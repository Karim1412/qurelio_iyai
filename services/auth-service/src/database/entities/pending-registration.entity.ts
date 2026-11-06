import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum PendingRegistrationKind {
  COMPANY = 'COMPANY',
  USER = 'USER',
  /** Director invite: payload until invitee completes setup-account (then a `users` row is created). */
  INVITED_USER = 'INVITED_USER',
}

/**
 * Holds signup payloads until email OTP is verified; only then rows are created in `companies` / `users`.
 * INVITED_USER is completed via setup-account, not verify-otp.
 */
@Entity('pending_registrations')
export class PendingRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'enum', enum: PendingRegistrationKind })
  kind: PendingRegistrationKind;

  /** COMPANY: { companyName, field, email, phone, description?, companyCapacity?, passwordHash }. USER (self-signup): { firstName, lastName, email, phone, passwordHash, role, companyId }. INVITED_USER: { firstName, lastName, email, phone?, role, companyId } */
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
