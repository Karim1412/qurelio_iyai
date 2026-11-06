'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Plus,
  ChevronDown,
  Brain,
  ClipboardList,
  CircleCheck,
  TriangleAlert,
  Network,
  Play,
  ShieldCheck,
  Lightbulb,
  Upload,
  Loader2,
  FileX2,
  Activity,
  Timer,
  AlertCircle,
  Layers,
  Sparkles,
} from '@/components/icons';
import { usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getPageMeta } from '@/lib/page-meta';
import { companyApi, documentApi, ncApi, normalizeCompanyUsersResponse } from '@/lib/api';
import { formatIsoNormSelectLabel } from '@/lib/file-library-helpers';
import {
  buildClauseSectionMap,
  extractSectionClauseNumbers,
  findClauseSection,
  normalizeIsoClauseRef,
  trimClauseHeading,
  type ClauseSectionSummary,
} from '@/lib/audit-clause-scope';
import { buildNcWhyPlaceholders } from '@/lib/nc-clause-helpers';
import { companyUserDisplayName } from '@/lib/company-user-display';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/cn';
import { NcFishboneDialog } from '@/components/nc/NcFishboneDialog';

/* ------------------------------------------------------------------ */
/* Design tokens: refined semantic palette                            */
/* ------------------------------------------------------------------ */

const CLASS_CONFIG: Record<
  string,
  { color: string; soft: string; ring: string; label: string }
> = {
  MINOR:    { color: '#b76e00', soft: 'rgba(255,171,0,0.10)',  ring: 'rgba(255,171,0,0.25)',  label: 'Minor' },
  MAJOR:    { color: '#c4320a', soft: 'rgba(255,86,48,0.10)',  ring: 'rgba(255,86,48,0.25)',  label: 'Major' },
  CRITICAL: { color: '#a4170f', soft: 'rgba(183,29,24,0.10)',  ring: 'rgba(183,29,24,0.30)',  label: 'Critical' },
};

const STATUS_CONFIG: Record<string, { color: string; soft: string; label: string }> = {
  OPEN:                  { color: '#c4320a', soft: 'rgba(255,86,48,0.08)',   label: 'Open' },
  ROOT_CAUSE_ANALYSIS:   { color: '#6b1f9c', soft: 'rgba(123,31,162,0.08)',  label: 'RCA' },
  CAPA_DEFINED:          { color: '#1463b8', soft: 'rgba(21,101,192,0.08)',  label: 'CAPA defined' },
  IN_PROGRESS:           { color: '#9c6700', soft: 'rgba(255,171,0,0.10)',   label: 'In progress' },
  PENDING_VERIFICATION:  { color: '#0097a7', soft: 'rgba(0,188,212,0.08)',   label: 'Verification' },
  CLOSED:                { color: '#1b806a', soft: 'rgba(54,179,126,0.10)',  label: 'Closed' },
  REJECTED:              { color: '#546e7a', soft: 'rgba(84,110,122,0.10)',  label: 'Rejected' },
};

