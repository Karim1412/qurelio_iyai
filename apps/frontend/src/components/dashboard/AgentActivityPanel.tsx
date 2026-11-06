'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Brain,
  Sparkles,
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import {
  type AgentEvidenceExcerpt,
  type AgentStreamEvent,
  openEvaluationStream,
} from '@/lib/evaluation-stream';

type ClausePhase =
  | 'queued'
  | 'retrieving_iso'
  | 'retrieving_evidence'
  | 'reasoning'
  | 'done'
  | 'failed';

/** Fraction of a clause considered complete at each phase, for the progress bar. */
const CLAUSE_PHASE_WEIGHT: Record<ClausePhase, number> = {
  queued: 0.1,
  retrieving_iso: 0.25,
  retrieving_evidence: 0.45,
  reasoning: 0.65,
  done: 1,
  failed: 1,
};

type ClauseState = {
  clauseRef: string;
  clauseTitle: string;
  phase: ClausePhase;
  startedAt: number;
  endedAt?: number;
  evidence?: AgentEvidenceExcerpt[];
  evidenceCount?: number;
  verdict?: string;
  confidence?: number;
  gapsCount?: number;
  suggestionsCount?: number;
  gapPreview?: string | null;
  error?: string;
};

type RunState = {
  totalClauses?: number;
  completedClauses?: number;
  startedAt?: number;
  finishedAt?: number;
  conformityScore?: number;
  summary?: string;
  failed?: { error: string };
  summarising?: boolean;
};

const VERDICT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  SATISFIED: { label: 'Satisfied', color: '#1b5e20', bg: '#e8f5e9' },
  PARTIALLY_SATISFIED: { label: 'Partial', color: '#e65100', bg: '#fff3e0' },
  NOT_SATISFIED: { label: 'Not satisfied', color: '#b71c1c', bg: '#ffebee' },
};

function PhaseLabel({ phase }: { phase: ClausePhase }) {
  if (phase === 'queued') {
    return <span className="text-[var(--muted)]">Queued…</span>;
  }
  if (phase === 'retrieving_iso') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
        <Search className="h-3 w-3 animate-pulse" />
        Looking up ISO clause text
      </span>
    );
  }
  if (phase === 'retrieving_evidence') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
        <Search className="h-3 w-3 animate-pulse" />
        Retrieving evidence chunks
      </span>
    );
  }
  if (phase === 'reasoning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--brand-primary)]">
        <Brain className="h-3 w-3 animate-pulse" />
        Model is reasoning over evidence…
      </span>
    );
  }
  if (phase === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-700">
        <AlertCircle className="h-3 w-3" />
        Clause failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-700">
      <CheckCircle className="h-3 w-3" />
      Verdict emitted
    </span>
  );
}

