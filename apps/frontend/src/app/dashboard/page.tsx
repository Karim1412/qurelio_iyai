'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileUp,
  LineChart as LineChartIcon,
  Calendar,
  CalendarRange,
  Building2,
  ArrowRight,
  Users,
  List,
  ExternalLink,
  Sparkles,
  BotMessageSquare,
} from '@/components/icons';
import {
  ProductsIllustration,
  ComplianceIllustration,
  AuditsIllustration,
  NonConformitiesIllustration,
  ReportsIllustration,
  StandardsIllustration,
  CompanyManagementIllustration,
  CalendarIllustration,
} from '@/components/icons/sidebar-illustrations';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuthStore } from '@/lib/auth-store';
import {
  adminApi,
  documentApi,
  evaluationApi,
  auditApi,
  ncApi,
  companyApi,
  normalizeCompanyUsersResponse,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadDocumentDialog } from '@/components/dashboard/UploadDocumentDialog';
import { RunEvaluationDialog } from '@/components/dashboard/RunEvaluationDialog';
import { ScheduleAuditDialog } from '@/components/dashboard/ScheduleAuditDialog';
import { DocumentHoverPreview } from '@/components/dashboard/DocumentHoverPreview';
import { attachDocDragGlobal } from '@/components/dashboard/TrashFabGlobal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import {
  AICompliancePulse,
  ComplianceHealthScore,
  AIInsightsCard,
  PendingApprovalsCard,
  UpcomingAuditsCard,
  RecentActivityFeed,
  SystemHealthCard,
  TrustIndicatorsFooter,
  AIBadge,
  EmptyMetricState,
  type AIInsight,
  type ActivityItem,
  type UpcomingAudit,
  type SystemHealthService,
} from '@/components/dashboard/MissionControlWidgets';

const BR = '#4d92c4';
const BR_BG = 'rgba(77,146,196,0.12)';

/** Hero CTAs: `--brand-accent-cta` (slightly lighter than the wordmark `--brand-accent`). */
const heroGoldBtn =
  'gap-2 rounded-full border-0 bg-none bg-[var(--brand-accent-cta)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-dark)] shadow-none transition hover:brightness-105 dark:shadow-none';

/** Square-ish tile button for the hero quick-actions grid (icon on top, label below). */
const heroSquareGoldBtn =
  'flex aspect-[6/5] h-auto w-full flex-col items-center justify-center gap-1 rounded-xl border-0 bg-none bg-[var(--brand-accent-cta)] p-2 text-[11px] font-semibold leading-tight text-[var(--brand-dark)] shadow-none transition hover:brightness-105 hover:-translate-y-0.5 dark:shadow-none [&>a]:flex [&>a]:h-full [&>a]:w-full [&>a]:flex-col [&>a]:items-center [&>a]:justify-center [&>a]:gap-1 [&>svg]:h-4 [&>svg]:w-4 [&>a>svg]:h-4 [&>a>svg]:w-4';


type RangeKey = 'today' | '7d' | '30d' | 'year' | 'custom';

function getDateRange(
  key: RangeKey,
  custom?: { from: string; to: string }
): { start: number; end: number } {
  const endNow = Date.now();
  const d = new Date();
  if (key === 'custom' && custom?.from && custom?.to) {
    const s = new Date(custom.from + 'T00:00:00');
    const e = new Date(custom.to + 'T23:59:59.999');
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s.getTime() <= e.getTime()) {
      return { start: s.getTime(), end: e.getTime() };
    }
  }
  if (key === 'today') {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return { start: s.getTime(), end: endNow };
  }
  if (key === '7d') return { start: endNow - 7 * 86400000, end: endNow };
  if (key === '30d') return { start: endNow - 30 * 86400000, end: endNow };
  if (key === 'custom') {
    const y = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
    return { start: y.getTime(), end: endNow };
  }
  const y = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
  return { start: y.getTime(), end: endNow };
}

function entityTs(item: unknown): number {
  const o = item as { updatedAt?: string; createdAt?: string };
  return new Date(o.updatedAt || o.createdAt || 0).getTime();
}

function inRange(t: number, start: number, end: number) {
  return t >= start && t <= end;
}

function filterByRange<T>(items: T[], start: number, end: number, getT: (x: T) => number): T[] {
  return items.filter((x) => inRange(getT(x), start, end));
}

function apiMessage(err: unknown): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : (m || 'Could not load data');
}

type ListType =
  | 'products'
  | 'compliance'
  | 'audits'
  | 'ncs'
  | 'reports'
  | 'standards';

interface RawItem {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  severity?: string;
  isoStandard?: string;
  effectiveDate?: string;
  scheduledAt?: string;
  createdAt?: string;
  updatedAt?: string;
  uploadedBy?: { firstName?: string; lastName?: string; email?: string } | string;
  [k: string]: unknown;
}

interface TeamUser {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
  isActive?: boolean;
}

const TEAM_AVATAR_PALETTE = ['#4d92c4', '#118d57', '#b76e00', '#7c4dff', '#1565c0', '#b71d18'];

function getUserInitials(u: TeamUser): string {
  const fn = (u.firstName || '').trim();
  const ln = (u.lastName || '').trim();
  if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
  if (fn) return fn.slice(0, 2).toUpperCase();
  if (ln) return ln.slice(0, 2).toUpperCase();
  return (u.email || '?').slice(0, 2).toUpperCase();
}

function getAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return TEAM_AVATAR_PALETTE[Math.abs(h) % TEAM_AVATAR_PALETTE.length];
}

type SeriesPoint = { label: string; value: number };

/** Real per-month counts for a metric, from the raw entity list. */
function bucketSeries(
  items: unknown[],
  buckets: { start: number; end: number; label: string }[],
): SeriesPoint[] {
  return buckets.map((b) => ({
    label: b.label,
    value: items.filter((it) => {
      const t = entityTs(it);
      return t >= b.start && t <= b.end;
    }).length,
  }));
}

/**
 * KPI card chart. Renders the real monthly `series` as an interactive area
 * sparkline (hover shows the true value for that month). Falls back to a
 * deterministic decorative wave (no tooltip) when no series is available.
 */
function MiniSparkline({
  color,
  seed,
  series,
}: {
  color: string;
  seed: string;
  series?: SeriesPoint[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 72;
  const H = 28;
  const PX = 3;
  const PY = 4;

  const real = !!series && series.length >= 2;
  let values: number[];
  let labels: string[];
  if (real) {
    values = series!.map((s) => s.value);
    labels = series!.map((s) => s.label);
  } else {
    let hh = 0;
    for (let i = 0; i < seed.length; i++) hh = ((hh << 5) - hh + seed.charCodeAt(i)) | 0;
    const rand = () => {
      hh = (hh * 1664525 + 1013904223) | 0;
      return ((hh >>> 0) % 1000) / 1000;
    };
    values = Array.from({ length: 7 }, () => rand());
    labels = [];
  }

  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - PX * 2) / (n - 1);
  const pts = values.map((v, i) => ({
    x: PX + i * stepX,
    y: PY + (1 - (v - min) / span) * (H - PY * 2),
  }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div
      className="relative h-7 w-[72px] shrink-0"
      onMouseLeave={() => setHover(null)}
      onMouseMove={
        real
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const rx = ((e.clientX - r.left) / r.width) * W;
              const idx = Math.max(0, Math.min(n - 1, Math.round((rx - PX) / stepX)));
              setHover(idx);
            }
          : undefined
      }
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        aria-hidden
      >
        <polyline
          points={line}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {real && hover !== null && (
          <circle cx={pts[hover].x} cy={pts[hover].y} r="2.5" fill={color} />
        )}
      </svg>
      {real && hover !== null && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            left: `${(pts[hover].x / W) * 100}%`,
            color: 'var(--text-primary)',
          }}
        >
          <span className="text-[var(--muted)]">{labels[hover]}</span>{' '}
          <span style={{ color }} className="font-semibold">
            {values[hover]}
          </span>
        </div>
      )}
    </div>
  );
}

interface TrendPoint {
  label: string;
  documentsReady: number;
  auditsCompleted: number;
  ncsClosed: number;
}

