import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Curated source registry imported from the tutor-provided workbook.
 * A monitored source is an information endpoint, not an individual legal instrument.
 */
@Entity('regulatory_monitor_sources')
@Index(['enabled', 'nextCheckAt'])
@Index(['jurisdiction', 'priority'])
export class RegulatoryMonitorSource {
  @PrimaryColumn({ name: 'source_id', length: 32 })
  sourceId!: string;

  @Column({ name: 'region_group', length: 100 })
  regionGroup!: string;

  @Column({ length: 160 })
  jurisdiction!: string;

  @Column({ name: 'regulatory_domain', length: 240 })
  regulatoryDomain!: string;

  @Column({ name: 'source_name', length: 500 })
  sourceName!: string;

  @Column({ name: 'official_url', length: 2048 })
  officialUrl!: string;

  @Column({ name: 'publisher_type', type: 'text' })
  publisherType!: string;

  @Column({ name: 'source_class', type: 'text' })
  sourceClass!: string;

  @Column({ name: 'content_to_monitor', type: 'text' })
  contentToMonitor!: string;

  @Column({ name: 'preferred_detection_method', type: 'text' })
  preferredDetectionMethod!: string;

  @Column({ name: 'suggested_check_cadence', length: 200 })
  suggestedCheckCadence!: string;

  @Column({ length: 8 })
  priority!: string;

  @Column({ name: 'automation_notes', type: 'text' })
  automationNotes!: string;

  @Column({ name: 'access_licensing_notes', type: 'text' })
  accessLicensingNotes!: string;

  @Column({ name: 'recommended_ai_use', type: 'text' })
  recommendedAiUse!: string;

  @Column({ name: 'verification_status', type: 'text' })
  verificationStatus!: string;

  /** Source-specific interval derived from the workbook recommendation; never slower than weekly by default. */
  @Column({ name: 'check_interval_hours', type: 'integer', default: 168 })
  checkIntervalHours!: number;

  /** True only after a platform admin explicitly overrides the workbook's recommended cadence. */
  @Column({ name: 'check_interval_manually_configured', type: 'boolean', default: false })
  checkIntervalManuallyConfigured!: boolean;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ name: 'check_status', length: 32, default: 'NEVER_CHECKED' })
  checkStatus!: 'NEVER_CHECKED' | 'CHECKING' | 'OK' | 'CHANGE_DETECTED' | 'ERROR';

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt?: Date | null;

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt?: Date | null;

  @Column({ name: 'next_check_at', type: 'timestamptz', nullable: true })
  nextCheckAt?: Date | null;

  @Column({ name: 'last_http_status', type: 'integer', nullable: true })
  lastHttpStatus?: number | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'last_etag', type: 'text', nullable: true })
  lastEtag?: string | null;

  @Column({ name: 'last_modified_header', type: 'text', nullable: true })
  lastModifiedHeader?: string | null;

  @Column({ name: 'last_content_hash', length: 64, nullable: true })
  lastContentHash?: string | null;

  /** Bounded canonical snapshot used for deterministic comparison; never interpreted as legal advice by itself. */
  @Column({ name: 'last_content_snapshot', type: 'text', nullable: true })
  lastContentSnapshot?: string | null;

  @Column({ name: 'last_link_inventory', type: 'jsonb', default: '[]' })
  lastLinkInventory!: Array<{ url: string; text: string }>;

  @Column({ name: 'last_failure_count', type: 'integer', default: 0 })
  lastFailureCount!: number;

  @Column({ name: 'last_change_detected_at', type: 'timestamptz', nullable: true })
  lastChangeDetectedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
