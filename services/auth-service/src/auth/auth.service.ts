import {
  Injectable, UnauthorizedException, BadRequestException,
  ConflictException, NotFoundException, Logger, ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtService }         from '@nestjs/jwt';
import { ConfigService }      from '@nestjs/config';
import { InjectRepository }   from '@nestjs/typeorm';
import { Repository }         from 'typeorm';
import { User, UserRole }     from '../database/entities/user.entity';
import { Company, CompanyStatus } from '../database/entities/company.entity';
import { OtpCode, OtpType }   from '../database/entities/otp-code.entity';
import { PendingRegistration, PendingRegistrationKind } from '../database/entities/pending-registration.entity';
import { OtpService }         from '../otp/otp.service';
import { MailService }        from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';
import {
  RegisterCompanyDto, RegisterUserDto, LoginDto, VerifyOtpDto,
  ForgotPasswordDto, ResetPasswordDto, UpdateProfileDto, ChangePasswordDto,
  SetupAccountDto, ContactDto,
} from './auth.dto';
import { AUTH_SUBJECT_COMPANY, JwtRequestUser } from './jwt.strategy';
import { AvatarStorageService } from '../avatar/avatar-storage.service';
import { CompanyService } from '../company/company.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Lock account after this many consecutive wrong passwords */
  private static readonly LOGIN_MAX_FAILURES = 5;
  /** Lockout duration after max failures */
  private static readonly LOGIN_LOCK_MS = 30 * 60 * 1000;

  constructor(
    @InjectRepository(User)    private userRepo:    Repository<User>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(OtpCode) private otpRepo:     Repository<OtpCode>,
    @InjectRepository(PendingRegistration) private pendingRepo: Repository<PendingRegistration>,
    private jwt:    JwtService,
    private config: ConfigService,
    private otp:    OtpService,
    private mail:   MailService,
    private avatarStorage: AvatarStorageService,
    private companyService: CompanyService,
  ) {}

  private mimeFromAvatarKey(key: string): string {
    const ext = (key.split('.').pop() ?? '').toLowerCase();
    const m: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return m[ext] || 'application/octet-stream';
  }

  /** Stream avatar bytes for GET /auth/profile/avatar/image (browser uses Authorization header). */
  async sendProfileAvatarImage(principal: JwtRequestUser, res: Response): Promise<void> {
    let key: string | null = null;
    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      const company = await this.companyRepo.findOne({ where: { id: principal.id } });
      key = company?.avatarKey ?? null;
    } else {
      const user = await this.userRepo.findOne({ where: { id: principal.id }, select: ['id', 'avatarKey'] });
      key = user?.avatarKey ?? null;
    }
    if (!key) {
      res.status(404).json({ message: 'No profile photo' });
      return;
    }
    try {
      const buf = await this.avatarStorage.getObjectBuffer(key);
      res.setHeader('Content-Type', this.mimeFromAvatarKey(key));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(buf);
    } catch (e: unknown) {
      this.logger.warn(`sendProfileAvatarImage: ${e instanceof Error ? e.message : e}`);
      res.status(404).json({ message: 'Profile photo not found' });
    }
  }

  private extFromMime(mime: string): string {
    const m: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    return m[mime] || 'jpg';
  }

  private normEmail(e: string) {
    return e.trim().toLowerCase();
  }

  /** Remove in-progress signup so the same email can restart. */
  private async deletePendingByEmail(email: string) {
    const key = this.normEmail(email);
    const p   = await this.pendingRepo.findOne({ where: { email: key } });
    if (p) {
      await this.otpRepo.delete({ pendingRegistrationId: p.id } as any);
      await this.pendingRepo.delete(p.id);
    }
  }

  // ── Token helpers ──────────────────────────────────────────────────────────
  private signAccess(payload: object) {
    return this.jwt.sign(payload, {
      secret:    this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });
  }

  private signRefresh(payload: object) {
    return this.jwt.sign(payload, {
      secret:    this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  private tokenPayload(entity: { id: string; email: string; role: string; companyId?: string }) {
    return { sub: entity.id, email: entity.email, role: entity.role, companyId: entity.companyId ?? null };
  }

  private async clearExpiredUserLock(user: User): Promise<void> {
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil <= now) {
      await this.userRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }
  }

  private assertUserNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new UnauthorizedException(
        `Account temporarily locked due to multiple failed login attempts. Try again in about ${mins} minute(s).`,
      );
    }
  }

  private async recordUserFailedPassword(user: User): Promise<never> {
    const next = (user.failedLoginAttempts ?? 0) + 1;
    if (next >= AuthService.LOGIN_MAX_FAILURES) {
      await this.userRepo.update(user.id, {
        failedLoginAttempts: AuthService.LOGIN_MAX_FAILURES,
        lockedUntil:         new Date(Date.now() + AuthService.LOGIN_LOCK_MS),
      });
      throw new UnauthorizedException(
        'Too many failed attempts. This account is locked for 30 minutes.',
      );
    }
    await this.userRepo.update(user.id, { failedLoginAttempts: next });
    throw new UnauthorizedException('Invalid credentials');
  }

  private async clearExpiredCompanyLock(company: Company): Promise<void> {
    const now = new Date();
    if (company.lockedUntil && company.lockedUntil <= now) {
      await this.companyRepo.update(company.id, { failedLoginAttempts: 0, lockedUntil: null });
      company.failedLoginAttempts = 0;
      company.lockedUntil = null;
    }
  }

  private assertCompanyNotLocked(company: Company): void {
    if (company.lockedUntil && company.lockedUntil > new Date()) {
      const mins = Math.max(1, Math.ceil((company.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new UnauthorizedException(
        `Account temporarily locked due to multiple failed login attempts. Try again in about ${mins} minute(s).`,
      );
    }
  }

  private async recordCompanyFailedPassword(company: Company): Promise<never> {
    const next = (company.failedLoginAttempts ?? 0) + 1;
    if (next >= AuthService.LOGIN_MAX_FAILURES) {
      await this.companyRepo.update(company.id, {
        failedLoginAttempts: AuthService.LOGIN_MAX_FAILURES,
        lockedUntil:         new Date(Date.now() + AuthService.LOGIN_LOCK_MS),
      });
      throw new UnauthorizedException(
        'Too many failed attempts. This account is locked for 30 minutes.',
      );
    }
    await this.companyRepo.update(company.id, { failedLoginAttempts: next });
    throw new UnauthorizedException('Invalid credentials');
  }

  // ── Register Company (saved only after OTP) ───────────────────────────────
  async registerCompany(dto: RegisterCompanyDto) {
    await this.deletePendingByEmail(dto.email);

    const emailKey = this.normEmail(dto.email);
    const companyName = await this.companyService.assertCompanyNameAvailable(dto.companyName);
    const dup      = await this.companyRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) = :e', { e: emailKey })
      .getOne();
    if (dup) throw new ConflictException('A company with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const payload        = {
      companyName,
      field:           dto.field,
      email:           emailKey,
      phone:           dto.phone,
      description:     dto.description ?? null,
      companyCapacity: dto.companyCapacity ?? null,
      passwordHash,
    };

    const pending = this.pendingRepo.create({
      email:   emailKey,
      kind:    PendingRegistrationKind.COMPANY,
      payload,
    });
    await this.pendingRepo.save(pending);

    // createAndSend saves the OTP to DB now and fires the email in the background
    await this.otp.createAndSend({
      to:                     emailKey,
      name:                   dto.companyName,
      pendingRegistrationId:  pending.id,
      type:                   OtpType.EMAIL_VERIFICATION,
      purpose:                'verification',
    });

    this.logger.log(`Company signup pending OTP: ${emailKey}`);
    return { message: 'Check your email for a code to complete company registration.' };
  }

  // ── Register User (saved only after OTP; company matched by workspace code) ─
  async registerUser(dto: RegisterUserDto) {
    const emailKeyEarly = this.normEmail(dto.email);
    const directorInvite = await this.pendingRepo.findOne({
      where: { email: emailKeyEarly, kind: PendingRegistrationKind.INVITED_USER },
    });
    if (directorInvite) {
      throw new ConflictException(
        'This email has a pending team invitation. Use the setup link in your email, or ask your director to resend it.',
      );
    }

    await this.deletePendingByEmail(dto.email);

    const codeNorm = dto.companyCode.trim().toUpperCase();
    const company = await this.companyRepo.findOne({
      where: { companyCode: codeNorm, status: CompanyStatus.ACTIVE },
    });

    if (!company) {
      throw new BadRequestException(
        'No active company found with this code. Ask your company director for the workspace code (shown on Profile), or check spelling.',
      );
    }
    const emailKey = this.normEmail(dto.email);

    const dupUser = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.email)) = :e', { e: emailKey })
      .getOne();
    if (dupUser) {
      if (dupUser.companyId !== company.id) {
        throw new ConflictException('A user with this email already exists');
      }
      if (dupUser.isActive) {
        throw new ConflictException('You already have an account. Sign in instead.');
      }
      if (dupUser.isEmailVerified) {
        throw new BadRequestException(
          'This email is already registered and is waiting for your company director to activate your account.',
        );
      }
      throw new BadRequestException(
        'This email was already added by your company. Sign in with the password your director gave you.',
      );
    }

    await this.companyService.ensureSeatAvailableForNewTeamMember(company.id);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const payload      = {
      firstName: dto.firstName,
      lastName:  dto.lastName,
      email:     emailKey,
      phone:     dto.phone,
      role:      dto.role,
      companyId: company.id,
      passwordHash,
    };

    const pending = this.pendingRepo.create({
      email: emailKey,
      kind:  PendingRegistrationKind.USER,
      payload,
    });
    await this.pendingRepo.save(pending);

    // createAndSend saves the OTP to DB now and fires the email in the background
    await this.otp.createAndSend({
      to:                     emailKey,
      name:                   `${dto.firstName} ${dto.lastName}`,
      pendingRegistrationId:  pending.id,
      type:                   OtpType.EMAIL_VERIFICATION,
      purpose:                'verification',
    });

    this.logger.log(`User signup pending OTP: ${emailKey}`);
    return { message: 'Check your email for a code to complete registration.' };
  }

  // ── Verify User OTP ────────────────────────────────────────────────────────
  async verifyUserOtp(dto: VerifyOtpDto) {
    const emailKey = this.normEmail(dto.email);
    const pending  = await this.pendingRepo.findOne({
      where: { email: emailKey, kind: PendingRegistrationKind.USER },
    });
    if (!pending) {
      throw new NotFoundException(
        'No pending signup for this email. If you already verified, sign in; otherwise register again.',
      );
    }

    await this.otp.verify({
      pendingRegistrationId: pending.id,
      code:                  dto.code,
      type:                  OtpType.EMAIL_VERIFICATION,
    });

    const p = pending.payload as Record<string, string>;
    const companyId = (p.companyId ?? '').toString().trim();
    const seatsBefore = (await this.companyService.getSeatUsage(companyId)).used;
    await this.companyService.ensureSeatAvailableForNewTeamMember(companyId);

    const user = this.userRepo.create({
      firstName:       p.firstName,
      lastName:        p.lastName,
      email:           p.email,
      phone:           p.phone,
      passwordHash:    p.passwordHash,
      role:            p.role as UserRole,
      companyId:       p.companyId,
      isActive:        false,
      isEmailVerified: true,
    });
    await this.userRepo.save(user);
    await this.pendingRepo.delete(pending.id);

    const seatsAfter = (await this.companyService.getSeatUsage(companyId)).used;
    await this.companyService.notifyIfApproachingCapacity(companyId, seatsBefore, seatsAfter);

    return { message: 'Email verified. Awaiting activation by your company admin.' };
  }

  // ── Verify Company OTP ─────────────────────────────────────────────────────
  async verifyCompanyOtp(dto: VerifyOtpDto) {
    const emailKey = this.normEmail(dto.email);
    const pending  = await this.pendingRepo.findOne({
      where: { email: emailKey, kind: PendingRegistrationKind.COMPANY },
    });
    if (!pending) {
      throw new NotFoundException(
        'No pending signup for this email. If you already verified, sign in; otherwise register again.',
      );
    }

    await this.otp.verify({
      pendingRegistrationId: pending.id,
      code:                  dto.code,
      type:                  OtpType.EMAIL_VERIFICATION,
    });

    const p = pending.payload as Record<string, string>;
    const companyName = await this.companyService.assertCompanyNameAvailable(String(p.companyName ?? ''), pending.id);

    const companyCode = await this.companyService.allocateUniqueCompanyCode();
    const company = this.companyRepo.create({
      name:            companyName,
      companyCode,
      field:           p.field,
      email:           p.email,
      phone:           p.phone,
      description:     p.description || undefined,
      capacity:        p.companyCapacity || undefined,
      passwordHash:    p.passwordHash,
      status:          CompanyStatus.PENDING,
      isEmailVerified: true,
    });
    await this.companyRepo.save(company);
    await this.pendingRepo.delete(pending.id);

    return { message: 'Email verified. Your company is pending super admin approval.' };
  }

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  async resendOtp(email: string) {
    const emailKey = this.normEmail(email);

    const pending = await this.pendingRepo.findOne({ where: { email: emailKey } });
    if (pending) {
      if (pending.kind === PendingRegistrationKind.INVITED_USER) {
        const pl = pending.payload as Record<string, string>;
        const name = `${pl.firstName} ${pl.lastName}`;
        const code = await this.otp.create({
          pendingRegistrationId: pending.id,
          type:                   OtpType.PASSWORD_RESET,
          ttlMinutes:             24 * 60,
        });
        const frontendUrl =
          (this.config.get<string>('FRONTEND_URL') ?? '').trim() ||
          process.env.FRONTEND_URL ||
          'http://127.0.0.1:3001';
        const setupLink = `${frontendUrl.replace(/\/$/, '')}/auth/setup-account?email=${encodeURIComponent(emailKey)}&code=${code}`;
        await this.mail.sendSetPasswordEmail({ to: emailKey, name, setupLink });
        return { message: 'New invite link sent' };
      }

      const pl = pending.payload as Record<string, string>;
      const name =
        pending.kind === PendingRegistrationKind.COMPANY
          ? pl.companyName
          : `${pl.firstName} ${pl.lastName}`;
      await this.otp.createAndSend({
        to:                     emailKey,
        name,
        pendingRegistrationId: pending.id,
        type:                   OtpType.EMAIL_VERIFICATION,
        purpose:                'verification',
      });
      return { message: 'New code sent' };
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.email)) = :e', { e: emailKey })
      .getOne();
    if (user) {
      await this.otp.createAndSend({
        to:     user.email,
        name:   `${user.firstName} ${user.lastName}`,
        userId: user.id,
        type:   OtpType.EMAIL_VERIFICATION,
        purpose: 'verification',
      });
      return { message: 'New code sent' };
    }

    const company = await this.companyRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) = :e', { e: emailKey })
      .getOne();
    if (company) {
      await this.otp.createAndSend({
        to:        company.email,
        name:      company.name,
        companyId: company.id,
        type:      OtpType.EMAIL_VERIFICATION,
        purpose:   'verification',
      });
      return { message: 'New code sent' };
    }

    throw new NotFoundException('No account or pending signup found with this email');
  }

  // ── Login (user or company director) ──────────────────────────────────────
  async login(dto: LoginDto) {
    const emailKey = this.normEmail(dto.email);

    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.company', 'company')
      .where('LOWER(TRIM(u.email)) = :e', { e: emailKey })
      .getOne();

    if (user) {
      await this.clearExpiredUserLock(user);
      this.assertUserNotLocked(user);

      if (!await bcrypt.compare(dto.password, user.passwordHash))
        await this.recordUserFailedPassword(user);

      await this.userRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });

      if (!user.isEmailVerified)
        throw new UnauthorizedException('Please verify your email first');
      if (!user.isActive)
        throw new UnauthorizedException('Account not yet activated by your company admin');

      const payload      = this.tokenPayload({ ...user, companyId: user.companyId });
      const accessToken  = this.signAccess(payload);
      const refreshToken = this.signRefresh(payload);
      await this.userRepo.update(user.id, { refreshToken: await bcrypt.hash(refreshToken, 10) });

      return {
        accessToken, refreshToken,
        user: {
          id:              user.id,
          firstName:       user.firstName,
          lastName:        user.lastName,
          email:           user.email,
          phone:           user.phone,
          role:            user.role,
          isActive:        user.isActive,
          isEmailVerified: user.isEmailVerified,
          companyId:       user.companyId,
          company:         user.company
            ? {
                id: user.company.id,
                name: user.company.name,
                companyCode: user.company.companyCode ?? null,
                avatarKey: user.company.avatarKey ?? null,
              }
            : null,
          hasCustomAvatar: Boolean(user.avatarKey),
          avatarKey:       user.avatarKey ?? null,
          avatarUrl:       null,
        },
      };
    }

    const company = await this.companyRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) = :e', { e: emailKey })
      .getOne();
    if (company) {
      await this.clearExpiredCompanyLock(company);
      this.assertCompanyNotLocked(company);

      if (!await bcrypt.compare(dto.password, company.passwordHash))
        await this.recordCompanyFailedPassword(company);

      await this.companyRepo.update(company.id, { failedLoginAttempts: 0, lockedUntil: null });

      if (!company.isEmailVerified)
        throw new UnauthorizedException('Please verify your company email first');
      if (company.status !== CompanyStatus.ACTIVE)
        throw new UnauthorizedException('Company account not yet activated by super admin');

      const payload      = { sub: company.id, email: company.email, role: UserRole.DIRECTOR, companyId: company.id };
      const accessToken  = this.signAccess(payload);
      const refreshToken = this.signRefresh(payload);
      await this.companyRepo.update(company.id, { refreshToken: await bcrypt.hash(refreshToken, 10) });

      return {
        accessToken, refreshToken,
        user: {
          id:              company.id,
          firstName:       company.name,
          lastName:        '',
          email:           company.email,
          phone:           company.phone,
          role:            UserRole.DIRECTOR,
          isActive:        company.status === CompanyStatus.ACTIVE,
          isEmailVerified: company.isEmailVerified,
          companyId:       company.id,
          company:         {
            id: company.id,
            name: company.name,
            companyCode: company.companyCode ?? null,
            avatarKey: company.avatarKey ?? null,
          },
          hasCustomAvatar: Boolean(company.avatarKey),
          avatarKey:       company.avatarKey ?? null,
          avatarUrl:       null,
        },
      };
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  /** Issue new access + refresh tokens when the refresh JWT is valid and matches the stored hash. */
  async refresh(dto: { refreshToken: string }) {
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) throw new UnauthorizedException('Refresh not configured');

    let payload: { sub: string; email: string; role: UserRole; companyId?: string | null };
    try {
      payload = this.jwt.verify(dto.refreshToken, { secret: refreshSecret }) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.role === UserRole.DIRECTOR) {
      const company = await this.companyRepo.findOne({ where: { id: payload.sub } });
      if (!company?.refreshToken) {
        throw new UnauthorizedException('Session invalid. Please sign in again.');
      }
      if (!(await bcrypt.compare(dto.refreshToken, company.refreshToken))) {
        throw new UnauthorizedException('Session invalid. Please sign in again.');
      }
      if (!company.isEmailVerified) {
        throw new UnauthorizedException('Please verify your company email first');
      }
      if (company.status !== CompanyStatus.ACTIVE) {
        throw new UnauthorizedException('Company account is not active');
      }

      const tokenPayload = {
        sub: company.id,
        email: company.email,
        role: UserRole.DIRECTOR,
        companyId: company.id,
      };
      const accessToken = this.signAccess(tokenPayload);
      const newRefresh = this.signRefresh(tokenPayload);
      await this.companyRepo.update(company.id, { refreshToken: await bcrypt.hash(newRefresh, 10) });

      return {
        accessToken,
        refreshToken: newRefresh,
        user: {
          id: company.id,
          firstName: company.name,
          lastName: '',
          email: company.email,
          phone: company.phone,
          role: UserRole.DIRECTOR,
          isActive: company.status === CompanyStatus.ACTIVE,
          isEmailVerified: company.isEmailVerified,
          companyId: company.id,
          company: {
            id: company.id,
            name: company.name,
            companyCode: company.companyCode ?? null,
            avatarKey: company.avatarKey ?? null,
          },
          hasCustomAvatar: Boolean(company.avatarKey),
          avatarKey: company.avatarKey ?? null,
          avatarUrl: null,
        },
      };
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.company', 'company')
      .where('u.id = :id', { id: payload.sub })
      .getOne();
    if (!user?.refreshToken) {
      throw new UnauthorizedException('Session invalid. Please sign in again.');
    }
    if (!(await bcrypt.compare(dto.refreshToken, user.refreshToken))) {
      throw new UnauthorizedException('Session invalid. Please sign in again.');
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account not yet activated by your company admin');
    }

    const tokenPayload = this.tokenPayload({ ...user, companyId: user.companyId });
    const accessToken = this.signAccess(tokenPayload);
    const newRefresh = this.signRefresh(tokenPayload);
    await this.userRepo.update(user.id, { refreshToken: await bcrypt.hash(newRefresh, 10) });

    return {
      accessToken,
      refreshToken: newRefresh,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        companyId: user.companyId,
        company: user.company
          ? {
              id: user.company.id,
              name: user.company.name,
              companyCode: user.company.companyCode ?? null,
              avatarKey: user.company.avatarKey ?? null,
            }
          : null,
        hasCustomAvatar: Boolean(user.avatarKey),
        avatarKey: user.avatarKey ?? null,
        avatarUrl: null,
      },
    };
  }

  // ── Get current user ───────────────────────────────────────────────────────
  async getMe(principal: JwtRequestUser) {
    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      const company = await this.companyRepo.findOne({ where: { id: principal.id } });
      if (!company) throw new NotFoundException('Company not found');
      return {
        id: company.id,
        firstName: company.name,
        lastName: '',
        email: company.email,
        phone: company.phone,
        role: UserRole.DIRECTOR,
        isActive: company.status === CompanyStatus.ACTIVE,
        isEmailVerified: company.isEmailVerified,
        companyId: company.id,
        company: {
          id: company.id,
          name: company.name,
          companyCode: company.companyCode ?? null,
          avatarKey: company.avatarKey ?? null,
        },
        createdAt: company.createdAt,
        hasCustomAvatar: Boolean(company.avatarKey),
        avatarKey: company.avatarKey ?? null,
        avatarUrl: null,
      };
    }

    const user = await this.userRepo.findOne({
      where: { id: principal.id },
      relations: { company: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      companyId: user.companyId,
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            companyCode: user.company.companyCode ?? null,
            avatarKey: user.company.avatarKey ?? null,
          }
        : null,
      createdAt: user.createdAt,
      hasCustomAvatar: Boolean(user.avatarKey),
      avatarKey: user.avatarKey ?? null,
      avatarUrl: null,
    };
  }

  // ── Update profile ─────────────────────────────────────────────────────────
  async updateProfile(principal: JwtRequestUser, dto: UpdateProfileDto) {
    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      // Director: update company name and/or phone
      const updates: Partial<{ name: string; phone: string }> = {};
      if (dto.name?.trim())  updates.name  = dto.name.trim();
      if (dto.phone?.trim()) updates.phone = dto.phone.trim();
      if (Object.keys(updates).length) {
        await this.companyRepo.update(principal.id, updates);
      }
      return this.getMe(principal);
    }
    const { name, ...userFields } = dto;
    await this.userRepo.update(principal.id, userFields);
    return this.getMe(principal);
  }

  async uploadProfileAvatar(principal: JwtRequestUser, file: Express.Multer.File) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, or GIF images are allowed');
    }

    const ext = this.extFromMime(file.mimetype);

    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      const company = await this.companyRepo.findOne({ where: { id: principal.id } });
      if (!company) throw new NotFoundException('Company not found');
      const newKey = `avatars/company-${company.id}/${Date.now()}.${ext}`;
      if (company.avatarKey) {
        try {
          await this.avatarStorage.remove(company.avatarKey);
        } catch {
          /* ignore stale key */
        }
      }
      await this.avatarStorage.upload(newKey, file.buffer, file.mimetype);
      await this.companyRepo.update(company.id, { avatarKey: newKey });
      return this.getMe(principal);
    }

    const user = await this.userRepo.findOne({ where: { id: principal.id } });
    if (!user) throw new NotFoundException('User not found');
    const newKey = `avatars/user-${user.id}/${Date.now()}.${ext}`;
    if (user.avatarKey) {
      try {
        await this.avatarStorage.remove(user.avatarKey);
      } catch {
        /* ignore */
      }
    }
    await this.avatarStorage.upload(newKey, file.buffer, file.mimetype);
    await this.userRepo.update(user.id, { avatarKey: newKey });
    return this.getMe(principal);
  }

  async removeProfileAvatar(principal: JwtRequestUser) {
    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      const company = await this.companyRepo.findOne({ where: { id: principal.id } });
      if (!company) throw new NotFoundException('Company not found');
      if (company.avatarKey) {
        try {
          await this.avatarStorage.remove(company.avatarKey);
        } catch {
          /* ignore */
        }
        await this.companyRepo.update(company.id, { avatarKey: null });
      }
      return this.getMe(principal);
    }

    const user = await this.userRepo.findOne({ where: { id: principal.id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.avatarKey) {
      try {
        await this.avatarStorage.remove(user.avatarKey);
      } catch {
        /* ignore */
      }
      await this.userRepo.update(user.id, { avatarKey: null });
    }
    return this.getMe(principal);
  }

  // ── Change password ────────────────────────────────────────────────────────
  async changePassword(principal: JwtRequestUser, dto: ChangePasswordDto) {
    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      const company = await this.companyRepo.findOne({ where: { id: principal.id } });
      if (!company) throw new NotFoundException('Company not found');
      if (!await bcrypt.compare(dto.currentPassword, company.passwordHash))
        throw new BadRequestException('Current password is incorrect');
      await this.companyRepo.update(principal.id, { passwordHash: await bcrypt.hash(dto.newPassword, 12) });
      return { message: 'Password changed successfully' };
    }
    const user = await this.userRepo.findOne({ where: { id: principal.id } });
    if (!user) throw new NotFoundException('User not found');
    if (!await bcrypt.compare(dto.currentPassword, user.passwordHash))
      throw new BadRequestException('Current password is incorrect');
    await this.userRepo.update(principal.id, { passwordHash: await bcrypt.hash(dto.newPassword, 12) });
    return { message: 'Password changed successfully' };
  }

  // ── Forgot password ────────────────────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const emailKey = this.normEmail(dto.email);

    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.email)) = :e', { e: emailKey })
      .getOne();

    if (user) {
      await this.otp.createAndSend({
        to: user.email, name: `${user.firstName} ${user.lastName}`,
        userId: user.id, type: OtpType.PASSWORD_RESET, purpose: 'password-reset',
      });
      return { message: 'Password reset code sent to your email' };
    }

    // Also support company directors
    const company = await this.companyRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) = :e', { e: emailKey })
      .getOne();

    if (company) {
      await this.otp.createAndSend({
        to: company.email, name: company.name,
        companyId: company.id, type: OtpType.PASSWORD_RESET, purpose: 'password-reset',
      });
      return { message: 'Password reset code sent to your email' };
    }

    // Prevent enumeration: always return success
    return { message: 'If an account exists, a reset code has been sent' };
  }

  // ── Setup account (director invite) ────────────────────────────────────────
  async setupAccount(dto: SetupAccountDto) {
    const emailKey = this.normEmail(dto.email);

    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.email)) = :e', { e: emailKey })
      .getOne();
    if (user) {
      await this.otp.verify({ userId: user.id, code: dto.code, type: OtpType.PASSWORD_RESET });

      await this.userRepo.update(user.id, {
        passwordHash:    await bcrypt.hash(dto.newPassword, 12),
        isEmailVerified: true,
        refreshToken:    null,
      });
      const staleInvite = await this.pendingRepo.findOne({
        where: { email: emailKey, kind: PendingRegistrationKind.INVITED_USER },
      });
      if (staleInvite) await this.pendingRepo.delete(staleInvite.id);
      return { message: 'Password set successfully. You can now sign in.' };
    }

    const pending = await this.pendingRepo.findOne({
      where: { email: emailKey, kind: PendingRegistrationKind.INVITED_USER },
    });
    if (!pending) {
      throw new NotFoundException('Account not found for this email');
    }

    const p = pending.payload as Record<string, string>;
    const companyId = (p.companyId ?? '').toString().trim();
    if (!companyId) throw new BadRequestException('Invalid invitation');

    const seatsBefore = (await this.companyService.getSeatUsage(companyId)).used;
    await this.companyService.ensureSeatAvailableForNewTeamMember(companyId);

    await this.otp.verify({
      pendingRegistrationId: pending.id,
      code:                  dto.code,
      type:                  OtpType.PASSWORD_RESET,
    });

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const created = this.userRepo.create({
      firstName:       p.firstName,
      lastName:        p.lastName,
      email:           (p.email ?? emailKey).trim().toLowerCase(),
      phone:           p.phone?.trim() ? p.phone : null,
      passwordHash,
      role:            p.role as UserRole,
      companyId:       p.companyId,
      isActive:        true,
      isEmailVerified: true,
    });
    await this.userRepo.save(created);
    await this.pendingRepo.delete(pending.id);

    const seatsAfter = (await this.companyService.getSeatUsage(companyId)).used;
    await this.companyService.notifyIfApproachingCapacity(companyId, seatsBefore, seatsAfter);

    return { message: 'Password set successfully. You can now sign in.' };
  }

  // ── Reset password ─────────────────────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const otpRecord = await this.otpRepo.findOne({
      where: { code: dto.code, type: OtpType.PASSWORD_RESET, isUsed: false },
      order: { createdAt: 'DESC' },
    });
    if (!otpRecord || otpRecord.expiresAt < new Date())
      throw new BadRequestException('Invalid or expired reset code');

    if (otpRecord.userId) {
      await this.otp.verify({ userId: otpRecord.userId, code: dto.code, type: OtpType.PASSWORD_RESET });
      await this.userRepo.update(otpRecord.userId, {
        passwordHash: await bcrypt.hash(dto.newPassword, 12),
        refreshToken: null,
      });
    } else if (otpRecord.companyId) {
      await this.otp.verify({ companyId: otpRecord.companyId, code: dto.code, type: OtpType.PASSWORD_RESET });
      await this.companyRepo.update(otpRecord.companyId, {
        passwordHash: await bcrypt.hash(dto.newPassword, 12),
      });
    } else {
      throw new BadRequestException('Invalid reset code');
    }

    return { message: 'Password reset successfully' };
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  async logout(principal: JwtRequestUser) {
    if ('authSubject' in principal && principal.authSubject === AUTH_SUBJECT_COMPANY) {
      await this.companyRepo.update(principal.id, { refreshToken: null });
    } else {
      await this.userRepo.update(principal.id, { refreshToken: null });
    }
    return { message: 'Logged out successfully' };
  }

  // ── Contact form ───────────────────────────────────────────────────────────
  async contact(dto: ContactDto) {
    setImmediate(() => {
      this.mail.sendContactMessage({
        firstName: dto.firstName,
        lastName:  dto.lastName ?? '',
        email:     dto.email,
        subject:   dto.subject ?? '',
        message:   dto.message,
      }).catch((err) => this.logger.error(`Contact send error: ${err?.message ?? err}`));
    });
    return { message: 'Your message has been received. We will get back to you shortly.' };
  }
}
