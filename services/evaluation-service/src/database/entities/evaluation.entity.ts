import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { NonConformity } from './non-conformity.entity';

export enum EvaluationStatus { QUEUED = 'QUEUED', PROCESSING = 'PROCESSING', COMPLETED = 'COMPLETED', FAILED = 'FAILED' }

@Entity('evaluations')
export class Evaluation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'company_id' })       companyId!: string;
  @Column({ name: 'initiated_by' })     initiatedBy!: string;
  @Column({ name: 'initiator_email', type: 'varchar', length: 320, nullable: true })
  initiatorEmail!: string | null;
  @Column({ type: 'enum', enum: EvaluationStatus, default: EvaluationStatus.QUEUED }) status!: EvaluationStatus;
  @Column({ name: 'conformity_score', type: 'float', nullable: true })
  conformityScore!: number | null;
  @Column({ name: 'iso_document_id' })     isoDocumentId!: string;
  @Column({ name: 'iso_standard' })        isoStandard!: string;
  @Column({ name: 'product_document_id' }) productDocumentId!: string;
  @Column({ name: 'evidence_document_ids', type: 'jsonb', nullable: true }) evidenceDocumentIds!: string[] | null;
  @Column({ name: 'scoring_method', type: 'varchar', length: 32, default: 'AI_AUTOMATIC' }) scoringMethod!: string;
  @Column({ name: 'clause_weights', type: 'jsonb', nullable: true }) clauseWeights!: Record<string, number> | null;
  @Column({ name: 'request_snapshot', type: 'jsonb', nullable: true }) requestSnapshot!: Record<string, unknown> | null;
  @Column({ name: 'nc_drafts', type: 'jsonb', nullable: true }) ncDrafts!: Record<string, unknown>[] | null;
  @Column({ name: 'nc_drafts_confirmed_at', type: 'timestamptz', nullable: true }) ncDraftsConfirmedAt!: Date | null;
  @Column({ name: 'override_audit', type: 'jsonb', nullable: true }) overrideAudit!: Record<string, unknown>[] | null;
  @Column({ type: 'jsonb', nullable: true }) results!: any;
  @Column({ type: 'text', nullable: true }) summary!: string;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @OneToMany(() => NonConformity, (nc) => nc.evaluation) nonConformities!: NonConformity[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
