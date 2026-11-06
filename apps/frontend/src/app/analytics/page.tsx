'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Sector,
  type PieLabelRenderProps,
} from 'recharts';
import { TrendingUp, TrendingDown, Sparkles } from '@/components/icons';
import {
  ReportsIllustration,
  AuditsIllustration,
  NonConformitiesIllustration,
  ProductsIllustration,
  ComplianceIllustration,
} from '@/components/icons/sidebar-illustrations';
import { cn } from '@/utils/cn';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuthStore } from '@/lib/auth-store';
import toast from 'react-hot-toast';
import {
  type AnalyticsKpi,
  type ChartSlice,
  type ComplianceTrendRow,
  buildAnalyticsKpis,
  buildComplianceTrend,
  buildDocumentStatusSlices,
  buildEvaluationsByStatus,
  buildNcSeveritySlices,
  fetchWorkspaceSnapshot,
} from '@/lib/workspace-data';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type KpiTrend = 'up' | 'down';
type Kpi = AnalyticsKpi & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  tint: string;
  tintBg: string;
};

const KPI_META: Record<
  string,
  { icon: React.ComponentType<{ size?: number }>; tint: string; tintBg: string }
> = {
  'Active Documents': {
    icon: ReportsIllustration,
    tint: '#1B1BF5',
    tintBg: 'rgba(27,27,245,0.10)',
  },
  'Audits Completed': {
    icon: AuditsIllustration,
    tint: '#118D57',
    tintBg: 'rgba(17,141,87,0.10)',
  },
  'Open Non-Conformities': {
    icon: NonConformitiesIllustration,
    tint: '#B76E00',
    tintBg: 'rgba(183,110,0,0.10)',
  },
  'Products Tracked': {
    icon: ProductsIllustration,
    tint: '#7C4DFF',
    tintBg: 'rgba(124,77,255,0.10)',
  },
};

/* ─────────────────────────  Primitives  ───────────────────────── */

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 720ms ${EASE}, transform 780ms ${EASE}`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}

function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{val.toLocaleString()}</>;
}

/** Soft glass card chrome: used for every analytics surface. */
function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[24px] border border-[var(--border)]/55 bg-[var(--surface)]',
        'shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)]',
        'transition-[transform,box-shadow,border-color] duration-500',
        'hover:border-[var(--border)]/80 hover:shadow-[0_18px_44px_-24px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]',
        className,
      )}
      style={{ transitionTimingFunction: EASE }}
    >
      {children}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  delay = 0,
  className,
  children,
  action,
  accent = 'var(--brand-primary)',
}: {
  title: string;
  subtitle?: string;
  delay?: number;
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <GlassCard>
        {/* Subtle brand-tinted halo top-right (very soft, no opacity bump on hover) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-44 w-44 rounded-full opacity-20"
          style={{
            background: `radial-gradient(closest-side, ${accent}, transparent 70%)`,
            filter: 'blur(14px)',
          }}
        />
        {/* Top accent rail revealed on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px origin-center scale-x-0 transition-transform duration-700 group-hover:scale-x-100"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${accent} 50%, transparent 100%)`,
            transitionTimingFunction: EASE,
          }}
        />
        <div className="relative p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">{subtitle}</p>
              )}
            </div>
            {action}
          </div>
          {children}
        </div>
      </GlassCard>
    </Reveal>
  );
}

/* ─────────────────────────  Tooltip  ───────────────────────── */

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  fontSize: 12,
  padding: '10px 14px',
  boxShadow:
    '0 8px 28px -16px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.5)',
  backdropFilter: 'saturate(140%) blur(8px)',
};
const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: 'var(--muted)',
  fontSize: 10.5,
  marginBottom: 6,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 500,
};

/* ─────────────────────────  Sparkline  ───────────────────────── */

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 96;
  const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d - min) / span) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const lastX = w;
  const lastY = h - ((data[data.length - 1] - min) / span) * h;
  const gradId = `spark-grad-${color.replace('#', '')}`;
  return (
    <svg
      aria-hidden
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h + 2}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.6" fill={color} />
      <circle cx={lastX} cy={lastY} r="5" fill={color} fillOpacity="0.18" />
    </svg>
  );
}

