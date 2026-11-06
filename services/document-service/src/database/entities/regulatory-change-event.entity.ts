import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('regulatory_change_events')
@Index(['state', 'detectedAt'])
@Index(['sourceId', 'detectedAt'])
export class RegulatoryChangeEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'source_id', length: 32 })
  sourceId!: string;

  @Column({ name: 'check_id', type: 'uuid' })
  checkId!: string;

  @Column({ name: 'source_name', length: 500 })
  sourceName!: string;

  @Column({ name: 'source_url', length: 2048 })
  sourceUrl!: string;

  @Column({ name: 'priority', length: 8 })
  priority!: string;

  @Column({ name: 'detected_at', type: 'timestamptz' })
  detectedAt!: Date;

  @Column({ name: 'title', length: 500 })
  title!: string;

  @Column({ name: 'summary', type: 'text' })
  summary!: string;

  @Column({ name: 'change_types', type: 'jsonb', default: '[]' })
  changeTypes!: string[];

  @Column({ name: 'before_hash', length: 64, nullable: true })
  beforeHash?: string | null;

  @Column({ name: 'after_hash', length: 64 })
  afterHash!: string;

  @Column({ name: 'change_excerpt', type: 'text', nullable: true })
  changeExcerpt?: string | null;

  @Column({ length: 32, default: 'NEEDS_REVIEW' })
  state!: 'NEEDS_REVIEW' | 'CONFIRMED_CHANGE' | 'NOT_REGULATORY_CHANGE';

  @Column({ name: 'reviewed_by', length: 128, nullable: true })
  reviewedBy?: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote?: string | null;

  @Column({ name: 'notifications_created', type: 'integer', default: 0 })
  notificationsCreated!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
