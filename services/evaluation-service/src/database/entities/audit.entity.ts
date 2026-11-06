import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';

export enum AuditType   { INTERNAL = 'INTERNAL', SUPPLIER = 'SUPPLIER', CERTIFICATION = 'CERTIFICATION', DEFAULT = 'DEFAULT' }
export enum AuditStatus { PLANNED = 'PLANNED', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED' }
/** Checklist / finding status (AUD-004). STRENGTH = strong point. */
export enum FindingType { CONFORMANT = 'CONFORMANT', NON_CONFORMANT = 'NON_CONFORMANT', OBSERVATION = 'OBSERVATION', STRENGTH = 'STRENGTH' }

@Entity('audits')
export class Audit {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'company_id' }) companyId!: string;
  @Column() title!: string;
  @Column({ type: 'enum', enum: AuditType }) type!: AuditType;
  @Column({ type: 'enum', enum: AuditStatus, default: AuditStatus.PLANNED }) status: AuditStatus;
  /** Start date / time (AUD-001). Nullable so schema sync can adopt existing DB rows without a backfill. */
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;
  /** End date / time (AUD-001). */
  @Column({ name: 'scheduled_end_at', type: 'timestamptz', nullable: true }) scheduledEndAt: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ name: 'lead_auditor' }) leadAuditor: string;
  @Column({ type: 'text' }) scope: string;
  /** Selected clause refs for scope, e.g. ["4.1","5.2"] (AUD-001 / AUD-003). */
  @Column({ name: 'scope_clause_refs', type: 'jsonb', nullable: true }) scopeClauseRefs: string[] | null;
  @Column({ name: 'iso_standard', type: 'varchar', length: 32, nullable: true })
  isoStandard: string | null;
  @Column({ name: 'overall_conclusion', type: 'text', nullable: true }) overallConclusion: string;
  /** AUD-006 snapshot: summary, checklist summary, findings, linked NC ids. */
  @Column({ name: 'completed_report', type: 'jsonb', nullable: true }) completedReport: Record<string, unknown> | null;
  @OneToMany(() => AuditFinding,    (f) => f.audit) findings:   AuditFinding[];
  @OneToMany(() => AuditChecklist,  (c) => c.audit) checklists: AuditChecklist[];
  @OneToMany(() => AuditChangeLog, (l) => l.audit) changeLogs: AuditChangeLog[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('audit_findings')
export class AuditFinding {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'audit_id' })   auditId: string;
  @Column({ type: 'enum', enum: FindingType }) type: FindingType;
  @Column({ name: 'iso_clause', nullable: true }) isoClause: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'text', nullable: true }) evidence: string;
  @Column({ name: 'recorded_by' }) recordedBy: string;
  @ManyToOne(() => Audit, (a) => a.findings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_id' }) audit: Audit;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('audit_checklists')
export class AuditChecklist {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'audit_id' })   auditId: string;
  @Column({ name: 'iso_clause' }) isoClause: string;
  @Column({ type: 'text' }) question: string;
  /** 1=chapter, 2=section, 3=criteria; null=legacy/flat (render as criteria). */
  @Column({ name: 'hierarchy_level', type: 'int', nullable: true }) hierarchyLevel: number | null;
  /** Conformance score 0–100; maps to the audit spreadsheet “percentage” column. */
  @Column({ type: 'int', nullable: true }) score: number | null;
  @Column({ type: 'enum', enum: FindingType, nullable: true }) answer: FindingType | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  /** Per-criterion evidence checklist: default + AI-generated + user lines (optional source: default|ai|user). */
  @Column({ name: 'evidence_checks', type: 'jsonb', nullable: true })
  evidenceChecks: Array<{ id: string; label: string; checked: boolean; source?: 'default' | 'ai' | 'user' }> | null;
  /** Optional evidence file (document id in document-service). */
  @Column({ name: 'attachment_document_id', type: 'uuid', nullable: true }) attachmentDocumentId: string | null;
  /** NC created automatically when answer = NON_CONFORMANT (AUD-005). */
  @Column({ name: 'nc_id', type: 'uuid', nullable: true }) ncId: string | null;
  @ManyToOne(() => Audit, (a) => a.checklists, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_id' }) audit: Audit;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

/** AUD-008 audit trail for audit record and checklist changes. */
@Entity('audit_change_logs')
export class AuditChangeLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'audit_id' }) auditId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ length: 96 }) action: string;
  @Column({ type: 'jsonb', nullable: true }) detail: Record<string, unknown> | null;
  @ManyToOne(() => Audit, (a) => a.changeLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_id' }) audit: Audit;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
