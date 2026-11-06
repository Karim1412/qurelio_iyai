'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Calendar, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Loader2,
  Mail, Plus, RefreshCw, Trash2, Users, Ban, Building2,
} from '@/components/icons';
import { demoApi, type DemoBookingAdmin, type DemoSlotAdmin } from '@/lib/api';
import { cn } from '@/utils/cn';

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Local "YYYY-MM-DDTHH:mm" → ISO instant, so the admin types wall-clock time. */
function localToIso(day: string, time: string): string {
  return new Date(`${day}T${time}:00`).toISOString();
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-[var(--nav-hover)] text-[var(--muted)]',
};

export default function AdminDemoPage() {
  const [tab, setTab] = useState<'requests' | 'calendar'>('requests');
  const [bookings, setBookings] = useState<DemoBookingAdmin[]>([]);
  const [slots, setSlots] = useState<DemoSlotAdmin[]>([]);
  const [summary, setSummary] = useState<{ pending: number; overdue: number; upcomingSlots: number; responseHours: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string>(() => dayKey(new Date()));

  const [newTime, setNewTime] = useState('09:00');
  const [newDuration, setNewDuration] = useState(45);
  const [busy, setBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [respondTo, setRespondTo] = useState<DemoBookingAdmin | null>(null);
  const [respondNote, setRespondNote] = useState('');
  const [respondLink, setRespondLink] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DemoBookingAdmin | null>(null);
  const [answersOpen, setAnswersOpen] = useState<DemoBookingAdmin | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, sum] = await Promise.all([
        demoApi.listBookings(statusFilter === 'ALL' ? undefined : statusFilter),
        demoApi.adminSlots(),
        demoApi.summary(),
      ]);
      setBookings(b.data ?? []);
      setSlots(s.data ?? []);
      setSummary(sum.data);
    } catch {
      toast.error('Could not load demo bookings');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);


  useEffect(() => { void load(); }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, DemoSlotAdmin[]>();
    for (const s of slots) {
      const key = dayKey(new Date(s.startsAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [slots]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const daySlots = byDay.get(selectedDay) ?? [];
  /** Past times are rejected server-side; disable the control rather than let it fail. */
  const isPastDay = selectedDay < dayKey(new Date());
  const isPastSelection = new Date(`${selectedDay}T${newTime}:00`).getTime() <= Date.now();

  const addSlot = async () => {
    setBusy(true);
    try {
      await demoApi.createSlot({ startsAt: localToIso(selectedDay, newTime), durationMinutes: newDuration });
      toast.success('Slot added');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not add slot');
    } finally { setBusy(false); }
  };

  const removeSlot = async (id: string) => {
    setBusy(true);
    try {
      await demoApi.deleteSlot(id);
      toast.success('Slot removed');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not remove slot');
    } finally { setBusy(false); }
  };

  const toggleSlot = async (s: DemoSlotAdmin) => {
    setBusy(true);
    try {
      await demoApi.updateSlot(s.id, { status: s.status === 'OPEN' ? 'BLOCKED' : 'OPEN' });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not update slot');
    } finally { setBusy(false); }
  };

  const respond = async (status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED') => {
    if (!respondTo) return;
    setBusy(true);
    try {
      const res = await demoApi.respond(respondTo.id, {
        status,
        adminNote: respondNote.trim() || undefined,
        meetingLink: respondLink.trim() || undefined,
      });
      const link = (res.data as { meetingLink?: string | null })?.meetingLink;
      toast.success(
        status !== 'CONFIRMED'
          ? 'Requester notified'
          : link
            ? 'Demo confirmed, Meet link sent'
            : 'Demo confirmed, no meeting link (add one and re-confirm if needed)',
      );
      setRespondTo(null);
      setRespondNote('');
      setRespondLink('');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not update the request');
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await demoApi.deleteBooking(deleteTarget.id);
      const released = (res.data as { slotReleased?: boolean })?.slotReleased;
      toast.success(released ? 'Request deleted, slot released' : 'Request deleted');
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not delete the request');
    } finally { setBusy(false); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header + KPIs */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Demo Requests</h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              Answer booking requests and manage the public demo calendar.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi label="Pending requests" value={summary.pending} tone="amber" icon={<Users className="h-5 w-5" />} />
            <Kpi
              label={`Past ${summary.responseHours}h target`}
              value={summary.overdue}
              tone={summary.overdue > 0 ? 'red' : 'neutral'}
              icon={<CircleAlert className="h-5 w-5" />}
            />
            <Kpi label="Open slots ahead" value={summary.upcomingSlots} tone="brand" icon={<Calendar className="h-5 w-5" />} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--border)]">
          {(['requests', 'calendar'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === t
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {t === 'requests' ? 'Demo requests' : 'Calendar'}
            </button>
          ))}
        </div>

        {tab === 'requests' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'ALL'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                    statusFilter === s
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                      : 'border-[var(--input-border)] text-[var(--muted)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-20 text-sm text-[var(--muted)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
                Loading requests…
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">No requests here</p>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  New bookings from the public demo page will appear in this list.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <article
                    key={b.id}
                    className={cn(
                      'rounded-2xl border bg-[var(--surface)] p-5',
                      b.overdue ? 'border-red-300' : 'border-[var(--border)]',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-[var(--text-primary)]">{b.companyName}</h3>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', STATUS_STYLES[b.status])}>
                            {b.status}
                          </span>
                          {b.overdue && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                              Overdue
                            </span>
                          )}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
                          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{b.field}</span>
                          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{b.companyCapacity} employees</span>
                          <a href={`mailto:${b.email}`} className="inline-flex items-center gap-1 hover:text-[var(--brand-primary)]">
                            <Mail className="h-3.5 w-3.5" />{b.email}
                          </a>
                          <span>{b.phone}</span>
                        </p>
                      </div>
                      <div className="text-right text-[12px]">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {b.slot
                            ? new Date(b.slot.startsAt).toLocaleString(undefined, {
                                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                              })
                            : 'Slot removed'}
                        </p>
                        <p className="text-[var(--muted)]">
                          Requested {new Date(b.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--page-bg)]/60 p-3 text-[13px] leading-relaxed text-[var(--text-primary)]">
                      {b.description}
                    </p>

                    {b.meetingLink && (
                      <p className="mt-2 truncate text-[12px]">
                        <span className="font-semibold text-[var(--muted)]">Meeting:</span>{' '}
                        <a href={b.meetingLink} target="_blank" rel="noreferrer" className="text-[var(--brand-primary)] hover:underline">
                          {b.meetingLink}
                        </a>
                      </p>
                    )}
                    {b.adminNote && (
                      <p className="mt-2 text-[12px] text-[var(--muted)]">
                        <span className="font-semibold">Your note:</span> {b.adminNote}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {b.status === 'PENDING' && (
                        <>
                          <Button size="sm" className="gap-1.5" onClick={() => { setRespondTo(b); setRespondNote(''); setRespondLink(b.meetingLink ?? ''); }}>
                            <CircleCheck className="h-3.5 w-3.5" />
                            Answer request
                          </Button>
                          <span className="text-[11px] text-[var(--muted)]">
                            Reply by {new Date(b.responseDueAt).toLocaleString(undefined, {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setAnswersOpen(b)}>
                        View full answers
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(b)}
                        className="ml-auto gap-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* Month grid */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Previous month"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)]">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Next month"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)]">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {grid.map((d) => {
                  const key = dayKey(d);
                  const list = byDay.get(key) ?? [];
                  const booked = list.filter((s) => s.status === 'BOOKED').length;
                  const open = list.filter((s) => s.status === 'OPEN').length;
                  const inMonth = d.getMonth() === month.getMonth();
                  const isSelected = key === selectedDay;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border text-sm transition-all duration-150',
                        !inMonth && 'opacity-40',
                        isSelected
                          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 font-bold text-[var(--brand-primary)]'
                          : 'border-[var(--input-border)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40',
                      )}
                    >
                      <span>{d.getDate()}</span>
                      <span className="flex items-center gap-0.5">
                        {open > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
                        {booked > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" aria-hidden />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Open</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />Booked</span>
              </div>
            </section>

            {/* Day editor */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </h2>

              {isPastDay && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[12px] text-amber-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  This day has passed. Slots can only be added for future times. Visitors never see
                  past slots.
                </p>
              )}

              <div className="mt-4 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="slot-time">Time</Label>
                  <Input id="slot-time" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                </div>
                <div className="w-24">
                  <Label htmlFor="slot-dur">Minutes</Label>
                  <Input
                    id="slot-dur" type="number" min={5} step={5} value={newDuration}
                    onChange={(e) => setNewDuration(Math.max(5, Number(e.target.value) || 45))}
                  />
                </div>
                <Button onClick={addSlot} disabled={busy || isPastSelection} className="gap-1.5">
                  <Plus className="h-4 w-4" />Add
                </Button>
              </div>

              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setBulkOpen(true)}>
                Generate a week of slots…
              </Button>

              <div className="mt-5 space-y-2">
                {daySlots.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-[var(--muted)]">No slots on this day yet.</p>
                )}
                {daySlots.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--input-border)] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {new Date(s.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        <span className="ml-2 text-[11px] font-normal text-[var(--muted)]">{s.durationMinutes} min</span>
                      </p>
                      {s.booking ? (
                        <p className="truncate text-[11px] text-[var(--brand-primary)]">{s.booking.companyName}</p>
                      ) : (
                        <p className="text-[11px] text-[var(--muted)]">
                          {s.status === 'OPEN' ? 'Visible on the public page' : 'Hidden from the public page'}
                        </p>
                      )}
                    </div>
                    {s.status !== 'BOOKED' && (
                      <>
                        <button
                          type="button"
                          title={s.status === 'OPEN' ? 'Hide from public page' : 'Publish'}
                          onClick={() => toggleSlot(s)}
                          disabled={busy}
                          className="text-[var(--muted)] transition-colors hover:text-[var(--brand-primary)]"
                        >
                          {s.status === 'OPEN' ? <Ban className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          title="Delete slot"
                          onClick={() => removeSlot(s.id)}
                          disabled={busy}
                          className="text-[var(--muted)] transition-colors hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {s.status === 'BOOKED' && (
                      <span className="rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--brand-primary)]">
                        Booked
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <BulkSlotsDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        fromDay={selectedDay}
        onDone={() => { setBulkOpen(false); void load(); }}
      />

      {/* Delete a request: permanent, so it is confirmed */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this request?</DialogTitle>
            <DialogDescription className="text-[13px]">
              {deleteTarget?.companyName}&apos;s request will be removed permanently. The requester
              is not notified.
              {deleteTarget?.status === 'PENDING' && deleteTarget?.slot && (
                <> Their slot on{' '}
                  <strong>
                    {new Date(deleteTarget.slot.startsAt).toLocaleString(undefined, {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </strong>{' '}
                  goes back on the public calendar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirmDelete}
              disabled={busy}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete a request: permanent, so it is confirmed */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this request?</DialogTitle>
            <DialogDescription className="text-[13px]">
              {deleteTarget?.companyName}&apos;s request will be removed permanently. The requester
              is not notified.
              {deleteTarget?.status === 'PENDING' && deleteTarget?.slot && (
                <> Their slot on{' '}
                  <strong>
                    {new Date(deleteTarget.slot.startsAt).toLocaleString(undefined, {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </strong>{' '}
                  goes back on the public calendar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirmDelete}
              disabled={busy}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full questionnaire answers for a demo request */}
      <Dialog open={!!answersOpen} onOpenChange={(v) => !v && setAnswersOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{answersOpen?.companyName}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {answersOpen?.fullName ?? '-'}{answersOpen?.role ? ` · ${answersOpen.role}` : ''}
            </DialogDescription>
          </DialogHeader>
          {answersOpen && (
            <dl className="space-y-3 text-[13px]">
              <Answer label="Requested slot" value={answersOpen.slot ? new Date(answersOpen.slot.startsAt).toLocaleString() : null} />
              <Answer label="Work email" value={answersOpen.email} />
              <Answer label="Phone" value={answersOpen.phone} />
              <Answer label="Industry" value={answersOpen.field} />
              <Answer label="Consulting for" value={answersOpen.consultingScope} />
              <Answer label="Company size" value={answersOpen.companyCapacity} />
              <Answer label="Active markets" value={(answersOpen.marketsActive ?? []).join(', ')} />
              <Answer label="Targeting" value={(answersOpen.marketsTargeting ?? []).join(', ')} />
              <Answer label="Certifications" value={(answersOpen.certifications ?? []).join(', ')} />
              <Answer label="Products managed" value={answersOpen.productCount} />
              <Answer label="Compliance today" value={answersOpen.complianceToday} />
              <Answer label="Main challenges" value={(answersOpen.challenges ?? []).join(' · ')} />
              <Answer label="Timeline" value={answersOpen.timeline} />
              <Answer label="Decision role" value={answersOpen.decisionRole} />
              <Answer label="Pilot programme" value={answersOpen.pilotInterest} />
              <Answer label="Demo language" value={answersOpen.preferredLanguage} />
              <Answer label="Marketing opt-in" value={answersOpen.consentMarketing ? 'Yes' : 'No'} />
              {answersOpen.description && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Wants to see in the demo
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-xl bg-[var(--page-bg)]/60 p-3 leading-relaxed">
                    {answersOpen.description}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={() => setAnswersOpen(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete a request: permanent, so it is confirmed */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this request?</DialogTitle>
            <DialogDescription className="text-[13px]">
              {deleteTarget?.companyName}&apos;s request will be removed permanently. The requester
              is not notified.
              {deleteTarget?.status === 'PENDING' && deleteTarget?.slot && (
                <> Their slot on{' '}
                  <strong>
                    {new Date(deleteTarget.slot.startsAt).toLocaleString(undefined, {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </strong>{' '}
                  goes back on the public calendar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirmDelete}
              disabled={busy}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete a request: permanent, so it is confirmed */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this request?</DialogTitle>
            <DialogDescription className="text-[13px]">
              {deleteTarget?.companyName}&apos;s request will be removed permanently. The requester
              is not notified.
              {deleteTarget?.status === 'PENDING' && deleteTarget?.slot && (
                <> Their slot on{' '}
                  <strong>
                    {new Date(deleteTarget.slot.startsAt).toLocaleString(undefined, {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </strong>{' '}
                  goes back on the public calendar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirmDelete}
              disabled={busy}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Answer a request */}
      <Dialog open={!!respondTo} onOpenChange={(v) => !v && setRespondTo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Answer {respondTo?.companyName}</DialogTitle>
            <DialogDescription className="text-[13px]">
              The requester is emailed either way. Declining releases the slot back to the public calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="meet-link">Meeting link (optional)</Label>
            <Input
              id="meet-link"
              value={respondLink}
              onChange={(e) => setRespondLink(e.target.value)}
              placeholder="Leave blank to generate a Google Meet link automatically"
            />
            <p className="text-[11px] text-[var(--muted)]">
              A Google Meet link is created on confirm. Paste one here to use it instead.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note to the requester (optional)</Label>
            <Textarea
              id="note" rows={4} value={respondNote}
              onChange={(e) => setRespondNote(e.target.value)}
              placeholder="Joining link, what to prepare, or why another time suits better…"
            />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRespondTo(null)} disabled={busy}>Cancel</Button>
            <Button variant="outline" onClick={() => respond('DECLINED')} disabled={busy} className="gap-1.5">
              <Ban className="h-4 w-4" />Decline
            </Button>
            <Button onClick={() => respond('CONFIRMED')} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
              Confirm demo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/** One label/value row in the full-answers dialog; blank answers are skipped. */
function Answer({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-x-3 border-b border-[var(--border)]/50 pb-2">
      <dt className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function Kpi({
  label, value, tone, icon,
}: { label: string; value: number; tone: 'amber' | 'red' | 'brand' | 'neutral'; icon: React.ReactNode }) {
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    brand: 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
    neutral: 'bg-[var(--nav-hover)] text-[var(--muted)]',
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        <p className="text-[12px] text-[var(--muted)]">{label}</p>
      </div>
    </div>
  );
}

/** Generate one slot every `every` minutes across a time range, for N weekdays. */
function BulkSlotsDialog({
  open, onClose, fromDay, onDone,
}: { open: boolean; onClose: () => void; fromDay: string; onDone: () => void }) {
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [every, setEvery] = useState(60);
  const [duration, setDuration] = useState(45);
  const [days, setDays] = useState(5);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  const starts = useMemo(() => {
    const out: string[] = [];
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    if ([fh, fm, th, tm].some(Number.isNaN)) return out;
    const base = new Date(`${fromDay}T00:00:00`);

    for (let d = 0; d < days; d += 1) {
      const day = new Date(base);
      day.setDate(base.getDate() + d);
      if (weekdaysOnly && (day.getDay() === 0 || day.getDay() === 6)) continue;
      for (let mins = fh * 60 + fm; mins + duration <= th * 60 + tm; mins += Math.max(5, every)) {
        const slot = new Date(day);
        slot.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        if (slot.getTime() > Date.now()) out.push(slot.toISOString());
      }
    }
    return out;
  }, [from, to, every, duration, days, weekdaysOnly, fromDay]);

  const generate = async () => {
    if (starts.length === 0) return;
    setBusy(true);
    try {
      const res = await demoApi.bulkSlots({ starts, durationMinutes: duration });
      const { created, skipped } = res.data as { created: number; skipped: number };
      toast.success(`${created} slot${created === 1 ? '' : 's'} created${skipped ? `, ${skipped} already existed` : ''}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not generate slots');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate slots</DialogTitle>
          <DialogDescription className="text-[13px]">
            Creates one bookable slot per interval, starting from{' '}
            {new Date(`${fromDay}T00:00:00`).toLocaleDateString()}. Times that already exist are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="b-from">From</Label><Input id="b-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label htmlFor="b-to">To</Label><Input id="b-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label htmlFor="b-every">Every (min)</Label><Input id="b-every" type="number" min={5} step={5} value={every} onChange={(e) => setEvery(Math.max(5, Number(e.target.value) || 60))} /></div>
          <div><Label htmlFor="b-dur">Duration (min)</Label><Input id="b-dur" type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 45))} /></div>
          <div><Label htmlFor="b-days">Days ahead</Label><Input id="b-days" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 5)))} /></div>
          <label className="flex items-end gap-2 pb-2 text-[13px] text-[var(--text-primary)]">
            <input type="checkbox" checked={weekdaysOnly} onChange={(e) => setWeekdaysOnly(e.target.checked)} />
            Weekdays only
          </label>
        </div>

        <p className="mt-1 text-[12px] text-[var(--muted)]">
          {starts.length} slot{starts.length === 1 ? '' : 's'} will be created.
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={generate} disabled={busy || starts.length === 0} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
