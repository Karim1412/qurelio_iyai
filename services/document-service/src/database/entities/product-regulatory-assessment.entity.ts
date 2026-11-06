import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Immutable, tenant-scoped human review of a product/regulatory-reference pair.
 * A new row is written for each decision so prior decisions remain auditable.
 * This entity does NOT represent an automatically computed legal conclusion.
 */
@Entity('product_regulatory_assessments')
@Index(['companyId', 'productId', 'reviewedAt'])
@Index(['companyId', 'productId', 'regulationId'])
export class ProductRegulatoryAssessment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column({ name: 'product_id' })
  productId!: string;

  @Column({ name: 'regulation_id', nullable: true })
  regulationId?: string | null;

  @Column({ length: 500 })
  reference!: string;

  @Column({ length: 1000, nullable: true })
  title?: string | null;

  @Column({ length: 32 })
  decision!: 'APPLICABLE' | 'CONDITIONAL' | 'NOT_APPLICABLE' | 'NEEDS_REVIEW';

  @Column({ type: 'text' })
  rationale!: string;

  @Column({ type: 'text', nullable: true })
  conditions?: string | null;

  /** User-entered traceability references (document names/IDs or evidence references). */
  @Column({ name: 'evidence_references', type: 'jsonb', default: '[]' })
  evidenceReferences!: string[];

  @Column({ name: 'source_url', length: 2048, nullable: true })
  sourceUrl?: string | null;

  @Column({ name: 'source_version', length: 200, nullable: true })
  sourceVersion?: string | null;

  /** Stable monitored source selected from the source registry when the reviewer saves the decision. */
  @Column({ name: 'monitored_source_id', length: 32, nullable: true })
  monitoredSourceId?: string | null;

  /** Hash of the source snapshot used as the review baseline, if a snapshot existed. */
  @Column({ name: 'source_snapshot_hash_at_review', length: 64, nullable: true })
  sourceSnapshotHashAtReview?: string | null;

  @Column({ name: 'reviewer_id' })
  reviewerId!: string;

  @Column({ name: 'reviewer_role', length: 64 })
  reviewerRole!: string;

  @CreateDateColumn({ name: 'reviewed_at', type: 'timestamptz' })
  reviewedAt!: Date;
}
