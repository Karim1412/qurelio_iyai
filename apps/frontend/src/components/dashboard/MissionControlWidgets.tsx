'use client';

/**
 * Compliance Mission Control widgets.
 * Soft, premium, semantic: all components share the same shell language so
 * the dashboard reads as one continuous surface, not a scrapbook of cards.
 *
 * Public exports:
 *  - AIBadge                : subtle "AI analyzed / assisted / recommendation" chip
 *  - EmptyMetricState       : intelligent empty state inside a metric card
 *  - AICompliancePulse      : simple inline label inside the hero
 *  - ComplianceHealthScore  : radial gauge + sub-metrics (CAPAs, risks, readiness)
 *  - AIInsightsCard         : gap detection / SOP expiry / missing evidence
 *  - PendingApprovalsCard   : documents, CAPAs, audit validations
 *  - UpcomingAuditsCard     : audits with date + status
 *  - RecentActivityFeed     : uploads, evaluations, audit assignments, overdue CAPAs
 *  - SystemHealthCard       : AI engine, OCR, notifications, audit trail
 *  - TrustIndicatorsFooter  : ISO 27001, audit trail, RBAC
 */

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles,
  Lightbulb,
  Shield,
  ShieldCheck,
  Bell,
  Activity,
  CheckCircle,
  AlertTriangle,
  Timer,
  Calendar,
  FileText,
  FileUp,
  LineChart as LineChartIcon,
  ArrowRight,
  Bot,
  BotMessageSquare,
  Brain,
} from '@/components/icons';
import { cn } from '@/utils/cn';
import { DocumentCardPreview } from '@/components/dashboard/DocumentCardPreview';

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

const PANEL =
  'group relative overflow-hidden rounded-2xl border border-[var(--border)]/55 bg-[var(--surface)] ' +
  'transition-colors duration-300 ease-out hover:border-[var(--border)]/85';

/* Decorative hover rail/glow removed for a calmer, less busy dashboard.
   Kept as no-op components so existing call sites stay valid. */
function AccentRail(_props: { color: string }) {
  return null;
}

function CornerGlow(_props: { color: string; bg?: string }) {
  return null;
}

function PanelHeader({
  eyebrow,
  title,
  color,
  Icon,
  right,
}: {
  eyebrow: string;
  title: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-between gap-3 px-4 pb-2.5 pt-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border)]"
          style={{
            backgroundColor: `${color}14`,
            color,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            {eyebrow}
          </p>
          <h3 className="text-[13.5px] font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h3>
        </div>
      </div>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI badge                                                            */
/* ------------------------------------------------------------------ */

type AIBadgeVariant = 'analyzed' | 'assisted' | 'recommendation';

export function AIBadge({
  variant = 'analyzed',
  className,
}: {
  variant?: AIBadgeVariant;
  className?: string;
}) {
  const label =
    variant === 'analyzed'
      ? 'AI analyzed'
      : variant === 'assisted'
        ? 'AI assisted'
        : 'AI recommendation';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.08] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--brand-primary)]',
        className,
      )}
    >
      <Bot className="h-3 w-3" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty metric state: used inside KPI cards when value === 0         */
/* ------------------------------------------------------------------ */

