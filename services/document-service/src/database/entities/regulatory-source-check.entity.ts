import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('regulatory_source_checks')
@Index(['sourceId', 'startedAt'])
export class RegulatorySourceCheck {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'source_id', length: 32 })
  sourceId!: string;

  @Column({ name: 'status', length: 32 })
  status!: 'BASELINE_CAPTURED' | 'UNCHANGED' | 'POTENTIAL_CHANGE' | 'ERROR';

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt!: Date;

  @Column({ name: 'duration_ms', type: 'integer', default: 0 })
  durationMs!: number;

  @Column({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus?: number | null;

  @Column({ name: 'final_url', length: 2048, nullable: true })
  finalUrl?: string | null;

  @Column({ name: 'previous_hash', length: 64, nullable: true })
  previousHash?: string | null;

  @Column({ name: 'current_hash', length: 64, nullable: true })
  currentHash?: string | null;

  @Column({ name: 'change_types', type: 'jsonb', default: '[]' })
  changeTypes!: string[];

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
