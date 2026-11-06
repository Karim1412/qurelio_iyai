'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity, AlertCircle, Calendar, CheckCircle, Timer, ExternalLink, FileText,
  History, RefreshCw, Search, Settings, ShieldCheck, X,
} from '@/components/icons';
import { cn } from '@/utils/cn';
import { regulatoryMonitoringApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import toast from 'react-hot-toast';

type SourceStatus = 'NEVER_CHECKED' | 'CHECKING' | 'OK' | 'CHANGE_DETECTED' | 'ERROR';
type EventState = 'NEEDS_REVIEW' | 'ACTION_REQUIRED' | 'NO_PRODUCT_IMPACT';

interface Source {
  sourceId: string;
  regionGroup: string;
  jurisdiction: string;
  regulatoryDomain: string;
  sourceName: string;
  officialUrl: string;
  publisherType: string;
  sourceClass: string;
  contentToMonitor: string;
  preferredDetectionMethod: string;
  suggestedCheckCadence: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | string;
  automationNotes: string;
  accessLicensingNotes: string;
  recommendedAiUse: string;
  verificationStatus: string;
  checkIntervalHours: number;
  checkIntervalManuallyConfigured: boolean;
  enabled: boolean;
  checkStatus: SourceStatus;
  lastAttemptAt?: string | null;
  lastCheckedAt?: string | null;
  nextCheckAt?: string | null;
  lastHttpStatus?: number | null;
  lastError?: string | null;
  lastFailureCount: number;
  lastChangeDetectedAt?: string | null;
  isDue: boolean;
  lastSuccessfulCheckAt?: string | null;
  cadenceWarning: boolean;
  linkedToCompany?: boolean;
  exactDuplicateEndpointCount?: number;
}

interface CheckRun {
  id: string;
  sourceId: string;
  status: 'BASELINE_CAPTURED' | 'UNCHANGED' | 'POTENTIAL_CHANGE' | 'ERROR';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  httpStatus?: number | null;
  finalUrl?: string | null;
  previousHash?: string | null;
  currentHash?: string | null;
  changeTypes: string[];
  summary?: string | null;
  errorMessage?: string | null;
}

interface RegulatoryEvent {
  id: string;
  sourceId: string;
  checkId: string;
  sourceName: string;
  sourceUrl: string;
  priority: string;
  detectedAt: string;
  title: string;
  summary: string;
  changeTypes: string[];
  beforeHash?: string | null;
  afterHash: string;
  changeExcerpt?: string | null;
  state: EventState;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  notificationsCreated: number;
}

interface Summary {
  totalSources: number;
  enabledSources: number;
  sourcesWithErrors: number;
  changeEventsNeedingReview: number;
  actionRequiredReviews: number;
  dueSources: number;
  lastCheckedAt?: string | null;
  defaultIntervalHours: number;
}

interface SourceHistory {
  source: Source;
  checks: CheckRun[];
  events: RegulatoryEvent[];
}

const STATUS_LABEL: Record<SourceStatus, string> = {
  NEVER_CHECKED: 'Not checked', CHECKING: 'Checking', OK: 'No change detected',
  CHANGE_DETECTED: 'Change detected', ERROR: 'Check failed',
};

const EVENT_LABEL: Record<EventState, string> = {
  NEEDS_REVIEW: 'Impact review needed', ACTION_REQUIRED: 'Action required',
  NO_PRODUCT_IMPACT: 'No product impact',
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatInterval(hours: number): string {
  if (hours % 168 === 0) return `Every ${hours / 168} week${hours / 168 === 1 ? '' : 's'}`;
  if (hours % 24 === 0) return `Every ${hours / 24} day${hours / 24 === 1 ? '' : 's'}`;
  return `Every ${hours} hour${hours === 1 ? '' : 's'}`;
}

function badgeClass(status: string): string {
  if (status === 'OK' || status === 'BASELINE_CAPTURED' || status === 'NO_PRODUCT_IMPACT') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'CHANGE_DETECTED' || status === 'POTENTIAL_CHANGE' || status === 'NEEDS_REVIEW') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'ERROR') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'ACTION_REQUIRED') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'CHECKING') return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function priorityClass(priority: string): string {
  if (priority === 'P0') return 'border-red-200 bg-red-50 text-red-800';
  if (priority === 'P1') return 'border-orange-200 bg-orange-50 text-orange-800';
  if (priority === 'P2') return 'border-blue-200 bg-blue-50 text-blue-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function sourceNeedsVerification(status: string): boolean {
  return /validate|verify|verification|confirm|vendor evaluation|not a unified official feed/i.test(status || '');
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', className)}>{children}</span>;
}

