import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Evaluation } from './evaluation.entity';

export enum NCClassification { MINOR = 'MINOR', MAJOR = 'MAJOR', CRITICAL = 'CRITICAL' }
export enum NCStatus {
  OPEN = 'OPEN',
  ROOT_CAUSE_ANALYSIS = 'ROOT_CAUSE_ANALYSIS',
  CAPA_DEFINED = 'CAPA_DEFINED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
}
export enum NCSource { MANUAL = 'MANUAL', AI_EVALUATION = 'AI_EVALUATION', AUDIT = 'AUDIT' }
export enum CAPAType { CORRECTIVE = 'CORRECTIVE', PREVENTIVE = 'PREVENTIVE' }

/** Per CAPA-004: planned vs execution vs done (in addition to completedAt). */
export enum CapaActionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

@Entity('non_conformities')
export class NonConformity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @Column() title: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'enum', enum: NCClassification, default: NCClassification.MINOR }) classification: NCClassification;
  @Column({ type: 'enum', enum: NCStatus, default: NCStatus.OPEN }) status: NCStatus;
  @Column({ type: 'enum', enum: NCSource, default: NCSource.MANUAL }) source: NCSource;
  @Column({ name: 'iso_clause', type: 'varchar', length: 64, nullable: true }) isoClause: string;
  @Column({ name: 'iso_standard', type: 'varchar', length: 32, nullable: true }) isoStandard: string;
  @Column({ name: 'detected_by' }) detectedBy: string;
  /** Optional NC owner / assignee (company user id). */
  @Column({ name: 'assigned_to', type: 'uuid', nullable: true }) assignedTo: string | null;
  @Column({ name: 'root_cause', type: 'text', nullable: true }) rootCause: string;
  @Column({ name: 'why_analysis', type: 'jsonb', nullable: true }) whyAnalysis: any;
  /** Optional linked documents as NC evidence (CAPA-001). */
  @Column({ name: 'evidence_document_ids', type: 'jsonb', nullable: true }) evidenceDocumentIds: string[] | null;
  @Column({ name: 'evaluation_id', type: 'uuid', nullable: true }) evaluationId: string | null;
  /** Populated when NC is created from an audit checklist item (AUD-005). */
  @Column({ name: 'audit_checklist_id', type: 'uuid', nullable: true }) auditChecklistId: string | null;
  @ManyToOne(() => Evaluation, (e) => e.nonConformities, { nullable: true })
  @JoinColumn({ name: 'evaluation_id' }) evaluation: Evaluation;
  @OneToMany(() => CapaAction, (c) => c.nonConformity) capaActions: CapaAction[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('capa_actions')
export class CapaAction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @Column({ type: 'enum', enum: CAPAType }) type: CAPAType;
  @Column() title: string;
  @Column({ type: 'text' }) description: string;
  @Column({ name: 'assigned_to' }) assignedTo: string;
  @Column({ name: 'due_date' }) dueDate: Date;
  @Column({
    name: 'action_status',
    type: 'enum',
    enum: CapaActionStatus,
    default: CapaActionStatus.PLANNED,
  }) actionStatus: CapaActionStatus;
  @Column({ name: 'completed_at', nullable: true }) completedAt: Date;
  @Column({ name: 'is_effective', nullable: true }) isEffective: boolean;
  @Column({ name: 'verified_by', nullable: true }) verifiedBy: string;
  @Column({ name: 'verified_at', nullable: true }) verifiedAt: Date;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ name: 'non_conformity_id' }) nonConformityId: string;
  /** Linked evidence documents for CAPA implementation (CAPA-007). */
  @Column({ name: 'evidence_document_ids', type: 'jsonb', nullable: true }) evidenceDocumentIds: string[] | null;
  @Column({ name: 'due_reminder_sent_at', type: 'timestamptz', nullable: true }) dueReminderSentAt: Date | null;
  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true }) createdByUserId: string | null;
  @Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true }) completedByUserId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => NonConformity, (nc) => nc.capaActions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'non_conformity_id' }) nonConformity: NonConformity;
}
