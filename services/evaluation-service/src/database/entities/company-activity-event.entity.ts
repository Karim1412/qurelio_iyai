import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** Append-only events for actions not represented elsewhere (eval delete, NC verify, …). */
@Entity('company_activity_events')
export class CompanyActivityEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'company_id' }) companyId!: string;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ type: 'text' }) summary!: string;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
