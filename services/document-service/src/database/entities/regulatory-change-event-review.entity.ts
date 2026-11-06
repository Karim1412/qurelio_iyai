import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Tenant-scoped impact review for a globally detected source-change signal.
 * The shared source event is never globally confirmed/rejected by one customer's reviewer.
 * Each company can record its own assessment of the impact on its products.
 */
@Entity('regulatory_change_event_reviews')
@Index(['companyId', 'eventId', 'reviewedAt'])
@Index(['companyId', 'state', 'reviewedAt'])
export class RegulatoryChangeEventReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'company_id' })
  companyId!: string;

  @Column({ length: 32 })
  state!: 'ACTION_REQUIRED' | 'NO_PRODUCT_IMPACT';

  @Column({ name: 'reviewed_by', length: 128 })
  reviewedBy!: string;

  @Column({ name: 'reviewer_role', length: 64 })
  reviewerRole!: string;

  @Column({ name: 'review_note', type: 'text' })
  reviewNote!: string;

  @CreateDateColumn({ name: 'reviewed_at', type: 'timestamptz' })
  reviewedAt!: Date;
}