type CompanyMember = { id: string; label: string; email?: string };
type DocPick = { id: string; label: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function normalizeDocumentList(raw: { id: string; name?: string; title?: string }[]): DocPick[] {
  const byId = new Map<string, DocPick>();
  for (const d of raw) {
    const id = String(d.id ?? '').trim();
    if (!id || byId.has(id)) continue;
    const label = String(d.name || d.title || id.slice(0, 8));
    byId.set(id, { id, label });
  }
  const seenLabel = new Set<string>();
  const out: DocPick[] = [];
  for (const row of Array.from(byId.values())) {
    const k = row.label.trim().toLowerCase();
    if (seenLabel.has(k)) continue;
    seenLabel.add(k);
    out.push(row);
  }
  return out;
}

type IsoStandardRow = { id: string; name: string; isoStandard?: string | null };

/* ------------------------------------------------------------------ */
/* NC grouping helpers                                                 */
/* ------------------------------------------------------------------ */

type NcGroup = {
  key: string;
  type: 'evaluation' | 'audit' | 'manual';
  label: string;
  productName?: string;
  date?: string;
  evaluationId?: string;
  ncs: any[];
};

function groupNcsBySource(ncs: any[], documents: DocPick[]): NcGroup[] {
  const evalMap = new Map<string, any[]>();
  const auditNcs: any[] = [];
  const manualNcs: any[] = [];

  for (const nc of ncs) {
    if (nc.evaluationId) {
      const arr = evalMap.get(nc.evaluationId) ?? [];
      arr.push(nc);
      evalMap.set(nc.evaluationId, arr);
    } else if (nc.source === 'AUDIT') {
      auditNcs.push(nc);
    } else {
      manualNcs.push(nc);
    }
  }

  const groups: NcGroup[] = [];

  for (const [evalId, evalNcs] of evalMap) {
    const first = evalNcs[0];
    const iso = first.isoStandard || first.evaluation?.isoStandard;
    const productDocId = first.evaluation?.productDocumentId;
    const productName = productDocId ? documents.find((d) => d.id === productDocId)?.label : undefined;
    const rawDate = first.evaluation?.createdAt ?? first.createdAt;
    const date = rawDate
      ? new Date(rawDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined;
    groups.push({
      key: evalId,
      type: 'evaluation',
      label: iso ? `AI Evaluation: ${iso}` : 'AI Evaluation',
      productName,
      date,
      evaluationId: evalId,
      ncs: evalNcs,
    });
  }

  if (auditNcs.length) {
    groups.push({ key: 'audit', type: 'audit', label: 'Audit Non-Conformities', ncs: auditNcs });
  }
  if (manualNcs.length) {
    groups.push({ key: 'manual', type: 'manual', label: 'Manually Reported', ncs: manualNcs });
  }

  return groups;
}

function displayNcTitle(nc: { title?: string | null; isoClause?: string | null }) {
  const raw = (nc.title ?? '').trim();
  if (raw && !/^undefined$/i.test(raw) && !/\bundefined\b/i.test(raw)) return raw;
  const clause = (nc.isoClause ?? '').toString().trim();
  if (clause) return `Non-conformance: Clause ${clause}`;
  return 'Non-conformance: add a title and upload supporting evidence';
}

function resolveAssigneeLabel(assignedTo: string, members: CompanyMember[]) {
  const m = members.find((x) => x.id === assignedTo);
  return m?.label ?? assignedTo;
}

function statusCountRow(row: { status?: string; count?: string | number; _count?: string | number }) {
  return Number(row?.count ?? row?._count ?? 0) || 0;
}

/* ------------------------------------------------------------------ */
/* Small atoms                                                         */
/* ------------------------------------------------------------------ */

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 0 3px ${color}1a` }}
    />
  );
}

function ClassChip({ classification }: { classification: string }) {
  const cfg = CLASS_CONFIG[classification] || CLASS_CONFIG.MINOR;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: cfg.soft, color: cfg.color, boxShadow: `inset 0 0 0 1px ${cfg.ring}` }}
    >
      <StatusDot color={cfg.color} />
      {cfg.label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.02em]"
      style={{ background: cfg.soft, color: cfg.color }}
    >
      <StatusDot color={cfg.color} />
      {cfg.label}
    </span>
  );
}

function MetaTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--muted)]">
      {children}
    </span>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'brand' | 'amber' | 'blue' | 'green';
}) {
  const tones: Record<string, string> = {
    default: 'text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]',
    brand: 'text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10',
    amber: 'text-[#b76e00] hover:bg-[rgba(255,171,0,0.10)]',
    blue: 'text-[#1463b8] hover:bg-[rgba(21,101,192,0.10)]',
    green: 'text-[#118d57] hover:bg-[rgba(54,179,126,0.10)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150',
        tones[tone],
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="relative h-[92px] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)]">
      {/* Shimmer sweep */}
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--brand-primary) 6%, transparent) 50%, transparent 100%)',
        }}
      />
      <div className="relative flex items-center gap-4 px-5 py-4">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--page-bg)]/70" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-2/5 rounded-full bg-[var(--page-bg)]/70" />
          <div className="h-2.5 w-3/5 rounded-full bg-[var(--page-bg)]/50" />
          <div className="flex gap-2 pt-1">
            <div className="h-2 w-16 rounded-full bg-[var(--page-bg)]/60" />
            <div className="h-2 w-12 rounded-full bg-[var(--page-bg)]/60" />
          </div>
        </div>
        <div className="h-7 w-20 shrink-0 rounded-full bg-[var(--page-bg)]/60" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NC Guide: always-visible definitions + workflow steps              */
/* ------------------------------------------------------------------ */

const NC_CONCEPTS = [
  {
    abbr: 'NC',
    full: 'Non-Conformity',
    step: '01',
    color: '#c4320a',
    soft: 'rgba(255,86,48,0.08)',
    ring: 'rgba(255,86,48,0.20)',
    Icon: AlertCircle,
    def: 'A gap between what the standard requires and what actually happens.',
    detail: 'Any product, process, or system that does not meet a specified requirement (ISO clause, internal procedure, regulation…). It must be recorded, investigated, and corrected.',
  },
  {
    abbr: 'RCA',
    full: 'Root Cause Analysis',
    step: '02',
    color: '#6b1f9c',
    soft: 'rgba(123,31,162,0.08)',
    ring: 'rgba(123,31,162,0.20)',
    Icon: Network,
    def: 'Finding out WHY the non-conformity happened.',
    detail: 'Go beyond the symptom: ask "Why?" 5 times (5-Why method) or use an Ishikawa (fishbone) diagram. Without knowing the real cause, fixes are only temporary.',
  },
  {
    abbr: 'CAPA',
    full: 'Corrective & Preventive Action',
    step: '03',
    color: '#1463b8',
    soft: 'rgba(21,101,192,0.08)',
    ring: 'rgba(21,101,192,0.20)',
    Icon: ShieldCheck,
    def: 'What you do to fix the problem and stop it from coming back.',
    detail: 'Corrective action = fix this specific issue now. Preventive action = change the system so it cannot happen again. Assign an owner, a due date, and collect evidence of completion.',
  },
] as const;

const NC_FLOW_STEPS = [
  { step: 1, label: 'NC Open',       color: '#c4320a', soft: 'rgba(255,86,48,0.08)',    desc: 'Record the deviation.' },
  { step: 2, label: 'RCA',           color: '#6b1f9c', soft: 'rgba(123,31,162,0.08)',   desc: 'Find the root cause.' },
  { step: 3, label: 'CAPA Defined',  color: '#1463b8', soft: 'rgba(21,101,192,0.08)',   desc: 'Plan the fix.' },
  { step: 4, label: 'In Progress',   color: '#9c6700', soft: 'rgba(255,171,0,0.10)',    desc: 'Execute the actions.' },
  { step: 5, label: 'Verification',  color: '#0097a7', soft: 'rgba(0,188,212,0.08)',    desc: 'Confirm it worked.' },
  { step: 6, label: 'Closed',        color: '#1b806a', soft: 'rgba(54,179,126,0.10)',   desc: 'Lock & document.' },
] as const;

function NcFlowBanner() {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)]"
    >
      {/* ── Concept definitions: always visible ── */}
      <div className="grid grid-cols-1 divide-y divide-[var(--border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {NC_CONCEPTS.map((c, idx) => (
          <motion.div
            key={c.abbr}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + idx * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="group relative flex flex-col gap-2 overflow-hidden px-5 py-4 transition-colors duration-300"
          >
            {/* Left accent rail: colored by concept */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-3 left-0 w-[2px] rounded-r-full opacity-50 transition-all duration-300 group-hover:opacity-100"
              style={{
                background: `linear-gradient(180deg, transparent, ${c.color}, transparent)`,
              }}
            />
            {/* Soft hover wash */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
              style={{
                background: `radial-gradient(420px circle at 0% 0%, ${c.soft}, transparent 65%)`,
              }}
            />
            {/* Faint step ordinal in the background */}
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-2 select-none font-semibold tabular-nums text-[28px] leading-none opacity-[0.06] transition-opacity duration-300 group-hover:opacity-[0.12]"
              style={{ color: c.color }}
            >
              {c.step}
            </span>

            <div className="relative flex items-center gap-2.5">
              <span
                className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold tracking-[0.08em] transition-transform duration-300 group-hover:-translate-y-px"
                style={{
                  background: c.soft,
                  color: c.color,
                  boxShadow: `inset 0 0 0 1px ${c.ring}`,
                }}
              >
                <c.Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {c.abbr}
              </span>
              <span className="text-[12px] font-semibold tracking-[-0.005em] text-[var(--text-primary)]">
                {c.full}
              </span>
            </div>

            <p className="relative text-[12.5px] font-medium leading-snug text-[var(--text-primary)]">
              {c.def}
            </p>
            <p className="relative text-[11px] leading-relaxed text-[var(--muted)]">{c.detail}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Workflow stepper toggle ── */}
      <div
        className="border-t border-[var(--border)]"
        style={{ background: 'linear-gradient(to bottom, var(--surface-elevated), var(--surface))' }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--nav-hover)]/60"
        >
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] transition-colors duration-300 group-hover:bg-[var(--brand-primary)]/15"
          >
            <Lightbulb className="h-3 w-3" strokeWidth={1.75} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
            Workflow
          </span>
          <span aria-hidden className="h-3 w-px bg-[var(--border)]" />
          <span className="flex flex-1 flex-wrap items-center gap-1 text-[11px] font-medium text-[var(--muted)]">
            {NC_FLOW_STEPS.map((s, i) => (
              <React.Fragment key={s.step}>
                {i > 0 && (
                  <span aria-hidden className="text-[var(--border)]">
                    ›
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors duration-200 group-hover:text-[var(--text-primary)]"
                >
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
              </React.Fragment>
            ))}
          </span>
          <ChevronDown
            className={cn(
              'ml-auto h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform duration-300',
              open && 'rotate-180',
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="steps"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-3 gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-6">
                {NC_FLOW_STEPS.map((s, idx) => (
                  <motion.div
                    key={s.step}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    className="group relative flex flex-col gap-1.5 px-3.5 py-3 transition-colors duration-300"
                    style={{ background: 'var(--surface)' }}
                  >
                    {/* Subtle hover wash in step color */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: s.soft }}
                    />
                    {/* connector chevron between steps */}
                    {idx < NC_FLOW_STEPS.length - 1 && (
                      <span
                        className="pointer-events-none absolute -right-[7px] top-1/2 z-[1] hidden h-3.5 w-3.5 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[8px] font-bold text-[var(--muted)] sm:flex"
                        aria-hidden
                      >
                        ›
                      </span>
                    )}
                    <div className="relative flex items-center gap-1.5">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums transition-transform duration-300 group-hover:scale-110"
                        style={{ background: `${s.color}20`, color: s.color }}
                      >
                        {s.step}
                      </span>
                      <span
                        aria-hidden
                        className="h-px flex-1 origin-left scale-x-0 rounded-full opacity-0 transition-all duration-500 ease-out group-hover:scale-x-100 group-hover:opacity-60"
                        style={{ background: `linear-gradient(90deg, ${s.color}, transparent)` }}
                      />
                    </div>
                    <p
                      className="relative text-[11.5px] font-semibold leading-tight"
                      style={{ color: s.color }}
                    >
                      {s.label}
                    </p>
                    <p className="relative text-[10.5px] leading-snug text-[var(--muted)]">{s.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* NC Group Section: collapsible group with header                    */
/* ------------------------------------------------------------------ */

const GROUP_ICONS: Record<NcGroup['type'], React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  evaluation: Sparkles,
  audit:      ClipboardList,
  manual:     TriangleAlert,
};

const GROUP_COLORS: Record<NcGroup['type'], { color: string; soft: string }> = {
  evaluation: { color: '#1463b8', soft: 'rgba(21,101,192,0.10)' },
  audit:      { color: '#9c6700', soft: 'rgba(255,171,0,0.10)' },
  manual:     { color: '#546e7a', soft: 'rgba(84,110,122,0.10)' },
};

function NcGroupSection({
  group,
  members,
  documents,
  onRefresh,
  onRefreshDocuments,
}: {
  group: NcGroup;
  members: CompanyMember[];
  documents: DocPick[];
  onRefresh: () => void;
  onRefreshDocuments: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const cfg = GROUP_COLORS[group.type];
  const Icon = GROUP_ICONS[group.type];
  const count = group.ncs.length;

  return (
    <div className="mt-5 first:mt-0">
      {/* Clickable group header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group relative mb-2 flex w-full items-center gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--border)] hover:bg-[var(--surface-elevated)]/60"
      >
        {/* Left accent rail in group color */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-0 w-[2px] rounded-r-full opacity-60 transition-all duration-300 group-hover:opacity-100"
          style={{ background: cfg.color }}
        />
        {/* Soft wash on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(380px circle at 0% 50%, ${cfg.soft}, transparent 60%)`,
          }}
        />

        <span
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-[1.04]"
          style={{ background: cfg.soft, color: cfg.color }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>

        <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[12.5px] font-semibold tracking-[-0.005em] text-[var(--text-primary)]">
            {group.label}
          </span>
          {group.productName && (
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-elevated)]/60 px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--muted)]">
              {group.productName}
            </span>
          )}
          {group.date && (
            <span className="text-[10.5px] tabular-nums text-[var(--muted)]">{group.date}</span>
          )}
        </div>

        <span
          className="relative shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums transition-transform duration-300 group-hover:-translate-y-px"
          style={{
            background: cfg.soft,
            color: cfg.color,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${cfg.color} 22%, transparent)`,
          }}
        >
          {count} NC{count !== 1 ? 's' : ''}
        </span>

        <ChevronDown
          className={cn(
            'relative ml-1 h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform duration-300',
            !open && '-rotate-90',
          )}
        />
      </button>

      {/* Collapsible NC cards */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {group.ncs.map((nc, i) => (
              <motion.div
                key={nc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <NCCard
                  nc={nc}
                  onRefresh={onRefresh}
                  members={members}
                  documents={documents}
                  onRefreshDocuments={onRefreshDocuments}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NC Card                                                             */
/* ------------------------------------------------------------------ */

function NCCard({
  nc,
  onRefresh,
  members,
  documents,
  onRefreshDocuments,
}: {
  nc: any;
  onRefresh: () => void;
  members: CompanyMember[];
  documents: DocPick[];
  onRefreshDocuments: () => Promise<void>;
}) {
  const user = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState(false);
  const [capaOpen, setCapaOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [whyData, setWhyData] = useState<any>(null);
  const [fishboneOpen, setFishboneOpen] = useState(false);
  const [aiRootOpen, setAiRootOpen] = useState(false);
  const [aiRootLoading, setAiRootLoading] = useState(false);
  const [aiRootPayload, setAiRootPayload] = useState<{
    probableCauses: { id: string; title: string; rationale: string; confidence: number }[];
    model?: string | null;
    historySampleSize?: number;
  } | null>(null);
  const [dismissedCauseIds, setDismissedCauseIds] = useState<Set<string>>(new Set());
  const [causeEdits, setCauseEdits] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyEffective, setVerifyEffective] = useState(true);
  const [verifyReject, setVerifyReject] = useState(false);
  const [rca, setRca] = useState({
    why1: '', why2: '', why3: '', why4: '', why5: '', rootCause: '',
  });
  const [capaForm, setCapaForm] = useState({
    type: 'CORRECTIVE',
    title: '',
    description: '',
    assignedTo: '',
    dueDate: '',
    evidenceDocumentIds: [] as string[],
  });
  const capaEvidenceFileRef = useRef<HTMLInputElement>(null);
  const [capaEvidenceUploading, setCapaEvidenceUploading] = useState(false);
  const [clauseSection, setClauseSection] = useState<ClauseSectionSummary | null>(null);

  const classCfg = CLASS_CONFIG[nc.classification] || CLASS_CONFIG.MINOR;
  const canVerify = usePermissions().validateCapaClosure;
  const manual = nc.source === 'MANUAL';

  const fetchFishboneAi = useCallback(async () => {
    const r = await ncApi.aiIshikawa(nc.id);
    return { branches: r.data.branches, model: r.data.model };
  }, [nc.id]);

  const loadAiRootCauses = useCallback(async () => {
    setAiRootLoading(true);
    setDismissedCauseIds(new Set());
    setCauseEdits({});
    try {
      const r = await ncApi.aiRootCauses(nc.id);
      setAiRootPayload({
        probableCauses: r.data.probableCauses ?? [],
        model: r.data.model,
        historySampleSize: r.data.historySampleSize,
      });
    } catch {
      try {
        const w = await ncApi.whyAnalysis(nc.id);
        setAiRootPayload({
          probableCauses: [
            {
              id: 'offline-1',
              title: 'Heuristic root-cause angle',
              rationale: String(w.data?.suggestions?.rootCauseSuggestion ?? '').slice(0, 1200),
              confidence: 0.35,
            },
          ],
          model: 'template-offline',
          historySampleSize: 0,
        });
      } catch {
        toast.error('Could not load AI root-cause suggestions');
        setAiRootPayload(null);
      }
    } finally {
      setAiRootLoading(false);
    }
  }, [nc.id]);

  const syncRcaFromNc = useCallback(() => {
    const w = nc.whyAnalysis;
    if (w && typeof w === 'object') {
      setRca({
        why1: String(w.why1 ?? ''),
        why2: String(w.why2 ?? ''),
        why3: String(w.why3 ?? ''),
        why4: String(w.why4 ?? ''),
        why5: String(w.why5 ?? ''),
        rootCause: String(w.rootCause ?? ''),
      });
    } else {
      setRca({ why1: '', why2: '', why3: '', why4: '', why5: '', rootCause: '' });
    }
  }, [nc.whyAnalysis]);

  useEffect(() => {
    if (expanded) syncRcaFromNc();
  }, [expanded, syncRcaFromNc]);

  const clauseRefDisplay = useMemo(
    () => normalizeIsoClauseRef(nc.isoClause ?? ''),
    [nc.isoClause],
  );

  useEffect(() => {
    if (!expanded || !clauseRefDisplay) {
      setClauseSection(null);
      return;
    }
    const docIds = Array.isArray(nc.evidenceDocumentIds) ? nc.evidenceDocumentIds : [];
    if (!docIds.length) {
      setClauseSection(null);
      return;
    }
    let cancelled = false;
    (async () => {
      for (const docId of docIds) {
        try {
          const res = await documentApi.get(String(docId));
          const sec = findClauseSection(res.data, clauseRefDisplay);
          if (sec && !cancelled) {
            setClauseSection(sec);
            return;
          }
        } catch {
          /* try next evidence doc */
        }
      }
      if (!cancelled) setClauseSection(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, nc.id, clauseRefDisplay, nc.evidenceDocumentIds]);

  const whyPlaceholders = useMemo(
    () =>
      buildNcWhyPlaceholders({
        title: nc.title,
        isoClause: nc.isoClause,
        isoStandard: nc.isoStandard,
        clauseSection,
      }),
    [nc.title, nc.isoClause, nc.isoStandard, clauseSection],
  );

  const clauseContextLabel = useMemo(() => {
    if (!clauseRefDisplay) return null;
    const std = (nc.isoStandard ?? '').trim();
    const heading = trimClauseHeading(clauseSection?.heading ?? '');
    return heading
      ? `${std ? `${std} · ` : ''}Clause ${clauseRefDisplay}: ${heading}`
      : std
        ? `${std} · Clause ${clauseRefDisplay}`
        : `Clause ${clauseRefDisplay}`;
  }, [clauseRefDisplay, nc.isoStandard, clauseSection]);

  const handleWhyAnalysis = async () => {
    try {
      const res = await ncApi.whyAnalysis(nc.id);
      setWhyData(res.data.suggestions);
      setWhyOpen(true);
    } catch {
      toast.error('Failed to generate analysis');
    }
  };

  const applyAiToRca = () => {
    if (!whyData) return;
    setRca({
      why1: whyData.why1 ?? '',
      why2: whyData.why2 ?? '',
      why3: whyData.why3 ?? '',
      why4: whyData.why4 ?? '',
      why5: whyData.why5 ?? '',
      rootCause: whyData.rootCauseSuggestion ?? '',
    });
    toast.success('Applied AI suggestions, review and save');
  };

  const handleSaveRca = async () => {
    try {
      await ncApi.saveRca(nc.id, rca);
      toast.success('RCA saved. This NC is now in the RCA tab');
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to save RCA');
    }
  };

  const handleStartRca = async () => {
    try {
      await ncApi.startRca(nc.id);
      toast.success('NC moved to RCA phase. Open the RCA tab to find it');
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to start RCA');
    }
  };

  const handleStartCapa = async () => {
    try {
      await ncApi.startCapa(nc.id);
      toast.success('CAPA execution started');
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to start');
    }
  };

  const handleRejectNc = async () => {
    try {
      await ncApi.rejectNc(nc.id, { reason: rejectReason });
      toast.success('NC rejected');
      setRejectOpen(false);
      setRejectReason('');
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to reject');
    }
  };

  const handleVerify = async () => {
    if (!user?.id) return toast.error('Not signed in');
    try {
      await ncApi.verify(nc.id, {
        verifiedBy: user.id,
        isEffective: verifyEffective,
        notes: verifyNotes.trim() || undefined,
        rejectNc: !verifyEffective && verifyReject,
      });
      toast.success('Verification recorded');
      setVerifyNotes('');
      setVerifyReject(false);
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Verification failed');
    }
  };

  const handleAddCapa = async () => {
    if (!capaForm.title || !capaForm.assignedTo || !capaForm.dueDate) {
      return toast.error('Fill all required fields');
    }
    const assigneeEmail = members.find((m) => m.id === capaForm.assignedTo)?.email;
    try {
      await ncApi.addCapa(nc.id, { ...capaForm, assigneeEmail });
      toast.success('CAPA action added');
      setCapaOpen(false);
      setCapaForm({
        type: 'CORRECTIVE',
        title: '',
        description: '',
        assignedTo: '',
        dueDate: '',
        evidenceDocumentIds: [],
      });
      onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to add CAPA');
    }
  };

  const handleCompleteCapa = async (capaId: string) => {
    try {
      await ncApi.completeCapa(capaId);
      toast.success('CAPA marked complete');
      onRefresh();
    } catch {
      toast.error('Failed');
    }
  };

  const toggleCapaEvidence = (docId: string) => {
    setCapaForm((p) => {
      const set = new Set(p.evidenceDocumentIds);
      if (set.has(docId)) set.delete(docId);
      else set.add(docId);
      return { ...p, evidenceDocumentIds: Array.from(set) };
    });
  };

  const handleCapaEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCapaEvidenceUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'EVIDENCE');
      fd.append('description', 'CAPA evidence');
      const res = await documentApi.upload(fd);
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      const newId = row?.id as string | undefined;
      await onRefreshDocuments();
      if (newId) {
        setCapaForm((p) => ({
          ...p,
          evidenceDocumentIds: p.evidenceDocumentIds.includes(newId)
            ? p.evidenceDocumentIds
            : [...p.evidenceDocumentIds, newId],
        }));
      }
      toast.success('Evidence uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setCapaEvidenceUploading(false);
    }
  };

  return (
    <Card
      className={cn(
        'group relative mb-3 overflow-hidden border-[var(--border)] shadow-none',
        'rounded-2xl transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-[var(--border)]/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.10)]',
        expanded && 'ring-1 ring-[var(--brand-primary)]/15',
      )}
    >
      {/* Severity edge glow: soft, replaces the chunky left border */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] opacity-60"
        style={{
          background: `linear-gradient(180deg, ${classCfg.color}, ${classCfg.color}00)`,
        }}
      />

      <CardContent className="px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <ClassChip classification={nc.classification} />
              <StatusChip status={nc.status} />
              {nc.source && <MetaTag>{String(nc.source).replace(/_/g, ' ')}</MetaTag>}
              {clauseRefDisplay && <MetaTag>Clause {clauseRefDisplay}</MetaTag>}
            </div>
            <p className="text-[15px] font-semibold leading-snug tracking-[-0.005em] text-[var(--text-primary)]">
              {displayNcTitle(nc)}
            </p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
              {nc.description}
            </p>
          </div>

          {/* Action toolbar */}
          <div className="flex shrink-0 items-center gap-0.5 self-start rounded-xl border border-transparent bg-transparent p-0.5 transition-colors group-hover:border-[var(--border)] group-hover:bg-[var(--page-bg)]/50">
            {nc.status === 'OPEN' && (
              <IconAction icon={Play} label="Start RCA: move to RCA phase" tone="brand" onClick={handleStartRca} />
            )}
            <IconAction icon={Brain} label="AI 5-Why prompts" tone="brand" onClick={handleWhyAnalysis} />
            <IconAction
              icon={Lightbulb}
              label="AI root causes"
              tone="amber"
              onClick={() => {
                setAiRootOpen(true);
                void loadAiRootCauses();
              }}
            />
            <IconAction icon={Network} label="Ishikawa" tone="blue" onClick={() => setFishboneOpen(true)} />
            <IconAction
              icon={ClipboardList}
              label="Add CAPA"
              tone="green"
              onClick={() => {
                setCapaForm({
                  type: 'CORRECTIVE',
                  title: '',
                  description: '',
                  assignedTo: '',
                  dueDate: '',
                  evidenceDocumentIds: [],
                });
                setCapaOpen(true);
              }}
            />
            <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-all duration-200 hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <Separator className="my-4" />

              {(nc.status === 'OPEN' || nc.status === 'ROOT_CAUSE_ANALYSIS') && (
                <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/40 p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand-primary)]">
                      5 Whys · Structured RCA
                    </span>
                    {clauseContextLabel && (
                      <span className="rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">
                        {clauseContextLabel}
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
                    {nc.isoClause
                      ? manual
                        ? 'Each “Why” should trace back to the selected clause requirement. Use the brain icon for clause-specific AI prompts, then refine and save.'
                        : 'Optional: tailor each why to the clause gap. Use AI prompts (brain icon) for clause-specific suggestions.'
                      : manual
                        ? 'Save this analysis to unlock CAPA actions. Use the brain icon for AI prompts, then refine and save.'
                        : 'Optional: run RCA first to move the NC to "CAPA Defined" before execution. You can also add a CAPA directly to jump straight to In Progress.'}
                  </p>
                  {clauseSection?.summary && (
                    <p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
                      <span className="font-semibold text-[var(--text-primary)]">Clause requirement: </span>
                      {clauseSection.summary}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(['why1', 'why2', 'why3', 'why4', 'why5'] as const).map((k, i) => (
                      <div key={k}>
                        <Label className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                          Why {i + 1}
                          {clauseRefDisplay ? ` · clause ${clauseRefDisplay}` : ''}
                        </Label>
                        <Textarea
                          rows={2}
                          value={(rca as any)[k]}
                          onChange={(e) => setRca((p) => ({ ...p, [k]: e.target.value }))}
                          placeholder={whyPlaceholders[k]}
                          className="mt-1 resize-none text-sm"
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-2">
                      <Label className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                        Root cause summary
                      </Label>
                      <Textarea
                        rows={2}
                        value={rca.rootCause}
                        onChange={(e) => setRca((p) => ({ ...p, rootCause: e.target.value }))}
                        placeholder={whyPlaceholders.rootCause}
                        className="mt-1 resize-none text-sm"
                      />
                    </div>
                  </div>
                  <Button type="button" className="mt-3" size="sm" onClick={handleSaveRca}>
                    Save RCA
                  </Button>
                </div>
              )}

              {nc.status === 'CAPA_DEFINED' && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200/60 bg-blue-50/60 p-3.5 text-sm">
                  <Activity className="h-4 w-4 shrink-0 text-blue-700" />
                  <p className="flex-1 text-[13px] font-medium leading-relaxed text-blue-950">
                    CAPA plan recorded. Start execution when the team is ready.
                  </p>
                  <Button type="button" size="sm" className="gap-1.5" onClick={handleStartCapa}>
                    <Play className="h-3.5 w-3.5" />
                    Start execution
                  </Button>
                </div>
              )}

              {nc.status === 'PENDING_VERIFICATION' && canVerify && (
                <div className="mb-4 rounded-xl border border-cyan-200/60 bg-cyan-50/50 p-4 text-sm">
                  <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-900">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verification · QM / Auditor
                  </p>
                  <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={verifyEffective} onCheckedChange={(v) => setVerifyEffective(v === true)} />
                      <span>CAPA effective: close NC</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={verifyReject}
                        onCheckedChange={(v) => setVerifyReject(v === true)}
                        disabled={verifyEffective}
                      />
                      <span>Mark NC rejected (if not effective)</span>
                    </label>
                  </div>
                  <Label className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    Notes
                  </Label>
                  <Textarea
                    rows={2}
                    className="mb-3 mt-1 resize-none text-sm"
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                  />
                  <Button type="button" size="sm" onClick={handleVerify}>
                    Submit verification
                  </Button>
                </div>
              )}

              {nc.status !== 'CLOSED' && nc.status !== 'REJECTED' && nc.status !== 'PENDING_VERIFICATION' && (
                <div className="mb-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-[var(--muted)] hover:text-[#c4320a]"
                    onClick={() => setRejectOpen(true)}
                  >
                    Reject NC…
                  </Button>
                </div>
              )}

              {nc.capaActions?.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
                    CAPA Actions · {nc.capaActions.length}
                  </p>
                  <div className="space-y-2">
                    {nc.capaActions.map((capa: any) => (
                      <div
                        key={capa.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--page-bg)]/50 px-3.5 py-2.5 transition-colors hover:bg-[var(--page-bg)]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                              style={{
                                background:
                                  capa.type === 'CORRECTIVE' ? 'rgba(21,101,192,0.10)' : 'rgba(0,188,212,0.10)',
                                color: capa.type === 'CORRECTIVE' ? '#1463b8' : '#006064',
                              }}
                            >
                              {capa.type}
                            </span>
                            {capa.actionStatus && (
                              <Badge variant="default" className="border border-[var(--border)] text-[10px] font-medium">
                                {String(capa.actionStatus).replace(/_/g, ' ')}
                              </Badge>
                            )}
                            <span className="text-sm font-semibold text-[var(--text-primary)]">{capa.title}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                            Due {new Date(capa.dueDate).toLocaleDateString()} · {resolveAssigneeLabel(String(capa.assignedTo ?? ''), members)}
                            {Array.isArray(capa.evidenceDocumentIds) && capa.evidenceDocumentIds.length > 0 && (
                              <> · {capa.evidenceDocumentIds.length} evidence file{capa.evidenceDocumentIds.length > 1 ? 's' : ''}</>
                            )}
                          </p>
                        </div>
                        {!capa.completedAt ? (
                          <button
                            type="button"
                            onClick={() => handleCompleteCapa(capa.id)}
                            title="Mark complete"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#118d57] transition-colors hover:bg-[rgba(54,179,126,0.10)]"
                          >
                            <CircleCheck className="h-4 w-4" />
                          </button>
                        ) : (
                          <Badge variant="paid" className="shrink-0 text-[10px] font-medium">
                            Done
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs italic text-[var(--muted)]">No CAPA actions yet.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      {/* CAPA dialog */}
      <Dialog open={capaOpen} onOpenChange={setCapaOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] w-[min(100vw-1.5rem,32rem)] max-w-none overflow-y-auto overflow-x-hidden sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add CAPA Action</DialogTitle>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 py-2 pr-1">
            <div className="min-w-0">
              <Label>Type</Label>
              <Select value={capaForm.type} onValueChange={(v) => setCapaForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORRECTIVE">Corrective (immediate fix)</SelectItem>
                  <SelectItem value="PREVENTIVE">Preventive (long-term)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`capa-title-${nc.id}`}>Action Title *</Label>
              <Input
                id={`capa-title-${nc.id}`}
                value={capaForm.title}
                onChange={(e) => setCapaForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor={`capa-desc-${nc.id}`}>Description</Label>
              <Textarea
                id={`capa-desc-${nc.id}`}
                rows={2}
                value={capaForm.description}
                onChange={(e) => setCapaForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor={`capa-assign-${nc.id}`}>Assigned to *</Label>
              <Select value={capaForm.assignedTo || undefined} onValueChange={(v) => setCapaForm((p) => ({ ...p, assignedTo: v }))}>
                <SelectTrigger id={`capa-assign-${nc.id}`} className="min-w-0">
                  <SelectValue placeholder={members.length ? 'Select a team member' : 'Loading team…'} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!members.length && (
                <p className="mt-1 text-xs text-[var(--muted)]">Could not load company directory; check your role or try again.</p>
              )}
            </div>
            <div>
              <Label htmlFor={`capa-due-${nc.id}`}>Due Date *</Label>
              <Input
                id={`capa-due-${nc.id}`}
                type="date"
                value={capaForm.dueDate}
                onChange={(e) => setCapaForm((p) => ({ ...p, dueDate: e.target.value }))}
              />
            </div>
            <div className="min-w-0">
              <Label>Evidence documents (optional)</Label>
              <p className="mb-2 text-[11px] text-[var(--muted)]">Link files that prove implementation or context.</p>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  ref={capaEvidenceFileRef}
                  type="file"
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.xlsx,.jpeg,.jpg,.png,.tiff,.tif,application/pdf,image/*"
                  onChange={handleCapaEvidenceFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={capaEvidenceUploading}
                  onClick={() => capaEvidenceFileRef.current?.click()}
                >
                  {capaEvidenceUploading ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      Upload new file
                    </>
                  )}
                </Button>
              </div>
              {documents.length > 0 ? (
                <div className="max-h-36 space-y-1.5 overflow-y-auto overflow-x-hidden rounded-md border border-[var(--border)] p-2">
                  {documents.map((d) => (
                    <label key={d.id} className="flex min-w-0 cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        className="shrink-0"
                        checked={capaForm.evidenceDocumentIds.includes(d.id)}
                        onCheckedChange={() => toggleCapaEvidence(d.id)}
                      />
                      <span className="min-w-0 truncate">{d.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">No files in the library list yet. Upload one above.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCapaOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddCapa}>
              Add CAPA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 5-Why dialog */}
      <Dialog open={whyOpen} onOpenChange={setWhyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-[var(--brand-primary)]" />
                AI 5-Why suggestions
              </span>
              {clauseContextLabel && (
                <span className="text-xs font-normal text-[var(--muted)]">{clauseContextLabel}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {whyData && (
            <div className="max-h-[60vh] space-y-2.5 overflow-y-auto py-2">
              {(['why1', 'why2', 'why3', 'why4', 'why5'] as const).map((key, i) => (
                <div
                  key={key}
                  className="rounded-xl border border-[var(--brand-primary)]/15 bg-[var(--brand-primary)]/5 px-3.5 py-2.5"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand-primary)]">
                    Why #{i + 1}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">{whyData[key]}</p>
                </div>
              ))}
              <div className="rounded-xl border border-[rgba(54,179,126,0.25)] bg-[rgba(54,179,126,0.06)] px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#1b806a]">
                  Suggested root cause
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
                  {whyData.rootCauseSuggestion}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={applyAiToRca}>
              Apply to RCA form
            </Button>
            <Button type="button" onClick={() => setWhyOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this NC?</DialogTitle>
          </DialogHeader>
          <Label>Reason (optional)</Label>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleRejectNc}>
              Reject NC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI root causes dialog */}
      <Dialog open={aiRootOpen} onOpenChange={setAiRootOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-[#b76e00]" />
              AI probable root causes
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--muted)]">
            Suggestions use this NC and recent non-conformities from your company. Accept into your RCA summary,
            edit the text first, or dismiss a suggestion.
          </p>
          {aiRootLoading && (
            <p className="py-4 text-center text-sm text-[var(--muted)]">Calling AI service…</p>
          )}
          {!aiRootLoading && aiRootPayload && (
            <>
              <p className="text-[11px] text-[var(--muted)]">
                History rows: {aiRootPayload.historySampleSize ?? 0}
                {aiRootPayload.model ? (
                  <>
                    {' '}
                    · Model: <span className="font-mono">{aiRootPayload.model}</span>
                  </>
                ) : null}
              </p>
              {(aiRootPayload.probableCauses || []).length === 0 && (
                <p className="py-2 text-sm text-[var(--muted)]">
                  No suggestions returned. Try Refresh or check the AI service configuration.
                </p>
              )}
              <div className="mt-2 space-y-3">
                {(aiRootPayload.probableCauses || [])
                  .filter((c) => !dismissedCauseIds.has(c.id))
                  .map((c) => (
                    <div key={c.id} className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/40 p-3">
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{c.title}</p>
                        <span className="rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                          {(c.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      <Textarea
                        rows={4}
                        className="resize-none text-xs"
                        value={causeEdits[c.id] ?? `${c.title}\n\n${c.rationale}`}
                        onChange={(e) => setCauseEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={async () => {
                            const text = (causeEdits[c.id] ?? `${c.title}\n\n${c.rationale}`).trim();
                            const nextRca = {
                              ...rca,
                              rootCause: rca.rootCause ? `${rca.rootCause}\n\n---\n${text}` : text,
                            };
                            setRca(nextRca);
                            setDismissedCauseIds((s) => new Set(s).add(c.id));
                            try {
                              await ncApi.saveRca(nc.id, nextRca);
                              toast.success('RCA saved. NC is now in the RCA tab');
                              setAiRootOpen(false);
                              onRefresh();
                            } catch {
                              toast.error('Merged into form. Click Save RCA in the card to persist');
                            }
                          }}
                        >
                          Accept &amp; Save RCA
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDismissedCauseIds((s) => new Set(s).add(c.id))}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
              {(aiRootPayload.probableCauses || []).length > 0 &&
                (aiRootPayload.probableCauses || []).every((c) => dismissedCauseIds.has(c.id)) && (
                  <p className="py-2 text-center text-xs text-[var(--muted)]">
                    All suggestions dismissed or accepted.
                  </p>
                )}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void loadAiRootCauses()} disabled={aiRootLoading}>
              Refresh suggestions
            </Button>
            <Button type="button" onClick={() => setAiRootOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NcFishboneDialog
        open={fishboneOpen}
        onOpenChange={setFishboneOpen}
        ncTitle={displayNcTitle(nc)}
        ncDescription={String(nc.description ?? '')}
        fetchAiBranches={fetchFishboneAi}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const TAB_LABELS = [
  'All',
  'Open',
  'RCA',
  'CAPA defined',
  'In progress',
  'Verification',
  'Closed',
  'Rejected',
] as const;
const TAB_STATUSES: (string | undefined)[] = [
  undefined,
  'OPEN',
  'ROOT_CAUSE_ANALYSIS',
  'CAPA_DEFINED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'CLOSED',
  'REJECTED',
];

export default function NCPage() {
  const pathname = usePathname();
  const pageMeta = getPageMeta(pathname || '/nc');
  const perms = usePermissions();
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [documents, setDocuments] = useState<DocPick[]>([]);
  const [ncs, setNCs] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('0');
  const [createOpen, setCreateOpen] = useState(false);
  const [isoStandards, setIsoStandards] = useState<IsoStandardRow[]>([]);
  const [isoStandardsLoading, setIsoStandardsLoading] = useState(false);
  const [ncClauseOptions, setNcClauseOptions] = useState<string[]>([]);
  const [ncClauseSections, setNcClauseSections] = useState<Record<string, ClauseSectionSummary>>({});
  const [loadingNcClauses, setLoadingNcClauses] = useState(false);
  const ncCreateEvidenceFileRef = useRef<HTMLInputElement>(null);
  const [ncCreateEvidenceUploading, setNcCreateEvidenceUploading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    classification: 'MINOR',
    isoClause: '',
    isoStandard: '',
    isoDocumentId: '',
    clauseRef: '',
    assignedTo: '',
    extraEvidenceIds: [] as string[],
  });

  const onNcIsoDocumentChange = useCallback(
    async (documentId: string) => {
      if (!documentId || documentId === '__none__') {
        setForm((p) => ({
          ...p,
          isoDocumentId: '',
          isoStandard: '',
          isoClause: '',
          clauseRef: '',
        }));
        setNcClauseOptions([]);
        setNcClauseSections({});
        return;
      }
      const row = isoStandards.find((x) => x.id === documentId);
      setForm((p) => ({
        ...p,
        isoDocumentId: documentId,
        isoStandard: (row?.isoStandard?.trim() || p.isoStandard).trim(),
        isoClause: '',
        clauseRef: '',
      }));
      setLoadingNcClauses(true);
      try {
        const res = await documentApi.get(documentId);
        const extracted = extractSectionClauseNumbers(res.data);
        setNcClauseOptions(extracted);
        setNcClauseSections(buildClauseSectionMap(res.data));
        if (!extracted.length) {
          toast.error('No clauses found. Run extraction on this standard in the file library first.');
        }
      } catch {
        setNcClauseOptions([]);
        setNcClauseSections({});
        toast.error('Could not load clauses from the selected standard.');
      } finally {
        setLoadingNcClauses(false);
      }
    },
    [isoStandards],
  );

  useEffect(() => {
    loadAll();
  }, [tab]);

  useEffect(() => {
    (async () => {
      try {
        const res = await companyApi.getUsers();
        const { users } = normalizeCompanyUsersResponse(res.data);
        setMembers(
          (users as { id: string; firstName?: string; lastName?: string; email?: string }[]).map((u) => ({
            id: u.id,
            email: u.email,
            label: companyUserDisplayName(u),
          })),
        );
      } catch {
        setMembers([]);
      }
    })();
  }, []);

  const reloadDocuments = useCallback(async () => {
    try {
      const res = await documentApi.list();
      const raw = Array.isArray(res.data) ? res.data : [];
      setDocuments(normalizeDocumentList(raw as { id: string; name?: string; title?: string }[]));
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    void reloadDocuments();
  }, [reloadDocuments]);

  useEffect(() => {
    if (!createOpen) return;
    (async () => {
      setIsoStandardsLoading(true);
      try {
        const res = await documentApi.list({ type: 'ISO_NORM' });
        const raw = Array.isArray(res.data) ? res.data : [];
        setIsoStandards(
          raw.map((d: { id: string; name?: string; isoStandard?: string | null }) => ({
            id: d.id,
            name: d.name || 'Standard document',
            isoStandard: d.isoStandard ?? null,
          })),
        );
      } catch {
        setIsoStandards([]);
      } finally {
        setIsoStandardsLoading(false);
      }
    })();
  }, [createOpen]);

  const loadAll = async () => {
    setLoading(true);
    const status = TAB_STATUSES[Number(tab)];
    const axiosMsg = (reason: unknown): string => {
      const r = reason as { response?: { data?: { message?: unknown }; status?: number }; message?: string };
      const m = r?.response?.data?.message;
      if (typeof m === 'string' && m.trim()) return m.trim();
      if (Array.isArray(m) && m.length) return String(m[0]);
      if (r?.response?.status === 401 || r?.response?.status === 403)
        return r.response.status === 401 ? 'Session expired, sign in again' : 'Access denied for this action';
      if (r?.message) return r.message;
      return 'Request failed';
    };

    try {
      const [ncOutcome, kpiOutcome] = await Promise.allSettled([
        ncApi.list(status ? { status } : {}),
        ncApi.kpis(),
      ]);

      if (ncOutcome.status === 'fulfilled') setNCs(ncOutcome.value.data);
      else setNCs([]);

      if (kpiOutcome.status === 'fulfilled') setKpis(kpiOutcome.value.data);
      else setKpis(null);

      const errs: string[] = [];
      if (ncOutcome.status === 'rejected') errs.push(`list (${axiosMsg(ncOutcome.reason)})`);
      if (kpiOutcome.status === 'rejected') errs.push(`KPIs (${axiosMsg(kpiOutcome.reason)})`);
      if (errs.length) toast.error(`Could not load NC data: ${errs.join('; ')}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNcCreateEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNcCreateEvidenceUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'EVIDENCE');
      fd.append('description', 'NC evidence');
      const res = await documentApi.upload(fd);
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      const newId = row?.id as string | undefined;
      await reloadDocuments();
      if (newId) {
        setForm((p) => ({
          ...p,
          extraEvidenceIds: p.extraEvidenceIds.includes(newId) ? p.extraEvidenceIds : [...p.extraEvidenceIds, newId],
        }));
      }
      toast.success('Evidence uploaded');
    } catch {
      toast.error('Upload failed. Use PDF, Office, or image under 50 MB');
    } finally {
      setNcCreateEvidenceUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title || !form.description) return toast.error('Fill required fields');
    if (form.isoDocumentId && !form.clauseRef.trim()) {
      return toast.error('Select a clause ref for the chosen ISO standard.');
    }
    const evidenceIds = Array.from(
      new Set([...(form.isoDocumentId ? [form.isoDocumentId] : []), ...form.extraEvidenceIds]),
    );
    try {
      await ncApi.create({
        title: form.title,
        description: form.description,
        classification: form.classification,
        isoClause: (form.clauseRef || form.isoClause).trim() || undefined,
        isoStandard: form.isoStandard.trim() || undefined,
        source: 'MANUAL',
        assignedTo: form.assignedTo || undefined,
        evidenceDocumentIds: evidenceIds.length ? evidenceIds : undefined,
      });
      toast.success('Non-conformity created');
      setCreateOpen(false);
      setForm({
        title: '',
        description: '',
        classification: 'MINOR',
        isoClause: '',
        isoStandard: '',
        isoDocumentId: '',
        clauseRef: '',
        assignedTo: '',
        extraEvidenceIds: [],
      });
      setNcClauseOptions([]);
      setNcClauseSections({});
      loadAll();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to create');
    }
  };

  /* -------- Derived KPI tiles ----------------------------------- */

  const kpiTiles = useMemo(() => {
    if (!kpis) return [];
    const openCount = statusCountRow(
      kpis.byStatus?.find((s: any) => s.nc_status === 'OPEN' || s.status === 'OPEN') ?? {},
    );
    const inProgress = statusCountRow(
      kpis.byStatus?.find((s: any) => s.nc_status === 'IN_PROGRESS' || s.status === 'IN_PROGRESS') ?? {},
    );
    return [
      { label: 'Total NCs',       value: kpis.total,        color: '#1463b8', soft: 'rgba(21,101,192,0.10)',  Icon: Layers },
      { label: 'Open',            value: openCount,         color: '#c4320a', soft: 'rgba(255,86,48,0.10)',   Icon: AlertCircle },
      { label: 'In progress',     value: inProgress,        color: '#9c6700', soft: 'rgba(255,171,0,0.12)',   Icon: Activity },
      { label: 'Overdue CAPAs',   value: kpis.overdueCAPAs, color: '#a4170f', soft: 'rgba(183,29,24,0.10)',   Icon: Timer },
    ];
  }, [kpis]);

  /* -------- Per-tab counts (derived from kpis) ------------------ */
  const tabCounts = useMemo(() => {
    const m = new Map<number, number>();
    if (!kpis) return m;
    let total = 0;
    for (const row of (kpis.byStatus ?? []) as Array<{ status?: string; nc_status?: string; count?: number; _count?: number }>) {
      const status = row.nc_status ?? row.status;
      const c = statusCountRow(row);
      total += c;
      const idx = TAB_STATUSES.findIndex((s) => s === status);
      if (idx > 0) m.set(idx, c);
    }
    m.set(0, kpis.total ?? total);
    return m;
  }, [kpis]);

  return (
    <DashboardLayout showRouteHeader={false}>
      {/* Header */}
      <header className="mb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[26px]">
                {pageMeta.title}
              </h1>
              {kpis?.total != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--page-bg)]/60 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {kpis.total} total
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-[var(--muted)]">{pageMeta.tagline}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {perms.createNcRecords && (
              <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New NC
              </Button>
            )}
          </div>
        </div>
        <div
          aria-hidden
          className="mt-5 h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--border) 12%, var(--border) 88%, transparent)',
          }}
        />
      </header>

      {/* KPIs: unified soft panel */}
      {kpis && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="mb-7"
          aria-label="Key NC indicators"
        >
          <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--surface-elevated)]">
            {/* Soft ambient glows */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[var(--brand-primary)]/8 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-[var(--brand-accent)]/6 blur-3xl"
            />
            {/* Top hairline gradient */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-primary) 40%, transparent), transparent)',
              }}
            />

            <div className="relative grid grid-cols-2 sm:grid-cols-4">
              {kpiTiles.map((kpi, i) => (
                <motion.button
                  key={kpi.label}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.08 + i * 0.06,
                    duration: 0.45,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={cn(
                    'group relative flex items-center gap-4 px-5 py-5 text-left transition-colors duration-300 sm:px-6 sm:py-6',
                    // Soft dividers: 2×2 on mobile, 1×4 on desktop
                    i === 1 && 'border-l border-[var(--border)]/60',
                    i === 2 && 'border-t border-[var(--border)]/60 sm:border-l sm:border-t-0',
                    i === 3 && 'border-l border-t border-[var(--border)]/60 sm:border-t-0',
                  )}
                >
                  {/* Soft hover wash */}
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
                    style={{ background: kpi.soft }}
                  />
                  {/* Top accent rule that sweeps in */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-5 top-0 h-[2px] origin-center scale-x-0 rounded-full opacity-0 transition-all duration-500 ease-out group-hover:scale-x-100 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${kpi.color}, transparent)`,
                    }}
                  />

                  {/* Icon with soft halo */}
                  <span
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 ease-out group-hover:scale-110 group-hover:-rotate-3"
                    style={{ background: kpi.soft, color: kpi.color }}
                  >
                    <kpi.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(circle at center, ${kpi.color}22, transparent 70%)`,
                      }}
                    />
                  </span>

                  <div className="relative min-w-0 flex-1">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] transition-colors duration-300 group-hover:text-[var(--text-primary)]">
                      {kpi.label}
                    </p>
                    <motion.p
                      className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-[28px]"
                      style={{ color: kpi.color }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: 0.18 + i * 0.06,
                        duration: 0.5,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      {kpi.value ?? 0}
                    </motion.p>
                    {/* Soft progress sliver: grows gently on hover */}
                    <span
                      aria-hidden
                      className="mt-2.5 block h-[3px] w-10 origin-left rounded-full transition-all duration-500 ease-out group-hover:w-20"
                      style={{
                        background: `linear-gradient(90deg, ${kpi.color}, color-mix(in srgb, ${kpi.color} 25%, transparent))`,
                      }}
                    />
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Bottom hairline gradient */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, var(--border) 90%, transparent), transparent)',
              }}
            />
          </div>
        </motion.section>
      )}

      {/* NC lifecycle explainer */}
      <NcFlowBanner />

      {/* Tabs: soft segmented pill */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5 -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="inline-flex gap-1 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)] p-1">
          {TAB_LABELS.map((label, i) => {
            const active = tab === String(i);
            const status = TAB_STATUSES[i];
            const dotColor =
              i === 0
                ? 'var(--brand-primary)'
                : (status && STATUS_CONFIG[status]?.color) || 'var(--muted)';
            const count = tabCounts.get(i);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setTab(String(i))}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-medium tracking-[-0.005em] transition-colors duration-200',
                  active
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nc-tab-pill"
                    className="absolute inset-0 rounded-xl bg-[var(--surface)]"
                    style={{
                      boxShadow:
                        'inset 0 0 0 1px color-mix(in srgb, var(--brand-primary) 22%, transparent)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                {/* Soft halo behind the pill on active */}
                {active && (
                  <motion.span
                    layoutId="nc-tab-glow"
                    aria-hidden
                    className="absolute inset-0 rounded-xl opacity-60"
                    style={{
                      background: `radial-gradient(circle at center, color-mix(in srgb, ${dotColor} 14%, transparent), transparent 70%)`,
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span
                  aria-hidden
                  className="relative inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-transform duration-300"
                  style={{
                    background: dotColor,
                    boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${dotColor} 18%, transparent)` : 'none',
                    transform: active ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
                <span className="relative">{label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      'relative ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums transition-colors duration-200',
                      active ? '' : 'bg-[var(--page-bg)] text-[var(--muted)]',
                    )}
                    style={
                      active
                        ? {
                            background: `color-mix(in srgb, ${dotColor} 14%, transparent)`,
                            color: dotColor,
                          }
                        : undefined
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : ncs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl border border-dashed border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--surface-elevated)] px-6 py-16 text-center"
        >
          {/* Ambient halos */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[var(--brand-primary)]/8 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[var(--brand-accent)]/6 blur-3xl"
          />
          <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
            {/* Concentric soft rings */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'radial-gradient(circle at center, color-mix(in srgb, var(--brand-primary) 16%, transparent), transparent 70%)',
              }}
            />
            <span
              aria-hidden
              className="absolute inset-2 rounded-full border border-[var(--brand-primary)]/15"
            />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <FileX2 className="h-[22px] w-[22px]" strokeWidth={1.75} />
            </span>
          </div>
          <p className="relative text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            No non-conformities found
          </p>
          <p className="relative mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--muted)]">
            Nothing matches this filter. Create a manual NC or switch to another tab to see your records.
          </p>
          {perms.createNcRecords && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative mt-6 gap-2 rounded-full"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New NC
            </Button>
          )}
        </motion.div>
      ) : (
        groupNcsBySource(ncs, documents).map((group) => (
          <NcGroupSection
            key={group.key}
            group={group}
            members={members}
            documents={documents}
            onRefresh={loadAll}
            onRefreshDocuments={reloadDocuments}
          />
        ))
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] w-[min(100vw-1.5rem,36rem)] max-w-none overflow-y-auto overflow-x-hidden sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>New Non-Conformity</DialogTitle>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 py-2 pr-1">
            <div className="min-w-0">
              <Label htmlFor="nc-title">Title *</Label>
              <Input id="nc-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="nc-desc">Description *</Label>
              <Textarea
                id="nc-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="min-w-0">
              <Label>Classification</Label>
              <Select value={form.classification} onValueChange={(v) => setForm((p) => ({ ...p, classification: v }))}>
                <SelectTrigger className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['MINOR', 'MAJOR', 'CRITICAL'].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Standard file</Label>
              <Select
                value={form.isoDocumentId || '__none__'}
                onValueChange={(v) => void onNcIsoDocumentChange(v)}
                disabled={loadingNcClauses}
              >
                <SelectTrigger className="min-w-0">
                  <SelectValue
                    placeholder={
                      isoStandardsLoading ? 'Loading standards…' : 'Select an uploaded ISO PDF (optional)'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {isoStandards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="truncate">{formatIsoNormSelectLabel(d)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.isoStandard && (
                <p className="mt-1 text-xs font-medium text-[var(--brand-primary)]">
                  Reference: {form.isoStandard}
                </p>
              )}
              {!isoStandards.length && !isoStandardsLoading && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  No ISO standard documents found. Upload a standard (PDF) under Documents first.
                </p>
              )}
            </div>
            {form.isoDocumentId && (
              <div className="min-w-0">
                <Label className="text-xs">Clause ref *</Label>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                  Clauses come from the selected standard&apos;s extraction in the file library. Select one.
                </p>
                <div
                  className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2"
                  role="group"
                  aria-label="Clause reference"
                >
                  {loadingNcClauses ? (
                    <span className="text-xs text-[var(--muted)]">Loading clauses from document…</span>
                  ) : ncClauseOptions.length === 0 ? (
                    <span className="text-xs text-amber-700">
                      No clauses in this document. Run extraction and activate the standard in the file library.
                    </span>
                  ) : (
                    ncClauseOptions.map((c) => {
                      const heading = ncClauseSections[c]?.heading?.trim();
                      const title = heading ? `${c}: ${heading}` : c;
                      return (
                        <label
                          key={c}
                          className="flex cursor-pointer items-center gap-1 text-xs"
                          title={title}
                        >
                          <input
                            type="checkbox"
                            checked={form.clauseRef === c}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                clauseRef: e.target.checked ? c : '',
                                isoClause: e.target.checked ? c : '',
                              }))
                            }
                          />
                          {c}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
            <div className="min-w-0">
              <Label>Assigned to (optional)</Label>
              <Select
                value={form.assignedTo || '__none__'}
                onValueChange={(v) => setForm((p) => ({ ...p, assignedTo: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder={members.length ? 'Select a team member' : 'Loading team…'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Supporting evidence (optional)</Label>
              <p className="mb-2 text-[11px] text-[var(--muted)]">Upload photos or files linked to this NC.</p>
              <input
                ref={ncCreateEvidenceFileRef}
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.xlsx,.jpeg,.jpg,.png,.tiff,.tif,application/pdf,image/*"
                onChange={handleNcCreateEvidenceFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={ncCreateEvidenceUploading}
                onClick={() => ncCreateEvidenceFileRef.current?.click()}
              >
                {ncCreateEvidenceUploading ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Upload evidence file
                  </>
                )}
              </Button>
              {form.extraEvidenceIds.length > 0 && (
                <p className="mt-2 text-xs text-[var(--muted)]">{form.extraEvidenceIds.length} file(s) will be linked.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreate}>
              Create NC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}