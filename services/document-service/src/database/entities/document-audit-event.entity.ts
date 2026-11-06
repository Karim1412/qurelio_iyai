import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('document_audit_events')
@Index(['companyId', 'documentId', 'createdAt'])
export class DocumentAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column({ name: 'document_id' })
  documentId!: string;

  @Column({ name: 'actor_user_id' })
  actorUserId!: string;

  @Column({ length: 64 })
  action!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
