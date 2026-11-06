import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index,
} from 'typeorm';

export enum ReportType {
  AUDIT = 'AUDIT',
  NON_CONFORMITY = 'NON_CONFORMITY',
  CAPA = 'CAPA',
  INCIDENT = 'INCIDENT',
  COMPLAINT = 'COMPLAINT',
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

export enum ReportSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Main Report entity storing report instances
 * Supports multiple report types with configurable templates and workflows
 */
@Entity('reports')
@Index(['companyId', 'type', 'status'])
@Index(['companyId', 'createdAt'])
@Index(['assignedToUserId'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column({ type: 'enum', enum: ReportType })
  type!: ReportType;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.DRAFT })
  status: ReportStatus;

  @Column({ type: 'enum', enum: ReportSeverity, nullable: true })
  severity: ReportSeverity | null;

  /** Reference to template version used to create this report */
  @Column({ name: 'template_version_id', type: 'uuid', nullable: true })
  templateVersionId: string | null;

  /** User who created the report */
  @Column({ name: 'created_by_user_id' })
  createdByUserId!: string;

  /** User who submitted the report (filled when status changes to SUBMITTED) */
  @Column({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId: string | null;

  /** User assigned to review/approve the report */
  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  /** User who approved/rejected the report */
  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  /** Approval/rejection comment */
  @Column({ type: 'text', nullable: true })
  approvalComment: string | null;

  /** Submitted at timestamp */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /** Approved/rejected at timestamp */
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  /** Closed at timestamp */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** Due date for report submission/review */
  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  /** Report-specific data stored as JSON (flexible per template) */
  @Column({ type: 'jsonb', default: '{}' })
  data: Record<string, unknown>;

  /** Current version number (auto-incremented on save) */
  @Column({ type: 'int', default: 1 })
  version: number;

  /** Is this report locked for editing (true during approval) */
  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  /** Document IDs attached to this report (evidence files) */
  @Column({ name: 'attachment_document_ids', type: 'jsonb', nullable: true })
  attachmentDocumentIds: string[] | null;

  /** Related entity IDs (e.g., audit ID, NC ID) */
  @Column({ name: 'related_entity_ids', type: 'jsonb', nullable: true })
  relatedEntityIds: Record<string, string> | null;

  @OneToMany(() => ReportVersion, (v) => v.report)
  versions: ReportVersion[];

  @OneToMany(() => ReportModification, (m) => m.report)
  modifications: ReportModification[];

  @OneToMany(() => ReportApproval, (a) => a.report)
  approvals: ReportApproval[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Version history for reports
 * Every save creates a new version snapshot
 */
@Entity('report_versions')
@Index(['reportId', 'versionNumber'])
export class ReportVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'report_id' })
  reportId!: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  /** Snapshot of report data at this version */
  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  /** Who created this version */
  @Column({ name: 'created_by_user_id' })
  createdByUserId!: string;

  /** Change reason/comment */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne(() => Report, (r) => r.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: Report;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/**
 * Track all modifications to report fields
 * Enables complete audit trail and change visualization
 */
@Entity('report_modifications')
@Index(['reportId', 'createdAt'])
@Index(['fieldName'])
@Index(['modifiedByUserId'])
export class ReportModification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'report_id' })
  reportId!: string;

  /** Field name that was modified */
  @Column({ name: 'field_name' })
  fieldName!: string;

  /** Old value before modification */
  @Column({ type: 'jsonb', nullable: true })
  oldValue: any;

  /** New value after modification */
  @Column({ type: 'jsonb', nullable: true })
  newValue: any;

  /** Who made this modification */
  @Column({ name: 'modified_by_user_id' })
  modifiedByUserId!: string;

  /** Reason for modification */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne(() => Report, (r) => r.modifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: Report;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/**
 * Approval/rejection history
 * Tracks who approved/rejected and when
 */
@Entity('report_approvals')
@Index(['reportId', 'createdAt'])
@Index(['approverUserId'])
export class ReportApproval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'report_id' })
  reportId!: string;

  @Column({ name: 'approver_user_id' })
  approverUserId!: string;

  @Column({ type: 'enum', enum: ReportStatus })
  action: ReportStatus; // APPROVED or REJECTED

  @Column({ type: 'text' })
  comment: string;

  @ManyToOne(() => Report, (r) => r.approvals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: Report;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
