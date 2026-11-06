import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { User } from './user.entity';

export enum CompanyStatus {
  PENDING   = 'PENDING',
  ACTIVE    = 'ACTIVE',
  INACTIVE  = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * Workspace invite code: fixed prefix QUR + 5 alphanumeric (uppercase), unique per company.
   * Nullable only for legacy rows until backfilled at startup.
   */
  @Column({ name: 'company_code', length: 8, unique: true, nullable: true })
  companyCode: string | null;

  @Column()
  field: string;

  @Column({ unique: true })
  email: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  capacity: string;

  /** MinIO object key for company logo / director profile photo. */
  @Column({ name: 'avatar_key', nullable: true })
  avatarKey: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.PENDING })
  status: CompanyStatus;

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
  lockedUntil: Date | null;

  /** Bcrypt hash of the current refresh JWT (same pattern as `users.refresh_token`). */
  @Column({ name: 'refresh_token', nullable: true })
  refreshToken: string | null;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