function ClauseCard({ state }: { state: ClauseState }) {
  const [open, setOpen] = useState(false);
  const verdictStyle = state.verdict ? VERDICT_STYLE[state.verdict] : undefined;
  const isActive = state.phase !== 'done' && state.phase !== 'failed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border bg-[var(--surface)] transition-colors',
        isActive ? 'border-[var(--brand-primary)]/40' : 'border-[var(--border)]',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
              {state.clauseRef}
            </span>
            <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
              {state.clauseTitle}
            </span>
          </div>
          <div className="mt-1 text-[11px]">
            <PhaseLabel phase={state.phase} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {verdictStyle && (
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={{ background: verdictStyle.bg, color: verdictStyle.color }}
            >
              {verdictStyle.label}
              {typeof state.confidence === 'number'
                ? ` · ${Math.round(state.confidence * 100)}%`
                : ''}
            </span>
          )}
          {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand-primary)]" />}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-[var(--muted)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
          )}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-[var(--border)] px-3 py-2 text-xs">
              {typeof state.evidenceCount === 'number' && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                    Evidence retrieved ({state.evidenceCount})
                  </p>
                  {state.evidence?.length ? (
                    <ul className="space-y-1.5">
                      {state.evidence.map((ex, i) => (
                        <li
                          key={i}
                          className="rounded border border-[var(--border)] bg-[var(--nav-hover)] p-1.5"
                        >
                          <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--muted)]">
                            <FileText className="h-3 w-3" />
                            <span className="truncate">
                              {ex.source_label || ex.document_id}
                              {typeof ex.similarity_score === 'number'
                                ? ` · sim ${ex.similarity_score.toFixed(2)}`
                                : ''}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-3 text-[11px] italic text-[var(--text-primary)]">
                            &ldquo;{ex.excerpt}&rdquo;
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[var(--muted)]">No excerpts surfaced.</p>
                  )}
                </div>
              )}
              {state.gapsCount != null && state.gapsCount > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                    Gaps ({state.gapsCount})
                  </p>
                  {state.gapPreview && (
                    <p className="text-[11px] text-red-700">{state.gapPreview}</p>
                  )}
                </div>
              )}
              {state.error && (
                <p className="text-[11px] text-red-700">Error: {state.error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function AgentActivityPanel({
  evaluationId,
  enabled,
  onDone,
}: {
  evaluationId: string;
  enabled: boolean;
  onDone?: () => void;
}) {
  const [run, setRun] = useState<RunState>({});
  const [clauses, setClauses] = useState<Record<string, ClauseState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!enabled) return;
    setRun({});
    setClauses({});
    setOrder([]);

    const handle = openEvaluationStream(
      evaluationId,
      (ev) => {
        applyEvent(ev, setRun, setClauses, setOrder, onDoneRef);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('agent stream error', err);
      },
    );

    return () => handle.close();
  }, [enabled, evaluationId]);

  const stats = useMemo(() => {
    const list = order.map((k) => clauses[k]).filter(Boolean);
    return {
      total: run.totalClauses ?? list.length,
      done: Math.max(list.filter((c) => c.phase === 'done' || c.phase === 'failed').length, run.completedClauses ?? 0),
      active: list.filter((c) => c.phase !== 'done' && c.phase !== 'failed').length,
      failed: list.filter((c) => c.phase === 'failed').length,
    };
  }, [order, clauses, run.totalClauses]);

  const finished = !!run.finishedAt || !!run.failed;

  // Clause progress caps at 95% so the bar cannot read "done" while the overall
  // summary is still being drafted; only a finished run reaches 100%.
  //
  // Partial phases are credited on purpose: clauses run concurrently and settle
  // in a burst at the end, so counting completions alone leaves the bar pinned
  // at 0% for most of the run.
  const progressPct = useMemo(() => {
    if (finished) return 100;
    if (run.summarising) return 95;
    if (stats.total <= 0) return 0;
    const credited = order.reduce((sum, ref) => {
      const phase = clauses[ref]?.phase;
      return sum + (phase ? CLAUSE_PHASE_WEIGHT[phase] : 0);
    }, 0);
    return Math.round(Math.min(95, (credited / stats.total) * 95));
  }, [finished, order, clauses, stats.total, run.summarising]);

  const headerStatus = run.failed
    ? { label: 'Failed', color: '#b71c1c', bg: '#ffebee' }
    : run.finishedAt
      ? { label: 'Completed', color: '#1b5e20', bg: '#e8f5e9' }
      : { label: 'Running', color: '#1565c0', bg: '#e3f2fd' };

  return (
    <Card className="border-[var(--border)] p-4 shadow-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[var(--brand-primary)]" />
          <h3 className="font-bold text-[var(--text-primary)]">AI agent activity</h3>
          <Badge variant="default" className="text-[10px]">
            <span
              className="rounded px-1.5 py-0.5"
              style={{ background: headerStatus.bg, color: headerStatus.color }}
            >
              {headerStatus.label}
            </span>
          </Badge>
        </div>
        <div className="text-xs text-[var(--muted)]">
          {stats.done}/{stats.total || '-'} clauses
          {stats.active > 0 && ` · ${stats.active} in-flight`}
          {stats.failed > 0 && ` · ${stats.failed} failed`}
        </div>
      </div>

      {/* 0 → 100% completion bar. Driven by settled clauses, so it tracks the run
          rather than the clock; the last 5% is reserved for summary drafting. */}
      <div
        className="mb-3"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Evaluation ${progressPct}% complete`}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] text-[var(--muted)]">
            {finished ? 'Complete' : run.summarising ? 'Drafting summary' : 'Analysing clauses'}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {progressPct}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--page-bg)]">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: run.failed ? '#b71c1c' : finished ? '#36b37e' : 'var(--brand-primary)',
            }}
          />
        </div>
      </div>

      {run.summarising && !run.finishedAt && (
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs text-[var(--brand-primary)]">
          <Sparkles className="h-3 w-3 animate-pulse" />
          Drafting overall summary…
        </p>
      )}

      {run.failed && (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          Agent reported an error: {run.failed.error}
        </p>
      )}

      {!order.length && !finished && (
        <p className="text-xs text-[var(--muted)]">
          Waiting for the first clause to start. The agent retrieves ISO clause text and product
          evidence chunks before reasoning over them.
        </p>
      )}

      <div className="space-y-2">
        {order.map((ref) => clauses[ref] && <ClauseCard key={ref} state={clauses[ref]} />)}
      </div>

      {run.finishedAt && typeof run.conformityScore === 'number' && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Final conformity score: <strong>{run.conformityScore.toFixed(1)}%</strong>. Reloading
          report…
        </p>
      )}
    </Card>
  );
}

function applyEvent(
  ev: AgentStreamEvent,
  setRun: React.Dispatch<React.SetStateAction<RunState>>,
  setClauses: React.Dispatch<React.SetStateAction<Record<string, ClauseState>>>,
  setOrder: React.Dispatch<React.SetStateAction<string[]>>,
  onDoneRef: React.MutableRefObject<(() => void) | undefined>,
) {
  const get = <T,>(k: string): T | undefined => ev[k] as T | undefined;
  const ref = get<string>('clause_reference') ?? '';
  const title = get<string>('clause_title') ?? `Clause ${ref}`;

  const upsertClause = (mut: (s: ClauseState) => ClauseState) => {
    setClauses((prev) => {
      const cur = prev[ref] ?? {
        clauseRef: ref,
        clauseTitle: title,
        phase: 'queued',
        startedAt: ev.ts * 1000,
      };
      return { ...prev, [ref]: mut({ ...cur, clauseTitle: title || cur.clauseTitle }) };
    });
  };

  switch (ev.type) {
    case 'hello':
      return;
    case 'started':
      setRun((r) => ({
        ...r,
        startedAt: ev.ts * 1000,
        totalClauses: get<number>('total_clauses'),
      }));
      return;
    case 'progress_snapshot': {
      const done = Boolean(get<boolean>('done'));
      const failed = Boolean(get<boolean>('failed'));
      setRun((r) => ({
        ...r,
        totalClauses: get<number>('total_clauses') ?? r.totalClauses,
        completedClauses: get<number>('completed_clauses') ?? r.completedClauses,
        summarising: Boolean(get<boolean>('summarising')),
        ...(done ? { finishedAt: (get<number>('ts') ?? ev.ts) * 1000 } : {}),
        ...(failed ? {
          finishedAt: (get<number>('ts') ?? ev.ts) * 1000,
          failed: { error: get<string>('error') ?? 'Evaluation failed' },
        } : {}),
      }));
      if (done || failed) onDoneRef.current?.();
      return;
    }
    case 'clause_started':
      if (!ref) return;
      setOrder((o) => (o.includes(ref) ? o : [...o, ref]));
      upsertClause((s) => ({ ...s, phase: 'retrieving_iso', startedAt: ev.ts * 1000 }));
      return;
    case 'clause_retrieving': {
      if (!ref) return;
      const source = get<string>('source');
      upsertClause((s) => ({
        ...s,
        phase: source === 'EVIDENCE' ? 'retrieving_evidence' : 'retrieving_iso',
      }));
      return;
    }
    case 'evidence_found':
      if (!ref) return;
      upsertClause((s) => ({
        ...s,
        evidenceCount: get<number>('count') ?? 0,
        evidence: get<AgentEvidenceExcerpt[]>('excerpts') ?? [],
      }));
      return;
    case 'clause_llm_calling':
      if (!ref) return;
      upsertClause((s) => ({ ...s, phase: 'reasoning' }));
      return;
    case 'verdict_emitted':
      if (!ref) return;
      upsertClause((s) => ({
        ...s,
        phase: 'done',
        endedAt: ev.ts * 1000,
        verdict: get<string>('verdict'),
        confidence: get<number>('confidence'),
        gapsCount: get<number>('gaps_count'),
        suggestionsCount: get<number>('suggestions_count'),
        gapPreview: get<string>('gap_preview') ?? null,
      }));
      return;
    case 'clause_failed':
      if (!ref) {
        setRun((r) => ({ ...r, failed: { error: get<string>('error') ?? 'unknown' } }));
        return;
      }
      setOrder((o) => (o.includes(ref) ? o : [...o, ref]));
      upsertClause((s) => ({
        ...s,
        phase: 'failed',
        endedAt: ev.ts * 1000,
        error: get<string>('error') ?? 'unknown',
      }));
      return;
    case 'summary_started':
      setRun((r) => ({
        ...r,
        summarising: true,
        conformityScore: get<number>('conformity_score'),
      }));
      return;
    case 'done':
    case 'engine_complete':
      setRun((r) => ({
        ...r,
        summarising: false,
        finishedAt: ev.ts * 1000,
        conformityScore: get<number>('conformity_score') ?? r.conformityScore,
        summary: get<string>('summary'),
      }));
      onDoneRef.current?.();
      return;
    case 'failed':
      setRun((r) => ({
        ...r,
        finishedAt: ev.ts * 1000,
        failed: { error: get<string>('error') ?? 'unknown' },
      }));
      onDoneRef.current?.();
      return;
    case 'closed':
      return;
    default:
      return;
  }
}
