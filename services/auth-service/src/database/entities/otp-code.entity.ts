import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum OtpType {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET     = 'PASSWORD_RESET',
}

@Entity('otp_codes')
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column({ type: 'enum', enum: OtpType })
  type: OtpType;

  @Column({ name: 'is_used', default: false })
  isUsed: boolean;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: string;

  /** Set for signup OTP before company/user row exists */
  @Column({ name: 'pending_registration_id', nullable: true })
  pendingRegistrationId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
