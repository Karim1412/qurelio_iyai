import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  DemoBooking, DemoBookingStatus, DemoSlot, DemoSlotStatus,
} from '../database/entities/demo.entity';
import {
  BulkCreateDemoSlotsDto, CreateDemoBookingDto, CreateDemoSlotDto,
  RespondDemoBookingDto, UpdateDemoSlotDto,
} from './demo.dto';
import { MailService } from '../mail/mail.service';
import { GoogleMeetService } from './google-meet.service';

/** Stated turnaround on the public page and in the confirmation email. */
export const DEMO_RESPONSE_TARGET_HOURS = 48;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(DemoSlot) private slots: Repository<DemoSlot>,
    @InjectRepository(DemoBooking) private bookings: Repository<DemoBooking>,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly meet: GoogleMeetService,
    private readonly config: ConfigService,
  ) {}

  // ── Public ────────────────────────────────────────────────────────────────

  /**
   * Bookable slots from now on. Past slots and anything already taken or
   * withdrawn never reach the public page.
   */
  async listPublicSlots(): Promise<Array<{ id: string; startsAt: string; durationMinutes: number }>> {
    const rows = await this.slots.find({
      where: { status: DemoSlotStatus.OPEN, startsAt: MoreThanOrEqual(new Date()) },
      order: { startsAt: 'ASC' },
      take: 500,
    });
    return rows.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      durationMinutes: s.durationMinutes,
    }));
  }

  /**
   * Conditional questions are only required once their trigger is chosen, so they
   * cannot be expressed with field-level decorators alone.
   */
  private assertConditionals(dto: CreateDemoBookingDto) {
    const missing: string[] = [];
    if (dto.role === 'Other' && !dto.roleOther?.trim()) missing.push('Please specify your role');
    if (dto.role === 'Quality & regulatory consultant' && !dto.consultingScope) {
      missing.push('Tell us whether Qurelio is for your own firm, your clients, or both');
    }
    if (dto.certifications?.includes('Other') && !dto.certificationsOther?.trim()) {
      missing.push('Please specify the other certification');
    }
    if (dto.complianceToday === 'A QMS or eQMS already in place' && !dto.qmsName?.trim()) {
      missing.push('Which QMS or eQMS do you use?');
    }
    if (dto.challenges.includes('Other') && !dto.challengesOther?.trim()) {
      missing.push('Please specify the other challenge');
    }
    if (dto.marketsActive.length === 0 && dto.marketsTargeting.length === 0) {
      missing.push('Select at least one market you are active in or targeting');
    }
    if (!dto.consentContact) missing.push('Consent is required to process your request');
    if (missing.length > 0) throw new BadRequestException(missing);
  }

  /**
   * Take a slot and record the request, questionnaire answers included.
   *
   * The slot claim runs in a transaction with a row lock so two visitors
   * submitting the same slot at the same moment cannot both win it.
   */
  async createBooking(dto: CreateDemoBookingDto) {
    this.assertConditionals(dto);

    const booking = await this.dataSource.transaction(async (tx) => {
      const slot = await tx.getRepository(DemoSlot).findOne({
        where: { id: dto.slotId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!slot) throw new NotFoundException('That time slot no longer exists');
      if (slot.status !== DemoSlotStatus.OPEN) {
        throw new ConflictException('That time slot has just been taken. Please pick another');
      }
      if (slot.startsAt.getTime() <= Date.now()) {
        throw new BadRequestException('That time slot is in the past. Please pick another');
      }

      await tx.getRepository(DemoSlot).update(slot.id, { status: DemoSlotStatus.BOOKED });

      const row = tx.getRepository(DemoBooking).create({
        slotId: slot.id,
        companyName: dto.companyName.trim(),
        field: dto.field,
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        description: dto.description?.trim() || null,
        companyCapacity: dto.companyCapacity,
        fullName: dto.fullName.trim(),
        role: dto.role,
        roleOther: dto.roleOther?.trim() || null,
        consultingScope: dto.consultingScope || null,
        marketsActive: dto.marketsActive,
        marketsTargeting: dto.marketsTargeting,
        certifications: dto.certifications ?? [],
        certificationsOther: dto.certificationsOther?.trim() || null,
        productCount: dto.productCount || null,
        complianceToday: dto.complianceToday,
        qmsName: dto.qmsName?.trim() || null,
        challenges: dto.challenges,
        challengesOther: dto.challengesOther?.trim() || null,
        timeline: dto.timeline,
        decisionRole: dto.decisionRole,
        pilotInterest: dto.pilotInterest,
        preferredLanguage: dto.preferredLanguage || null,
        consentContact: true,
        consentMarketing: !!dto.consentMarketing,
        status: DemoBookingStatus.PENDING,
      });
      const saved = await tx.getRepository(DemoBooking).save(row);
      return { ...saved, slot };
    });

    this.logger.log(`Demo booking ${booking.id} for ${booking.email} at ${booking.slot.startsAt.toISOString()}`);

    // Email is a side effect of a successful booking, never a reason to fail it.
    void this.mail
      .sendDemoBookingReceived({
        to: booking.email,
        companyName: booking.companyName,
        startsAt: booking.slot.startsAt,
        durationMinutes: booking.slot.durationMinutes,
        responseHours: DEMO_RESPONSE_TARGET_HOURS,
      })
      .catch((e) => this.logger.warn(`Requester confirmation email failed: ${e?.message ?? e}`));

    const adminTo = this.adminNotifyAddress();
    if (adminTo) {
      void this.mail
        .sendDemoBookingAdminAlert({
          to: adminTo,
          booking,
          startsAt: booking.slot.startsAt,
          responseHours: DEMO_RESPONSE_TARGET_HOURS,
        })
        .catch((e) => this.logger.warn(`Admin alert email failed: ${e?.message ?? e}`));
    }

    return {
      id: booking.id,
      status: booking.status,
      startsAt: booking.slot.startsAt.toISOString(),
      durationMinutes: booking.slot.durationMinutes,
      responseHours: DEMO_RESPONSE_TARGET_HOURS,
    };
  }

  private adminNotifyAddress(): string {
    return (
      this.config.get<string>('DEMO_NOTIFY_EMAIL')?.trim() ||
      this.config.get<string>('SMTP_SENDER_EMAIL')?.trim() ||
      ''
    );
  }

  // ── Admin: bookings ───────────────────────────────────────────────────────

  async listBookings(status?: string) {
    const where = status ? { status: status as DemoBookingStatus } : {};
    const rows = await this.bookings.find({
      where,
      relations: ['slot'],
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return rows.map((b) => this.presentBooking(b));
  }

  /** Pending count + how many have already blown the response target. */
  async summary() {
    const overdueBefore = new Date(Date.now() - DEMO_RESPONSE_TARGET_HOURS * 3600_000);
    const [pending, overdue, upcomingSlots] = await Promise.all([
      this.bookings.count({ where: { status: DemoBookingStatus.PENDING } }),
      this.bookings.count({
        where: { status: DemoBookingStatus.PENDING, createdAt: LessThan(overdueBefore) },
      }),
      this.slots.count({
        where: { status: DemoSlotStatus.OPEN, startsAt: MoreThanOrEqual(new Date()) },
      }),
    ]);
    return { pending, overdue, upcomingSlots, responseHours: DEMO_RESPONSE_TARGET_HOURS };
  }

  async respondToBooking(id: string, dto: RespondDemoBookingDto) {
    const booking = await this.bookings.findOne({ where: { id }, relations: ['slot'] });
    if (!booking) throw new NotFoundException('Booking not found');
    if (dto.status === DemoBookingStatus.PENDING) {
      throw new BadRequestException('Choose confirm, decline or cancel');
    }

    booking.status = dto.status;
    booking.adminNote = dto.adminNote?.trim() || null;
    booking.respondedAt = new Date();

    if (dto.status === DemoBookingStatus.CONFIRMED) {
      // A pasted link always wins: it is the admin's explicit choice, and the
      // fallback when Google is unconfigured or failing.
      const manual = dto.meetingLink?.trim();
      if (manual) {
        booking.meetingLink = manual;
      } else if (!booking.meetingLink) {
        const created = await this.meet.createMeeting({
          summary: `Qurelio demo: ${booking.companyName}`,
          description: [
            `Demo for ${booking.companyName}.`,
            booking.fullName ? `Contact: ${booking.fullName} <${booking.email}>` : `Contact: ${booking.email}`,
            booking.description ? `\nThey asked to see:\n${booking.description}` : '',
          ].filter(Boolean).join('\n'),
          startsAt: booking.slot.startsAt,
          durationMinutes: booking.slot.durationMinutes,
          attendeeEmail: booking.email,
        });
        if (created) {
          booking.meetingLink = created.meetingLink;
          booking.calendarEventId = created.calendarEventId;
        } else {
          // Confirmation still goes out; it simply carries no join link.
          this.logger.warn(
            `Booking ${booking.id} confirmed without a meeting link, add one manually if needed`,
          );
        }
      }
    }

    await this.bookings.save(booking);

    // Declining or cancelling a confirmed demo should not leave a live calendar invite.
    if (
      booking.calendarEventId &&
      (dto.status === DemoBookingStatus.DECLINED || dto.status === DemoBookingStatus.CANCELLED)
    ) {
      void this.meet.cancelMeeting(booking.calendarEventId);
    }

    // Declining or cancelling frees the slot so someone else can take it.
    const releases = dto.status === DemoBookingStatus.DECLINED || dto.status === DemoBookingStatus.CANCELLED;
    if (releases && booking.slot) {
      const stillFuture = booking.slot.startsAt.getTime() > Date.now();
      await this.slots.update(booking.slotId, {
        status: stillFuture ? DemoSlotStatus.OPEN : DemoSlotStatus.BLOCKED,
      });
    }

    void this.mail
      .sendDemoBookingDecision({
        to: booking.email,
        companyName: booking.companyName,
        startsAt: booking.slot.startsAt,
        durationMinutes: booking.slot.durationMinutes,
        confirmed: dto.status === DemoBookingStatus.CONFIRMED,
        note: booking.adminNote,
        meetingLink: booking.meetingLink,
      })
      .catch((e) => this.logger.warn(`Decision email failed: ${e?.message ?? e}`));

    const fresh = await this.bookings.findOne({ where: { id }, relations: ['slot'] });
    return this.presentBooking(fresh!);
  }

  /**
   * Remove a request for good. The slot it was holding is released so the time
   * does not stay silently unbookable; a slot already in the past is blocked
   * instead, since re-publishing it would be pointless.
   */
  async deleteBooking(id: string) {
    const booking = await this.bookings.findOne({ where: { id }, relations: ['slot'] });
    if (!booking) throw new NotFoundException('Booking not found');

    const slotId = booking.slotId;
    const slotWasHeld = booking.slot?.status === DemoSlotStatus.BOOKED;
    const stillFuture = booking.slot ? booking.slot.startsAt.getTime() > Date.now() : false;

    await this.bookings.delete(id);

    if (slotWasHeld) {
      await this.slots.update(slotId, {
        status: stillFuture ? DemoSlotStatus.OPEN : DemoSlotStatus.BLOCKED,
      });
    }
    this.logger.log(`Demo booking ${id} deleted (slot ${slotWasHeld ? 'released' : 'untouched'})`);
    return { message: 'Request deleted', slotReleased: slotWasHeld && stillFuture };
  }

  // ── Admin: calendar ───────────────────────────────────────────────────────

  /** Every slot in a window, with the booking that holds it (admin view). */
  async listSlots(fromIso?: string, toIso?: string) {
    const qb = this.slots
      .createQueryBuilder('s')
      .leftJoinAndSelect(
        's.bookings',
        'b',
        'b.status IN (:...live)',
        { live: [DemoBookingStatus.PENDING, DemoBookingStatus.CONFIRMED] },
      )
      .orderBy('s.startsAt', 'ASC');

    if (fromIso) qb.andWhere('s.startsAt >= :from', { from: new Date(fromIso) });
    if (toIso) qb.andWhere('s.startsAt <= :to', { to: new Date(toIso) });

    const rows = await qb.take(1000).getMany();
    return rows.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      durationMinutes: s.durationMinutes,
      status: s.status,
      booking: s.bookings?.[0]
        ? {
            id: s.bookings[0].id,
            companyName: s.bookings[0].companyName,
            email: s.bookings[0].email,
            status: s.bookings[0].status,
          }
        : null,
    }));
  }

  async createSlot(dto: CreateDemoSlotDto) {
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid start time');
    // A past slot can never be booked: the public list filters it out, so creating
    // one only looks like availability that silently is not there.
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('That time is in the past. Pick a future slot');
    }
    const existing = await this.slots.findOne({ where: { startsAt } });
    if (existing) throw new ConflictException('A slot already exists at that time');
    const slot = this.slots.create({
      startsAt,
      durationMinutes: dto.durationMinutes ?? 45,
      status: DemoSlotStatus.OPEN,
    });
    await this.slots.save(slot);
    return { id: slot.id, startsAt: slot.startsAt.toISOString(), durationMinutes: slot.durationMinutes, status: slot.status };
  }

  /**
   * Generate many slots at once. Times that already exist are skipped rather
   * than failing the batch, so re-running a generation is harmless.
   */
  async bulkCreateSlots(dto: BulkCreateDemoSlotsDto) {
    const now = Date.now();
    const wanted = dto.starts
      .map((s) => new Date(s))
      .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() > now);
    if (wanted.length === 0) throw new BadRequestException('No valid future start times supplied');
    if (wanted.length > 500) throw new BadRequestException('Too many slots in one request (max 500)');

    const existing = await this.slots.find({ where: { startsAt: In(wanted) } });
    const taken = new Set(existing.map((s) => s.startsAt.getTime()));
    const fresh = wanted.filter((d) => !taken.has(d.getTime()));

    if (fresh.length > 0) {
      await this.slots.insert(
        fresh.map((startsAt) => ({
          startsAt,
          durationMinutes: dto.durationMinutes ?? 45,
          status: DemoSlotStatus.OPEN,
        })),
      );
    }
    return { created: fresh.length, skipped: wanted.length - fresh.length };
  }

  async updateSlot(id: string, dto: UpdateDemoSlotDto) {
    const slot = await this.slots.findOne({ where: { id } });
    if (!slot) throw new NotFoundException('Slot not found');

    if (dto.status && dto.status !== slot.status) {
      if (slot.status === DemoSlotStatus.BOOKED) {
        throw new ConflictException('Answer or cancel the booking before changing this slot');
      }
      slot.status = dto.status;
    }
    if (dto.startsAt) {
      if (slot.status === DemoSlotStatus.BOOKED) {
        throw new ConflictException('Cannot move a slot that is already booked');
      }
      const next = new Date(dto.startsAt);
      if (Number.isNaN(next.getTime())) throw new BadRequestException('Invalid start time');
      const clash = await this.slots.findOne({ where: { startsAt: next } });
      if (clash && clash.id !== slot.id) throw new ConflictException('A slot already exists at that time');
      slot.startsAt = next;
    }
    if (dto.durationMinutes) slot.durationMinutes = dto.durationMinutes;

    await this.slots.save(slot);
    return { id: slot.id, startsAt: slot.startsAt.toISOString(), durationMinutes: slot.durationMinutes, status: slot.status };
  }

  /** Deleting a booked slot would silently drop a request, so it is refused. */
  async deleteSlot(id: string) {
    const slot = await this.slots.findOne({ where: { id } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.status === DemoSlotStatus.BOOKED) {
      throw new ConflictException('This slot is booked. Decline or cancel the booking first');
    }
    await this.slots.delete(id);
    return { message: 'Slot deleted' };
  }

  private presentBooking(b: DemoBooking) {
    const dueAt = new Date(b.createdAt.getTime() + DEMO_RESPONSE_TARGET_HOURS * 3600_000);
    return {
      id: b.id,
      companyName: b.companyName,
      field: b.field,
      email: b.email,
      phone: b.phone,
      description: b.description,
      companyCapacity: b.companyCapacity,
      // Qualification answers, folded in from the booking form.
      fullName: b.fullName ?? null,
      role: b.roleOther?.trim() ? `${b.role}: ${b.roleOther}` : b.role ?? null,
      consultingScope: b.consultingScope ?? null,
      marketsActive: b.marketsActive ?? [],
      marketsTargeting: b.marketsTargeting ?? [],
      certifications: b.certificationsOther?.trim()
        ? [...(b.certifications ?? []).filter((c) => c !== 'Other'), b.certificationsOther]
        : b.certifications ?? [],
      productCount: b.productCount ?? null,
      complianceToday: b.qmsName?.trim() ? `${b.complianceToday}: ${b.qmsName}` : b.complianceToday ?? null,
      challenges: b.challengesOther?.trim()
        ? [...(b.challenges ?? []).filter((c) => c !== 'Other'), b.challengesOther]
        : b.challenges ?? [],
      timeline: b.timeline ?? null,
      decisionRole: b.decisionRole ?? null,
      pilotInterest: b.pilotInterest ?? null,
      preferredLanguage: b.preferredLanguage ?? null,
      consentMarketing: !!b.consentMarketing,
      status: b.status,
      adminNote: b.adminNote ?? null,
      meetingLink: b.meetingLink ?? null,
      createdAt: b.createdAt.toISOString(),
      respondedAt: b.respondedAt ? b.respondedAt.toISOString() : null,
      /** When the 48 h target expires; the UI flags anything past this. */
      responseDueAt: dueAt.toISOString(),
      overdue: b.status === DemoBookingStatus.PENDING && dueAt.getTime() < Date.now(),
      slot: b.slot
        ? {
            id: b.slot.id,
            startsAt: b.slot.startsAt.toISOString(),
            durationMinutes: b.slot.durationMinutes,
          }
        : null,
    };
  }
}
