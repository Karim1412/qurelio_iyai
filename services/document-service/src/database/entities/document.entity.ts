import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import type { ExtractedStructure } from '../../ocr/extracted-structure';

/**
 * Product: Container for related documents (e.g., "Product X" has multiple specs, manuals, images)
 */
@Entity('products')
@Index(['companyId'])
@Index(['companyId', 'name'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column()
  name!: string; // e.g., "Widget A", "Safety Harness Pro"

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  sku?: string; // Product SKU / code

  @Column({ nullable: true })
  reference?: string;

  @Column({ nullable: true })
  revision?: string;

  @Column({ name: 'category_tags', type: 'text', array: true, default: '{}' })
  categoryTags!: string[];

  /** Merged productProfile from document extractions (Overview / Specs tabs) */
  @Column({ name: 'merged_profile', type: 'jsonb', nullable: true })
  mergedProfile?: Record<string, unknown> | null;

  /** Per-field traceability: which document (id + name) supplied the value currently shown in mergedProfile, keyed by dotted path. */
  @Column({ name: 'field_provenance', type: 'jsonb', nullable: true })
  fieldProvenance?: Record<string, unknown> | null;

  /** Fields where two or more documents disagreed on the value — first-seen stays authoritative until resolved. */
  @Column({ name: 'field_conflicts', type: 'jsonb', nullable: true })
  fieldConflicts?: Record<string, unknown> | null;

  /** Deterministic, product-level (cross-document) extraction completeness — recomputed on every merge. */
  @Column({ name: 'extraction_quality', type: 'jsonb', nullable: true })
  extractionQuality?: Record<string, unknown> | null;

  /** Cross-check of requiredCertifications (declared at onboarding) against what was actually found across attached documents. */
  @Column({ name: 'requirement_coverage', type: 'jsonb', nullable: true })
  requirementCoverage?: Record<string, unknown> | null;

  /** Deterministic (template-based, not AI-generated) one-paragraph compliance-readiness summary. */
  @Column({ name: 'readiness_summary', type: 'text', nullable: true })
  readinessSummary?: string | null;

  /** Facts the AI freely captured that don't fit any predefined field — accumulated across all documents, deduped, capped at 30. */
  @Column({ name: 'custom_fields', type: 'jsonb', nullable: true })
  customFields?: Record<string, unknown>[] | null;

  /** Compact source-grounded facts accumulated across all product documents. */
  @Column({ name: 'product_facts', type: 'jsonb', nullable: true })
  productFacts?: Record<string, unknown>[] | null;

  // ── Step 1: Identity ────────────────────────────────────────────────────

  @Column({ name: 'brand_name', nullable: true })
  brandName?: string;

  @Column({ name: 'product_family', nullable: true })
  productFamily?: string;

  @Column({ name: 'product_type', nullable: true })
  productType?: string; // 'finished' | 'semi_finished' | 'component' | 'raw_material' | 'service'

  @Column({ name: 'product_status', nullable: true })
  productStatus?: string; // 'active' | 'draft' | 'discontinued'

  // ── Step 2: Technical ───────────────────────────────────────────────────

  @Column({ name: 'intended_use', type: 'text', nullable: true })
  intendedUse?: string;

  @Column({ name: 'target_users', type: 'jsonb', default: '[]' })
  targetUsers!: string[];

  @Column({ name: 'key_materials', type: 'jsonb', default: '[]' })
  keyMaterials!: string[];

  @Column({ name: 'physical_form', nullable: true })
  physicalForm?: string;

  @Column({ name: 'hs_tariff_code', nullable: true })
  hsTariffCode?: string;

  @Column({ name: 'country_of_origin', nullable: true })
  countryOfOrigin?: string;

  // ── Step 3: Markets ─────────────────────────────────────────────────────

  @Column({ name: 'target_markets', type: 'jsonb', default: '[]' })
  targetMarkets!: string[];

  @Column({ name: 'required_certifications', type: 'jsonb', default: '[]' })
  requiredCertifications!: string[];

  @Column({ name: 'applicable_regulations', type: 'jsonb', default: '[]' })
  applicableRegulations!: string[];

  @Column({ name: 'industry_labels', type: 'jsonb', default: '[]' })
  industryLabels!: string[];

  // ── Step 4: Manufacturing ───────────────────────────────────────────────

  @Column({ name: 'production_sites', type: 'jsonb', default: '[]' })
  productionSites!: string[];

  @Column({ name: 'production_processes', type: 'jsonb', default: '[]' })
  productionProcesses!: string[];

  @Column({ name: 'critical_suppliers', type: 'jsonb', default: '[]' })
  criticalSuppliers!: string[];

  // ── Step 5: Certifications ──────────────────────────────────────────────

  @Column({ name: 'product_certifications', type: 'jsonb', default: '[]' })
  productCertifications!: Array<{
    standardName: string;
    certifyingBody: string;
    certificateNumber: string;
    marketScope: string;
    issueDate: string;
    expiryDate: string;
  }>;

  // ── Status ──────────────────────────────────────────────────────────────

  @Column({ name: 'onboarding_status', nullable: true })
  onboardingStatus?: string; // 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

  @Column({ name: 'current_step', type: 'int', nullable: true })
  currentStep?: number;

  @OneToMany(() => Document, (d) => d.product)
  documents!: Document[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** When set, the product folder is hidden from the active library; files are archived together. */
  @Column({ name: 'archived_at', type: 'timestamp with time zone', nullable: true })
  archivedAt?: Date | null;
}

/**
 * FileFolder: user-managed, nestable folder tree for the File Manager.
 * Independent from Product (which is a flat product container). A folder may
 * have a parent (self-reference) to form a Windows-Explorer-like hierarchy.
 */
@Entity('file_folders')
@Index(['companyId'])
@Index(['companyId', 'parentId'])
export class FileFolder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column()
  name!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * Document: now belongs to a Product (optional for ISO norms / procedures which are company-wide)
 */
export enum DocumentType {
  ISO_NORM = 'ISO_NORM',
  PRODUCT_DOC = 'PRODUCT_DOC',
  PROCEDURE = 'PROCEDURE',
  EVIDENCE = 'EVIDENCE',
  /** Stored file only: no OCR/RAG pipeline (e.g. open in Google Docs/Sheets locally). */
  WORKSPACE_FILE = 'WORKSPACE_FILE',
}
/** UPLOADED = stored; PROCESSING = OCR/extraction; READY = processed (indexed for search); FAILED = error */
export enum DocumentStatus {
  UPLOADING = 'UPLOADING',
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

/** Draft → review → approved (DOC-004); ISO standards may leave null */
export enum DocumentApprovalStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** Standards library lifecycle (STD-004, STD-005), applies mainly to ISO_NORM */
export enum StandardLibraryStatus {
  PROCESSING = 'PROCESSING',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity('documents')
@Index(['companyId'])
@Index(['companyId', 'productId'])
@Index(['companyId', 'type'])
@Index(['companyId', 'archivedAt'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ name: 'mime_type' })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ type: 'enum', enum: DocumentType })
  type!: DocumentType;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.UPLOADED })
  status!: DocumentStatus;

  @Column({ name: 'approval_status', type: 'enum', enum: DocumentApprovalStatus, nullable: true })
  approvalStatus?: DocumentApprovalStatus | null;

  @Column({ name: 'library_status', type: 'enum', enum: StandardLibraryStatus, nullable: true })
  libraryStatus?: StandardLibraryStatus | null;

  @Column({ name: 'archived_at', type: 'timestamp with time zone', nullable: true })
  archivedAt?: Date | null;

  @Column({ name: 'effective_date', type: 'date', nullable: true })
  effectiveDate?: Date | null;

  @Column({ name: 'storage_key' })
  storageKey!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  // NEW: Link to product (optional, null for company-wide docs like ISO norms)
  @Column({ name: 'product_id', nullable: true })
  productId?: string;

  @ManyToOne(() => Product, (p) => p.documents, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  /** File Manager folder this document is organised into (optional). */
  @Column({ name: 'folder_id', type: 'uuid', nullable: true })
  folderId?: string | null;

  @Column({ name: 'uploaded_by' })
  uploadedBy!: string;

  @Column({ default: 1 })
  version!: number;

  @Column({ name: 'iso_standard', nullable: true })
  isoStandard?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  /**
   * Workspace / QMS records (WORKSPACE_FILE): new uploads set inactive until QM / Company Admin activates.
   * DB default true keeps older rows usable if the column is added to an existing database.
   */
  @Column({ name: 'workspace_active', default: true })
  workspaceActive!: boolean;

  /** User-defined type e.g. Report, PV, Certificate (WORKSPACE_FILE). */
  @Column({ name: 'workspace_category', nullable: true })
  workspaceCategory?: string | null;

  @Column({ name: 'extracted_text', type: 'text', nullable: true })
  extractedText?: string;

  /** JSON from OpenAI structuring (sections, title, metadata). */
  @Column({ name: 'extracted_structured', type: 'jsonb', nullable: true })
  extractedStructured?: ExtractedStructure | null;

  @Column({ name: 'processing_error', nullable: true })
  processingError?: string;

  /**
   * Copyright guardrail (Standards & Regulations): set when the uploader was
   * warned the document looks like a licensed standard and accepted
   * responsibility for their right to use it.
   */
  @Column({ name: 'copyright_ack', default: false })
  copyrightAcknowledged!: boolean;

  /** What the guardrail matched, e.g. "ISO 13485": kept as evidence of the warning. */
  @Column({ name: 'copyright_flag', type: 'text', nullable: true })
  copyrightFlag?: string | null;

  /**
   * Held back by the content scan: stored but never indexed and not activatable
   * until a Quality Manager accepts responsibility for it.
   */
  @Column({ name: 'copyright_quarantined', default: false })
  copyrightQuarantined!: boolean;

  /** Manual fallback when OCR fails after retries (DOC edge case) */
  @Column({ name: 'manual_text_override', type: 'text', nullable: true })
  manualTextOverride?: string | null;

  @OneToMany(() => DocumentVersion, (v) => v.document)
  versions!: DocumentVersion[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

@Entity('document_versions')
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  version!: number;

  @Column({ name: 'storage_key' })
  storageKey!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ name: 'uploaded_by' })
  uploadedBy!: string;

  @Column({ name: 'change_note', nullable: true })
  changeNote?: string;

  @Column({ default: false })
  archived!: boolean;

  @ManyToOne(() => Document, (d) => d.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