/* ─────────────────────────  Active pie shape  ───────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
const renderActiveShape = (props: any) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
  } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={8}
      />
      {/* Soft outer ring */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        fillOpacity={0.15}
        cornerRadius={4}
      />
    </g>
  );
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─────────────────────────  Page  ───────────────────────── */

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [complianceTrend, setComplianceTrend] = useState<ComplianceTrendRow[]>([]);
  const [docStatus, setDocStatus] = useState<ChartSlice[]>([]);
  const [ncBySeverity, setNcBySeverity] = useState<ChartSlice[]>([]);
  const [evalByStandard, setEvalByStandard] = useState<
    Array<{ team: string; completed: number; pending: number }>
  >([]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snapshot = await fetchWorkspaceSnapshot();
        if (cancelled) return;
        const rawKpis = buildAnalyticsKpis(snapshot);
        setKpis(
          rawKpis.map((k) => {
            const meta = KPI_META[k.label] ?? KPI_META['Active Documents'];
            return { ...k, icon: meta.icon, tint: meta.tint, tintBg: meta.tintBg };
          }),
        );
        setComplianceTrend(buildComplianceTrend(snapshot.docs, snapshot.audits, snapshot.ncs));
        setDocStatus(buildDocumentStatusSlices(snapshot.docs));
        setNcBySeverity(buildNcSeveritySlices(snapshot.ncs));
        setEvalByStandard(buildEvaluationsByStatus(snapshot.evals));
      } catch {
        if (!cancelled) toast.error('Could not load analytics data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totalDocs = useMemo(
    () => docStatus.reduce((sum, d) => sum + d.value, 0),
    [docStatus],
  );
  const totalNc = useMemo(
    () => ncBySeverity.reduce((sum, d) => sum + d.value, 0),
    [ncBySeverity],
  );

  const [docActive, setDocActive] = useState<number>(-1);
  const [ncActive, setNcActive] = useState<number>(-1);

  return (
    <DashboardLayout showRouteHeader={false}>
      <div className="min-h-full px-4 pb-12 pt-2 sm:px-6 lg:px-8">
        {/* ─── Header ─── */}
        <Reveal>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight text-[var(--text-primary)]">
                Analytics
              </h1>
              <p className="text-[13px] text-[var(--muted)]">
                Live metrics from your documents, audits, evaluations &amp; non-conformities
              </p>
            </div>
            {loading && (
              <span className="text-[12px] font-medium text-[var(--muted)]">Loading…</span>
            )}
          </div>
        </Reveal>

        {/* ─── KPI cards ─── */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            const TrendIcon = kpi.trend === 'up' ? TrendingUp : TrendingDown;
            const trendCls =
              kpi.trend === 'up'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
            return (
              <Reveal key={kpi.label} delay={80 + i * 90}>
                <GlassCard className="hover:-translate-y-0.5">
                  {/* Subtle corner glow tinted with the KPI color */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full opacity-30"
                    style={{
                      background: `radial-gradient(closest-side, ${kpi.tint}22, transparent 72%)`,
                      filter: 'blur(10px)',
                    }}
                  />
                  {/* Top accent rail revealed on hover */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-6 top-0 h-px origin-center scale-x-0 transition-transform duration-700 group-hover:scale-x-100"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${kpi.tint} 50%, transparent 100%)`,
                      transitionTimingFunction: EASE,
                    }}
                  />

                  <div className="relative p-5">
                    <div className="flex items-start justify-between">
                      <div
                        className="relative flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset transition-transform duration-500 group-hover:scale-[1.04]"
                        style={{
                          backgroundColor: kpi.tintBg,
                          color: kpi.tint,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ['--tw-ring-color' as any]: `${kpi.tint}26`,
                          transitionTimingFunction: EASE,
                        }}
                      >
                        {/* Tile inner sheen */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-2 top-1 h-2 rounded-full opacity-70"
                          style={{
                            background:
                              'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, transparent 100%)',
                          }}
                        />
                        <Icon size={30} />
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          trendCls,
                        )}
                      >
                        <TrendIcon size={12} strokeWidth={2} />
                        {kpi.delta}
                      </span>
                    </div>

                    <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                      {kpi.label}
                    </p>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <p className="text-[28px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
                        <CountUp to={kpi.value} />
                      </p>
                      <Sparkline data={kpi.spark} color={kpi.tint} />
                    </div>
                  </div>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>

        {/* ─── Row 1: Compliance area + Doc status donut ─── */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Compliance Trend"
            subtitle="Monthly compliance score over the last year"
            delay={420}
            className="lg:col-span-2"
            accent="var(--brand-primary)"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--brand-primary)] backdrop-blur-sm">
                <Sparkles size={11} strokeWidth={2} />
                Year to date
              </span>
            }
          >
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={complianceTrend.length ? complianceTrend : [{ month: '-', compliance: 0, audits: 0, nc: 0 }]}
                  margin={{ top: 12, right: 18, left: -6, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradComp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.32} />
                      <stop offset="60%" stopColor="var(--brand-primary)" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCompStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--brand-primary)" />
                      <stop offset="100%" stopColor="var(--brand-accent)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="2 6"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{
                      stroke: 'var(--brand-primary)',
                      strokeOpacity: 0.22,
                      strokeWidth: 1.5,
                      strokeDasharray: '3 4',
                    }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={(v) => [`${v}%`, '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="compliance"
                    name="Compliance"
                    stroke="url(#gradCompStroke)"
                    strokeWidth={2.5}
                    fill="url(#gradComp)"
                    isAnimationActive
                    animationDuration={1600}
                    animationEasing="ease-out"
                    activeDot={{
                      r: 6,
                      strokeWidth: 3,
                      stroke: 'var(--surface)',
                      fill: 'var(--brand-primary)',
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Document Status"
            subtitle={`${totalDocs.toLocaleString()} total documents`}
            delay={520}
            accent="#118D57"
          >
            <div className="relative h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Pie
                    data={docStatus.length ? docStatus : [{ name: 'No data', value: 1, color: '#94A3B8' }]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={98}
                    paddingAngle={3}
                    cornerRadius={10}
                    stroke="var(--surface)"
                    strokeWidth={3}
                    {...({
                      activeIndex: docActive,
                      activeShape: renderActiveShape,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any)}
                    onMouseEnter={(_, idx) => setDocActive(idx)}
                    onMouseLeave={() => setDocActive(-1)}
                    isAnimationActive
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    {(docStatus.length ? docStatus : [{ name: 'No data', value: 1, color: '#94A3B8' }]).map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                  {docActive >= 0
                    ? docStatus[docActive].name
                    : 'Total'}
                </span>
                <span className="text-[26px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
                  {docActive >= 0 ? (
                    docStatus[docActive].value.toLocaleString()
                  ) : (
                    <CountUp to={totalDocs} />
                  )}
                </span>
                <span className="mt-1 text-[11px] text-[var(--muted)]">
                  {docActive >= 0
                    ? `${Math.round((docStatus[docActive].value / totalDocs) * 100)}%`
                    : 'documents'}
                </span>
              </div>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {docStatus.map((d, i) => {
                const isActive = docActive === i;
                return (
                  <li
                    key={d.name}
                    onMouseEnter={() => setDocActive(i)}
                    onMouseLeave={() => setDocActive(-1)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-[12px] transition-colors duration-300',
                      isActive && 'bg-[var(--nav-hover)]',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[var(--nav-inactive)]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: d.color }}
                      />
                      {d.name}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {d.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          </ChartCard>
        </div>

        {/* ─── Row 2: Audits vs NC + NC severity ─── */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Audits vs Non-Conformities"
            subtitle="Volumes per month"
            delay={620}
            className="lg:col-span-2"
            accent="#7C4DFF"
          >
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={complianceTrend.length ? complianceTrend : [{ month: '-', compliance: 0, audits: 0, nc: 0 }]}
                  margin={{ top: 12, right: 18, left: -6, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="lineAud" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#1B1BF5" />
                      <stop offset="100%" stopColor="#7C4DFF" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="2 6"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={{
                      stroke: 'var(--brand-primary)',
                      strokeOpacity: 0.18,
                      strokeWidth: 1.5,
                      strokeDasharray: '3 4',
                    }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={32}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{
                      fontSize: 11.5,
                      color: 'var(--nav-inactive)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="audits"
                    name="Audits"
                    stroke="url(#lineAud)"
                    strokeWidth={2.6}
                    dot={false}
                    activeDot={{
                      r: 6,
                      strokeWidth: 3,
                      stroke: 'var(--surface)',
                      fill: '#7C4DFF',
                    }}
                    isAnimationActive
                    animationDuration={1600}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="nc"
                    name="Non-Conformities"
                    stroke="#B76E00"
                    strokeWidth={2.2}
                    strokeDasharray="6 5"
                    dot={false}
                    activeDot={{
                      r: 5,
                      strokeWidth: 3,
                      stroke: 'var(--surface)',
                      fill: '#B76E00',
                    }}
                    isAnimationActive
                    animationDuration={1600}
                    animationBegin={250}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="NC by Severity"
            subtitle="Open non-conformities breakdown"
            delay={720}
            accent="#DC2626"
          >
            <div className="relative h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Pie
                    data={ncBySeverity.length ? ncBySeverity : [{ name: 'None', value: 1, color: '#94A3B8' }]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={92}
                    paddingAngle={3}
                    cornerRadius={8}
                    stroke="var(--surface)"
                    strokeWidth={3}
                    {...({
                      activeIndex: ncActive,
                      activeShape: renderActiveShape,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any)}
                    onMouseEnter={(_, idx) => setNcActive(idx)}
                    onMouseLeave={() => setNcActive(-1)}
                    isAnimationActive
                    animationDuration={1500}
                    animationEasing="ease-out"
                    labelLine={false}
                    label={(p: PieLabelRenderProps) => {
                      const value = typeof p.value === 'number' ? p.value : 0;
                      const pct = Math.round((value / totalNc) * 100);
                      if (pct < 8) return null;
                      const cx = Number(p.cx ?? 0);
                      const cy = Number(p.cy ?? 0);
                      const midAngle = Number(p.midAngle ?? 0);
                      const radius =
                        ((Number(p.innerRadius ?? 0)) + (Number(p.outerRadius ?? 0))) / 2;
                      const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180);
                      const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180);
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="#fff"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {pct}%
                        </text>
                      );
                    }}
                  >
                    {ncBySeverity.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                  Total NC
                </span>
                <span className="text-[22px] font-semibold leading-none tracking-tight text-[var(--text-primary)]">
                  <CountUp to={totalNc} />
                </span>
              </div>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {ncBySeverity.map((d, i) => {
                const isActive = ncActive === i;
                return (
                  <li
                    key={d.name}
                    onMouseEnter={() => setNcActive(i)}
                    onMouseLeave={() => setNcActive(-1)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-[12px] transition-colors duration-300',
                      isActive && 'bg-[var(--nav-hover)]',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[var(--nav-inactive)]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: d.color }}
                      />
                      {d.name}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {d.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          </ChartCard>
        </div>

        {/* ─── Training progress ─── */}
        <ChartCard
          title="Evaluations by Standard"
          subtitle="Completed vs in-progress runs"
          delay={820}
          accent="var(--brand-accent)"
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--brand-primary)] backdrop-blur-sm">
              <ComplianceIllustration size={12} />
              12-month rolling
            </span>
          }
        >
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={
                  evalByStandard.length
                    ? evalByStandard
                    : [{ team: 'No evaluations', completed: 0, pending: 0 }]
                }
                margin={{ top: 12, right: 18, left: -6, bottom: 0 }}
                barCategoryGap="22%"
              >
                <defs>
                  <linearGradient id="gradDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-accent)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="var(--brand-accent)" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="2 6"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="team"
                  tick={{ fontSize: 11.5, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: 'var(--nav-hover)', opacity: 0.6, radius: 8 }}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    fontSize: 11.5,
                    color: 'var(--nav-inactive)',
                  }}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  stackId="a"
                  fill="url(#gradDone)"
                  radius={[2, 2, 8, 8]}
                  isAnimationActive
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="pending"
                  name="Pending"
                  stackId="a"
                  fill="url(#gradPending)"
                  radius={[10, 10, 2, 2]}
                  isAnimationActive
                  animationDuration={1500}
                  animationBegin={220}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </DashboardLayout>
  );
}
