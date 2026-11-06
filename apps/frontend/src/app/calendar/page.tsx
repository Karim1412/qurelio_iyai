'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addDays,
  addHours,
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit,
  X,
} from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/lib/auth-store';
import { buildCalendarEvents, fetchWorkspaceSnapshot } from '@/lib/workspace-data';

// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
type ColorKey = 'sky' | 'violet' | 'rose' | 'emerald' | 'amber' | 'teal';

interface CalEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO
  end: string;   // ISO
  allDay: boolean;
  color: ColorKey;
  /** Local notes vs scheduled audits / CAPA due dates from the API */
  source?: 'local' | 'audit' | 'capa';
  href?: string;
}

const COLORS: Record<ColorKey, { bg: string; soft: string; text: string; ring: string; dot: string }> = {
  sky:     { bg: 'rgba(14,165,233,0.18)',  soft: 'rgba(14,165,233,0.08)',  text: '#075985', ring: 'rgba(14,165,233,0.35)',  dot: '#0ea5e9' },
  violet:  { bg: 'rgba(139,92,246,0.18)',  soft: 'rgba(139,92,246,0.08)',  text: '#5b21b6', ring: 'rgba(139,92,246,0.35)',  dot: '#8b5cf6' },
  rose:    { bg: 'rgba(244,63,94,0.18)',   soft: 'rgba(244,63,94,0.08)',   text: '#9f1239', ring: 'rgba(244,63,94,0.35)',   dot: '#f43f5e' },
  emerald: { bg: 'rgba(16,185,129,0.18)',  soft: 'rgba(16,185,129,0.08)',  text: '#065f46', ring: 'rgba(16,185,129,0.35)',  dot: '#10b981' },
  amber:   { bg: 'rgba(245,158,11,0.18)',  soft: 'rgba(245,158,11,0.08)',  text: '#92400e', ring: 'rgba(245,158,11,0.35)',  dot: '#f59e0b' },
  teal:    { bg: 'rgba(20,184,166,0.18)',  soft: 'rgba(20,184,166,0.08)',  text: '#115e59', ring: 'rgba(20,184,166,0.35)',  dot: '#14b8a6' },
};

const COLOR_KEYS = Object.keys(COLORS) as ColorKey[];
const STORAGE_KEY = 'qurelio:calendar:v1';
const HOUR_PX = 44;

// ─────────────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function isoFromLocal(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}`).toISOString();
}

function fmtTime(d: Date): string {
  return format(d, 'HH:mm');
}

function loadEvents(): CalEvent[] {
  if (typeof window === 'undefined') return seedEvents();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedEvents();
    const parsed = JSON.parse(raw) as CalEvent[];
    if (!Array.isArray(parsed)) return seedEvents();
    return parsed;
  } catch {
    return seedEvents();
  }
}