export function EmptyMetricState({
  message,
  cta,
  href,
  onClick,
  color,
}: {
  message: string;
  cta?: string;
  href?: string;
  onClick?: () => void;
  color: string;
}) {
  const ctaInner = cta && (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors"
      style={{
        borderColor: `${color}33`,
        backgroundColor: `${color}12`,
        color,
      }}
    >
      {cta}
      <ArrowRight className="h-3 w-3" />
    </span>
  );

  return (
    <div className="mt-1.5">
      <p className="text-[12px] leading-snug text-[var(--muted)]">{message}</p>
      {cta && (
        <div className="mt-2.5">
          {href ? (
            <Link href={href} className="inline-flex">
              {ctaInner}
            </Link>
          ) : onClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              }}
              className="inline-flex"
            >
              {ctaInner}
            </button>
          ) : (
            ctaInner
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI Compliance Pulse: simple inline label inside the hero           */
/* ------------------------------------------------------------------ */

export interface CompliancePulseData {
  standardsMonitored: number;
  documentsAnalyzed: number;
  gapsDetected: number;
  lastScanLabel: string;
}

export function AICompliancePulse({ data }: { data?: CompliancePulseData }) {
  const metrics = data
    ? [
        { label: 'Standards monitored', value: data.standardsMonitored },
        { label: 'Documents analyzed', value: data.documentsAnalyzed },
        { label: 'Gaps detected', value: data.gapsDetected },
      ]
    : [];

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
      {/* Identity */}
      <div className="inline-flex items-center gap-2.5">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--brand-accent)]/10">
          <BotMessageSquare className="h-[18px] w-[18px] text-[var(--brand-accent)]" />
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        </span>
        <div className="leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
            AI Compliance Pulse
          </p>
          <p className="text-[13.5px] font-semibold text-white">Continuous monitoring active</p>
        </div>
      </div>

      {/* Inline soft metrics: no card, just typography + thin dividers */}
      {metrics.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {metrics.map((m, i) => (
            <li
              key={m.label}
              className="flex items-baseline gap-1.5 leading-none"
              style={
                i > 0
                  ? { borderLeft: '1px solid rgba(255,255,255,0.10)', paddingLeft: '1.25rem' }
                  : undefined
              }
            >
              <span className="text-[18px] font-semibold tracking-tight text-white tabular-nums">
                {m.value}
              </span>
              <span className="text-[11px] font-medium text-white/55">{m.label}</span>
            </li>
          ))}
          {data?.lastScanLabel && (
            <li
              className="flex items-center gap-1.5 leading-none"
              style={{
                borderLeft: '1px solid rgba(255,255,255,0.10)',
                paddingLeft: '1.25rem',
              }}
            >
              <Timer className="h-3 w-3 text-white/55" />
              <span className="text-[11px] font-medium text-white/65">{data.lastScanLabel}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compliance Health Score: radial gauge + sub-metrics                */
/* ------------------------------------------------------------------ */

export interface ComplianceHealthData {
  score: number; // 0–100
  capaCount: number;
  criticalRisks: number;
  auditReadiness: number; // 0–100
}

export function ComplianceHealthScore({ data }: { data: ComplianceHealthData }) {
  const score = Math.max(0, Math.min(100, data.score));
  const accent =
    score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#fb923c' : '#ef4444';
  const status =
    score >= 80 ? 'Excellent' : score >= 60 ? 'Healthy' : score >= 40 ? 'At risk' : 'Critical';

  const radius = 56;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  return (
    <div className={cn(PANEL, 'h-full')}>
      <AccentRail color={accent} />
      <CornerGlow color={accent} />
      <PanelHeader
        eyebrow="Mission control"
        title="Compliance Health Score"
        color={accent}
        Icon={ShieldCheck}
        right={<AIBadge variant="analyzed" />}
      />

      <div className="relative grid grid-cols-1 gap-5 px-5 pb-5 sm:grid-cols-[150px_1fr]">
        <div className="relative mx-auto h-[140px] w-[140px]">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              strokeWidth={stroke}
              fill="none"
              stroke="var(--border)"
              opacity={0.45}
            />
            <motion.circle
              cx="70"
              cy="70"
              r={radius}
              strokeWidth={stroke}
              fill="none"
              stroke={accent}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - dash }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
              {score}
              <span className="text-[14px] font-medium text-[var(--muted)]">%</span>
            </span>
            <span
              className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              {status}
            </span>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-2.5">
          <SubMetric
            Icon={AlertTriangle}
            label="Open CAPAs"
            value={data.capaCount}
            tone={data.capaCount > 0 ? '#f59e0b' : '#10b981'}
          />
          <SubMetric
            Icon={Shield}
            label="Critical risks"
            value={data.criticalRisks}
            tone={data.criticalRisks > 0 ? '#ef4444' : '#10b981'}
          />
          <SubMetric
            Icon={CheckCircle}
            label="Audit readiness"
            value={`${data.auditReadiness}%`}
            tone={
              data.auditReadiness >= 80
                ? '#10b981'
                : data.auditReadiness >= 50
                  ? '#f59e0b'
                  : '#ef4444'
            }
          />
        </ul>
      </div>
    </div>
  );
}

function SubMetric({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/55 px-3 py-2 transition-colors hover:bg-[var(--nav-hover)]/40">
      <span className="flex items-center gap-2 text-[12px] text-[var(--nav-inactive)]">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${tone}1a`, color: tone }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
        {value}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* AI Insights Card                                                    */
/* ------------------------------------------------------------------ */

export interface AIInsight {
  id: string;
  title: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
  kind: 'gap' | 'expiry' | 'evidence';
}

const SEVERITY_STYLE: Record<
  AIInsight['severity'],
  { color: string; bg: string; label: string }
> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', label: 'Critical' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: 'Warning' },
  info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', label: 'Info' },
};

export function AIInsightsCard({ insights }: { insights: AIInsight[] }) {
  const color = 'var(--brand-primary)';

  return (
    <div className={cn(PANEL, 'h-full')}>
      <AccentRail color="var(--brand-primary)" />
      <CornerGlow color="var(--brand-primary)" bg="rgba(77,146,196,0.10)" />
      <PanelHeader
        eyebrow="Intelligence"
        title="AI Insights"
        color={color}
        Icon={Brain}
        right={<AIBadge variant="recommendation" />}
      />
      <div className="px-5 pb-5">
        {insights.length === 0 ? (
          <EmptyBlock
            Icon={BotMessageSquare}
            primary="Your environment looks healthy."
            secondary="AI will surface gaps, expirations, and missing evidence here as it scans your data."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {insights.slice(0, 4).map((i, idx) => {
              const s = SEVERITY_STYLE[i.severity];
              return (
                <motion.li
                  key={i.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="group/row relative flex items-start gap-3 rounded-2xl border border-[var(--border)]/50 bg-[var(--surface)]/55 px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-transparent hover:bg-[var(--nav-hover)]/40"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: s.bg, color: s.color }}
                  >
                    {i.kind === 'gap' ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : i.kind === 'expiry' ? (
                      <Timer className="h-3.5 w-3.5" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                        {i.title}
                      </p>
                      <span
                        className="hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider sm:inline-flex"
                        style={{ backgroundColor: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{i.detail}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pending Approvals                                                   */
/* ------------------------------------------------------------------ */

export interface PendingApprovals {
  documents: number;
  capas: number;
  auditValidations: number;
}

export function PendingApprovalsCard({
  data,
  href = '/docs?status=pending',
}: {
  data: PendingApprovals;
  href?: string;
}) {
  const color = '#b76e00';
  const total = data.documents + data.capas + data.auditValidations;

  return (
    <div className={cn(PANEL, 'h-full')}>
      <AccentRail color={color} />
      <CornerGlow color={color} bg="rgba(183,110,0,0.10)" />
      <PanelHeader
        eyebrow="Workflow"
        title="Pending Approvals"
        color={color}
        Icon={CheckCircle}
        right={
          total > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              {total} awaiting
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
              All clear
            </span>
          )
        }
      />
      <div className="grid grid-cols-3 gap-2 px-5 pb-5">
        <ApprovalCell label="Documents" value={data.documents} color={color} />
        <ApprovalCell label="CAPAs" value={data.capas} color="#ef4444" />
        <ApprovalCell label="Audit validations" value={data.auditValidations} color="#7c4dff" />
      </div>
      <Link
        href={href}
        className="group/footer relative flex items-center justify-between border-t border-[var(--border)]/55 bg-[var(--surface)]/60 px-5 py-2.5 text-[12px] font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/[0.06]"
      >
        Review queue
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/footer:translate-x-0.5" />
      </Link>
    </div>
  );
}

function ApprovalCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/55 px-3 py-2.5">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-2 top-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <p className="text-[20px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1 text-[10.5px] leading-snug text-[var(--muted)]">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upcoming Audits                                                     */
/* ------------------------------------------------------------------ */

export interface UpcomingAudit {
  id: string;
  name: string;
  date: string;
  status: string;
}

export function UpcomingAuditsCard({
  audits,
  href = '/audits',
}: {
  audits: UpcomingAudit[];
  href?: string;
}) {
  const color = '#7c4dff';
  return (
    <div className={cn(PANEL, 'h-full')}>
      <AccentRail color={color} />
      <CornerGlow color={color} bg="rgba(124,77,255,0.10)" />
      <PanelHeader
        eyebrow="Schedule"
        title="Upcoming Audits"
        color={color}
        Icon={Calendar}
        right={
          audits.length > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              {audits.length} planned
            </span>
          ) : null
        }
      />
      <div className="px-5 pb-3">
        {audits.length === 0 ? (
          <EmptyBlock
            Icon={Calendar}
            primary="No audits scheduled yet"
            secondary="Schedule your first ISO audit to start tracking readiness here."
            cta={{ label: 'Schedule audit', href }}
            color={color}
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {audits.slice(0, 4).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/55 px-3 py-2 transition-colors hover:bg-[var(--nav-hover)]/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {a.name}
                  </p>
                  <p className="text-[10.5px] text-[var(--muted)]">{a.date}</p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ backgroundColor: `${color}14`, color }}
                >
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {audits.length > 0 && (
        <Link
          href={href}
          className="group/footer relative flex items-center justify-between border-t border-[var(--border)]/55 bg-[var(--surface)]/60 px-5 py-2.5 text-[12px] font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/[0.06]"
        >
          Open audit calendar
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/footer:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent Activity Feed                                                */
/* ------------------------------------------------------------------ */

export interface ActivityItem {
  id: string;
  kind: 'upload' | 'evaluation' | 'audit' | 'capa';
  /** Human operation performed on the item, e.g. "Uploaded", "Processed & ready". */
  action?: string;
  title: string;
  subtitle?: string;
  timeLabel: string;
  /** Person who created/owns the document. */
  user?: string;
  /** Profile photo URL, when one exists. */
  avatarUrl?: string;
  /** Exact creation date + time, e.g. "16 May 2026, 11:01 AM". */
  dateLabel?: string;
  /** The document's own content/description. */
  description?: string;
  /** Human document type label, e.g. "ISO norm". */
  docType?: string;
  /** Raw document id, used to fetch the real file preview. */
  docId?: string;
  /** Link to open the item. */
  href?: string;
}

/** Small round avatar: photo when available, otherwise coloured initials. */
function FeedAvatar({ name, src }: { name: string; src?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const palette = ['#4d92c4', '#118d57', '#b76e00', '#7c4dff', '#1565c0', '#b71d18'];
  const c = palette[Math.abs(h) % palette.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${c} 16%, var(--surface))`, color: c }}
    >
      {initials}
    </span>
  );
}

const ACTIVITY_STYLE: Record<
  ActivityItem['kind'],
  { color: string; bg: string; Icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  upload: { color: '#118d57', bg: 'rgba(17,141,87,0.10)', Icon: FileUp, label: 'Upload' },
  evaluation: { color: '#4d92c4', bg: 'rgba(77,146,196,0.12)', Icon: LineChartIcon, label: 'Evaluation' },
  audit: { color: '#7c4dff', bg: 'rgba(124,77,255,0.10)', Icon: Calendar, label: 'Audit' },
  capa: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', Icon: AlertTriangle, label: 'CAPA' },
};

export function RecentActivityFeed({ items }: { items: ActivityItem[] }) {
  const color = 'var(--brand-primary)';
  // This panel focuses on documents and their content.
  const docs = items.filter((i) => i.kind === 'upload');
  return (
    <div className={cn(PANEL, 'h-full')}>
      <AccentRail color="var(--brand-primary)" />
      <CornerGlow color="var(--brand-primary)" bg="rgba(77,146,196,0.10)" />
      <PanelHeader
        eyebrow="Live feed"
        title="Recent Activity"
        color={color}
        Icon={Activity}
        right={
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium text-[var(--brand-primary)]">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)]/45" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
            </span>
            Live
          </span>
        }
      />
      <div className="px-4 pb-4">
        {docs.length === 0 ? (
          <EmptyBlock
            Icon={Activity}
            primary="No documents yet"
            secondary="Uploaded documents and their activity will appear here as they happen."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {docs.slice(0, 4).map((it, idx) => {
                const s = ACTIVITY_STYLE[it.kind];
                const who = it.user || 'System';
                return (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      href={it.href || '/docs'}
                      className="group/card flex h-full flex-col gap-3 rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)] p-3 transition-colors duration-300 hover:border-[var(--brand-primary)]/35 hover:bg-[var(--nav-hover)]/30"
                    >
                      {/* Top: who created it + photo + exact date/time */}
                      <div className="flex items-center gap-2.5">
                        <FeedAvatar name={who} src={it.avatarUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
                            {who}
                          </p>
                          <p className="truncate text-[10.5px] text-[var(--muted)]">
                            {it.dateLabel || it.timeLabel}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-colors group-hover/card:text-[var(--brand-primary)]" />
                      </div>

                      {/* The real document, rendered as a PDF page / image */}
                      {it.docId ? (
                        <DocumentCardPreview
                          documentId={it.docId}
                          name={it.title}
                          fallbackText={it.description || it.subtitle}
                          className="h-44 w-full"
                        />
                      ) : (
                        <div className="flex h-44 items-center justify-center rounded-xl border border-[var(--border)]/60 bg-[var(--page-bg)] text-[var(--muted)]">
                          <FileText className="h-6 w-6" />
                        </div>
                      )}

                      {/* Title + operation */}
                      <div className="flex flex-1 flex-col gap-1.5">
                        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[var(--text-primary)]">
                          {it.title}
                        </p>
                        <div className="mt-auto flex flex-wrap items-center gap-1.5">
                          {it.action && (
                            <span
                              className="inline-flex items-center rounded-full px-1.5 py-px text-[9.5px] font-semibold"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${s.color} 14%, var(--surface))`,
                                color: s.color,
                              }}
                            >
                              {it.action}
                            </span>
                          )}
                          {it.docType && (
                            <span className="inline-flex items-center rounded-full bg-[var(--nav-hover)]/60 px-2 py-0.5 text-[10px] font-medium text-[var(--nav-inactive)]">
                              {it.docType}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-center">
              <Link
                href="/docs"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--nav-hover)]/50"
              >
                See more
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* System Health                                                       */
/* ------------------------------------------------------------------ */

export interface SystemHealthService {
  id: string;
  label: string;
  status: 'online' | 'degraded' | 'offline';
  detail?: string;
}

const STATUS_STYLE: Record<SystemHealthService['status'], { color: string; label: string }> = {
  online: { color: '#10b981', label: 'Online' },
  degraded: { color: '#f59e0b', label: 'Degraded' },
  offline: { color: '#ef4444', label: 'Offline' },
};

export function SystemHealthCard({ services }: { services: SystemHealthService[] }) {
  const allOnline = services.every((s) => s.status === 'online');
  const accent = allOnline
    ? '#10b981'
    : services.some((s) => s.status === 'offline')
      ? '#ef4444'
      : '#f59e0b';

  return (
    <div className={cn(PANEL, 'h-full')}>
      <AccentRail color={accent} />
      <CornerGlow color={accent} />
      <PanelHeader
        eyebrow="Status"
        title="System Health"
        color={accent}
        Icon={Bot}
        right={
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            <span className="relative inline-flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full"
                style={{ backgroundColor: `${accent}99` }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: accent }}
              />
            </span>
            {allOnline ? 'All systems healthy' : 'Issues detected'}
          </span>
        }
      />
      <ul className="grid grid-cols-1 gap-1.5 px-5 pb-5 sm:grid-cols-2">
        {services.map((s) => {
          const st = STATUS_STYLE[s.status];
          return (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/55 px-3 py-2 transition-colors hover:bg-[var(--nav-hover)]/40"
            >
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                  {s.label}
                </p>
                {s.detail && (
                  <p className="truncate text-[10.5px] text-[var(--muted)]">{s.detail}</p>
                )}
              </div>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: `${st.color}1a`, color: st.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                {st.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trust indicators footer                                             */
/* ------------------------------------------------------------------ */

export function TrustIndicatorsFooter() {
  const items: { Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { Icon: ShieldCheck, label: 'ISO 27001 Ready' },
    { Icon: Activity, label: 'Audit Trail Enabled' },
    { Icon: Shield, label: 'Role-Based Access Active' },
    { Icon: Bell, label: 'Real-time Alerts' },
  ];
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 rounded-2xl border border-[var(--border)]/50 bg-[var(--surface)]/55 px-4 py-3">
      {items.map((it) => (
        <span
          key={it.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/55 bg-[var(--surface)]/75 px-2.5 py-1 text-[11px] font-medium text-[var(--nav-inactive)] backdrop-blur-sm transition-colors hover:border-[var(--brand-primary)]/30 hover:text-[var(--brand-primary)]"
        >
          <it.Icon className="h-3 w-3" />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared empty block                                                  */
/* ------------------------------------------------------------------ */

function EmptyBlock({
  Icon,
  primary,
  secondary,
  cta,
  color = 'var(--brand-primary)',
}: {
  Icon: React.ComponentType<{ className?: string }>;
  primary: string;
  secondary: string;
  cta?: { label: string; href: string };
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${color}14`, color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{primary}</p>
      <p className="max-w-[280px] text-[11.5px] leading-relaxed text-[var(--muted)]">
        {secondary}
      </p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
          style={{ backgroundColor: `${color}14`, color }}
        >
          {cta.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
