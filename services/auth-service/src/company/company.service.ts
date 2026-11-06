import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
  BadRequestException, InternalServerErrorException, Logger, OnModuleInit,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { Response } from 'express';
import { InjectRepository }   from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Company, CompanyStatus } from '../database/entities/company.entity';
import { User, UserRole }     from '../database/entities/user.entity';
import { PendingRegistration, PendingRegistrationKind } from '../database/entities/pending-registration.entity';
import { OtpCode, OtpType }   from '../database/entities/otp-code.entity';
import { OtpService }         from '../otp/otp.service';
import { MailService }        from '../mail/mail.service';
import * as bcrypt            from 'bcryptjs';
import { AddUserDto, UpdateUserRoleDto } from './company.dto';
import { parseCapacityMax, totalSeatsUsed } from './company-capacity.util';
import { JwtRequestUser }       from '../auth/jwt.strategy';
import { AvatarStorageService } from '../avatar/avatar-storage.service';

const COMPANY_CODE_PREFIX = 'QUR';
const COMPANY_CODE_SUFFIX_LEN = 5;
const COMPANY_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

@Injectable()
export class CompanyService implements OnModuleInit {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(User)    private userRepo:    Repository<User>,
    @InjectRepository(PendingRegistration) private pendingRepo: Repository<PendingRegistration>,
    @InjectRepository(OtpCode) private otpRepo: Repository<OtpCode>,
    private otp:  OtpService,
    private mail: MailService,
    private avatarStorage: AvatarStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillMissingCompanyCodes();
  }

  /** QUR + 5 random A–Z / 0–9; retries until unique in DB. */
  async allocateUniqueCompanyCode(): Promise<string> {
    for (let attempt = 0; attempt < 48; attempt++) {
      let suffix = '';
      for (let i = 0; i < COMPANY_CODE_SUFFIX_LEN; i++) {
        suffix += COMPANY_CODE_ALPHABET[randomInt(COMPANY_CODE_ALPHABET.length)];
      }
      const code = COMPANY_CODE_PREFIX + suffix;
      const taken = await this.companyRepo.exist({ where: { companyCode: code } });
      if (!taken) return code;
    }
    throw new InternalServerErrorException('Could not generate a unique company code. Please try again.');
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  async assertCompanyNameAvailable(companyName: string, excludePendingId?: string): Promise<string> {
    const normalized = this.normalizeName(companyName ?? '');
    if (!normalized) throw new BadRequestException('Company name is required');

    const existing = await this.companyRepo
      .createQueryBuilder('c')
      .where("LOWER(REGEXP_REPLACE(TRIM(c.name), '[[:space:]]+', ' ', 'g')) = :name", { name: normalized })
      .getOne();
    if (existing) throw new ConflictException('A company with this name already exists');

    const pendingQb = this.pendingRepo
      .createQueryBuilder('p')
      .where('p.kind = :kind', { kind: PendingRegistrationKind.COMPANY })
      .andWhere("LOWER(REGEXP_REPLACE(TRIM(p.payload->>'companyName'), '[[:space:]]+', ' ', 'g')) = :name", {
        name: normalized,
      });
    if (excludePendingId) pendingQb.andWhere('p.id != :excludePendingId', { excludePendingId });
    const pending = await pendingQb.getOne();
    if (pending) throw new ConflictException('A company registration with this name is already pending');

    return companyName.trim().replace(/\s+/g, ' ');
  }

  private async backfillMissingCompanyCodes(): Promise<void> {
    try {
      const missing = await this.companyRepo.find({ where: { companyCode: IsNull() } });
      if (missing.length === 0) return;
      this.logger.log(`Backfilling company_code for ${missing.length} company row(s)`);
      for (const row of missing) {
        row.companyCode = await this.allocateUniqueCompanyCode();
        await this.companyRepo.save(row);
      }
    } catch (e: unknown) {
      this.logger.warn(
        `backfillMissingCompanyCodes: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Each User row with this companyId (used with pending invites in getSeatSnapshot for capacity). */
  private async countTeamMembers(companyId: string): Promise<number> {
    return this.userRepo.count({ where: { companyId } });
  }

  /**
   * Invites not yet completed still consume a seat.
   * Exclude rows where a `users` row already exists for this tenant + email (stale pending after setup).
   */
  private async countPendingInvitesForCompany(companyId: string): Promise<number> {
    return this.pendingRepo
      .createQueryBuilder('p')
      .where('p.kind = :kind', { kind: PendingRegistrationKind.INVITED_USER })
      .andWhere(`(p.payload->>'companyId') = :cid`, { cid: companyId })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM users u
          WHERE u.company_id = :cid2
          AND LOWER(TRIM(u.email)) = LOWER(TRIM(p.email))
        )`,
        { cid2: companyId },
      )
      .getCount();
  }

  private async getSeatSnapshot(companyId: string) {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    const team = (await this.countTeamMembers(companyId)) + (await this.countPendingInvitesForCompany(companyId));
    const used = totalSeatsUsed(team);
    const maxSeats = parseCapacityMax(company.capacity);
    const unlimited = maxSeats == null;
    return { company, used, maxSeats, unlimited };
  }

  /**
   * Call before adding a net-new team member (new User row or orphan linked to company).
   * Self-service registration and director invites both use this.
   */
  /** Public for auth flows (self-registration) that need seat counts outside this service. */
  async getSeatUsage(companyId: string): Promise<{ used: number; max: number | null; unlimited: boolean }> {
    const { used, maxSeats, unlimited } = await this.getSeatSnapshot(companyId);
    return { used, max: unlimited ? null : maxSeats, unlimited };
  }

  async ensureSeatAvailableForNewTeamMember(companyId: string): Promise<void> {
    const { used, maxSeats, unlimited } = await this.getSeatSnapshot(companyId);
    if (unlimited || maxSeats == null) return;
    if (used >= maxSeats) {
      throw new BadRequestException(
        `This workspace has reached its plan limit of ${maxSeats} people (including the company owner). ` +
          'Remove a team member from User Management or ask a platform administrator to update your company size.',
      );
    }
  }

  /** After headcount increases: in-app + email when crossing 80% of the numeric cap. */
  async notifyIfApproachingCapacity(
    companyId: string,
    seatsBefore: number,
    seatsAfter: number,
  ): Promise<void> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) return;
    const maxSeats = parseCapacityMax(company.capacity);
    if (maxSeats == null) return;
    const threshold = Math.max(1, Math.ceil(maxSeats * 0.8));
    if (seatsAfter < threshold) return;
    if (seatsBefore >= threshold) return;

    const title = 'Team size: approaching your plan limit';
    const message =
      `You are using ${seatsAfter} of ${maxSeats} seats on your current plan. ` +
      'Remove inactive users from User Management or contact support to increase your company size.';

    setImmediate(() => {
      void this.sendInternalNotification({
        companyId,
        directorInboxUserId: companyId,
        title,
        message,
        metadata: { kind: 'CAPACITY_WARNING', seatsUsed: seatsAfter, seatsMax: maxSeats },
      });
      void this.mail.sendTeamCapacityNotice({
        to: company.email,
        companyName: company.name,
        seatsUsed: seatsAfter,
        seatsMax: maxSeats,
      });
    });
  }

  private async sendInternalNotification(params: {
    companyId: string;
    directorInboxUserId: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const base = (process.env.NOTIFICATION_SERVICE_URL ?? '').trim().replace(/\/$/, '');
    if (!base) return;
    const token = (process.env.NOTIFICATION_INTERNAL_TOKEN ?? process.env.DOCUMENT_INTERNAL_TOKEN ?? '').trim();
    try {
      const res = await fetch(`${base}/api/notifications/internal/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Internal-Token': token } : {}),
        },
        body: JSON.stringify({
          companyId: params.companyId,
          userId: params.directorInboxUserId,
          type: 'GENERAL',
          title: params.title,
          message: params.message,
          metadata: params.metadata,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Notification service returned ${res.status}`);
      }
    } catch (e: unknown) {
      this.logger.warn(`Notification service: ${e instanceof Error ? e.message : e}`);
    }
  }

  private mimeFromAvatarKey(key: string): string {
    const ext = (key.split('.').pop() ?? '').toLowerCase();
    const m: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    };
    return m[ext] || 'application/octet-stream';
  }

  /** Same-company managers can load a team member’s profile photo bytes. */
  async streamUserAvatarImage(actor: JwtRequestUser, userId: string, res: Response): Promise<void> {
    const cid = (actor.companyId ?? '').toString().trim();
    if (!cid) {
      res.status(403).json({ message: 'No company context' });
      return;
    }
    const target = await this.userRepo.findOne({ where: { id: userId, companyId: cid } });
    if (!target?.avatarKey) {
      res.status(404).json({ message: 'No profile photo' });
      return;
    }
    try {
      const buf = await this.avatarStorage.getObjectBuffer(target.avatarKey);
      res.setHeader('Content-Type', this.mimeFromAvatarKey(target.avatarKey));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(buf);
    } catch (e: unknown) {
      this.logger.warn(`streamUserAvatarImage: ${e instanceof Error ? e.message : e}`);
      res.status(404).json({ message: 'Photo not found' });
    }
  }

  /** Tenant members: company logo for the signed-in user’s organization (JWT companyId). */
  async streamOwnCompanyAvatarImage(actor: JwtRequestUser, res: Response): Promise<void> {
    const cid = (actor.companyId ?? '').toString().trim();
    if (!cid) {
      res.status(403).json({ message: 'No company context' });
      return;
    }
    return this.streamCompanyAvatarImage(cid, res);
  }

  /** Super admin: company (director) logo / photo. */
  async streamCompanyAvatarImage(companyId: string, res: Response): Promise<void> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company?.avatarKey) {
      res.status(404).json({ message: 'No company photo' });
      return;
    }
    try {
      const buf = await this.avatarStorage.getObjectBuffer(company.avatarKey);
      res.setHeader('Content-Type', this.mimeFromAvatarKey(company.avatarKey));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(buf);
    } catch (e: unknown) {
      this.logger.warn(`streamCompanyAvatarImage: ${e instanceof Error ? e.message : e}`);
      res.status(404).json({ message: 'Photo not found' });
    }
  }

  // ── Super Admin ────────────────────────────────────────────────────────────

  async getAllCompanies() {
    return this.companyRepo.find({
      select: [
        'id', 'name', 'companyCode', 'field', 'email', 'phone', 'capacity', 'status', 'isEmailVerified', 'createdAt',
        'avatarKey',
      ],
      order:  { createdAt: 'DESC' },
    });
  }

  async getCompany(id: string) {
    const c = await this.companyRepo.findOne({ where: { id }, relations: ['users'] });
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  /** Lightweight lookup for internal service callers (e.g. evaluation export). */
  async getCompanyDisplayName(id: string): Promise<string | null> {
    const c = await this.companyRepo.findOne({
      where: { id },
      select: { id: true, name: true },
    });
    const n = c?.name?.trim();
    return n || null;
  }

  async createCompanyByAdmin(dto: import('./company.dto').CreateCompanyByAdminDto) {
    const emailKey = dto.email.trim().toLowerCase();
    const companyName = await this.assertCompanyNameAvailable(dto.companyName);
    const dup = await this.companyRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) = :e', { e: emailKey })
      .getOne();
    if (dup) throw new ConflictException('A company with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const companyCode = await this.allocateUniqueCompanyCode();
    const company = this.companyRepo.create({
      name:            companyName,
      companyCode,
      field:           dto.field,
      email:           emailKey,
      phone:           dto.phone,
      description:     dto.description ?? null,
      capacity:        dto.companyCapacity ?? null,
      passwordHash,
      status:          CompanyStatus.ACTIVE,
      isEmailVerified: true,
    });
    await this.companyRepo.save(company);
    this.logger.log(`Admin created company directly: ${emailKey}`);
    return { message: 'Company created successfully', id: company.id };
  }

  async activateCompany(id: string) {
    const c = await this.companyRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Company not found');
    await this.companyRepo.update(id, { status: CompanyStatus.ACTIVE });
    if (c.isEmailVerified) {
      await this.mail.sendActivation({ to: c.email, name: c.name });
    }
    return { message: 'Company activated' };
  }

  /** Super admin: companies needing email verification or admin approval. */
  async getAdminPendingSummary() {
    const companiesAwaitingApproval = await this.companyRepo.count({
      where: { status: CompanyStatus.PENDING },
    });
    const pendingCompanySignups = await this.pendingRepo.count({
      where: { kind: PendingRegistrationKind.COMPANY },
    });
    return {
      companiesAwaitingApproval,
      companiesAwaitingEmail: pendingCompanySignups,
      total: companiesAwaitingApproval + pendingCompanySignups,
    };
  }

  /** Director: team members waiting for director activation (email verified, account not yet active). */
  async getDirectorPendingSummary(companyId: string) {
    const usersAwaitingActivation = await this.userRepo.count({
      where: { companyId, isEmailVerified: true, isActive: false },
    });
    return {
      usersAwaitingActivation,
      usersAwaitingEmail: 0,
      total: usersAwaitingActivation,
    };
  }

  async suspendCompany(id: string) {
    const c = await this.companyRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Company not found');
    await this.companyRepo.update(id, { status: CompanyStatus.SUSPENDED });
    return { message: 'Company suspended' };
  }

  async deleteCompany(id: string) {
    const c = await this.companyRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Company not found');
    await this.companyRepo.delete(id);
    return { message: 'Company deleted' };
  }

  // ── Director ───────────────────────────────────────────────────────────────

  async getCompanyUsers(companyId: string) {
    const users = await this.userRepo.find({
      where:  { companyId },
      select: [
        'id', 'firstName', 'lastName', 'email', 'phone', 'role', 'isActive', 'isEmailVerified', 'createdAt',
        'avatarKey',
      ],
      order:  { createdAt: 'DESC' },
    });
    const { used, maxSeats, unlimited } = await this.getSeatSnapshot(companyId);
    return {
      users,
      seats: {
        used,
        max: unlimited ? null : maxSeats,
        unlimited,
      },
    };
  }

  async addUser(companyId: string | null | undefined, dto: AddUserDto, actor: JwtRequestUser) {
    const cid = (companyId ?? '').toString().trim();
    if (!cid) {
      throw new BadRequestException(
        'Missing company context. Sign out and sign in again as your company director.',
      );
    }

    const allowed = [UserRole.QUALITY_MANAGER, UserRole.AUDITOR, UserRole.OPERATOR];
    if (!allowed.includes(dto.role as UserRole))
      throw new ForbiddenException('Invalid role');

    const emailKey = dto.email.trim().toLowerCase();

    const existing = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.email)) = :e', { e: emailKey })
      .getOne();

    const existingCid =
      existing?.companyId != null && existing.companyId !== ''
        ? String(existing.companyId).trim()
        : '';

    const sameTenant =
      !!existing && (existingCid === cid || existingCid === '');
    if (existing && !sameTenant) {
      throw new ConflictException('This email is already registered to another company');
    }

    const reinviteSameCompany = !!existing && existingCid === cid;
    const consumesNewSeat = !reinviteSameCompany;

    const seatsBefore = (await this.getSeatSnapshot(cid)).used;
    if (consumesNewSeat) {
      await this.ensureSeatAvailableForNewTeamMember(cid);
    }

    // Clear any lingering OTP-pending registration for this email
    const pending = await this.pendingRepo.findOne({ where: { email: emailKey } });
    if (pending) {
      await this.otpRepo.delete({ pendingRegistrationId: pending.id } as any);
      await this.pendingRepo.delete(pending.id);
    }

    let userId: string;

    if (existing) {
      // Re-invite existing user (same company or orphan)
      await this.userRepo.update(existing.id, {
        firstName:       dto.firstName,
        lastName:        dto.lastName,
        phone:           dto.phone ?? existing.phone ?? null,
        role:            dto.role as UserRole,
        companyId:       cid,
        isActive:        true,
        isEmailVerified: false,   // reset until they set their password
        passwordHash:    '',    // NOT NULL column: same as new invite until setup-account
      });
      userId = existing.id;
    } else {
      // New invite: no `users` row until invitee completes setup-account (OTP in link).
      const pendingInvite = this.pendingRepo.create({
        email:   emailKey,
        kind:    PendingRegistrationKind.INVITED_USER,
        payload: {
          firstName: dto.firstName,
          lastName:  dto.lastName,
          email:     emailKey,
          phone:     dto.phone ?? null,
          role:      dto.role,
          companyId: cid,
        },
      });
      await this.pendingRepo.save(pendingInvite);
      userId = pendingInvite.id;
    }

    // Send "set your password" email (existing user: OTP tied to userId; new invite: tied to pending registration)
    const code = await this.otp.create(
      existing
        ? {
            userId,
            type:        OtpType.PASSWORD_RESET,
            ttlMinutes:  24 * 60,
          }
        : {
            pendingRegistrationId: userId,
            type:                   OtpType.PASSWORD_RESET,
            ttlMinutes:             24 * 60,
          },
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
    const setupLink   = `${frontendUrl}/auth/setup-account?email=${encodeURIComponent(emailKey)}&code=${code}`;

    // Fire invite email in background: don't block the director's response
    setImmediate(() => {
      this.mail.sendSetPasswordEmail({
        to:        emailKey,
        name:      `${dto.firstName} ${dto.lastName}`,
        setupLink,
      }).catch((err) =>
        this.logger.error(`Invite email failed for ${emailKey}: ${err?.message ?? err}`),
      );
    });

    if (consumesNewSeat) {
      const seatsAfter = (await this.getSeatSnapshot(cid)).used;
      await this.notifyIfApproachingCapacity(cid, seatsBefore, seatsAfter);
    }

    return { message: 'Invitation sent', user: { email: emailKey, role: dto.role } };
  }

  async updateUserRole(companyId: string, userId: string, dto: UpdateUserRoleDto) {
    const cid = (companyId ?? '').toString().trim();
    if (!cid) throw new BadRequestException('Missing company context');

    const allowed = [UserRole.QUALITY_MANAGER, UserRole.AUDITOR, UserRole.OPERATOR];
    if (!allowed.includes(dto.role as UserRole)) {
      throw new BadRequestException('Role must be Quality Manager, Auditor, or Operator');
    }

    const target = await this.userRepo.findOne({ where: { id: userId, companyId: cid } });
    if (!target) throw new NotFoundException('User not found in your company');

    if (target.role === UserRole.DIRECTOR) {
      throw new ForbiddenException(
        'The company owner account cannot be reassigned. Invite users with Quality Manager, Auditor, or Operator roles.',
      );
    }

    if (target.role === (dto.role as UserRole)) {
      return { message: 'Role unchanged', user: { id: userId, role: dto.role } };
    }

    await this.userRepo.update(userId, { role: dto.role as UserRole });
    this.logger.log(`User ${userId} role updated → ${dto.role}`);
    return { message: 'Role updated', user: { id: userId, role: dto.role } };
  }

  async toggleUserActive(companyId: string, userId: string, actor: JwtRequestUser) {
    const user = await this.userRepo.findOne({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in your company');
    const wasActive = user.isActive;
    const nextActive = !wasActive;
    await this.userRepo.update(userId, { isActive: nextActive });
    if (nextActive && !wasActive && user.isEmailVerified) {
      await this.mail.sendAccountActivatedNotice({
        to: user.email,
        name: `${user.firstName} ${user.lastName}`,
        kind: 'user',
      });
    }
    return { message: `User ${nextActive ? 'activated' : 'deactivated'}` };
  }

  async removeUser(companyId: string, userId: string, actor: JwtRequestUser) {
    const user = await this.userRepo.findOne({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in your company');
    await this.userRepo.delete(userId);
    return { message: 'User removed' };
  }
}