export default function MonitoringPage() {
  const user = useAuthStore((state) => state.user);
  const isPlatformAdmin = user?.role === 'SUPER_ADMIN';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [events, setEvents] = useState<RegulatoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [eventState, setEventState] = useState('NEEDS_REVIEW');
  const [activeTab, setActiveTab] = useState<'sources' | 'events'>('sources');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceHistory, setSourceHistory] = useState<SourceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<RegulatoryEvent | null>(null);
  const [reviewResult, setReviewResult] = useState<'ACTION_REQUIRED' | 'NO_PRODUCT_IMPACT'>('ACTION_REQUIRED');
  const [reviewNote, setReviewNote] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [intervalDays, setIntervalDays] = useState('7');
  const [useRecommendedCadence, setUseRecommendedCadence] = useState(true);
  const [sourceEnabled, setSourceEnabled] = useState(true);
  const [savingSource, setSavingSource] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [summaryRes, sourcesRes, eventsRes] = await Promise.all([
        regulatoryMonitoringApi.summary(),
        regulatoryMonitoringApi.sources({ search: search.trim() || undefined, priority: priority === 'ALL' ? undefined : priority, status: status === 'ALL' ? undefined : status, limit: 250 }),
        regulatoryMonitoringApi.events({ state: eventState === 'ALL' ? undefined : eventState, limit: 75 }),
      ]);
      setSummary(summaryRes.data as Summary);
      setSources(Array.isArray(sourcesRes.data?.data) ? sourcesRes.data.data : []);
      setEvents(Array.isArray(eventsRes.data?.data) ? eventsRes.data.data : []);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      if (!quiet) toast.error(Array.isArray(message) ? message.join(' ') : message || 'Could not load regulatory monitoring data. Check the document service and database migration.');
    } finally {
      setLoading(false);
      if (!quiet) setRefreshing(false);
    }
  }, [search, priority, status, eventState]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Keep the dashboard fresh while the scheduler is processing its queue.
  useEffect(() => {
    const timer = setInterval(() => { void loadData(true); }, 25_000);
    return () => clearInterval(timer);
  }, [loadData]);

  const visibleSources = useMemo(() => sources, [sources]);

  const queueChecks = async (sourceIds?: string[]) => {
    setQueueing(true);
    try {
      const response = await regulatoryMonitoringApi.queueChecks(sourceIds);
      toast.success(response.data?.message || 'Source checks queued.');
      await loadData(true);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      toast.error(Array.isArray(message) ? message.join(' ') : message || 'You may need Quality Manager or Director permission to queue checks.');
    } finally {
      setQueueing(false);
    }
  };

  const openSourceHistory = async (source: Source) => {
    setSelectedSourceId(source.sourceId);
    setSourceHistory(null);
    setHistoryLoading(true);
    try {
      const response = await regulatoryMonitoringApi.sourceHistory(source.sourceId, 30);
      setSourceHistory(response.data as SourceHistory);
    } catch {
      toast.error('Could not load source history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openSourceSettings = (source: Source) => {
    setEditingSource(source);
    setIntervalDays(String(Number(Math.max(1 / 24, source.checkIntervalHours / 24).toFixed(4))));
    setUseRecommendedCadence(!source.checkIntervalManuallyConfigured);
    setSourceEnabled(source.enabled);
  };

  const saveSourceSettings = async () => {
    if (!editingSource) return;
    const days = Number(intervalDays);
    if (!useRecommendedCadence && (!Number.isFinite(days) || days < (1 / 24) || days > 7)) {
      toast.error('Choose a custom interval between 1 hour and 7 days.');
      return;
    }
    setSavingSource(true);
    try {
      await regulatoryMonitoringApi.updateSource(editingSource.sourceId, {
        enabled: sourceEnabled,
        ...(useRecommendedCadence ? { useRecommendedCadence: true } : { checkIntervalHours: Math.max(1, Math.round(days * 24)) }),
      });
      toast.success('Monitoring schedule saved.');
      setEditingSource(null);
      await loadData(true);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      toast.error(Array.isArray(message) ? message.join(' ') : message || 'Could not save source settings.');
    } finally {
      setSavingSource(false);
    }
  };

  const submitEventReview = async () => {
    if (!reviewTarget) return;
    if (reviewNote.trim().length < 10) {
      toast.error('Add a review note of at least 10 characters.');
      return;
    }
    setSavingReview(true);
    try {
      await regulatoryMonitoringApi.reviewEvent(reviewTarget.id, { impactState: reviewResult, reviewNote: reviewNote.trim() });
      toast.success('Source-change review recorded.');
      setReviewTarget(null);
      setReviewNote('');
      await loadData(true);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      toast.error(Array.isArray(message) ? message.join(' ') : message || 'Could not save the review.');
    } finally {
      setSavingReview(false);
    }
  };

  const metrics = [
    { label: 'Sources in registry', value: summary?.totalSources ?? '—', caption: `${summary?.enabledSources ?? 0} enabled`, icon: FileText, accent: 'bg-teal-500' },
    { label: 'Changes needing review', value: summary?.changeEventsNeedingReview ?? '—', caption: 'Potential source changes affecting reviewed products', icon: AlertCircle, accent: 'bg-amber-500' },
    { label: 'Actions required', value: summary?.actionRequiredReviews ?? '—', caption: 'Your company marked these changes for follow-up', icon: CheckCircle, accent: 'bg-red-500' },
    { label: 'Sources with errors', value: summary?.sourcesWithErrors ?? '—', caption: 'Failed checks require attention', icon: Activity, accent: 'bg-rose-500' },
    { label: 'Checks due', value: summary?.dueSources ?? '—', caption: 'Per-source workbook cadence (maximum 7 days)', icon: Calendar, accent: 'bg-indigo-500' },
  ];

  return (
    <DashboardLayout pageTitle="Monitoring" pageTagline="Regulatory Monitoring">
      <div className="space-y-6">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)]">
                <ShieldCheck className="h-4 w-4" /> Source-driven regulatory monitoring
              </div>
              <h1 className="mt-2 text-xl font-bold text-[var(--text-primary)]">Track regulatory sources and review detected changes</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Qurelio checks registered source endpoints, stores source history and flags changes for review. A changed page is only a potential update—not proof that a law changed. Change events are shared source signals; each company records its own impact review, and applicability decisions are never changed automatically.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void loadData(false)} disabled={refreshing} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} /> Refresh
              </Button>
              {isPlatformAdmin ? (
                <Button type="button" onClick={() => void queueChecks()} disabled={queueing || loading} className="gap-2">
                  <Activity className={cn('h-4 w-4', queueing && 'animate-pulse')} />
                  {queueing ? 'Queueing…' : 'Check all sources now'}
                </Button>
              ) : (
                <span className="self-center text-xs text-[var(--muted)]">Automatic source checks run in the background; manual checks are available for sources linked to your reviewed products.</span>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--page-bg)] px-3 py-1.5"><Timer className="h-3.5 w-3.5" /> Weekly maximum; faster for priority sources</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--page-bg)] px-3 py-1.5"><History className="h-3.5 w-3.5" /> Historical snapshots and events</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--page-bg)] px-3 py-1.5"><CheckCircle className="h-3.5 w-3.5" /> Failed checks are not treated as “no change”</span>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                <span className={cn('w-1 shrink-0', metric.accent)} aria-hidden />
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{metric.label}</p>
                    <Icon className="h-4 w-4 text-[var(--muted)]" />
                  </div>
                  <p className="mt-1 text-2xl font-extrabold leading-tight text-[var(--text-primary)]">{metric.value}</p>
                  <p className="mt-1 truncate text-[12px] text-[var(--muted)]" title={metric.caption}>{metric.caption}</p>
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Source verification and cadence matter</p>
              <p className="mt-1 leading-5">
                Each source uses the workbook-recommended cadence when it can be interpreted, with a maximum interval of seven days. Daily sources are checked daily; hourly and feed-driven sources are checked more often, with a one-hour minimum because the current scheduler uses hour-level intervals. Verify that every listed URL reaches the intended regulatory publication or feed, not just a homepage, before relying on its results.
              </p>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]">
          <div className="flex gap-1">
            <button type="button" onClick={() => setActiveTab('sources')} className={cn('border-b-2 px-4 py-3 text-sm font-semibold transition-colors', activeTab === 'sources' ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text-primary)]')}>
              Source registry <span className="ml-1 rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[11px]">{summary?.totalSources ?? 0}</span>
            </button>
            <button type="button" onClick={() => setActiveTab('events')} className={cn('border-b-2 px-4 py-3 text-sm font-semibold transition-colors', activeTab === 'events' ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text-primary)]')}>
              Detected changes for your products <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">{summary?.changeEventsNeedingReview ?? 0}</span>
            </button>
          </div>
          <p className="pb-2 text-xs text-[var(--muted)]">Last successful check: {formatDate(summary?.lastCheckedAt)}</p>
        </div>

        {activeTab === 'sources' ? (
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Registered sources</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">Search the 181 endpoints imported from your tutor’s spreadsheet.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-[220px] flex-1 xl:w-72 xl:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search source, country, domain…" className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
                </label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority" className="rounded-lg border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="ALL">All priorities</option><option value="P0">P0 · Critical</option><option value="P1">P1 · High</option><option value="P2">P2 · Medium</option><option value="P3">P3 · Low</option>
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="rounded-lg border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="ALL">All statuses</option><option value="UNCHECKED">Not checked</option><option value="DUE">Due</option><option value="CHANGED">Change detected</option><option value="ERROR">Check failed</option><option value="DISABLED">Disabled</option>
                </select>
              </div>
            </div>

            {loading ? <div className="p-10 text-center text-sm text-[var(--muted)]">Loading source registry…</div> : visibleSources.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--page-bg)]/50">
                      {['Source', 'Jurisdiction / domain', 'Priority', 'Schedule', 'Monitoring status', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{heading}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSources.map((source) => (
                      <tr key={source.sourceId} className="border-b border-[var(--border)]/70 align-top last:border-0 hover:bg-[var(--page-bg)]/30">
                        <td className="max-w-[320px] px-4 py-4">
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 rounded-lg bg-[var(--page-bg)] p-2"><FileText className="h-4 w-4 text-[var(--muted)]" /></div>
                            <div className="min-w-0">
                              <p className="font-semibold text-[var(--text-primary)]">{source.sourceName}</p>
                              <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{source.sourceId} · {source.sourceClass}</p>
                              {(source.exactDuplicateEndpointCount || 1) > 1 && <Badge className="mt-1 border-violet-200 bg-violet-50 text-violet-800">Shared endpoint · {source.exactDuplicateEndpointCount} registry records</Badge>}
                              <a href={source.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-[270px] items-center gap-1 truncate text-[11px] text-[var(--brand-primary)] hover:underline" title={source.officialUrl}>
                                <ExternalLink className="h-3 w-3 shrink-0" />{source.officialUrl}
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[220px] px-4 py-4">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{source.jurisdiction}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{source.regulatoryDomain}</p>
                          <p className="mt-1 text-[10px] text-[var(--muted)]">{source.regionGroup}</p>
                        </td>
                        <td className="px-4 py-4"><Badge className={priorityClass(source.priority)}>{source.priority}</Badge></td>
                        <td className="max-w-[230px] px-4 py-4">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">{formatInterval(source.checkIntervalHours)}</p>
                          {source.cadenceWarning && <p className="mt-1 text-[10px] leading-4 text-amber-700">Spreadsheet suggests faster checks: {source.suggestedCheckCadence}</p>}
                          {!source.cadenceWarning && <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Suggested: {source.suggestedCheckCadence}</p>}
                          {!source.enabled && <Badge className="mt-2 border-slate-200 bg-slate-50 text-slate-600">Disabled</Badge>}
                        </td>
                        <td className="max-w-[240px] px-4 py-4">
                          <Badge className={badgeClass(source.checkStatus)}>{STATUS_LABEL[source.checkStatus] || source.checkStatus}</Badge>
                          <p className="mt-2 text-[11px] text-[var(--muted)]">Last successful check: {formatDate(source.lastSuccessfulCheckAt)}</p>
                          <p className="mt-1 text-[11px] text-[var(--muted)]">Next check: {source.enabled ? formatDate(source.nextCheckAt) : 'Disabled'}</p>
                          {source.lastHttpStatus && <p className="mt-1 text-[10px] text-[var(--muted)]">HTTP {source.lastHttpStatus}</p>}
                          {source.lastError && <p className="mt-1 max-w-[230px] break-words text-[10px] text-rose-700" title={source.lastError}>{source.lastError}</p>}
                          {sourceNeedsVerification(source.verificationStatus) ? <p className="mt-1 text-[10px] leading-4 text-amber-700"><span className="font-semibold">Source validation needed:</span> {source.verificationStatus}</p> : <p className="mt-1 text-[10px] text-[var(--muted)]">Workbook verification note: {source.verificationStatus}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void openSourceHistory(source)}><History className="h-3.5 w-3.5" /> History</Button>
                            {source.enabled && (isPlatformAdmin || source.linkedToCompany) && <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void queueChecks([source.sourceId])} disabled={queueing || source.checkStatus === 'CHECKING'}><RefreshCw className="h-3.5 w-3.5" /> Check now</Button>}
                            {isPlatformAdmin && <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => openSourceSettings(source)}><Settings className="h-3.5 w-3.5" /> Settings</Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center"><Search className="mx-auto h-6 w-6 text-[var(--muted)]" /><p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">No sources match these filters</p><p className="mt-1 text-xs text-[var(--muted)]">Change the search or filters, or refresh the source registry.</p></div>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--muted)]">
              <span>Showing {visibleSources.length} source(s) on this page.</span><span>First successful check captures a baseline; only later differences create change events.</span>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-sm font-bold text-[var(--text-primary)]">Detected source changes</h2><p className="mt-1 text-xs text-[var(--muted)]">Review each change before concluding that a regulatory requirement has changed.</p></div>
              <select value={eventState} onChange={(e) => setEventState(e.target.value)} aria-label="Filter detected changes" className="rounded-lg border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
                <option value="NEEDS_REVIEW">Impact review needed</option><option value="ACTION_REQUIRED">Action required</option><option value="NO_PRODUCT_IMPACT">No product impact</option><option value="ALL">All detected changes</option>
              </select>
            </div>
            {loading ? <div className="p-10 text-center text-sm text-[var(--muted)]">Loading detected changes…</div> : events.length ? (
              <div className="divide-y divide-[var(--border)]">
                {events.map((event) => (
                  <article key={event.id} className="p-4 sm:p-5">
                    <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><Badge className={priorityClass(event.priority)}>{event.priority}</Badge><Badge className={badgeClass(event.state)}>{EVENT_LABEL[event.state]}</Badge><span className="text-[11px] text-[var(--muted)]">Detected {formatDate(event.detectedAt)}</span></div>
                        <h3 className="mt-2 text-sm font-bold text-[var(--text-primary)]">{event.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{event.summary}</p>
                        {event.changeTypes?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{event.changeTypes.map((type) => <span key={type} className="rounded-md bg-[var(--page-bg)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">{type}</span>)}</div>}
                        {event.changeExcerpt && <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--page-bg)]/40 p-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--text-primary)]">Inspect captured source excerpt</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--muted)]">{event.changeExcerpt}</p></details>}
                        {event.reviewNote && <p className="mt-2 text-xs text-[var(--muted)]">Your company’s impact-review note: {event.reviewNote}</p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--page-bg)]"><ExternalLink className="h-3.5 w-3.5" /> Open registered source</a>
                        {<Button type="button" size="sm" onClick={() => { setReviewTarget(event); setReviewNote(''); setReviewResult('ACTION_REQUIRED'); }}>Review product impact</Button>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="p-10 text-center"><CheckCircle className="mx-auto h-7 w-7 text-emerald-600" /><p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">No events in this view</p><p className="mt-1 text-xs text-[var(--muted)]">No source changes have been detected for this filter. Failed checks remain visible in the source registry.</p></div>}
          </section>
        )}
      </div>

      <Dialog open={!!selectedSourceId} onOpenChange={(open) => { if (!open) { setSelectedSourceId(null); setSourceHistory(null); } }}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Source history</DialogTitle>
            <DialogDescription>Recorded checks and change events for the selected source.</DialogDescription>
          </DialogHeader>
          {historyLoading ? <div className="p-6 text-center text-sm text-[var(--muted)]">Loading source history…</div> : sourceHistory ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-mono text-[var(--muted)]">{sourceHistory.source.sourceId}</p><h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">{sourceHistory.source.sourceName}</h3><p className="mt-1 text-xs text-[var(--muted)]">{sourceHistory.source.jurisdiction} · {sourceHistory.source.regulatoryDomain}</p></div><Badge className={priorityClass(sourceHistory.source.priority)}>{sourceHistory.source.priority}</Badge></div>
                <a href={sourceHistory.source.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--brand-primary)] hover:underline"><ExternalLink className="h-3.5 w-3.5" />{sourceHistory.source.officialUrl}</a>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]"><strong className="text-[var(--text-primary)]">Content to monitor: </strong>{sourceHistory.source.contentToMonitor}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]"><strong className="text-[var(--text-primary)]">Detection method: </strong>{sourceHistory.source.preferredDetectionMethod}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]"><strong className="text-[var(--text-primary)]">Automation notes: </strong>{sourceHistory.source.automationNotes}</p>
                <p className="mt-2 text-xs leading-5 text-amber-800"><strong>Licensing: </strong>{sourceHistory.source.accessLicensingNotes}</p>
              </div>
              <div><h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Check history</h3>{sourceHistory.checks.length ? <div className="space-y-2">{sourceHistory.checks.map((check) => <div key={check.id} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge className={badgeClass(check.status)}>{check.status.replaceAll('_', ' ')}</Badge>{check.httpStatus && <span className="text-[10px] text-[var(--muted)]">HTTP {check.httpStatus}</span>}<span className="text-[10px] text-[var(--muted)]">{check.durationMs} ms</span></div><p className="mt-1 text-xs text-[var(--muted)]">{formatDate(check.completedAt)}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{check.errorMessage || check.summary}</p></div><span className="font-mono text-[10px] text-[var(--muted)]">{check.currentHash ? `${check.currentHash.slice(0, 12)}…` : 'No hash'}</span></div>)}</div> : <p className="rounded-lg bg-[var(--page-bg)] p-4 text-xs text-[var(--muted)]">No checks recorded yet. Run a check to capture the first baseline.</p>}</div>
              <div><h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Change events</h3>{sourceHistory.events.length ? <div className="space-y-2">{sourceHistory.events.map((event) => <div key={event.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center gap-2"><Badge className={badgeClass(event.state)}>{EVENT_LABEL[event.state]}</Badge><span className="text-[10px] text-[var(--muted)]">{formatDate(event.detectedAt)}</span></div><p className="mt-1 text-xs font-semibold text-[var(--text-primary)]">{event.title}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{event.summary}</p></div>)}</div> : <p className="rounded-lg bg-[var(--page-bg)] p-4 text-xs text-[var(--muted)]">No change events recorded for this source.</p>}</div>
            </div>
          ) : <p className="p-6 text-center text-sm text-[var(--muted)]">No source details available.</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSource} onOpenChange={(open) => { if (!open) setEditingSource(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base">Source monitoring settings</DialogTitle><DialogDescription>Use the workbook recommendation by default, or configure a custom interval no slower than weekly.</DialogDescription></DialogHeader>
          {editingSource && <div className="space-y-4">
            <div><p className="text-sm font-semibold text-[var(--text-primary)]">{editingSource.sourceName}</p><p className="mt-1 text-xs text-[var(--muted)]">{editingSource.sourceId} · Suggested: {editingSource.suggestedCheckCadence}</p></div>
            <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={useRecommendedCadence} onChange={(e) => setUseRecommendedCadence(e.target.checked)} className="mt-0.5" /><span><b>Use workbook-recommended cadence</b><span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">Scheduled based on the tutor's suggested cadence, capped at a maximum of seven days. Feed recommendations below one hour use the current one-hour minimum.</span></span></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-[var(--text-primary)]">Custom check interval (days; decimals allowed)</span><input type="number" min="0.0417" max="7" step="0.0417" value={intervalDays} disabled={useRecommendedCadence} onChange={(e) => setIntervalDays(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none disabled:cursor-not-allowed disabled:opacity-50" /><span className="text-[11px] text-[var(--muted)]">Examples: 0.0417 ≈ 1 hour, 0.5 = 12 hours, 1 = daily, 7 = weekly.</span></label>
            <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={sourceEnabled} onChange={(e) => setSourceEnabled(e.target.checked)} /> Enable monitoring for this source</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingSource(null)}>Cancel</Button><Button type="button" onClick={() => void saveSourceSettings()} disabled={savingSource}>{savingSource ? 'Saving…' : 'Save settings'}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => { if (!open) setReviewTarget(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-base">Review source impact on your products</DialogTitle><DialogDescription>This review applies only to your company. It does not change the shared source event or automatically alter an applicability decision.</DialogDescription></DialogHeader>
          {reviewTarget && <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-950">{reviewTarget.sourceName}</p><p className="mt-1 text-xs leading-5 text-amber-900">{reviewTarget.summary}</p><a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-950 underline" href={reviewTarget.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open registered source</a></div>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-[var(--text-primary)]">Review outcome</span><select value={reviewResult} onChange={(e) => setReviewResult(e.target.value as typeof reviewResult)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"><option value="ACTION_REQUIRED">Action required for our products</option><option value="NO_PRODUCT_IMPACT">No impact on our products</option></select></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-[var(--text-primary)]">Review note (required)</span><textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={4} placeholder="Describe which products/markets you reviewed, what the official source says, and why action is or is not required…" className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" /></label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button><Button type="button" onClick={() => void submitEventReview()} disabled={savingReview}>{savingReview ? 'Saving…' : 'Save review outcome'}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
