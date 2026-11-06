import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ReportType } from './report.entity';

export interface TemplateField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'file' | 'table' | 'signature' | 'number' | 'email';
  required: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    custom?: string;
  };
  conditional?: {
    dependsOn: string; // Field ID it depends on
    showWhen?: any;
  };
  help?: string;
  order: number;
}

export interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  fields: TemplateField[];
  order: number;
  collapsible?: boolean;
  repeatable?: boolean;
}

/**
 * Report Template entity - Stores configurable report templates
 * Admins can create and manage templates without code changes
 */
@Entity('report_templates')
@Index(['companyId', 'reportType', 'isActive'])
@Index(['name'])
export class ReportTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ReportType })
  reportType!: ReportType;

  /** Template sections and fields */
  @Column({ type: 'jsonb' })
  sections: TemplateSection[];

  /** Available statuses for this template type */
  @Column({ type: 'jsonb', default: JSON.stringify(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CLOSED']) })
  statuses: string[];

  /** Workflow transitions allowed (from -> [to]) */
  @Column({ type: 'jsonb', nullable: true })
  workflow: Record<string, string[]> | null;

  /** Available approval roles for this template */
  @Column({ type: 'jsonb', default: JSON.stringify(['QUALITY_MANAGER', 'ADMIN']) })
  approvalRoles: string[];

  /** CSS/styling for PDF generation */
  @Column({ type: 'text', nullable: true })
  pdfTemplate: string | null;

  /** Enable collaborative editing */
  @Column({ name: 'enable_collaboration', default: true })
  enableCollaboration: boolean;

  /** Require signatures */
  @Column({ name: 'require_signatures', default: false })
  requireSignatures: boolean;

  /** Enable modification tracking */
  @Column({ name: 'track_modifications', default: true })
  trackModifications: boolean;

  /** Version number of this template */
  @Column({ type: 'int', default: 1 })
  version: number;

  /** Is this template currently active */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Parent template ID if this is a revision */
  @Column({ name: 'parent_template_id', type: 'uuid', nullable: true })
  parentTemplateId: string | null;

  /** Who created this template */
  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  /** Who last modified this template */
  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @OneToMany(() => ReportTemplateVersion, (v) => v.template, { cascade: true })
  versions: ReportTemplateVersion[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Template version history
 * Track template changes and allow rollback
 */
@Entity('report_template_versions')
@Index(['templateId', 'versionNumber'])
export class ReportTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @ManyToOne(() => ReportTemplate, (t) => t.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: ReportTemplate;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  /** Full template snapshot */
  @Column({ type: 'jsonb' })
  snapshot: {
    sections: TemplateSection[];
    statuses: string[];
    workflow?: Record<string, string[]>;
    approvalRoles: string[];
    pdfTemplate?: string;
  };

  /** What changed in this version */
  @Column({ type: 'text', nullable: true })
  changeDescription: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