function computeMonthlyBuckets(endTs: number, count: number) {
  const out: { start: number; end: number; label: string }[] = [];
  const ref = new Date(endTs);
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(ref.getFullYear(), ref.getMonth() - i, 1, 0, 0, 0, 0);
    const stop = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 0, 23, 59, 59, 999);
    out.push({
      start: start.getTime(),
      end: stop.getTime(),
      label: start.toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcon = React.ComponentType<any>;

interface StatCard {
  label: string;
  value: string;
  color: string;
  change: string;
  bg: string;
  trend?: 'up' | 'down' | 'flat';
  trendPct?: string;
  icon?: AnyIcon;
  href?: string;
  listType?: ListType;
  critical?: boolean;
  emptyHint?: { message: string; cta?: string; href?: string };
  aiBadge?: 'analyzed' | 'assisted' | 'recommendation';
  series?: SeriesPoint[];
}

const CURRENT_YEAR = new Date().getFullYear();

const RANGE_LABEL: Record<Exclude<RangeKey, 'custom'>, string> = {
  today: 'Today · live snapshot',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  year: `ISO Performance ${CURRENT_YEAR}`,
};

function periodLabel(rangeKey: RangeKey, customFrom: string, customTo: string): string {
  if (rangeKey === 'custom' && customFrom && customTo) {
    try {
      return `${format(new Date(customFrom + 'T12:00:00'), 'MMM d')} – ${format(new Date(customTo + 'T12:00:00'), 'MMM d, yyyy')}`;
    } catch {
      return 'Custom period';
    }
  }
  if (rangeKey === 'custom') return 'Custom period';
  return RANGE_LABEL[rangeKey];
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [rangeKey, setRangeKey] = useState<RangeKey>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [complianceRows, setComplianceRows] = useState<{ label: string; value: number }[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [runEvalOpen, setRunEvalOpen] = useState(false);
  const [scheduleAuditOpen, setScheduleAuditOpen] = useState(false);
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [trendSeries, setTrendSeries] = useState<TrendPoint[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [listType, setListType] = useState<ListType | null>(null);
  const [distActive, setDistActive] = useState<number>(-1);
  const [docsList, setDocsList] = useState<RawItem[]>([]);
  const [evalsList, setEvalsList] = useState<RawItem[]>([]);
  const [auditsList, setAuditsList] = useState<RawItem[]>([]);
  const [ncsList, setNcsList] = useState<RawItem[]>([]);

  const { start, end } = useMemo(
    () => getDateRange(rangeKey, rangeKey === 'custom' ? { from: customFrom, to: customTo } : undefined),
    [rangeKey, customFrom, customTo]
  );

  const onRangeChange = (v: string) => {
    const next = v as RangeKey;
    setRangeKey(next);
    if (next === 'custom' && !customFrom) {
      const endD = new Date();
      const startD = new Date(endD.getFullYear(), 0, 1);
      setCustomFrom(startD.toISOString().slice(0, 10));
      setCustomTo(endD.toISOString().slice(0, 10));
    }
  };

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (user.role === 'SUPER_ADMIN') {
        const { data: companies } = await adminApi.getCompanies();
        const listRaw = Array.isArray(companies) ? companies : [];
        const list = filterByRange(listRaw, start, end, (c) =>
          new Date((c as { createdAt?: string }).createdAt || 0).getTime()
        );
        const active = list.filter((c: { status: string }) => c.status === 'ACTIVE').length;
        setStats([
          {
            label: 'Organizations',
            value: String(list.length),
            color: BR,
            change: `${active} active`,
            bg: BR_BG,
            trend: 'up',
            trendPct: '+2.6%',
            icon: CompanyManagementIllustration,
            href: '/admin/companies',
          },
          {
            label: 'Pending approval',
            value: String(list.filter((c: { status: string }) => c.status === 'PENDING').length),
            color: '#b76e00',
            change: 'Companies',
            bg: 'rgba(183,110,0,0.1)',
            trend: 'flat',
            trendPct: '0%',
            icon: CalendarIllustration,
          },
          {
            label: 'Verified emails',
            value: String(list.filter((c: { isEmailVerified?: boolean }) => c.isEmailVerified).length),
            color: '#118d57',
            change: 'Of total',
            bg: 'rgba(17,141,87,0.1)',
            trend: 'up',
            trendPct: '+1.2%',
            icon: ComplianceIllustration,
          },
          {
            label: 'Suspended',
            value: String(list.filter((c: { status: string }) => c.status === 'SUSPENDED').length),
            color: '#b71d18',
            change: 'Accounts',
            bg: 'rgba(183,29,24,0.1)',
            trend: 'down',
            trendPct: '-0.4%',
            icon: NonConformitiesIllustration,
          },
        ]);

        const total = list.length || 1;
        setComplianceRows([
          { label: 'Active share', value: Math.round((active / total) * 100) },
          {
            label: 'Email verified',
            value: Math.round((list.filter((c: { isEmailVerified?: boolean }) => c.isEmailVerified).length / total) * 100),
          },
          {
            label: 'Pending setup',
            value: Math.round((list.filter((c: { status: string }) => c.status === 'PENDING').length / total) * 100),
          },
          {
            label: 'Suspended',
            value: Math.round((list.filter((c: { status: string }) => c.status === 'SUSPENDED').length / total) * 100),
          },
        ]);
        setTeam([]);
        setDocsList([]);
        setEvalsList([]);
        setAuditsList([]);
        setNcsList([]);
        return;
      }

      const [docsR, evalsR, auditsR, ncListR, ncKpisR, usersR] = await Promise.allSettled([
        documentApi.list(),
        evaluationApi.list(),
        auditApi.list(),
        ncApi.list(),
        ncApi.kpis(),
        user.role === 'DIRECTOR' ? companyApi.getUsers() : Promise.resolve({ data: [] }),
      ]);

      const docsRaw = docsR.status === 'fulfilled' ? (Array.isArray(docsR.value.data) ? docsR.value.data : []) : [];
      const evalsRaw = evalsR.status === 'fulfilled' ? (Array.isArray(evalsR.value.data) ? evalsR.value.data : []) : [];
      const auditsRaw = auditsR.status === 'fulfilled' ? (Array.isArray(auditsR.value.data) ? auditsR.value.data : []) : [];
      const ncsRaw = ncListR.status === 'fulfilled' ? (Array.isArray(ncListR.value.data) ? ncListR.value.data : []) : [];
      const kpis = ncKpisR.status === 'fulfilled' ? ncKpisR.value.data : null;
      const teamRaw =
        usersR.status === 'fulfilled'
          ? normalizeCompanyUsersResponse(usersR.value.data).users
          : [];

      const docs = filterByRange(docsRaw, start, end, entityTs);
      const evals = filterByRange(evalsRaw, start, end, entityTs);
      const audits = filterByRange(auditsRaw, start, end, entityTs);
      const ncs = filterByRange(ncsRaw, start, end, entityTs);
      const dedupeById = <T extends { id?: string }>(arr: T[]): T[] => {
        const seen = new Set<string>();
        const out: T[] = [];
        for (const item of arr) {
          const key = item?.id;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          out.push(item);
        }
        return out;
      };
      setTeam(teamRaw as TeamUser[]);
      setDocsList(dedupeById(docs as RawItem[]));
      setEvalsList(dedupeById(evals as RawItem[]));
      setAuditsList(dedupeById(audits as RawItem[]));
      setNcsList(dedupeById(ncs as RawItem[]));

      type StatusRow = { status?: string };
      const openAudits = (audits as StatusRow[]).filter(
        (a) => a.status === 'PLANNED' || a.status === 'IN_PROGRESS'
      ).length;
      const activeEvals = (evals as StatusRow[]).filter((e) => e.status === 'QUEUED' || e.status === 'PROCESSING').length;
      const openNc = (ncs as StatusRow[]).filter(
        (n) => n.status !== 'CLOSED' && n.status !== 'REJECTED'
      ).length;

      type DocRow = { type?: string };
      const productDocsRaw = (docsRaw as DocRow[]).filter((d) => d.type === 'PRODUCT_DOC');
      const standardDocsRaw = (docsRaw as DocRow[]).filter((d) => d.type === 'ISO_NORM');
      const productDocs = productDocsRaw.length;
      const standardDocs = standardDocsRaw.length;

      // Real monthly history (last 6 months) for each KPI card chart.
      const statBuckets = computeMonthlyBuckets(end, 6);

      setStats([
        {
          label: 'Products Management',
          value: String(productDocs),
          color: '#b76e00',
          bg: 'rgba(183,110,0,0.10)',
          change: 'Product files',
          trend: 'up',
          trendPct: '+1.8%',
          icon: ProductsIllustration,
          href: '/docs?view=product',
          listType: 'products',
          series: bucketSeries(productDocsRaw, statBuckets),
        },
        {
          label: 'AI Compliance Engine',
          value: String(evals.length),
          color: BR,
          bg: BR_BG,
          change: `${activeEvals} running`,
          trend: 'up',
          trendPct: '+3.0%',
          icon: ComplianceIllustration,
          href: '/evaluations',
          listType: 'compliance',
          aiBadge: 'analyzed',
          series: bucketSeries(evalsRaw, statBuckets),
        },
        {
          label: 'Audits',
          value: String(audits.length),
          color: '#7c4dff',
          bg: 'rgba(124,77,255,0.10)',
          change: `${openAudits} open`,
          trend: 'flat',
          trendPct: '+0.5%',
          icon: AuditsIllustration,
          href: '/audits',
          listType: 'audits',
          series: bucketSeries(auditsRaw, statBuckets),
          emptyHint: {
            message: 'No audits scheduled yet. Schedule your first ISO audit.',
            cta: 'Schedule audit',
            href: '/audits',
          },
        },
        {
          label: 'Non-conformities',
          value: String(openNc),
          color: '#b71d18',
          bg: 'rgba(183,29,24,0.10)',
          change: `${kpis?.overdueCAPAs ?? 0} overdue CAPA`,
          trend: 'down',
          trendPct: '-1.0%',
          icon: NonConformitiesIllustration,
          href: '/nc',
          listType: 'ncs',
          series: bucketSeries(ncsRaw, statBuckets),
          critical: true,
          emptyHint: {
            message: 'No active non-conformities detected. Compliance posture is clean.',
          },
        },
        {
          label: 'Reports',
          value: String(docs.length),
          color: '#118d57',
          bg: 'rgba(17,141,87,0.10)',
          change: 'In period',
          trend: 'up',
          trendPct: '+2.1%',
          icon: ReportsIllustration,
          href: '/docs',
          listType: 'reports',
          series: bucketSeries(docsRaw, statBuckets),
          emptyHint: {
            message: 'Compliance reports will appear here after evaluations.',
            cta: 'Run evaluation',
            href: '/evaluations',
          },
        },
        {
          label: 'Standards & Regulations',
          value: String(standardDocs),
          color: '#1565c0',
          bg: 'rgba(21,101,192,0.10)',
          change: 'Active norms',
          trend: 'up',
          trendPct: '+0.8%',
          icon: StandardsIllustration,
          href: '/docs?view=standard',
          listType: 'standards',
          series: bucketSeries(standardDocsRaw, statBuckets),
        },
      ]);

      const buckets = computeMonthlyBuckets(end, 6);
      type DocStatus = { status?: string };
      type Timed = { createdAt?: string; updatedAt?: string };
      const series: TrendPoint[] = buckets.map(({ start: bs, end: be, label }) => {
        const docInB = (docsRaw as Array<DocStatus & Timed>).filter((d) => {
          const t = entityTs(d);
          return t >= bs && t <= be;
        });
        const audInB = (auditsRaw as Array<DocStatus & Timed>).filter((a) => {
          const t = entityTs(a);
          return t >= bs && t <= be;
        });
        const ncInB = (ncsRaw as Array<DocStatus & Timed>).filter((n) => {
          const t = entityTs(n);
          return t >= bs && t <= be;
        });
        const docReady = docInB.length
          ? Math.round((docInB.filter((d) => d.status === 'READY').length / docInB.length) * 100)
          : 0;
        const audDone = audInB.length
          ? Math.round((audInB.filter((a) => a.status === 'COMPLETED').length / audInB.length) * 100)
          : 0;
        const ncClose = ncInB.length
          ? Math.round((ncInB.filter((n) => n.status === 'CLOSED').length / ncInB.length) * 100)
          : 0;
        return {
          label,
          documentsReady: docReady,
          auditsCompleted: audDone,
          ncsClosed: ncClose,
        };
      });
      setTrendSeries(series);

      if (ncs.length) {
        const t = ncs.length;
        const by: Record<string, number> = {};
        for (const n of ncs) {
          const st = (n as { status: string }).status;
          by[st] = (by[st] || 0) + 1;
        }
        setComplianceRows(Object.entries(by).map(([label, c]) => ({ label, value: Math.round((c / t) * 100) })));
      } else if (kpis?.byStatus?.length) {
        const t = kpis.total || 1;
        setComplianceRows(
          kpis.byStatus.map((row: { nc_status?: string; status?: string; count: string }) => ({
            label: String(row.nc_status || row.status || 'Status'),
            value: Math.min(100, Math.round((Number(row.count) / t) * 100)),
          }))
        );
      } else {
        const docRows = docs as StatusRow[];
        const auditRows = audits as StatusRow[];
        const ncRows = ncs as StatusRow[];
        setComplianceRows([
          { label: 'Documents ready', value: docRows.filter((d) => d.status === 'READY').length ? 85 : 0 },
          {
            label: 'Audits completed',
            value: auditRows.length
              ? Math.round((auditRows.filter((a) => a.status === 'COMPLETED').length / auditRows.length) * 100)
              : 0,
          },
          {
            label: 'NCs closed',
            value: ncRows.length ? Math.round((ncRows.filter((n) => n.status === 'CLOSED').length / ncRows.length) * 100) : 0,
          },
        ]);
      }

      const failed = [docsR, evalsR, auditsR, ncListR].filter((r) => r.status === 'rejected');
      const hardFailed = failed.filter((r) => {
        const status = (r as PromiseRejectedResult).reason?.response?.status;
        return status !== 503 && status !== undefined;
      });
      if (hardFailed.length > 0) {
        toast.error(apiMessage((hardFailed[0] as PromiseRejectedResult).reason));
      }
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const periodHint = periodLabel(rangeKey, customFrom, customTo);

  /* ── Mission Control: derive widget data from the same lists already loaded above ── */
  const missionControl = useMemo(() => {
    const openNcs = ncsList.filter((n) => n.status !== 'CLOSED' && n.status !== 'REJECTED');
    const criticalNcs = ncsList.filter(
      (n) => String(n.severity || '').toUpperCase() === 'CRITICAL',
    ).length;
    const overdueCapas = ncsList.filter(
      (n) => String(n.status || '').toUpperCase() === 'OVERDUE',
    ).length;
    const closedNcs = ncsList.filter((n) => n.status === 'CLOSED').length;

    const readyDocs = docsList.filter((d) => d.status === 'READY').length;
    const docReadiness = docsList.length ? (readyDocs / docsList.length) * 100 : 100;
    const completedAudits = auditsList.filter((a) => a.status === 'COMPLETED').length;
    const auditReadiness = auditsList.length
      ? Math.round((completedAudits / auditsList.length) * 100)
      : 80;
    const ncClosure = ncsList.length ? (closedNcs / ncsList.length) * 100 : 100;
    const score = Math.round(docReadiness * 0.4 + auditReadiness * 0.3 + ncClosure * 0.3);

    const health = {
      score,
      capaCount: openNcs.length,
      criticalRisks: criticalNcs,
      auditReadiness,
    };

    const insights: AIInsight[] = [];
    const standards = docsList.filter((d) => d.type === 'ISO_NORM');
    if (standards.length === 0 && docsList.length > 0) {
      insights.push({
        id: 'std-missing',
        kind: 'gap',
        severity: 'warning',
        title: 'No ISO standard linked yet',
        detail: 'Upload an ISO norm to start automated gap detection.',
      });
    }
    if (criticalNcs > 0) {
      insights.push({
        id: 'crit-nc',
        kind: 'gap',
        severity: 'critical',
        title: `${criticalNcs} critical non-conformity${criticalNcs > 1 ? 'ies' : ''} open`,
        detail: 'Immediate CAPA action recommended to protect audit readiness.',
      });
    }
    if (overdueCapas > 0) {
      insights.push({
        id: 'overdue-capa',
        kind: 'expiry',
        severity: 'warning',
        title: `${overdueCapas} CAPA${overdueCapas > 1 ? 's' : ''} overdue`,
        detail: 'Update status or extend the deadline to avoid audit findings.',
      });
    }
    const draftDocs = docsList.filter(
      (d) => String(d.status || '').toUpperCase() === 'DRAFT',
    ).length;
    if (draftDocs > 0) {
      insights.push({
        id: 'draft-docs',
        kind: 'evidence',
        severity: 'info',
        title: `${draftDocs} document${draftDocs > 1 ? 's' : ''} awaiting evidence`,
        detail: 'Attach supporting files so AI can complete the evaluation.',
      });
    }

    const pendingDocs = docsList.filter((d) =>
      ['PENDING', 'DRAFT', 'REVIEW'].includes(String(d.status || '').toUpperCase()),
    ).length;
    const pendingCapas = ncsList.filter((n) =>
      ['PENDING', 'OPEN', 'IN_PROGRESS'].includes(String(n.status || '').toUpperCase()),
    ).length;
    const pendingAuditValidations = auditsList.filter((a) =>
      ['PLANNED', 'IN_PROGRESS', 'PENDING_VALIDATION'].includes(
        String(a.status || '').toUpperCase(),
      ),
    ).length;
    const approvals = {
      documents: pendingDocs,
      capas: pendingCapas,
      auditValidations: pendingAuditValidations,
    };

    const upcoming: UpcomingAudit[] = auditsList
      .filter((a) => {
        const ts = a.scheduledAt ? new Date(a.scheduledAt).getTime() : NaN;
        return !Number.isNaN(ts) && ts >= Date.now() - 86400000;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime(),
      )
      .slice(0, 4)
      .map((a, i) => ({
        id: String(a.id ?? i),
        name: String(a.title ?? a.name ?? `Audit ${i + 1}`),
        date: a.scheduledAt
          ? new Date(a.scheduledAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
          : '-',
        status: String(a.status ?? 'PLANNED').replace(/_/g, ' '),
      }));

    const acts: ActivityItem[] = [];
    const relTime = (iso?: string) => {
      if (!iso) return '-';
      const t = new Date(iso).getTime();
      const diff = Date.now() - t;
      if (!Number.isFinite(diff) || diff < 0) return 'soon';
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 30) return `${d}d ago`;
      return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
    };
    const isUuid = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
    // Resolve a user id → display name using the already-loaded team list.
    const teamById = new Map<string, string>();
    for (const m of team) {
      if (!m.id) continue;
      const full = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
      const name = full || m.email;
      if (name) teamById.set(String(m.id), name);
    }
    const personName = (
      by: { firstName?: string; lastName?: string; email?: string } | string | undefined,
    ): string | undefined => {
      if (!by) return undefined;
      if (typeof by === 'string') {
        const v = by.trim();
        if (!v) return undefined;
        if (isUuid(v)) return teamById.get(v); // map id → name, else undefined
        return v;
      }
      const full = [by.firstName, by.lastName].filter(Boolean).join(' ').trim();
      return full || by.email || undefined;
    };

    // Map a document's status + timestamps to the operation that just happened on it.
    const docOperation = (
      d: RawItem,
    ): { action: string; detail: string } => {
      const st = String(d.status ?? '').toUpperCase();
      const wasUpdated =
        !!d.updatedAt &&
        !!d.createdAt &&
        new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime() > 60_000;
      if (['PROCESSING', 'EXTRACTING', 'ANALYZING', 'PARSING'].includes(st))
        return { action: 'Being analyzed', detail: 'AI extraction in progress' };
      if (['QUEUED', 'PENDING'].includes(st))
        return { action: 'Queued', detail: 'Waiting for analysis' };
      if (['FAILED', 'ERROR'].includes(st))
        return { action: 'Processing failed', detail: 'Needs a re-upload' };
      if (st === 'ARCHIVED') return { action: 'Archived', detail: 'Moved to archive' };
      if (['READY', 'EXTRACTED', 'COMPLETED', 'ACTIVE'].includes(st))
        return {
          action: wasUpdated ? 'Updated & ready' : 'Processed & ready',
          detail: 'Extraction complete',
        };
      return wasUpdated
        ? { action: 'Updated', detail: 'Document revised' }
        : { action: 'Uploaded', detail: 'New document added' };
    };

    const exactDate = (iso?: string): string | undefined => {
      if (!iso) return undefined;
      const t = new Date(iso);
      if (!Number.isFinite(t.getTime())) return undefined;
      try {
        return format(t, 'd MMM yyyy, h:mm a');
      } catch {
        return undefined;
      }
    };
    for (const d of docsList.slice(0, 8)) {
      const op = docOperation(d);
      const rawType = d.type ? String(d.type).replace(/_/g, ' ').toLowerCase() : 'document';
      const docTypeLabel = rawType.charAt(0).toUpperCase() + rawType.slice(1);
      const who = personName(d.uploadedBy);
      // The document's real content: the actual extracted text as it is,
      // then its description, then a meaningful fallback line.
      const str = (v: unknown) =>
        typeof v === 'string' && v.trim()
          ? v
              .replace(/[ \t]+/g, ' ') // collapse spaces/tabs only
              .replace(/\n{3,}/g, '\n\n') // cap blank-line runs
              .trim()
          : '';
      const desc =
        str(d.extractedText) ||
        str(d.description) ||
        str(d.summary) ||
        `${op.detail}, ${docTypeLabel} document.`;
      const stamp = d.updatedAt || d.createdAt;
      // Optional profile photo if the API provides one on the uploader object.
      const upl = d.uploadedBy as { avatarUrl?: string; photoUrl?: string; avatar?: string } | string | undefined;
      const avatarUrl =
        upl && typeof upl === 'object'
          ? upl.avatarUrl || upl.photoUrl || upl.avatar || undefined
          : undefined;
      acts.push({
        id: `doc-${d.id}`,
        kind: 'upload',
        action: op.action,
        title: String(d.name ?? d.title ?? 'Untitled document'),
        subtitle: `${op.detail} · ${rawType}${who ? ` · by ${who}` : ''}`,
        timeLabel: relTime(stamp),
        user: who || 'System',
        avatarUrl,
        dateLabel: exactDate(stamp),
        description: desc,
        docType: docTypeLabel,
        docId: String(d.id),
        href: '/docs',
      });
    }
    for (const e of evalsList.slice(0, 6)) {
      acts.push({
        id: `eval-${e.id}`,
        kind: 'evaluation',
        action: 'Evaluated',
        title: String(e.name ?? e.title ?? 'Evaluation run'),
        subtitle: e.isoStandard
          ? `Compliance check · ${String(e.isoStandard)}`
          : 'Compliance evaluation',
        timeLabel: relTime(e.createdAt),
      });
    }
    for (const a of auditsList.slice(0, 6)) {
      acts.push({
        id: `aud-${a.id}`,
        kind: 'audit',
        action: 'Audit scheduled',
        title: String(a.title ?? a.name ?? 'Audit scheduled'),
        subtitle: a.scheduledAt
          ? `Planned for ${new Date(a.scheduledAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
          : 'Audit planning',
        timeLabel: relTime(a.createdAt),
      });
    }
    for (const n of ncsList.filter(
      (x) => String(x.status || '').toUpperCase() === 'OVERDUE',
    )) {
      acts.push({
        id: `nc-${n.id}`,
        kind: 'capa',
        action: 'CAPA overdue',
        title: String(n.title ?? n.description ?? 'CAPA overdue'),
        subtitle: 'Corrective action required',
        timeLabel: relTime(n.updatedAt || n.createdAt),
      });
    }
    acts.sort((a, b) => {
      const order = ['just now', 'soon'];
      const oa = order.indexOf(a.timeLabel);
      const ob = order.indexOf(b.timeLabel);
      if (oa !== -1 || ob !== -1) return oa - ob;
      return 0;
    });

    const services: SystemHealthService[] = [
      { id: 'ai', label: 'AI Engine', status: 'online', detail: 'Inference latency healthy' },
      { id: 'ocr', label: 'OCR Service', status: 'online', detail: 'Document parsing active' },
      {
        id: 'notif',
        label: 'Notifications',
        status: 'online',
        detail: 'Real-time stream connected',
      },
      { id: 'audit', label: 'Audit Trail', status: 'online', detail: 'Tamper-evident logging' },
    ];

    return { health, insights, approvals, upcoming, activity: acts, services };
  }, [docsList, evalsList, auditsList, ncsList, team]);

  const listConfig = useMemo(() => {
    if (!listType) return null;
    const fmtDate = (d?: string) =>
      d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '-';
    const statusBadge = (s?: string): { label: string; color: string } | undefined => {
      if (!s) return undefined;
      const upper = s.toUpperCase();
      const color = ['CLOSED', 'COMPLETED', 'READY', 'ACTIVE', 'DONE', 'PASSED', 'VERIFIED'].includes(
        upper,
      )
        ? '#118d57'
        : ['PENDING', 'PLANNED', 'QUEUED', 'PROCESSING', 'IN_PROGRESS', 'DRAFT'].includes(upper)
          ? '#b76e00'
          : ['REJECTED', 'FAILED', 'OVERDUE', 'ARCHIVED'].includes(upper)
            ? '#b71d18'
            : '#4d92c4';
      return { label: upper.replace(/_/g, ' '), color };
    };

    type Row = {
      id: string;
      primary: string;
      secondary?: string;
      badge?: { label: string; color: string };
      date?: string;
      href?: string;
    };
    const rowKey = (item: RawItem, idx: number) => String(item.id ?? idx);

    switch (listType) {
      case 'products': {
        const products = docsList.filter((d) => d.type === 'PRODUCT_DOC');
        return {
          title: 'Products Management',
          icon: ProductsIllustration,
          color: '#b76e00',
          bg: 'rgba(183,110,0,0.10)',
          description: 'All product documents in this period',
          empty: 'No products in this period.',
          rows: products.map<Row>((p, i) => ({
            id: rowKey(p, i),
            primary: String(p.name ?? p.title ?? '-'),
            secondary: typeof p.description === 'string' ? p.description : undefined,
            badge: statusBadge(p.status),
            date: fmtDate(p.createdAt),
            href: p.id ? `/docs?view=product` : undefined,
          })),
        };
      }
      case 'compliance': {
        return {
          title: 'Compliance Engine',
          icon: ComplianceIllustration,
          color: BR,
          bg: BR_BG,
          description: 'All evaluations in this period',
          empty: 'No evaluations in this period.',
          rows: evalsList.map<Row>((e, i) => ({
            id: rowKey(e, i),
            primary: String(
              e.name ?? e.title ?? (e.id ? `Evaluation ${String(e.id).slice(0, 8)}` : 'Evaluation'),
            ),
            secondary: e.isoStandard ? String(e.isoStandard) : undefined,
            badge: statusBadge(e.status),
            date: fmtDate(e.createdAt),
            href: e.id ? `/evaluations/${e.id}` : '/evaluations',
          })),
        };
      }
      case 'audits': {
        return {
          title: 'Audits',
          icon: AuditsIllustration,
          color: '#7c4dff',
          bg: 'rgba(124,77,255,0.10)',
          description: 'All audits in this period',
          empty: 'No audits in this period.',
          rows: auditsList.map<Row>((a, i) => ({
            id: rowKey(a, i),
            primary: String(
              a.title ?? a.name ?? (a.id ? `Audit ${String(a.id).slice(0, 8)}` : 'Audit'),
            ),
            secondary: typeof a.scope === 'string' ? a.scope : undefined,
            badge: statusBadge(a.status),
            date: fmtDate(a.scheduledAt ?? a.createdAt),
            href: '/audits',
          })),
        };
      }
      case 'ncs': {
        return {
          title: 'Non-conformities',
          icon: NonConformitiesIllustration,
          color: '#b71d18',
          bg: 'rgba(183,29,24,0.10)',
          description: 'All non-conformities in this period',
          empty: 'No non-conformities in this period.',
          rows: ncsList.map<Row>((n, i) => ({
            id: rowKey(n, i),
            primary: String(
              n.title ??
                n.description ??
                (n.id ? `NC ${String(n.id).slice(0, 8)}` : 'Non-conformity'),
            ),
            secondary: n.severity ? `Severity: ${String(n.severity)}` : undefined,
            badge: statusBadge(n.status),
            date: fmtDate(n.createdAt),
            href: '/nc',
          })),
        };
      }
      case 'reports': {
        return {
          title: 'Reports',
          icon: ReportsIllustration,
          color: '#118d57',
          bg: 'rgba(17,141,87,0.10)',
          description: 'All documents in the file library',
          empty: 'No documents in this period.',
          rows: docsList.map<Row>((d, i) => ({
            id: rowKey(d, i),
            primary: String(d.name ?? d.title ?? '-'),
            secondary: d.type ? String(d.type).replace(/_/g, ' ') : undefined,
            badge: statusBadge(d.status),
            date: fmtDate(d.createdAt),
            href: '/docs',
          })),
        };
      }
      case 'standards': {
        const stds = docsList.filter((d) => d.type === 'ISO_NORM');
        return {
          title: 'Standards & Regulations',
          icon: StandardsIllustration,
          color: '#1565c0',
          bg: 'rgba(21,101,192,0.10)',
          description: 'All ISO standards & regulations',
          empty: 'No standards in this period.',
          rows: stds.map<Row>((s, i) => ({
            id: rowKey(s, i),
            primary: String(s.name ?? '-'),
            secondary: s.isoStandard ? String(s.isoStandard) : undefined,
            badge: statusBadge(s.status),
            date: fmtDate(s.effectiveDate ?? s.createdAt),
            href: '/docs?view=standard',
          })),
        };
      }
    }
  }, [listType, docsList, evalsList, auditsList, ncsList]);

  return (
    <DashboardLayout showRouteHeader={false}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mb-5"
      >
        <div
          className="relative min-h-[220px] overflow-hidden rounded-[28px] border border-white/[0.08] px-6 py-7 text-white sm:px-10 sm:py-8"
          style={{
            background:
              'linear-gradient(135deg, #0a1c30 0%, #103048 42%, #0c2842 70%, #050e1a 100%)',
          }}
        >
          {/* ─── Atmospheric layers ─── */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 88% 36%, rgba(255,193,7,0.28) 0%, transparent 42%), radial-gradient(circle at 14% 82%, rgba(77,146,196,0.32) 0%, transparent 40%)',
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[var(--brand-primary)]/22 blur-3xl"
            animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0.9, 0.7] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-[var(--brand-accent)]/14 blur-3xl"
            animate={{ scale: [1, 1.06, 1], opacity: [0.55, 0.8, 0.55] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 opacity-[0.05]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              // Transparent in the centre so the grid never strikes through
              // the centred logo: lines only fade in toward the edges.
              maskImage:
                'radial-gradient(ellipse 70% 65% at 50% 50%, transparent 0%, transparent 42%, black 85%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 70% 65% at 50% 50%, transparent 0%, transparent 42%, black 85%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06)_0%,transparent_55%,rgba(77,146,196,0.07)_100%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)]/55 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)]/45 to-transparent"
          />

          {/* ─── Centered brand logo: oversized so it bleeds past the banner top + bottom ─── */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 select-none"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.img
              src="/brand/querlio-mini.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="h-auto w-[560px] max-w-none opacity-[0.12] sm:w-[780px] lg:w-[980px]"
              animate={{ y: [-4, 4, -4] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* ─── 2-column content (text · buttons) ─── */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.18 } },
            }}
            className="relative z-[2] grid grid-cols-1 items-center gap-6 sm:grid-cols-[1.1fr_auto]"
          >
            {/* Left: headline + subtitle */}
            <div className="min-w-0">
              <motion.h2
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className="text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]"
                style={{ letterSpacing: '-0.018em' }}
              >
                Welcome back
                {user?.firstName && (
                  <>
                    ,{' '}
                    <span
                      className="bg-clip-text text-transparent"
                      style={{
                        backgroundImage:
                          'linear-gradient(135deg, #ffffff 0%, var(--brand-accent) 100%)',
                      }}
                    >
                      {user.firstName}
                    </span>
                  </>
                )}
              </motion.h2>

              <motion.p
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mt-1.5 max-w-md text-[13px] leading-relaxed text-white/75 sm:text-[13.5px]"
              >
                {user?.role === 'SUPER_ADMIN'
                  ? 'Monitor organizations and onboarding from one place.'
                  : 'Pick a quick action below or scroll for metrics and organization mix.'}
              </motion.p>
            </div>

            {/* Right: quick action buttons (2×2 grid) */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto grid w-full max-w-[240px] grid-cols-2 gap-3 sm:gap-3.5"
            >
              {user?.role === 'SUPER_ADMIN' ? (
                <>
                  <Button className={heroSquareGoldBtn} asChild>
                    <Link href="/admin/companies">
                      <Building2 />
                      <span className="text-center">Company accounts</span>
                    </Link>
                  </Button>
                  <Button className={heroSquareGoldBtn} asChild>
                    <Link href="/analytics">
                      <LineChartIcon />
                      <span className="text-center">Analytics</span>
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    className={heroSquareGoldBtn}
                    onClick={() => setUploadOpen(true)}
                  >
                    <FileUp />
                    <span className="text-center">Upload document</span>
                  </Button>
                  <Button
                    type="button"
                    className={heroSquareGoldBtn}
                    onClick={() => setRunEvalOpen(true)}
                  >
                    <LineChartIcon />
                    <span className="text-center">Run evaluation</span>
                  </Button>
                  <Button
                    type="button"
                    className={heroSquareGoldBtn}
                    onClick={() => setScheduleAuditOpen(true)}
                  >
                    <Calendar />
                    <span className="text-center">Schedule audit</span>
                  </Button>
                  <Button className={heroSquareGoldBtn} asChild>
                    <Link href="/analytics">
                      <LineChartIcon />
                      <span className="text-center">Analytics</span>
                    </Link>
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>

          {/* ─── AI Compliance Pulse (replaces the decorative Q logo) ─── */}
          {user?.role !== 'SUPER_ADMIN' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-[2] mt-6 flex justify-start"
            >
              <AICompliancePulse
                data={{
                  standardsMonitored: docsList.filter((d) => d.type === 'ISO_NORM').length,
                  documentsAnalyzed: docsList.length,
                  gapsDetected: ncsList.filter(
                    (n) => n.status !== 'CLOSED' && n.status !== 'REJECTED',
                  ).length,
                  lastScanLabel: 'Live · just now',
                }}
              />
            </motion.div>
          )}
        </div>
      </motion.div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-[var(--muted)]">
          Metrics for <span className="font-semibold text-[var(--text-primary)]">{periodHint}</span>
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[320px] sm:flex-row sm:items-center sm:justify-end">
          <div className="flex w-full items-center gap-2 sm:max-w-[280px] sm:ml-auto">
            <CalendarRange className="hidden h-4 w-4 shrink-0 text-[var(--brand-accent)] sm:block" aria-hidden />
            <Select value={rangeKey} onValueChange={onRangeChange}>
              <SelectTrigger className="h-9 w-full flex-1 text-xs">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="custom">Custom period…</SelectItem>
            </SelectContent>
            </Select>
          </div>
          {rangeKey === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
                />
              </label>
              <span className="text-[var(--muted)]">→</span>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
        </div>
      ) : (
        <>
          <div
            className={cn(
              'mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2',
              stats.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
            )}
          >
            {stats.map((stat, i) => {
              const TrendIcon = stat.trend === 'up' ? TrendingUp : stat.trend === 'down' ? TrendingDown : Minus;
              const trendColor =
                stat.trend === 'up'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : stat.trend === 'down'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-[var(--muted)]';
              const Icon = stat.icon;
              const href = stat.href;

              const cardInner = (
                <Card
                  className={cn(
                    'group relative h-full overflow-hidden rounded-2xl border px-4 py-3.5',
                    'transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    href && 'cursor-pointer hover:-translate-y-1',
                  )}
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${stat.color} 18%, var(--surface)) 0%, color-mix(in srgb, ${stat.color} 6%, var(--surface)) 100%)`,
                    borderColor: `color-mix(in srgb, ${stat.color} 22%, transparent)`,
                  }}
                >
                  {/* Halftone dot pattern: clustered toward the lower-right, like the reference */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage: `radial-gradient(${stat.color} 1px, transparent 1.6px)`,
                      backgroundSize: '12px 12px',
                      opacity: 0.16,
                      maskImage:
                        'radial-gradient(120% 90% at 88% 65%, #000 0%, transparent 62%)',
                      WebkitMaskImage:
                        'radial-gradient(120% 90% at 88% 65%, #000 0%, transparent 62%)',
                    }}
                  />
                  <CardContent className="relative flex flex-col gap-3 p-0">
                    <div className="flex items-start justify-between gap-2">
                      {/* Single-color illustration tile: color inherits via currentColor */}
                      <div
                        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${stat.color} 20%, var(--surface))`,
                          color: stat.color,
                        }}
                      >
                        {Icon && <Icon size={24} />}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {stat.aiBadge && <AIBadge variant={stat.aiBadge} />}
                        {stat.trend && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 text-[11px] font-semibold',
                              trendColor,
                            )}
                          >
                            <TrendIcon className="h-3 w-3 shrink-0" />
                            {stat.trendPct}
                          </span>
                        )}
                        {(!stat.emptyHint || stat.value !== '0') && (
                          <MiniSparkline
                            color={stat.color}
                            seed={stat.label}
                            series={stat.series}
                          />
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[11px] font-semibold tracking-tight"
                        style={{ color: `color-mix(in srgb, ${stat.color} 78%, var(--text-primary))` }}
                      >
                        {stat.label}
                      </p>
                      <p
                        className={cn(
                          'mt-1 font-bold leading-none tracking-tight',
                          stat.critical ? 'text-[26px]' : 'text-[22px]',
                        )}
                        style={{ color: stat.color }}
                      >
                        {stat.value}
                      </p>
                      {stat.value === '0' && stat.emptyHint ? (
                        <EmptyMetricState
                          message={stat.emptyHint.message}
                          cta={stat.emptyHint.cta}
                          href={stat.emptyHint.href}
                          color={stat.color}
                        />
                      ) : (
                        <p className="mt-1.5 text-[11px] text-[var(--muted)]">{stat.change}</p>
                      )}
                    </div>
                  </CardContent>
                  {stat.label === 'Non-conformities' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTrendsOpen(true);
                      }}
                      className="absolute bottom-3 left-3 z-10 inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)] transition hover:border-transparent"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = stat.bg;
                        e.currentTarget.style.color = stat.color;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '';
                        e.currentTarget.style.color = '';
                      }}
                      title="View compliance trends"
                    >
                      <LineChartIcon className="h-3 w-3" />
                      Trends
                    </button>
                  )}
                  {stat.listType && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setListType(stat.listType ?? null);
                      }}
                      className="absolute bottom-3 right-3 z-10 inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--muted)] transition hover:border-transparent"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = stat.bg;
                        e.currentTarget.style.color = stat.color;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '';
                        e.currentTarget.style.color = '';
                      }}
                      title={`View all ${stat.label.toLowerCase()}`}
                    >
                      <List className="h-3 w-3" />
                      View all
                    </button>
                  )}
                </Card>
              );

              return (
                <motion.div
                  key={stat.label}
                  className="h-full"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: i * 0.06,
                    duration: 0.65,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {href ? (
                    <Link
                      href={href}
                      aria-label={`Open ${stat.label}`}
                      className="block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]"
                    >
                      {cardInner}
                    </Link>
                  ) : (
                    cardInner
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* ─── Mission Control · Operational widgets row ─── */}
          {user?.role !== 'SUPER_ADMIN' && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1"
              >
                <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[17px]">
                  Operational intelligence
                </h2>
                <span className="text-[11px] font-medium text-[var(--muted)]">
                  Compliance Mission Control
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3"
              >
                <div className="lg:col-span-2">
                  <ComplianceHealthScore data={missionControl.health} />
                </div>
                <AIInsightsCard insights={missionControl.insights} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3"
              >
                <PendingApprovalsCard data={missionControl.approvals} />
                <UpcomingAuditsCard audits={missionControl.upcoming} />
                <SystemHealthCard services={missionControl.services} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mb-5"
              >
                <RecentActivityFeed items={missionControl.activity} />
              </motion.div>
            </>
          )}

          {/* ─── System overview : section header + Activity area + Distribution donut ─── */}
          {user?.role !== 'SUPER_ADMIN' && (trendSeries.length > 0 || stats.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mb-4 flex flex-wrap items-end justify-between gap-3"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
                  System overview
                </p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[22px]">
                  Analytics at a glance
                </h2>
              </div>
              
            </motion.div>
          )}

          {user?.role !== 'SUPER_ADMIN' && (trendSeries.length > 0 || stats.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3"
            >
              <div
                className="group relative overflow-hidden rounded-3xl border border-[var(--border)]/50 bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)] transition-shadow duration-500 hover:shadow-[0_22px_50px_-26px_rgba(15,23,42,0.22)] lg:col-span-2"
              >
                {/* Atmospheric layers */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-24 -top-24 h-52 w-52 rounded-full opacity-25"
                  style={{
                    background:
                      'radial-gradient(closest-side, var(--brand-primary), transparent 70%)',
                    filter: 'blur(18px)',
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -left-28 bottom-0 h-48 w-48 rounded-full opacity-15"
                  style={{
                    background:
                      'radial-gradient(closest-side, var(--brand-accent), transparent 70%)',
                    filter: 'blur(22px)',
                  }}
                />
                {/* Top accent rail */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/35 to-transparent"
                />
                {/* Faint dot grid */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.025]"
                  style={{
                    backgroundImage:
                      'radial-gradient(currentColor 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                    color: 'var(--text-primary)',
                    maskImage:
                      'radial-gradient(ellipse 70% 50% at 50% 60%, black 30%, transparent 80%)',
                    WebkitMaskImage:
                      'radial-gradient(ellipse 70% 50% at 50% 60%, black 30%, transparent 80%)',
                  }}
                />

                <div className="relative mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                      System activity
                    </p>
                    <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                      Compliance progress
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/80 px-2.5 py-1 text-[11px] font-medium text-[var(--brand-primary)] backdrop-blur-sm">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)]/55" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
                    </span>
                    Last 6 months
                  </span>
                </div>

                {/* Mini summary tiles */}
                {(() => {
                  const series = [
                    { key: 'documentsReady' as const, label: 'Docs ready', color: 'var(--brand-primary)' },
                    { key: 'auditsCompleted' as const, label: 'Audits', color: '#7C4DFF' },
                    { key: 'ncsClosed' as const, label: 'NCs closed', color: '#118D57' },
                  ];
                  return (
                    <div className="relative mb-4 grid grid-cols-3 gap-2.5">
                      {series.map((s, idx) => {
                        const last = trendSeries.length
                          ? (trendSeries[trendSeries.length - 1]?.[s.key] ?? 0)
                          : 0;
                        const prev = trendSeries.length > 1
                          ? (trendSeries[trendSeries.length - 2]?.[s.key] ?? 0)
                          : last;
                        const delta = last - prev;
                        const deltaSign = delta > 0 ? '+' : delta < 0 ? '−' : '';
                        const deltaCls = delta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : delta < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-[var(--muted)]';
                        return (
                          <motion.div
                            key={s.key}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: 0.42 + idx * 0.07,
                              duration: 0.55,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="relative overflow-hidden rounded-2xl border border-[var(--border)]/55 bg-[var(--surface)]/70 px-3 py-2.5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-12px_rgba(15,23,42,0.18)]"
                          >
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-2 top-0 h-px"
                              style={{
                                background: `linear-gradient(90deg, transparent 0%, ${s.color} 50%, transparent 100%)`,
                                opacity: 0.55,
                              }}
                            />
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: s.color }}
                              />
                              <span className="text-[10.5px] font-medium text-[var(--muted)]">
                                {s.label}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-baseline gap-1.5">
                              <span className="text-[20px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
                                {last}
                                <span className="text-[12px] font-medium text-[var(--muted)]">%</span>
                              </span>
                              <span className={cn('text-[10.5px] font-semibold', deltaCls)}>
                                {deltaSign}{Math.abs(delta)}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Main area chart */}
                <div className="relative h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendSeries} margin={{ top: 6, right: 14, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashDocs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.38} />
                          <stop offset="60%" stopColor="var(--brand-primary)" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dashAud" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7C4DFF" stopOpacity={0.34} />
                          <stop offset="60%" stopColor="#7C4DFF" stopOpacity={0.06} />
                          <stop offset="100%" stopColor="#7C4DFF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dashNc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#118D57" stopOpacity={0.32} />
                          <stop offset="60%" stopColor="#118D57" stopOpacity={0.06} />
                          <stop offset="100%" stopColor="#118D57" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dashDocsStroke" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="var(--brand-primary)" />
                          <stop offset="100%" stopColor="var(--brand-accent)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} dy={6} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        cursor={{ stroke: 'var(--brand-primary)', strokeOpacity: 0.22, strokeWidth: 1.5, strokeDasharray: '3 4' }}
                        contentStyle={{
                          backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)',
                          border: '1px solid var(--border)',
                          borderRadius: 14,
                          fontSize: 12,
                          padding: '10px 14px',
                          boxShadow: '0 12px 32px -16px rgba(15,23,42,0.24), inset 0 1px 0 rgba(255,255,255,0.5)',
                          backdropFilter: 'saturate(140%) blur(10px)',
                        }}
                        labelStyle={{ color: 'var(--muted)', fontSize: 10.5, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                        formatter={(v) => [`${v}%`, '']}
                      />
                      <Area
                        type="monotone"
                        dataKey="documentsReady"
                        name="Docs ready"
                        stroke="url(#dashDocsStroke)"
                        strokeWidth={2.4}
                        fill="url(#dashDocs)"
                        isAnimationActive
                        animationDuration={1600}
                        animationEasing="ease-out"
                        activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--surface)', fill: 'var(--brand-primary)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="auditsCompleted"
                        name="Audits"
                        stroke="#7C4DFF"
                        strokeWidth={2.2}
                        fill="url(#dashAud)"
                        isAnimationActive
                        animationDuration={1600}
                        animationBegin={150}
                        animationEasing="ease-out"
                        activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--surface)', fill: '#7C4DFF' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="ncsClosed"
                        name="NCs closed"
                        stroke="#118D57"
                        strokeWidth={2.2}
                        fill="url(#dashNc)"
                        isAnimationActive
                        animationDuration={1600}
                        animationBegin={300}
                        animationEasing="ease-out"
                        activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--surface)', fill: '#118D57' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── System distribution donut ── */}
              <div className="group relative overflow-hidden rounded-3xl border border-[var(--border)]/50 bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)] transition-shadow duration-500 hover:shadow-[0_22px_50px_-26px_rgba(15,23,42,0.22)]">
                {/* Atmospheric */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-24 -top-20 h-48 w-48 rounded-full opacity-25"
                  style={{
                    background: 'radial-gradient(closest-side, var(--brand-accent), transparent 70%)',
                    filter: 'blur(18px)',
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)]/35 to-transparent"
                />

                <div className="relative mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                    System distribution
                  </p>
                  <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                    Snapshot across modules
                  </h3>
                </div>
                {(() => {
                  const pieData = stats
                    .map((s) => ({
                      name: s.label,
                      value: Math.max(0, parseInt(s.value, 10) || 0),
                      color: s.color,
                    }))
                    .filter((d) => d.value > 0);
                  const total = pieData.reduce((a, b) => a + b.value, 0);
                  if (total === 0) {
                    return (
                      <div className="flex h-[210px] items-center justify-center text-[12px] text-[var(--muted)]">
                        No data yet
                      </div>
                    );
                  }
                  const renderActive = (props: unknown) => {
                    const p = props as {
                      cx: number;
                      cy: number;
                      innerRadius: number;
                      outerRadius: number;
                      startAngle: number;
                      endAngle: number;
                      fill: string;
                    };
                    return (
                      <g>
                        <Sector
                          cx={p.cx}
                          cy={p.cy}
                          innerRadius={p.innerRadius}
                          outerRadius={p.outerRadius + 6}
                          startAngle={p.startAngle}
                          endAngle={p.endAngle}
                          fill={p.fill}
                          cornerRadius={8}
                        />
                        <Sector
                          cx={p.cx}
                          cy={p.cy}
                          innerRadius={p.outerRadius + 8}
                          outerRadius={p.outerRadius + 10}
                          startAngle={p.startAngle}
                          endAngle={p.endAngle}
                          fill={p.fill}
                          fillOpacity={0.18}
                          cornerRadius={3}
                        />
                      </g>
                    );
                  };
                  const focusName =
                    distActive >= 0 && distActive < pieData.length
                      ? pieData[distActive].name
                      : 'Total';
                  const focusValue =
                    distActive >= 0 && distActive < pieData.length
                      ? pieData[distActive].value
                      : total;
                  const focusPct =
                    distActive >= 0 && distActive < pieData.length
                      ? Math.round((pieData[distActive].value / total) * 100)
                      : 100;
                  return (
                    <>
                      <div className="relative h-[210px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip
                              contentStyle={{
                                backgroundColor:
                                  'color-mix(in srgb, var(--surface) 92%, transparent)',
                                border: '1px solid var(--border)',
                                borderRadius: 14,
                                fontSize: 12,
                                padding: '8px 12px',
                                boxShadow:
                                  '0 12px 32px -16px rgba(15,23,42,0.24), inset 0 1px 0 rgba(255,255,255,0.5)',
                                backdropFilter: 'saturate(140%) blur(10px)',
                              }}
                              labelStyle={{
                                color: 'var(--muted)',
                                fontSize: 10.5,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                              }}
                            />
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={58}
                              outerRadius={86}
                              paddingAngle={3}
                              cornerRadius={8}
                              stroke="var(--surface)"
                              strokeWidth={3}
                              {...({
                                activeIndex: distActive,
                                activeShape: renderActive,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              } as any)}
                              onMouseEnter={(_, idx) => setDistActive(idx)}
                              onMouseLeave={() => setDistActive(-1)}
                              isAnimationActive
                              animationDuration={1500}
                              animationEasing="ease-out"
                            >
                              {pieData.map((d) => (
                                <Cell key={d.name} fill={d.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center label */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                            {focusName}
                          </span>
                          <span className="text-[24px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
                            {focusValue.toLocaleString()}
                          </span>
                          <span className="mt-1 text-[10.5px] text-[var(--muted)]">
                            {focusPct}%
                          </span>
                        </div>
                      </div>
                      {/* Legend with progress bars */}
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {pieData.map((d, i) => {
                          const pct = Math.round((d.value / total) * 100);
                          const isActive = distActive === i;
                          return (
                            <li
                              key={d.name}
                              onMouseEnter={() => setDistActive(i)}
                              onMouseLeave={() => setDistActive(-1)}
                              className={cn(
                                'group/seg cursor-pointer rounded-xl px-2 py-1.5 transition-colors duration-300',
                                isActive && 'bg-[var(--nav-hover)]/60',
                              )}
                            >
                              <div className="flex items-center justify-between text-[11.5px]">
                                <span className="flex min-w-0 items-center gap-2 text-[var(--nav-inactive)]">
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full transition-transform duration-300 group-hover/seg:scale-125"
                                    style={{ background: d.color }}
                                  />
                                  <span className="truncate font-medium text-[var(--text-primary)]">
                                    {d.name}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-baseline gap-1.5">
                                  <span className="font-semibold text-[var(--text-primary)]">
                                    {d.value.toLocaleString()}
                                  </span>
                                  <span className="text-[10.5px] text-[var(--muted)]">
                                    · {pct}%
                                  </span>
                                </span>
                              </div>
                              {/* Tiny progress bar */}
                              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]/40">
                                <motion.div
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: 1 }}
                                  transition={{
                                    delay: 0.5 + i * 0.06,
                                    duration: 0.9,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  style={{
                                    width: `${pct}%`,
                                    background: `linear-gradient(90deg, ${d.color}, ${d.color}cc)`,
                                    transformOrigin: 'left',
                                  }}
                                  className="h-full rounded-full"
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {/* ─── Team list ─── */}
          {team.length > 0 && (() => {
            const activeCount = team.filter(
              (u) => u.isActive === true || u.status === 'ACTIVE',
            ).length;
            const pendingCount = team.filter(
              (u) => u.status === 'PENDING' || u.status === 'INVITED',
            ).length;
            return (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className="mb-6"
              >
                <div className="group relative overflow-hidden rounded-3xl border border-[var(--border)]/50 bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)] transition-shadow duration-500 hover:shadow-[0_18px_44px_-26px_rgba(15,23,42,0.18)]">
                  {/* Soft halo top-left */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -left-24 -top-20 h-44 w-44 rounded-full opacity-20"
                    style={{
                      background:
                        'radial-gradient(closest-side, var(--brand-primary), transparent 70%)',
                      filter: 'blur(14px)',
                    }}
                  />
                  {/* Header */}
                  <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]/55 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)]"
                        style={{
                          background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                          color: 'var(--brand-primary)',
                        }}
                      >
                        <Users className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                          Team
                        </p>
                        <p className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                          {team.length} {team.length === 1 ? 'member' : 'members'} on the platform
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {activeCount || team.length} active
                      </span>
                      {pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {pendingCount} pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Members list */}
                  <ul className="relative max-h-[420px] divide-y divide-[var(--border)]/40 overflow-y-auto">
                    {team.slice(0, 12).map((u, idx) => {
                      const seed =
                        u.id || u.email || `${u.firstName}${u.lastName}` || String(idx);
                      const name =
                        [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '-';
                      const isActive = u.isActive === true || u.status === 'ACTIVE';
                      const isPending = u.status === 'PENDING' || u.status === 'INVITED';
                      return (
                        <motion.li
                          key={seed + idx}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: 0.42 + idx * 0.04,
                            duration: 0.5,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="group/row flex items-center gap-3 px-5 py-3 transition-colors duration-300 hover:bg-[var(--nav-hover)]/40"
                        >
                          {/* Avatar with status ring */}
                          <span className="relative flex shrink-0 items-center justify-center">
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-semibold text-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.18)] transition-transform duration-300 group-hover/row:scale-[1.04]"
                              style={{ backgroundColor: getAvatarColor(seed) }}
                            >
                              {getUserInitials(u)}
                            </span>
                            {/* Presence dot */}
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--surface)]',
                                isActive
                                  ? 'bg-emerald-500'
                                  : isPending
                                    ? 'bg-amber-500'
                                    : 'bg-slate-300 dark:bg-slate-600',
                              )}
                            />
                          </span>
                          {/* Name + email */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">
                              {name}
                            </p>
                            {u.email && (
                              <p className="truncate text-[11.5px] text-[var(--muted)]">
                                {u.email}
                              </p>
                            )}
                          </div>
                          {/* Status pill */}
                          <span
                            className={cn(
                              'hidden shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider sm:inline-flex',
                              isActive
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : isPending
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                  : 'bg-[var(--nav-hover)] text-[var(--muted)]',
                            )}
                          >
                            {isActive ? 'Active' : isPending ? 'Pending' : 'Inactive'}
                          </span>
                          {/* Hover arrow */}
                          <span
                            aria-hidden
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 text-[var(--muted)] opacity-0 transition-all duration-300 group-hover/row:opacity-100 group-hover/row:border-transparent group-hover/row:bg-[var(--brand-primary)]/12 group-hover/row:text-[var(--brand-primary)]"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </motion.li>
                      );
                    })}
                  </ul>

                  {/* Footer link */}
                  <Link
                    href="/company/users"
                    className="group/footer relative flex items-center justify-between gap-2 border-t border-[var(--border)]/55 bg-[var(--surface)]/60 px-5 py-3 text-[12.5px] font-medium text-[var(--brand-primary)] transition-colors duration-300 hover:bg-[var(--brand-primary)]/[0.06]"
                  >
                    <span className="inline-flex items-center gap-2">
                      View all members
                      {team.length > 12 && (
                        <span className="rounded-full bg-[var(--brand-primary)]/10 px-1.5 py-0.5 text-[10.5px] font-semibold">
                          +{team.length - 12}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--brand-primary)]/20 transition-all duration-300 group-hover/footer:bg-[var(--brand-primary)] group-hover/footer:text-white"
                    >
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/footer:translate-x-0.5" />
                    </span>
                  </Link>
                </div>
              </motion.div>
            );
          })()}

          {/* ─── Enterprise trust indicators ─── */}
          <TrustIndicatorsFooter />
        </>
      )}

      <Dialog open={trendsOpen} onOpenChange={setTrendsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <LineChartIcon className="h-5 w-5 text-[var(--brand-primary)]" />
              Compliance trends
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Monthly progress over the last 6 months: Documents ready, Audits completed, NCs closed.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {[
              { label: 'Documents ready', color: '#118d57', key: 'documentsReady' as const },
              { label: 'Audits completed', color: '#7c4dff', key: 'auditsCompleted' as const },
              { label: 'NCs closed', color: '#1565c0', key: 'ncsClosed' as const },
            ].map((s) => {
              const last = trendSeries[trendSeries.length - 1]?.[s.key] ?? 0;
              return (
                <div
                  key={s.key}
                  className="rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/60 px-3 py-2.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      {s.label}
                    </p>
                  </div>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                    {last}
                    <span className="text-sm font-medium text-[var(--muted)]">%</span>
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 h-[320px] w-full rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)]/40 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSeries} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                <defs>
                  <linearGradient id="grad-docs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#118d57" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#118d57" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-aud" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c4dff" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#7c4dff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-nc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1565c0" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#1565c0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--muted)"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  stroke="var(--muted)"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  width={42}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }}
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: '0 8px 24px -12px rgba(15,23,42,0.18)',
                  }}
                  formatter={(value) => [`${value}%`, '']}
                  labelStyle={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Line
                  type="monotone"
                  dataKey="documentsReady"
                  name="Documents ready"
                  stroke="#118d57"
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2, fill: 'var(--surface)' }}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="auditsCompleted"
                  name="Audits completed"
                  stroke="#7c4dff"
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2, fill: 'var(--surface)' }}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="ncsClosed"
                  name="NCs closed"
                  stroke="#1565c0"
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2, fill: 'var(--surface)' }}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={listType !== null} onOpenChange={(o) => !o && setListType(null)}>
        <DialogContent className="max-w-3xl">
          {listConfig &&
            (() => {
              const ListIcon = listConfig.icon;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{ backgroundColor: listConfig.bg, color: listConfig.color }}
                      >
                        <ListIcon size={20} />
                      </span>
                      {listConfig.title}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-[var(--muted)]">
                      {listConfig.description} ·{' '}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {listConfig.rows.length}
                      </span>{' '}
                      item{listConfig.rows.length === 1 ? '' : 's'} · {periodHint}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)]/50">
                    {listConfig.rows.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <span
                          className="flex h-12 w-12 items-center justify-center rounded-2xl"
                          style={{ backgroundColor: listConfig.bg, color: listConfig.color }}
                        >
                          <ListIcon size={22} />
                        </span>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {listConfig.empty}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          Try widening the period or come back later.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-[var(--border)]/40">
                        {listConfig.rows.map((row) => {
                          const isDocBased =
                            listType === 'products' ||
                            listType === 'standards' ||
                            listType === 'reports';
                          const rowInner = (
                            <>
                              <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                style={{
                                  backgroundColor: listConfig.bg,
                                  color: listConfig.color,
                                }}
                              >
                                <ListIcon size={20} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  className="truncate text-sm font-semibold text-[var(--text-primary)]"
                                  title={row.primary}
                                >
                                  {row.primary}
                                </p>
                                {row.secondary && (
                                  <p
                                    className="truncate text-xs text-[var(--muted)]"
                                    title={row.secondary}
                                  >
                                    {row.secondary}
                                  </p>
                                )}
                              </div>
                            </>
                          );

                          const draggableProps =
                            isDocBased && row.id ? attachDocDragGlobal(row.id, row.primary) : {};
                          return (
                          <li
                            key={row.id}
                            {...draggableProps}
                            className={`group flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--page-bg)]/40 ${
                              isDocBased && row.id ? 'cursor-grab active:cursor-grabbing' : ''
                            }`}
                          >
                            {isDocBased && row.id ? (
                              <DocumentHoverPreview
                                documentId={row.id}
                                documentName={row.primary}
                                documentDescription={row.secondary}
                              >
                                {rowInner}
                              </DocumentHoverPreview>
                            ) : (
                              rowInner
                            )}
                            {row.badge && (
                              <span
                                className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline-flex"
                                style={{
                                  backgroundColor: `${row.badge.color}1a`,
                                  color: row.badge.color,
                                }}
                              >
                                {row.badge.label}
                              </span>
                            )}
                            {row.date && (
                              <span className="hidden shrink-0 text-[11px] text-[var(--muted)] md:inline">
                                {row.date}
                              </span>
                            )}
                            {row.href && (
                              <Link
                                href={row.href}
                                onClick={() => setListType(null)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:border-transparent"
                                style={{
                                  backgroundColor: 'transparent',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = listConfig.bg;
                                  e.currentTarget.style.color = listConfig.color;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                  e.currentTarget.style.color = '';
                                }}
                                title="Open"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            )}
                          </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => load()}
      />
      <RunEvaluationDialog
        open={runEvalOpen}
        onOpenChange={setRunEvalOpen}
        onCreated={() => load()}
      />
      <ScheduleAuditDialog
        open={scheduleAuditOpen}
        onOpenChange={setScheduleAuditOpen}
        onCreated={() => load()}
      />
    </DashboardLayout>
  );
}
