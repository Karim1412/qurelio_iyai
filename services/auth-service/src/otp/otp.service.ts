import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository }                         from '@nestjs/typeorm';
import { Repository, MoreThan }                     from 'typeorm';
import { OtpCode, OtpType }                         from '../database/entities/otp-code.entity';
import { MailService }                              from '../mail/mail.service';
import * as crypto                                  from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpCode)
    private otpRepo: Repository<OtpCode>,
    private mail:    MailService,
  ) {}

  private generate(): string {
    return String(crypto.randomInt(100_000, 999_999));
  }

  async create(params: {
    userId?:                 string;
    companyId?:              string;
    pendingRegistrationId?:  string;
    type:                    OtpType;
    ttlMinutes?:             number;
  }): Promise<string> {
    const { userId, companyId, pendingRegistrationId, type, ttlMinutes = 10 } = params;

    const inv: Record<string, unknown> = { type, isUsed: false };
    if (userId) inv.userId = userId;
    else if (companyId) inv.companyId = companyId;
    else if (pendingRegistrationId) inv.pendingRegistrationId = pendingRegistrationId;

    await this.otpRepo.update(inv as any, { isUsed: true });

    const code      = this.generate();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.otpRepo.save(
      this.otpRepo.create({
        code,
        type,
        expiresAt,
        userId:                userId ?? null,
        companyId:             companyId ?? null,
        pendingRegistrationId: pendingRegistrationId ?? null,
      }),
    );

    this.logger.debug(`OTP created [${type}] for ${userId ?? companyId ?? pendingRegistrationId}`);
    return code;
  }

  async verify(params: {
    userId?:                string;
    companyId?:             string;
    pendingRegistrationId?: string;
    code:                   string;
    type:                   OtpType;
  }): Promise<void> {
    const { userId, companyId, pendingRegistrationId, code, type } = params;

    const qb = this.otpRepo.createQueryBuilder('o')
      .where('o.code = :code', { code })
      .andWhere('o.type = :type', { type })
      .andWhere('o.isUsed = :used', { used: false })
      .andWhere('o.expiresAt > :now', { now: new Date() });

    if (userId) qb.andWhere('o.userId = :uid', { uid: userId });
    else if (companyId) qb.andWhere('o.companyId = :cid', { cid: companyId });
    else if (pendingRegistrationId) qb.andWhere('o.pendingRegistrationId = :pid', { pid: pendingRegistrationId });
    else throw new BadRequestException('Invalid OTP context');

    const otp = await qb.orderBy('o.createdAt', 'DESC').getOne();

    if (!otp) throw new BadRequestException('Invalid or expired OTP code');

    await this.otpRepo.update(otp.id, { isUsed: true });
  }

  /**
   * Saves the OTP, then sends the email via SendGrid. The HTTP handler only
   * succeeds if the email send succeeds, so misconfiguration shows up as an error
   * instead of a silent failure.
   */
  async createAndSend(params: {
    to:                      string;
    name:                    string;
    userId?:                 string;
    companyId?:              string;
    pendingRegistrationId?:  string;
    type:                    OtpType;
    purpose:                 'verification' | 'password-reset';
  }): Promise<void> {
    const { to, name, userId, companyId, pendingRegistrationId, type, purpose } = params;

    const code = await this.create({ userId, companyId, pendingRegistrationId, type });
    await this.mail.sendOtp({ to, name, code, purpose });
  }
}
