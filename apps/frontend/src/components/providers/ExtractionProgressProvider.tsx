'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Loader2,
  CircleCheck,
  CircleAlert,
  X,
  FileText,
  Pause,
  Play,
  ChevronDown,
  ChevronUp,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { QurelioSpinner } from '@/components/ui/qurelio-spinner';
import { documentApi } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface DocStatus {
  id: string;
  name?: string;
  status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | 'UNKNOWN';
  processingError?: string | null;
}

export type ExtractionScope = 'product' | 'standard' | 'other';

interface ExtractionProgressContextValue {
  ids: string[];
  done: boolean;
  paused: boolean;
  scope: ExtractionScope | null;
  start: (ids: string[], scope?: ExtractionScope) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  dismissDone: () => void;
}

const ExtractionProgressContext = createContext<ExtractionProgressContextValue | null>(null);

export function useExtractionProgress() {
  const ctx = useContext(ExtractionProgressContext);
  if (!ctx) {
    throw new Error('useExtractionProgress must be used inside <ExtractionProgressProvider>');
  }
  return ctx;
}

const TERMINAL = (s?: string) => s === 'READY' || s === 'FAILED';

export function ExtractionProgressProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [scope, setScope] = useState<ExtractionScope | null>(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [statuses, setStatuses] = useState<DocStatus[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const router = useRouter();

  const start = useCallback((next: string[], nextScope: ExtractionScope = 'product') => {
    if (!next || next.length === 0) return;
    setDone(false);
    setPaused(false);
    setScope(nextScope);
    setIds((prev) => Array.from(new Set([...prev, ...next])));
    setStatuses((prev) => {
      const seen = new Set(prev.map((s) => s.id));
      const additions: DocStatus[] = next
        .filter((id) => !seen.has(id))
        .map((id) => ({ id, status: 'UPLOADED' }));
      return [...prev, ...additions];
    });
  }, []);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const cancel = useCallback(() => {
    setIds([]);
    setStatuses([]);
    setDone(false);
    setPaused(false);
    setScope(null);
    setDetailOpen(false);
  }, []);

  const dismissDone = useCallback(() => {
    setDone(false);
    setStatuses([]);
    setScope(null);
  }, []);

  // Auto-dismiss the success state after 8s and auto-expand the panel so the user sees the result
  useEffect(() => {
    if (!done) return;
    setMinimized(false);
    const t = setTimeout(() => {
      setDone(false);
      setScope(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [done]);

  // Polling: every 4s; pauses when `paused` is true
  useEffect(() => {
    if (ids.length === 0 || paused) return;
    let cancelled = false;

    const tick = async () => {
      const results = await Promise.all(
        ids.map((id) =>
          documentApi
            .get(id)
            .then((r) => {
              const d = r.data as {
                id?: string;
                name?: string;
                status?: string;
                processingError?: string | null;
              };
              return {
                id,
                name: d.name,
                status: (d.status as DocStatus['status']) || 'UNKNOWN',
                processingError: d.processingError ?? null,
              };
            })
            .catch(() => ({ id, status: 'UNKNOWN' as const })),
        ),
      );
      if (cancelled) return;
      setStatuses(results);

      const allDone = results.every((r) => TERMINAL(r.status));
      if (allDone) {
        setDone(true);
        setIds([]);
      }
    };

    void tick();
    const iv = setInterval(tick, 4000);
    const timeout = setTimeout(
      () => {
        if (!cancelled) {
          setDone(true);
          setIds([]);
        }
      },
      5 * 60_000,
    );
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(timeout);
    };
  }, [ids, paused]);

  const value = useMemo(
    () => ({ ids, done, paused, scope, start, pause, resume, cancel, dismissDone }),
    [ids, done, paused, scope, start, pause, resume, cancel, dismissDone],
  );

  const inFlight = ids.length > 0;
  const visible =
    (inFlight || done) && (scope === 'product' || scope === 'standard');
  const failed = statuses.filter((s) => s.status === 'FAILED').length;
  const ready = statuses.filter((s) => s.status === 'READY').length;
  const processing = statuses.filter((s) =>
    ['UPLOADED', 'PROCESSING', 'UPLOADING', 'UNKNOWN'].includes(s.status),
  ).length;

  return (
    <ExtractionProgressContext.Provider value={value}>
      {children}

      {/* Persistent extraction widget (bottom-right): iOS-style transitions */}
      {visible && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex justify-end">
          <AnimatePresence mode="wait" initial={false}>
            {minimized ? (
              <motion.button
                key="pill"
                type="button"
                onClick={() => setMinimized(false)}
                aria-label="Expand extraction panel"
                initial={{ opacity: 0, y: 14, scale: 0.55, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{
                  opacity: 0,
                  y: 18,
                  scale: 0.5,
                  filter: 'blur(6px)',
                  transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                }}
                whileTap={{ scale: 0.93 }}
                transition={{
                  type: 'spring',
                  stiffness: 360,
                  damping: 28,
                  mass: 0.7,
                }}
                style={{ transformOrigin: 'bottom right', willChange: 'transform, opacity, filter' }}
                className="pointer-events-auto group flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] py-2 pl-2 pr-4 text-left shadow-[0_18px_45px_-15px_rgba(15,23,42,0.35)] backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-[0_22px_55px_-15px_rgba(15,23,42,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40"
              >
                {inFlight && !paused ? (
                  <QurelioSpinner size={28} />
                ) : paused ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-200 text-orange-900">
                    <Pause className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : failed > 0 ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                    <CircleAlert className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-200 text-green-900">
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {paused
                    ? 'Paused'
                    : inFlight
                      ? `${processing} processing`
                      : failed > 0
                        ? `${failed} failed`
                        : 'Done'}
                </span>
                <ChevronUp className="h-3.5 w-3.5 text-[var(--muted)] transition group-hover:text-[var(--text-primary)]" />
              </motion.button>
            ) : (
              <motion.div
                key="panel"
                role="region"
                aria-label="Document extraction progress"
                initial={{ opacity: 0, y: 36, scale: 0.5, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{
                  opacity: 0,
                  y: 44,
                  scale: 0.42,
                  filter: 'blur(10px)',
                  transition: { duration: 0.32, ease: [0.4, 0, 1, 1] },
                }}
                transition={{
                  type: 'spring',
                  stiffness: 280,
                  damping: 30,
                  mass: 0.85,
                  opacity: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
                  filter: { duration: 0.32, ease: [0.25, 0.1, 0.25, 1] },
                }}
                style={{ transformOrigin: 'bottom right', willChange: 'transform, opacity, filter' }}
                className="pointer-events-auto flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-[0_24px_60px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm"
              >
            {/* Header */}
            <div className="flex items-center gap-3">
              {inFlight && !paused ? (
                <QurelioSpinner size={44} />
              ) : paused ? (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-200 text-orange-900">
                  <Pause className="h-5 w-5" aria-hidden />
                </span>
              ) : failed > 0 ? (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                  <CircleAlert className="h-5 w-5" aria-hidden />
                </span>
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-200 text-green-900">
                  <CircleCheck className="h-5 w-5" aria-hidden />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {paused
                    ? 'Extraction paused'
                    : inFlight
                      ? 'AI extraction running'
                      : failed > 0
                        ? 'Finished with errors'
                        : 'Extraction complete'}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {inFlight
                    ? `${processing} processing · ${ready} ready${failed ? ` · ${failed} failed` : ''}`
                    : failed > 0
                      ? `${ready} succeeded · ${failed} failed`
                      : `${ready} document${ready > 1 ? 's' : ''} ready`}
                </p>
              </div>

              <button
                type="button"
                aria-label="Hide"
                onClick={() => setMinimized(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--page-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition hover:bg-[var(--page-bg)]/80 hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40"
              >
                Hide
                <ChevronDown className="h-3 w-3" />
              </button>

              {!inFlight && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={dismissDone}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--page-bg)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Progress bar */}
            {inFlight && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-[var(--muted)]">
                  <span>{paused ? 'Paused' : 'Progress'}</span>
                  <span>
                    {ready + failed}/{ready + failed + processing}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--page-bg)]">
                  <div
                    className={`h-full transition-all duration-500 ${paused ? 'bg-orange-300' : 'bg-[var(--brand-primary)]'}`}
                    style={{
                      width: `${
                        ready + failed + processing > 0
                          ? Math.min(100, ((ready + failed) / (ready + failed + processing)) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Inline document list */}
            {statuses.length > 0 && (
              <ul className="max-h-[160px] divide-y divide-[var(--border)]/40 overflow-y-auto rounded-lg border border-[var(--border)]/50 bg-[var(--page-bg)]/40">
                {statuses.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]"
                      title={s.name || s.id}
                    >
                      {s.name || s.id.slice(0, 8)}
                    </span>
                    <StatusPill status={s.status} paused={paused} />
                  </li>
                ))}
              </ul>
            )}

            {/* Action buttons (icon-only) */}
            {inFlight && (
              <div className="flex items-center gap-2 border-t border-[var(--border)]/40 pt-3">
                {paused ? (
                  <button
                    type="button"
                    onClick={resume}
                    aria-label="Resume"
                    title="Resume"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-200 text-green-900 transition hover:bg-green-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={pause}
                    aria-label="Pause"
                    title="Pause"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-200 text-orange-900 transition hover:bg-orange-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={cancel}
                  aria-label="Cancel"
                  title="Cancel"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-200 text-red-900 transition hover:bg-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--page-bg)]"
                >
                  Details
                </button>
              </div>
            )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Detail dialog: shown on click */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI extraction status</DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              {paused
                ? 'Polling is paused. Click Resume to continue checking.'
                : inFlight
                  ? `${processing} document${processing > 1 ? 's' : ''} still processing`
                  : `${ready} ready · ${failed} failed`}
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[60vh] divide-y divide-[var(--border)]/50 overflow-y-auto rounded-xl border border-[var(--border)]/60">
            {statuses.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                No active extraction.
              </li>
            )}
            {statuses.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[var(--text-primary)]" title={s.name || s.id}>
                    {s.name || s.id}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {labelForStatus(s.status, paused)}
                  </p>
                  {s.status === 'FAILED' && s.processingError && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                      {s.processingError}
                    </p>
                  )}
                </div>
                <StatusPill status={s.status} />
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDetailOpen(false);
                router.push(
                  scope === 'standard' ? '/docs?view=standard' : '/docs?view=product',
                );
              }}
            >
              {scope === 'standard' ? 'Open standards' : 'Open products'}
            </Button>
            <div className="flex flex-wrap gap-2">
              {inFlight &&
                (paused ? (
                  <button
                    type="button"
                    onClick={resume}
                    aria-label="Resume"
                    title="Resume"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-green-200 text-green-900 transition hover:bg-green-300"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={pause}
                    aria-label="Pause"
                    title="Pause"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-200 text-orange-900 transition hover:bg-orange-300"
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                ))}
              {inFlight && (
                <button
                  type="button"
                  onClick={cancel}
                  aria-label="Cancel"
                  title="Cancel"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-200 text-red-900 transition hover:bg-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {!inFlight && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    dismissDone();
                    setDetailOpen(false);
                  }}
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ExtractionProgressContext.Provider>
  );
}

function labelForStatus(s: DocStatus['status'], paused: boolean): string {
  if (paused && !TERMINAL(s)) return 'Paused';
  switch (s) {
    case 'UPLOADING':
      return 'Uploading…';
    case 'UPLOADED':
      return 'Queued for processing';
    case 'PROCESSING':
      return 'Extracting with AI…';
    case 'READY':
      return 'Ready';
    case 'FAILED':
      return 'Extraction failed';
    default:
      return 'Checking…';
  }
}

function StatusPill({
  status,
  paused = false,
}: {
  status: DocStatus['status'];
  paused?: boolean;
}) {
  if (paused && !TERMINAL(status)) {
    return (
      <span className="shrink-0 rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-900">
        Paused
      </span>
    );
  }
  const cls =
    status === 'READY'
      ? 'bg-green-200 text-green-900'
      : status === 'FAILED'
        ? 'bg-red-200 text-red-900'
        : 'bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {status === 'READY'
        ? 'Ready'
        : status === 'FAILED'
          ? 'Failed'
          : status === 'PROCESSING'
            ? 'Processing'
            : 'Pending'}
    </span>
  );
}
