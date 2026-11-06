'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { demoApi, type DemoSlotPublic } from '@/lib/api';
import { DemoBookingModal } from '@/components/demo/DemoBookingModal';
import { EA_RESPONSE_HOURS as DEMO_RESPONSE_HOURS } from '@/components/demo/demo-form-options';
import { cn } from '@/utils/cn';

/** Local calendar-day key (YYYY-MM-DD): slots are grouped in the visitor's timezone. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Six-week grid starting on Monday, so the month always renders at a stable height. */
function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function BookDemoPage() {
  const [slots, setSlots] = useState<DemoSlotPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<DemoSlotPublic | null>(null);
  const [booked, setBooked] = useState<{ slot: DemoSlotPublic; pilot: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await demoApi.listSlots();
      setSlots(res.data ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Slots bucketed by local day, each bucket sorted by time. */
  const byDay = useMemo(() => {
    const map = new Map<string, DemoSlotPublic[]>();
    for (const s of slots) {
      const key = dayKey(new Date(s.startsAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [slots]);

  // Land on the first day that actually has availability.
  useEffect(() => {
    if (selectedDay || slots.length === 0) return;
    const first = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const d = new Date(first.startsAt);
    setMonth(startOfMonth(d));
    setSelectedDay(dayKey(d));
  }, [slots, selectedDay]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const todayKey = dayKey(new Date());
  const daySlots = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  const handleBooked = (pilot: boolean) => {
    if (activeSlot) setBooked({ slot: activeSlot, pilot });
    setActiveSlot(null);
    void load();
  };

  if (booked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-6 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Calendar className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Request sent</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            We have your request for{' '}
            <span className="font-semibold text-[var(--text-primary)]">
              {new Date(booked.slot.startsAt).toLocaleString(undefined, {
                weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            . Our team will confirm by email within {DEMO_RESPONSE_HOURS} hours, and the slot is held
            for you until then.
          </p>
          <p className="mt-3 text-[13px] text-[var(--muted)]">
            Nothing to prepare in the meantime. The demo will be built on what you&apos;ve just told us.
          </p>

          {booked.pilot && (
            <div className="mt-6 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/5 p-4 text-left">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                About the pilot programme
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
                Participants get early access, a locked-in launch price, and a monthly session with
                the product team. In return, we expect regular feedback on actual usage. We&apos;ll
                tell you more when we talk.
              </p>
            </div>
          )}
          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/">
              <Button variant="outline" className="w-full gap-2 sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Button>
            </Link>
            <Button className="w-full sm:w-auto" onClick={() => { setBooked(null); setSelectedDay(null); }}>
              Book another slot
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-4 w-4" />
            Back to Qurelio
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-primary)]">
            Book a demo
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Choose a time that suits you
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Pick an available slot and tell us about your company. We confirm every request within{' '}
            {DEMO_RESPONSE_HOURS} hours. All times are shown in your local timezone.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-24 text-sm text-[var(--muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
            Loading available times…
          </div>
        ) : failed ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">Could not load the calendar</p>
            <p className="mt-1 text-[13px] text-[var(--muted)]">Please check your connection and try again.</p>
            <Button className="mt-5" onClick={() => void load()}>Retry</Button>
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--nav-hover)]">
              <Calendar className="h-6 w-6 text-[var(--muted)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">No times available right now</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--muted)]">
              New slots are opened regularly. Please check back soon, or reach us from the contact
              section on the home page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* Month calendar */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {grid.map((d) => {
                  const key = dayKey(d);
                  const count = byDay.get(key)?.length ?? 0;
                  const inMonth = d.getMonth() === month.getMonth();
                  const isSelected = key === selectedDay;
                  const isToday = key === todayKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={count === 0}
                      onClick={() => setSelectedDay(key)}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition-all duration-150',
                        !inMonth && 'opacity-40',
                        count === 0
                          ? 'cursor-default border-transparent text-[var(--muted)]'
                          : 'cursor-pointer border-[var(--input-border)] font-semibold text-[var(--text-primary)] hover:border-[var(--brand-primary)]/50 hover:bg-[var(--brand-primary)]/5',
                        isSelected && count > 0 && 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
                        isToday && !isSelected && 'ring-1 ring-inset ring-[var(--brand-primary)]/30',
                      )}
                    >
                      <span>{d.getDate()}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            'mt-0.5 h-1.5 w-1.5 rounded-full',
                            isSelected ? 'bg-[var(--brand-primary)]' : 'bg-emerald-500',
                          )}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Days with available times
              </p>
            </section>

            {/* Times for the selected day */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {selectedDay
                  ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })
                  : 'Select a day'}
              </h2>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                {daySlots.length > 0
                  ? `${daySlots.length} time${daySlots.length > 1 ? 's' : ''} available`
                  : 'Pick a highlighted day on the calendar'}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {daySlots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSlot(s)}
                    className="rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/5 hover:text-[var(--brand-primary)]"
                  >
                    {new Date(s.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    <span className="mt-0.5 block text-[10px] font-normal text-[var(--muted)]">
                      {s.durationMinutes} min
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <DemoBookingModal
        slot={activeSlot}
        onClose={() => setActiveSlot(null)}
        onBooked={handleBooked}
      />
    </main>
  );
}