function saveEvents(events: CalEvent[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

function seedEvents(): CalEvent[] {
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────

interface DraftEvent {
  id: string | null;
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  color: ColorKey;
}

function makeDraft(date?: Date, hour?: number): DraftEvent {
  const d = date ?? new Date();
  const start = new Date(d);
  start.setHours(hour ?? 9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + 1);
  return {
    id: null,
    title: '',
    description: '',
    startDate: format(start, 'yyyy-MM-dd'),
    startTime: format(start, 'HH:mm'),
    endDate: format(end, 'yyyy-MM-dd'),
    endTime: format(end, 'HH:mm'),
    allDay: false,
    color: 'sky',
  };
}

function draftFromEvent(e: CalEvent): DraftEvent {
  const s = parseISO(e.start);
  const en = parseISO(e.end);
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? '',
    startDate: format(s, 'yyyy-MM-dd'),
    startTime: format(s, 'HH:mm'),
    endDate: format(en, 'yyyy-MM-dd'),
    endTime: format(en, 'HH:mm'),
    allDay: e.allDay,
    color: e.color,
  };
}

function eventFromDraft(d: DraftEvent): CalEvent {
  const start = d.allDay
    ? startOfDay(new Date(`${d.startDate}T00:00`)).toISOString()
    : isoFromLocal(d.startDate, d.startTime);
  const end = d.allDay
    ? endOfDay(new Date(`${d.endDate || d.startDate}T00:00`)).toISOString()
    : isoFromLocal(d.endDate || d.startDate, d.endTime || d.startTime);
  return {
    id: d.id ?? uid(),
    title: d.title.trim() || 'Untitled event',
    description: d.description.trim() || undefined,
    start,
    end,
    allDay: d.allDay,
    color: d.color,
    source: 'local',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user } = useAuthStore();
  const [localEvents, setLocalEvents] = useState<CalEvent[]>(() => []);
  const [backendEvents, setBackendEvents] = useState<CalEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftEvent>(() => makeDraft());

  const events = useMemo(
    () => [...backendEvents, ...localEvents],
    [backendEvents, localEvents],
  );

  useEffect(() => {
    setLocalEvents(loadEvents());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchWorkspaceSnapshot();
        if (cancelled) return;
        const mapped = buildCalendarEvents(snapshot.audits, snapshot.ncs).map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          color: e.color,
          source: e.source,
          href: e.href,
        }));
        setBackendEvents(mapped);
      } catch {
        /* keep local-only events */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (hydrated) saveEvents(localEvents);
  }, [localEvents, hydrated]);

  const openCreate = useCallback((date?: Date, hour?: number) => {
    setDraft(makeDraft(date, hour));
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((e: CalEvent) => {
    if (e.source === 'audit' || e.source === 'capa') {
      if (e.href && typeof window !== 'undefined') window.location.href = e.href;
      return;
    }
    setDraft(draftFromEvent(e));
    setDialogOpen(true);
  }, []);

  const saveDraft = useCallback(() => {
    const e = eventFromDraft(draft);
    setLocalEvents((prev) => {
      const idx = prev.findIndex((p) => p.id === e.id);
      if (idx < 0) return [...prev, e];
      const next = [...prev];
      next[idx] = e;
      return next;
    });
    setDialogOpen(false);
  }, [draft]);

  const deleteDraft = useCallback(() => {
    if (!draft.id) return;
    setLocalEvents((prev) => prev.filter((p) => p.id !== draft.id));
    setDialogOpen(false);
  }, [draft.id]);

  const goPrev = () => {
    if (view === 'month') setCursor((d) => addMonths(d, -1));
    else if (view === 'week' || view === 'agenda') setCursor((d) => addWeeks(d, -1));
    else setCursor((d) => addDays(d, -1));
  };
  const goNext = () => {
    if (view === 'month') setCursor((d) => addMonths(d, 1));
    else if (view === 'week' || view === 'agenda') setCursor((d) => addWeeks(d, 1));
    else setCursor((d) => addDays(d, 1));
  };
  const goToday = () => setCursor(new Date());

  const headerLabel = useMemo(() => {
    if (view === 'month') return format(cursor, 'MMMM yyyy');
    if (view === 'week' || view === 'agenda') {
      const ws = startOfWeek(cursor, { weekStartsOn: 1 });
      const we = endOfWeek(cursor, { weekStartsOn: 1 });
      const sameMonth = isSameMonth(ws, we);
      return sameMonth
        ? `${format(ws, 'd')} – ${format(we, 'd MMM yyyy')}`
        : `${format(ws, 'd MMM')} – ${format(we, 'd MMM yyyy')}`;
    }
    return format(cursor, 'EEEE, d MMMM yyyy');
  }, [view, cursor]);

  return (
    <DashboardLayout showRouteHeader={false}>
      <div className="relative -mx-4 -my-6 sm:-mx-6">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative border-b border-[var(--border)]/60 bg-[var(--surface)]/85 px-4 py-5 backdrop-blur-md sm:px-6"
        >
          {/* Soft top hairline + ambient halos */}

          <div className="relative mx-auto flex w-full max-w-[1700px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[26px]">
                Calendar
              </h1>
              <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)] sm:text-[13px]">
                Plan events across month, week, day, or agenda, gently and clearly.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ViewSwitcher view={view} onChange={setView} />
              <Button
                onClick={() => openCreate()}
                className="h-9 gap-1.5 rounded-full border-0 bg-none bg-[var(--brand-accent-cta)] px-4 text-sm font-semibold text-[var(--brand-dark)] shadow-[0_4px_14px_-6px_rgba(0,0,0,0.18)] transition-all duration-300 hover:brightness-105 hover:shadow-[0_10px_22px_-10px_rgba(0,0,0,0.25)]"
              >
                <Plus size={16} strokeWidth={1.5} />
                New event
              </Button>
            </div>
          </div>

          <div className="relative mx-auto mt-5 flex w-full max-w-[1700px] items-center gap-2">
            <button
              type="button"
              onClick={goToday}
              className="h-8 rounded-full border border-[var(--border)]/70 bg-[var(--surface)]/80 px-3.5 text-xs font-medium text-[var(--text-primary)] backdrop-blur-sm transition-all duration-300 hover:border-[var(--brand-primary)]/35 hover:bg-[var(--nav-hover)] hover:shadow-[0_4px_12px_-6px_rgba(15,23,42,0.12)]"
            >
              Today
            </button>
            <div className="flex items-center gap-0.5 rounded-full border border-[var(--border)]/70 bg-[var(--surface)]/60 p-0.5 backdrop-blur-sm">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] transition-all duration-300 hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)] active:scale-90"
              >
                <ChevronLeft size={15} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] transition-all duration-300 hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)] active:scale-90"
              >
                <ChevronRight size={15} strokeWidth={1.7} />
              </button>
            </div>
            <AnimatePresence mode="wait">
              <motion.h2
                key={headerLabel}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="ml-1 text-[15px] font-semibold tracking-tight text-[var(--text-primary)]"
              >
                {headerLabel}
              </motion.h2>
            </AnimatePresence>
          </div>
        </motion.header>

        <div className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col px-4 pb-6 pt-6 sm:px-6 lg:px-8" style={{ minHeight: 'calc(100vh - 220px)' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-1 flex-col"
            >
              {view === 'month' && (
                <MonthView
                  cursor={cursor}
                  events={events}
                  onCreate={openCreate}
                  onEdit={openEdit}
                />
              )}
              {view === 'week' && (
                <WeekView
                  cursor={cursor}
                  events={events}
                  onCreate={openCreate}
                  onEdit={openEdit}
                />
              )}
              {view === 'day' && (
                <DayView
                  cursor={cursor}
                  events={events}
                  onCreate={openCreate}
                  onEdit={openEdit}
                />
              )}
              {view === 'agenda' && (
                <AgendaView cursor={cursor} events={events} onEdit={openEdit} onCreate={openCreate} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        onDraftChange={setDraft}
        onSave={saveDraft}
        onDelete={deleteDraft}
      />
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  View switcher
// ─────────────────────────────────────────────────────────────────────────────

function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { id: ViewMode; label: string }[] = [
    { id: 'month',  label: 'Month' },
    { id: 'week',   label: 'Week' },
    { id: 'day',    label: 'Day' },
    { id: 'agenda', label: 'Agenda' },
  ];
  return (
    <div className="relative inline-flex items-center rounded-full border border-[var(--border)]/70 bg-[var(--surface)]/70 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-sm">
      {items.map((it) => {
        const active = view === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={cn(
              'relative h-8 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-300',
              active ? 'text-[var(--brand-dark)]' : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {active && (
              <motion.span
                layoutId="view-switcher-pill"
                className="absolute inset-0 -z-[1] rounded-full bg-[var(--brand-accent-cta)] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.18)]"
                transition={{ type: 'spring', stiffness: 460, damping: 38, mass: 0.8 }}
              />
            )}
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Month view
// ─────────────────────────────────────────────────────────────────────────────

function MonthView({
  cursor,
  events,
  onCreate,
  onEdit,
}: {
  cursor: Date;
  events: CalEvent[];
  onCreate: (d: Date) => void;
  onEdit: (e: CalEvent) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col overflow-hidden rounded-[24px] border border-[var(--border)]/60 bg-[var(--card)] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_18px_44px_-24px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.55)]"
    >
      <div className="grid shrink-0 grid-cols-7 border-b border-[var(--border)]/60 bg-gradient-to-b from-[var(--surface)]/80 to-transparent">
        {weekDays.map((d) => (
          <div
            key={d}
            className="px-3 py-3 text-[10.5px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 auto-rows-fr">
        {days.map((day, i) => {
          const inMonth = isSameMonth(day, cursor);
          const today = isToday(day);
          const dayEvents = events
            .filter((e) =>
              isWithinInterval(day, { start: startOfDay(parseISO(e.start)), end: endOfDay(parseISO(e.end)) }) ||
              isSameDay(day, parseISO(e.start)),
            )
            .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());
          const shown = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - shown.length;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCreate(day)}
              className={cn(
                'group relative flex min-h-[116px] flex-col items-stretch border-b border-r border-[var(--border)]/55 px-2 pt-2 pb-1 text-left',
                'transition-colors duration-300',
                inMonth ? 'bg-[var(--card)]' : 'bg-[var(--page-bg)]/60',
                'hover:bg-[var(--nav-hover)]/40',
                today && 'bg-[var(--brand-primary)]/[0.04]',
              )}
            >
              {/* Today subtle accent rail on top */}
              {today && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[var(--brand-primary)] to-transparent opacity-80"
                />
              )}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex h-7 min-w-[28px] items-center justify-center rounded-full px-1.5 text-[12.5px] font-semibold transition-all duration-300',
                    today
                      ? 'bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_-4px_rgba(27,27,245,0.45)]'
                      : inMonth
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--muted)]',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] font-medium text-[var(--muted)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    {dayEvents.length}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-col gap-1">
                {shown.map((e) => (
                  <span
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEdit(e);
                    }}
                    className="inline-flex h-[22px] items-center gap-1 truncate rounded-lg px-1.5 text-[10.5px] font-medium ring-1 ring-inset transition-all duration-300 hover:-translate-y-px hover:brightness-[0.97]"
                    style={{
                      backgroundColor: COLORS[e.color].soft,
                      color: COLORS[e.color].text,
                      ['--tw-ring-color' as never]: COLORS[e.color].ring,
                    }}
                    title={`${e.title} · ${e.allDay ? 'All day' : `${fmtTime(parseISO(e.start))}–${fmtTime(parseISO(e.end))}`}`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[e.color].dot }}
                    />
                    <span className="truncate">
                      {!e.allDay && <span className="mr-1 opacity-70">{fmtTime(parseISO(e.start))}</span>}
                      {e.title}
                    </span>
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[10.5px] font-medium text-[var(--muted)]">
                    +{overflow} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Week / Day shared grid
// ─────────────────────────────────────────────────────────────────────────────

function TimeGrid({
  days,
  events,
  onCreate,
  onEdit,
}: {
  days: Date[];
  events: CalEvent[];
  onCreate: (d: Date, hour?: number) => void;
  onEdit: (e: CalEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 7 * HOUR_PX; // start at 7am
    }
  }, [days[0]?.toString()]);

  const allDayEvents = events.filter((e) => e.allDay);
  const timed = events.filter((e) => !e.allDay);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col overflow-hidden rounded-[24px] border border-[var(--border)]/60 bg-[var(--card)] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_18px_44px_-24px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.55)]"
    >
      {/* Day header */}
      <div
        className="grid border-b border-[var(--border)]/60 bg-gradient-to-b from-[var(--surface)]/80 to-transparent"
        style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div key={d.toISOString()} className="px-3 py-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                {format(d, 'EEE')}
              </div>
              <div
                className={cn(
                  'mt-1 inline-flex h-8 min-w-[32px] items-center justify-center rounded-full px-2 text-[14px] font-semibold transition-all duration-300',
                  today
                    ? 'bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_-4px_rgba(27,27,245,0.45)]'
                    : 'text-[var(--text-primary)]',
                )}
              >
                {format(d, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="grid border-b border-[var(--border)]/60"
        style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-[var(--border)]/55 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
          All day
        </div>
        {days.map((d) => {
          const dayAllDay = allDayEvents.filter((e) =>
            isWithinInterval(d, {
              start: startOfDay(parseISO(e.start)),
              end: endOfDay(parseISO(e.end)),
            }) || isSameDay(d, parseISO(e.start)),
          );
          return (
            <div
              key={d.toISOString()}
              className="min-h-[36px] border-r border-[var(--border)]/55 px-1.5 py-1"
            >
              <div className="flex flex-wrap gap-1">
                {dayAllDay.map((e) => (
                  <span
                    key={e.id}
                    onClick={() => onEdit(e)}
                    className="inline-flex h-5 cursor-pointer items-center gap-1 truncate rounded-md px-1.5 text-[10.5px] font-medium ring-1 ring-inset hover:brightness-95"
                    style={{
                      backgroundColor: COLORS[e.color].soft,
                      color: COLORS[e.color].text,
                      ['--tw-ring-color' as never]: COLORS[e.color].ring,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[e.color].dot }} />
                    <span className="truncate">{e.title}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour grid (scrollable) */}
      <div ref={containerRef} className="relative flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))`,
            height: HOUR_PX * 24,
          }}
        >
          {/* Time labels column */}
          <div className="relative border-r border-[var(--border)]/55">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tracking-tight text-[var(--muted)]"
                style={{ top: h * HOUR_PX }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayStart = startOfDay(day);
            const eventsToday = timed.filter((e) => isSameDay(parseISO(e.start), day));
            // Layout overlapping events horizontally
            const positioned = layoutDayEvents(eventsToday);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'relative border-r border-[var(--border)]/55 transition-colors duration-300 hover:bg-[var(--nav-hover)]/20',
                  isToday(day) && 'bg-[var(--brand-primary)]/[0.025]',
                )}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const offset = e.clientY - rect.top;
                  const hour = Math.max(0, Math.min(23, Math.floor(offset / HOUR_PX)));
                  onCreate(day, hour);
                }}
              >
                {/* Hour gridlines */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-[var(--border)]/40"
                    style={{ top: h * HOUR_PX }}
                  />
                ))}
                {/* Current-time indicator */}
                {isToday(day) && <NowLine />}
                {/* Events */}
                {positioned.map(({ event, top, height, leftPct, widthPct }) => (
                  <div
                    key={event.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEdit(event);
                    }}
                    className="absolute cursor-pointer overflow-hidden rounded-xl p-1.5 text-[11px] font-medium ring-1 ring-inset transition-all duration-300 hover:-translate-y-px hover:shadow-[0_8px_18px_-10px_rgba(15,23,42,0.18)] hover:brightness-[1.02]"
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: COLORS[event.color].bg,
                      color: COLORS[event.color].text,
                      ['--tw-ring-color' as never]: COLORS[event.color].ring,
                    }}
                    title={`${event.title} · ${fmtTime(parseISO(event.start))}–${fmtTime(parseISO(event.end))}`}
                  >
                    <div className="flex items-center gap-1 leading-tight">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORS[event.color].dot }}
                      />
                      <span className="truncate">{event.title}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-80">
                      {fmtTime(parseISO(event.start))} – {fmtTime(parseISO(event.end))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function WeekView({
  cursor,
  events,
  onCreate,
  onEdit,
}: {
  cursor: Date;
  events: CalEvent[];
  onCreate: (d: Date, hour?: number) => void;
  onEdit: (e: CalEvent) => void;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return <TimeGrid days={days} events={events} onCreate={onCreate} onEdit={onEdit} />;
}

function DayView({
  cursor,
  events,
  onCreate,
  onEdit,
}: {
  cursor: Date;
  events: CalEvent[];
  onCreate: (d: Date, hour?: number) => void;
  onEdit: (e: CalEvent) => void;
}) {
  return <TimeGrid days={[cursor]} events={events} onCreate={onCreate} onEdit={onEdit} />;
}

function NowLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
      style={{ top: (minutes / 60) * HOUR_PX }}
    >
      <span className="relative -ml-1 flex h-2.5 w-2.5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)]/45" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-primary)] shadow-[0_0_0_3px_rgba(27,27,245,0.18)]" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-primary)]/70 to-transparent" />
    </div>
  );
}

interface Positioned {
  event: CalEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

function layoutDayEvents(items: CalEvent[]): Positioned[] {
  const sorted = [...items].sort(
    (a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime(),
  );
  type Lane = { end: number };
  const lanes: Lane[] = [];
  const assigned: { event: CalEvent; lane: number; start: number; end: number }[] = [];
  for (const e of sorted) {
    const s = parseISO(e.start);
    const en = parseISO(e.end);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = Math.max(startMin + 20, en.getHours() * 60 + en.getMinutes());
    let lane = lanes.findIndex((l) => l.end <= startMin);
    if (lane < 0) {
      lanes.push({ end: endMin });
      lane = lanes.length - 1;
    } else {
      lanes[lane].end = endMin;
    }
    assigned.push({ event: e, lane, start: startMin, end: endMin });
  }
  const totalLanes = Math.max(1, lanes.length);
  return assigned.map(({ event, lane, start, end }) => ({
    event,
    top: (start / 60) * HOUR_PX,
    height: ((end - start) / 60) * HOUR_PX - 2,
    leftPct: (lane / totalLanes) * 100,
    widthPct: 100 / totalLanes,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Agenda view
// ─────────────────────────────────────────────────────────────────────────────

function AgendaView({
  cursor,
  events,
  onCreate,
  onEdit,
}: {
  cursor: Date;
  events: CalEvent[];
  onCreate: (d: Date) => void;
  onEdit: (e: CalEvent) => void;
}) {
  const from = startOfWeek(cursor, { weekStartsOn: 1 });
  const to = endOfWeek(addWeeks(cursor, 3), { weekStartsOn: 1 });
  const upcoming = events
    .filter((e) => parseISO(e.start) >= from && parseISO(e.start) <= to)
    .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());

  const groups = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of upcoming) {
      const key = format(parseISO(e.start), 'yyyy-MM-dd');
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([k, list]) => ({ date: parseISO(k), list }));
  }, [upcoming]);

  if (groups.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-[var(--border)]/70 bg-[var(--card)] px-6 py-20 text-center"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-12 h-44 w-44 rounded-full opacity-25"
          style={{ background: 'radial-gradient(closest-side, var(--brand-primary), transparent 70%)', filter: 'blur(18px)' }}
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--brand-primary)]/12 to-[var(--brand-accent)]/15 text-[var(--brand-primary)] ring-1 ring-inset ring-[var(--brand-primary)]/15">
          <CalendarIcon size={22} strokeWidth={1.5} />
        </span>
        <p className="relative mt-4 text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">No events in this window</p>
        <p className="relative mt-1 text-xs text-[var(--muted)]">Try a different week, or add your first event.</p>
        <Button
          onClick={() => onCreate(new Date())}
          className="relative mt-5 h-9 gap-1.5 rounded-full border-0 bg-none bg-[var(--brand-accent-cta)] px-4 text-xs font-semibold text-[var(--brand-dark)] shadow-[0_4px_14px_-6px_rgba(0,0,0,0.18)] hover:brightness-105 hover:shadow-[0_10px_22px_-10px_rgba(0,0,0,0.25)]"
        >
          <Plus size={14} strokeWidth={1.5} />
          New event
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ date, list }, idx) => {
        const today = isToday(date);
        return (
          <motion.div
            key={date.toISOString()}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="group relative overflow-hidden rounded-[22px] border border-[var(--border)]/60 bg-[var(--card)] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.55)] transition-shadow duration-500 hover:shadow-[0_4px_8px_rgba(15,23,42,0.04),0_18px_44px_-22px_rgba(15,23,42,0.20)]"
          >
            {/* Today accent rail */}
            {today && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)] to-transparent opacity-90"
              />
            )}
            <div className="flex items-center gap-3 border-b border-[var(--border)]/55 bg-gradient-to-b from-[var(--surface)]/70 to-transparent px-5 py-3">
              <span
                className={cn(
                  'inline-flex h-9 min-w-[36px] items-center justify-center rounded-2xl px-2 text-[15px] font-semibold transition-all duration-300',
                  today
                    ? 'bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_-4px_rgba(27,27,245,0.45)]'
                    : 'bg-[var(--surface)]/80 text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border)]/60',
                )}
              >
                {format(date, 'd')}
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                  {format(date, 'EEEE')}
                </p>
                <p className="text-[11.5px] text-[var(--muted)]">{format(date, 'MMMM yyyy')}</p>
              </div>
              {today && (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/8 px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--brand-primary)]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)]/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
                  </span>
                  Today
                </span>
              )}
            </div>
            <ul className="divide-y divide-[var(--border)]/45">
              {list.map((e) => (
                <li
                  key={e.id}
                  onClick={() => onEdit(e)}
                  className="group/row flex cursor-pointer items-start gap-3 px-5 py-3.5 transition-colors duration-300 hover:bg-[var(--nav-hover)]/40"
                >
                  <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-30 transition-opacity duration-300 group-hover/row:opacity-60"
                      style={{ backgroundColor: COLORS[e.color].dot }}
                    />
                    <span
                      className="relative inline-flex h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: COLORS[e.color].dot }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{e.title}</p>
                    {e.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">{e.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-[var(--muted)]">
                    {e.allDay
                      ? 'All day'
                      : `${fmtTime(parseISO(e.start))} – ${fmtTime(parseISO(e.end))}`}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Event dialog
// ─────────────────────────────────────────────────────────────────────────────

function EventDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: DraftEvent;
  onDraftChange: (d: DraftEvent) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const editing = draft.id !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="shrink-0 px-6 pb-3 pt-6">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {editing ? 'Edit event' : 'New event'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editing ? 'Update event details below.' : 'Add a new event to your calendar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border)]">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Title
            </label>
            <Input
              ref={titleRef}
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
              placeholder="What's happening?"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Description
            </label>
            <Textarea
              value={draft.description}
              onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              placeholder="Optional notes, link, or agenda…"
              className="min-h-[72px]"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <div>
              <p className="text-[12.5px] font-medium text-[var(--text-primary)]">All day</p>
              <p className="text-[11px] text-[var(--muted)]">Spans the entire day(s)</p>
            </div>
            <Switch
              checked={draft.allDay}
              onCheckedChange={(v) => onDraftChange({ ...draft, allDay: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Start
              </label>
              <Input
                type="date"
                value={draft.startDate}
                onChange={(e) => onDraftChange({ ...draft, startDate: e.target.value })}
              />
              {!draft.allDay && (
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => onDraftChange({ ...draft, startTime: e.target.value })}
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                End
              </label>
              <Input
                type="date"
                value={draft.endDate}
                onChange={(e) => onDraftChange({ ...draft, endDate: e.target.value })}
              />
              {!draft.allDay && (
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => onDraftChange({ ...draft, endTime: e.target.value })}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Color
              </label>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize"
                style={{
                  backgroundColor: COLORS[draft.color].soft,
                  color: COLORS[draft.color].text,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: COLORS[draft.color].dot }}
                />
                {draft.color}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLOR_KEYS.map((c) => {
                const selected = draft.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={selected}
                    onClick={() => onDraftChange({ ...draft, color: c })}
                    style={{
                      ['--swatch' as never]: COLORS[c].dot,
                      ['--tw-ring-color' as never]: selected ? COLORS[c].dot : 'rgba(148,163,184,0.4)',
                    }}
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ease-out',
                      'hover:scale-110',
                      selected
                        ? 'scale-110 ring-2 ring-offset-2 ring-offset-[var(--card)] shadow-[0_4px_12px_-4px_var(--swatch)]'
                        : 'ring-1 ring-inset',
                    )}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full transition-transform"
                      style={{ backgroundColor: COLORS[c].dot }}
                    >
                      {selected && (
                        <motion.svg
                          key="check"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        >
                          <path
                            d="M5 12.5L10 17L19 7.5"
                            stroke="#ffffff"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </motion.svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-4">
          <div>
            {editing && (
              <Button
                variant="ghost"
                onClick={onDelete}
                className="h-9 gap-1.5 rounded-full px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-400/10"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-full px-3 text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              className="h-9 gap-1.5 rounded-full border-0 bg-none bg-[var(--brand-accent-cta)] px-4 text-xs font-semibold text-[var(--brand-dark)] shadow-none hover:brightness-105"
            >
              {editing ? (
                <>
                  <Edit size={14} strokeWidth={1.5} />
                  Save
                </>
              ) : (
                <>
                  <Plus size={14} strokeWidth={1.5} />
                  Add event
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
