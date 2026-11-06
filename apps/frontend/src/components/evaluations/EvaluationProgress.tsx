'use client';

import { useEffect, useRef, useState } from 'react';
import { openEvaluationStream } from '@/lib/evaluation-stream';

/** Statuses that mean the engine still has work to do. */
export const ACTIVE_EVALUATION_STATUSES = new Set(['PENDING', 'QUEUED', 'PROCESSING']);

/**
 * Ceiling for the time-based crawl. Before the engine reports `total_clauses`
 * there is nothing real to measure, so the bar eases toward this value and stops
 *: it must never imply the run is nearly finished when we simply don't know.
 */
const CRAWL_CEILING = 85;
/** Larger = slower crawl. Tuned against a typical multi-minute clause sweep. */
const CRAWL_TIME_CONSTANT_MS = 60_000;
/** Real progress is capped here; only a terminal status reaches 100%. */
const IN_FLIGHT_CEILING = 99;
/** How fast the shown number chases its target (0-1 per tick). */
const EASING = 0.12;
const TICK_MS = 80;

/**
 * How far through a single clause each streamed phase is. Clauses run
 * concurrently and all settle near the end, so counting only completions leaves
 * the bar frozen for minutes; crediting the intermediate phases keeps it moving
 * on real signal rather than on a timer.
 */
const PHASE_WEIGHT: Record<string, number> = {
  clause_started: 0.1,
  clause_retrieving: 0.25,
  evidence_found: 0.45,
  clause_llm_calling: 0.65,
  verdict_emitted: 1,
  clause_failed: 1,
};

type Snapshot = {
  /** Last percentage shown, so a remount resumes instead of restarting at 0. */
  pct: number;
  totalClauses: number;
  /** clause reference -> highest phase weight seen so far (never decreases). */
  clausePhase: Map<string, number>;
  summarising: boolean;
  done?: boolean;
  failed?: boolean;
};

/**
 * Progress survives unmounts. Switching between the card and table views, or
 * re-rendering after the 10s poll, tears the component down, without this the
 * bar would snap back to 0% every time.
 */
const SNAPSHOTS = new Map<string, Snapshot>();

function snapshotFor(evaluationId: string): Snapshot {
  let snap = SNAPSHOTS.get(evaluationId);
  if (!snap) {
    snap = { pct: 0, totalClauses: 0, clausePhase: new Map(), summarising: false };
    SNAPSHOTS.set(evaluationId, snap);
  }
  return snap;
}

/** Elapsed-time crawl anchored to when the run actually began, not to mount time. */
function crawlFor(startedAtMs: number | null): number {
  if (!startedAtMs) return 0;
  const elapsed = Date.now() - startedAtMs;
  if (elapsed <= 0) return 0;
  return CRAWL_CEILING * (1 - Math.exp(-elapsed / CRAWL_TIME_CONSTANT_MS));
}

