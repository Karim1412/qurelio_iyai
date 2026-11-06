import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum NotificationType {
  GENERAL = 'GENERAL',
  ALERT = 'ALERT',
  EVALUATION_COMPLETE = 'EVALUATION_COMPLETE',
  /** Document OCR / extraction finished (success or failure) */
  DOCUMENT_EXTRACTION_COMPLETE = 'DOCUMENT_EXTRACTION_COMPLETE',
  CAPA_ASSIGNED = 'CAPA_ASSIGNED',
  CAPA_DUE_SOON = 'CAPA_DUE_SOON',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  /** Hidden from the main inbox until restored */
  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
