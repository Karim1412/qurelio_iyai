import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany, Index, Unique,
} from 'typeorm';

/**
 * Demo booking calendar.
 *
 * Public visitors browse OPEN slots and book one; the platform super admin owns
 * the calendar. Slots are explicit rows rather than generated from weekly rules,
 * so "what is bookable" is always exactly what the admin created.
 */

export enum DemoSlotStatus {
  /** Published and bookable by the public page. */
  OPEN = 'OPEN',
  /** Held by a booking request (pending or confirmed). */
  BOOKED = 'BOOKED',
  /** Kept on the calendar but withdrawn from the public page. */
  BLOCKED = 'BLOCKED',
}

export enum DemoBookingStatus {
  /** Awaiting the admin's answer: the 48 h response target applies from createdAt. */
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  /** Withdrawn after being accepted, or cancelled with the slot. */
  CANCELLED = 'CANCELLED',
}

@Entity('demo_slots')
@Index(['startsAt'])
@Index(['status', 'startsAt'])
// One slot per instant: makes double-creation impossible, including via bulk generate.
@Unique('uq_demo_slot_startsAt', ['startsAt'])
export class DemoSlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Slot start, stored with timezone so the public page can render it locally. */
  @Column({ name: 'starts_at', type: 'timestamp with time zone' })
  startsAt!: Date;

  @Column({ name: 'duration_minutes', type: 'int', default: 45 })
  durationMinutes!: number;

  @Column({ type: 'enum', enum: DemoSlotStatus, default: DemoSlotStatus.OPEN })
  status!: DemoSlotStatus;

  @OneToMany(() => DemoBooking, (b) => b.slot)
  bookings!: DemoBooking[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

@Entity('demo_bookings')
@Index(['status', 'createdAt'])
@Index(['email'])
export class DemoBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'slot_id', type: 'uuid' })
  slotId!: string;

  @ManyToOne(() => DemoSlot, (s) => s.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slot_id' })
  slot!: DemoSlot;

  /**
   * Request form: the Early Access questionnaire, filled in the booking popup.
   *
   * A booking and its qualification answers are one record: the visitor picks a
   * slot and answers in the same step, so there is no separate request to
   * reconcile. `field` and `companyCapacity` keep their column names for the
   * rows created before the questionnaire existed.
   */

  @Column({ name: 'company_name' })
  companyName!: string;

  /** Field / Industry: Pharmaceutical / Cosmetic / MedTech. */
  @Column()
  field!: string;

  /** Work email. */
  @Column()
  email!: string;

  /** E.164, produced by the same phone input as registration. Optional. */
  @Column({ nullable: true })
  phone?: string | null;

  /** What they want to see in the demo. Optional since the questionnaire replaced it. */
  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Company size band. */
  @Column({ name: 'company_capacity' })
  companyCapacity!: string;

  // ── Qualification answers ─────────────────────────────────────────────────

  @Column({ name: 'full_name', nullable: true })
  fullName?: string | null;

  @Column({ nullable: true })
  role?: string | null;

  @Column({ name: 'role_other', nullable: true })
  roleOther?: string | null;

  /** Own firm / clients / both: asked only of consultants. */
  @Column({ name: 'consulting_scope', nullable: true })
  consultingScope?: string | null;

  @Column({ name: 'markets_active', type: 'jsonb', default: '[]' })
  marketsActive!: string[];

  @Column({ name: 'markets_targeting', type: 'jsonb', default: '[]' })
  marketsTargeting!: string[];

  @Column({ type: 'jsonb', default: '[]' })
  certifications!: string[];

  @Column({ name: 'certifications_other', nullable: true })
  certificationsOther?: string | null;

  @Column({ name: 'product_count', nullable: true })
  productCount?: string | null;

  @Column({ name: 'compliance_today', nullable: true })
  complianceToday?: string | null;

  @Column({ name: 'qms_name', nullable: true })
  qmsName?: string | null;

  /** Up to three. */
  @Column({ type: 'jsonb', default: '[]' })
  challenges!: string[];

  @Column({ name: 'challenges_other', nullable: true })
  challengesOther?: string | null;

  @Column({ nullable: true })
  timeline?: string | null;

  @Column({ name: 'decision_role', nullable: true })
  decisionRole?: string | null;

  @Column({ name: 'pilot_interest', nullable: true })
  pilotInterest?: string | null;

  @Column({ name: 'preferred_language', nullable: true })
  preferredLanguage?: string | null;

  /** Required to submit: recorded as evidence of consent. */
  @Column({ name: 'consent_contact', default: false })
  consentContact!: boolean;

  @Column({ name: 'consent_marketing', default: false })
  consentMarketing!: boolean;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: DemoBookingStatus, default: DemoBookingStatus.PENDING })
  status!: DemoBookingStatus;

  /** Free-text note the admin adds when answering. */
  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote?: string | null;

  @Column({ name: 'responded_at', type: 'timestamp with time zone', nullable: true })
  respondedAt?: Date | null;

  /** Google Meet URL sent with the confirmation: generated, or pasted by the admin. */
  @Column({ name: 'meeting_link', type: 'text', nullable: true })
  meetingLink?: string | null;

  /** Calendar event backing the Meet link, so it can be cancelled if the demo is. */
  @Column({ name: 'calendar_event_id', nullable: true })
  calendarEventId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