function parseTs(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

type Props = {
  evaluationId: string;
  status: string;
  /**
   * When the run began (`startedAt`, falling back to `createdAt`). Anchors the
   * crawl to real elapsed time so a page load mid-run shows the true position
   * rather than starting over from 0%.
   */
  startedAt?: string | null;
  /** Render the compact inline variant (table rows) instead of the full gauge. */
  compact?: boolean;
};

/**
 * Animated 0% → 100% progress for a queued or running evaluation.
 *
 * Prefers real progress from the SSE activity stream (clauses settled ÷ total
 * clauses). Until the stream reports, it falls back to an asymptotic crawl based
 * on how long the run has actually been going.
 */
export function EvaluationProgress({ evaluationId, status, startedAt, compact = false }: Props) {
  const startedAtMs = parseTs(startedAt);
  const snap = useRef<Snapshot>(snapshotFor(evaluationId));

  // Seed synchronously so the first painted frame is already at the right place.
  const [display, setDisplay] = useState(() =>
    Math.max(snapshotFor(evaluationId).pct, crawlFor(startedAtMs)),
  );

  const isProcessing = status === 'PROCESSING';

  // Keep the snapshot pointer correct if this instance is reused for another row.
  useEffect(() => {
    snap.current = snapshotFor(evaluationId);
  }, [evaluationId]);

  // Real progress from the engine's event stream.
  useEffect(() => {
    if (!isProcessing) return;
    const handle = openEvaluationStream(
      evaluationId,
      (ev) => {
        const s = snap.current;
        if (ev.type === 'started' && typeof ev.total_clauses === 'number') {
          s.totalClauses = ev.total_clauses;
        }
        if (ev.type === 'engine_complete' || ev.type === 'done') {
          s.done = true;
          s.summarising = false;
        }
        if (ev.type === 'failed') {
          s.failed = true;
          s.summarising = false;
        }
        if (ev.type === 'progress_snapshot') {
          if (typeof ev.done === 'boolean') s.done = ev.done;
          if (typeof ev.failed === 'boolean') s.failed = ev.failed;
          if (typeof ev.total_clauses === 'number') s.totalClauses = ev.total_clauses;
          const streamedTotal =
            typeof ev.total_clauses === 'number' ? ev.total_clauses : undefined;
          const streamedCompleted =
            typeof ev.completed_clauses === 'number' ? ev.completed_clauses : undefined;
          if (streamedCompleted !== undefined) {
            const snapshotTotal = typeof s.totalClauses === 'number' ? s.totalClauses : 0;
            const total = Math.max(0, snapshotTotal || streamedTotal || 0);
            const completed = Math.max(0, Math.min(total, streamedCompleted));
            // Reconstruct completed clause phases so a late subscriber starts
            // from real server progress instead of the time-based crawl.
            if (total > 0) {
              const existing = s.clausePhase.size;
              const missing = Math.max(0, completed - existing);
              for (let i = 0; i < missing; i += 1) {
                s.clausePhase.set(`__completed_${existing + i}`, 1);
              }
            }
          }
          s.summarising = Boolean(ev.summarising);
        }
        const weight = PHASE_WEIGHT[ev.type];
        if (weight !== undefined) {
          const ref = typeof ev.clause_reference === 'string' ? ev.clause_reference : '';
          // Events can arrive out of order; keep the furthest phase reached.
          if (ref) s.clausePhase.set(ref, Math.max(s.clausePhase.get(ref) ?? 0, weight));
        }
        if (ev.type === 'summary_started') s.summarising = true;
      },
      () => {
        /* stream unavailable: the crawl below keeps the bar alive */
      },
    );
    return () => handle.close();
  }, [evaluationId, isProcessing]);

  useEffect(() => {
    if (!ACTIVE_EVALUATION_STATUSES.has(status)) {
      setDisplay(100);
      SNAPSHOTS.delete(evaluationId); // run is over; don't leak state for it
      return;
    }
    const id = setInterval(() => {
      const s = snap.current;
      // The crawl is always a floor. Without it the bar stalls the moment
      // `total_clauses` arrives: real progress is 0 until the first clause
      // settles, and a monotonic bar would sit frozen for minutes.
      const crawl = crawlFor(startedAtMs);
      let target = crawl;
      if (s.totalClauses > 0) {
        let credited = 0;
        for (const w of s.clausePhase.values()) credited += w;
        // Reserve the last slice for summary generation, which follows the clauses.
        const real = (credited / s.totalClauses) * 95 + (s.summarising ? 5 : 0);
        target = Math.max(real, crawl);
      }
      target = Math.min(IN_FLIGHT_CEILING, target);
      setDisplay((d) => {
        // Monotonic: a progress bar that goes backwards reads as a fault.
        const next = target > d ? d + (target - d) * EASING : d;
        s.pct = next;
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status, evaluationId, startedAtMs]);

  const pct = Math.min(100, Math.round(display));
  const label = status === 'PROCESSING' ? 'Analysing' : 'Queued';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2" aria-live="polite">
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--page-bg)]">
          <span
            className="block h-full rounded-full bg-[#ffab00] transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--muted)]">{pct}%</span>
      </span>
    );
  }

  return (
    <div
      className="text-center"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${pct}% complete`}
    >
      <p className="text-2xl font-black tabular-nums text-[#b76e00]">{pct}%</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--page-bg)]">
        <div
          className="h-full rounded-full bg-[#ffab00] transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-[var(--muted)]">{label}…</p>
    </div>
  );
}
