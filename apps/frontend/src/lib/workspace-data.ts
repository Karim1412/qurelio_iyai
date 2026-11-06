import {
  documentApi,
  evaluationApi,
  auditApi,
  ncApi,
  productApi,
  companyApi,
  normalizeCompanyUsersResponse,
} from '@/lib/api';

export type TimedEntity = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  classification?: string;
  severity?: string;
  type?: string;
  approvalStatus?: string | null;
  libraryStatus?: string | null;
  title?: string;
  name?: string;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  capaActions?: CapaRow[];
  assignedTo?: string | null;
  description?: string;
  isoStandard?: string | null;
  source?: string;
};

export type CapaRow = {
  id: string;
  title: string;
  dueDate: string;
  actionStatus?: string;
  assignedTo?: string;
};

export type ChartSlice = { name: string; value: number; color: string };

export type ComplianceTrendRow = {
  month: string;
  compliance: number;
  audits: number;
  nc: number;
};

export type AnalyticsKpi = {
  label: string;
  value: number;
  delta: string;
  trend: 'up' | 'down';
  spark: number[];
};

export type WorkspaceSnapshot = {
  docs: TimedEntity[];
  evals: TimedEntity[];
  audits: TimedEntity[];
  ncs: TimedEntity[];
  products: TimedEntity[];
  ncKpis: {
    total?: number;
    overdueCAPAs?: number;
    byStatus?: Array<{ status?: string; nc_status?: string; count?: string | number }>;
  } | null;
  userLabels: Record<string, string>;
};

export function entityTs(item: TimedEntity): number {
  return new Date(item.updatedAt || item.createdAt || 0).getTime();
}

export function computeMonthlyBuckets(endTs: number, count: number) {
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

function pctChange(current: number, previous: number): { delta: string; trend: 'up' | 'down' } {
  if (previous <= 0) {
    if (current <= 0) return { delta: '0%', trend: 'up' };
    return { delta: '+100%', trend: 'up' };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return {
    delta: `${rounded >= 0 ? '+' : ''}${rounded}%`,
    trend: rounded >= 0 ? 'up' : 'down',
  };
}

function sparkFromMonthly(counts: number[]): number[] {
  if (!counts.length) return [0, 0, 0, 0, 0, 0];
  const max = Math.max(...counts, 1);
  return counts.map((c) => Math.round((c / max) * 100));
}

export async function fetchWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [docsR, evalsR, auditsR, ncListR, ncKpisR, productsR, usersR] = await Promise.allSettled([
    documentApi.list(),
    evaluationApi.list(),
    auditApi.list(),
    ncApi.list(),
    ncApi.kpis(),
    productApi.list(),
    companyApi.getUsers(),
  ]);

  const docs = docsR.status === 'fulfilled' && Array.isArray(docsR.value.data) ? docsR.value.data : [];
  const evals = evalsR.status === 'fulfilled' && Array.isArray(evalsR.value.data) ? evalsR.value.data : [];
  const audits = auditsR.status === 'fulfilled' && Array.isArray(auditsR.value.data) ? auditsR.value.data : [];
  const ncs = ncListR.status === 'fulfilled' && Array.isArray(ncListR.value.data) ? ncListR.value.data : [];
  const products =
    productsR.status === 'fulfilled' && Array.isArray(productsR.value.data) ? productsR.value.data : [];
  const ncKpis = ncKpisR.status === 'fulfilled' ? ncKpisR.value.data : null;

  const userLabels: Record<string, string> = {};
  if (usersR.status === 'fulfilled') {
    const { users } = normalizeCompanyUsersResponse(usersR.value.data);
    for (const u of users as Array<{
      id?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    }>) {
      if (!u.id) continue;
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
      userLabels[u.id] = name || u.email || u.id;
    }
  }

  return { docs, evals, audits, ncs, products, ncKpis, userLabels };
}

const DOC_STATUS_COLORS: Record<string, string> = {
  READY: '#118D57',
  PROCESSING: '#1B1BF5',
  UPLOADED: '#B76E00',
  UPLOADING: '#B76E00',
  FAILED: '#DC2626',
};

const APPROVAL_COLORS: Record<string, string> = {
  APPROVED: '#118D57',
  IN_REVIEW: '#1B1BF5',
  DRAFT: '#B76E00',
  REJECTED: '#DC2626',
};

const NC_CLASS_COLORS: Record<string, string> = {
  CRITICAL: '#DC2626',
  MAJOR: '#B76E00',
  MINOR: '#1B1BF5',
};

export function buildDocumentStatusSlices(docs: TimedEntity[]): ChartSlice[] {
  const byApproval: Record<string, number> = {};
  const byProcessing: Record<string, number> = {};
  for (const d of docs) {
    const appr = String(d.approvalStatus || '').toUpperCase();
    if (appr) byApproval[appr] = (byApproval[appr] || 0) + 1;
    const st = String(d.status || 'UPLOADED').toUpperCase();
    byProcessing[st] = (byProcessing[st] || 0) + 1;
  }
  const source = Object.keys(byApproval).length ? byApproval : byProcessing;
  const colorMap = Object.keys(byApproval).length ? APPROVAL_COLORS : DOC_STATUS_COLORS;
  return Object.entries(source)
    .map(([name, value]) => ({
      name: name.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      value,
      color: colorMap[name] || '#94A3B8',
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function buildNcSeveritySlices(ncs: TimedEntity[]): ChartSlice[] {
  const by: Record<string, number> = {};
  for (const n of ncs) {
    const key = String(n.classification || n.severity || 'MINOR').toUpperCase();
    by[key] = (by[key] || 0) + 1;
  }
  return ['CRITICAL', 'MAJOR', 'MINOR']
    .filter((k) => by[k])
    .map((k) => ({
      name: k.charAt(0) + k.slice(1).toLowerCase(),
      value: by[k],
      color: NC_CLASS_COLORS[k] || '#94A3B8',
    }));
}

export function buildComplianceTrend(docs: TimedEntity[], audits: TimedEntity[], ncs: TimedEntity[]): ComplianceTrendRow[] {
  const buckets = computeMonthlyBuckets(Date.now(), 12);
  return buckets.map(({ start, end, label }) => {
    const docInB = docs.filter((d) => {
      const t = entityTs(d);
      return t >= start && t <= end;
    });
    const audInB = audits.filter((a) => {
      const t = entityTs(a);
      return t >= start && t <= end;
    });
    const ncInB = ncs.filter((n) => {
      const t = entityTs(n);
      return t >= start && t <= end;
    });
    const docReady = docInB.length
      ? Math.round((docInB.filter((d) => d.status === 'READY').length / docInB.length) * 100)
      : 0;
    const audDone = audInB.length
      ? Math.round((audInB.filter((a) => a.status === 'COMPLETED').length / audInB.length) * 100)
      : 0;
    const ncClosed = ncInB.length
      ? Math.round((ncInB.filter((n) => n.status === 'CLOSED').length / ncInB.length) * 100)
      : 0;
    const compliance = Math.round(docReady * 0.4 + audDone * 0.3 + ncClosed * 0.3);
    return {
      month: label,
      compliance,
      audits: audInB.length,
      nc: ncInB.filter((n) => n.status !== 'CLOSED' && n.status !== 'REJECTED').length,
    };
  });
}

export function buildAnalyticsKpis(snapshot: WorkspaceSnapshot): AnalyticsKpi[] {
  const { docs, audits, ncs, products } = snapshot;
  const buckets = computeMonthlyBuckets(Date.now(), 6);
  const prev = buckets[buckets.length - 2];
  const cur = buckets[buckets.length - 1];

  const countIn = (items: TimedEntity[], b: { start: number; end: number }) =>
    items.filter((x) => {
      const t = entityTs(x);
      return t >= b.start && t <= b.end;
    }).length;

  const activeDocs = docs.filter((d) => !d.libraryStatus || d.libraryStatus !== 'ARCHIVED').length;
  const completedAudits = audits.filter((a) => a.status === 'COMPLETED').length;
  const openNc = ncs.filter((n) => n.status !== 'CLOSED' && n.status !== 'REJECTED').length;
  const productCount = products.filter(
    (p) => !(p as { archivedAt?: string | null }).archivedAt,
  ).length;

  const docSpark = sparkFromMonthly(buckets.map((b) => countIn(docs, b)));
  const audSpark = sparkFromMonthly(buckets.map((b) => countIn(audits.filter((a) => a.status === 'COMPLETED'), b)));
  const ncSpark = sparkFromMonthly(
    buckets.map((b) =>
      ncs.filter((n) => {
        const t = entityTs(n);
        return t >= b.start && t <= b.end && n.status !== 'CLOSED' && n.status !== 'REJECTED';
      }).length,
    ),
  );
  const prodSpark = sparkFromMonthly(buckets.map((b) => countIn(products, b)));

  const docDelta = pctChange(countIn(docs, cur), countIn(docs, prev));
  const audDelta = pctChange(
    countIn(
      audits.filter((a) => a.status === 'COMPLETED'),
      cur,
    ),
    countIn(
      audits.filter((a) => a.status === 'COMPLETED'),
      prev,
    ),
  );
  const ncDelta = pctChange(openNc, countIn(ncs.filter((n) => n.status !== 'CLOSED'), prev));
  const prodDelta = pctChange(productCount, countIn(products, prev));

  return [
    {
      label: 'Active Documents',
      value: activeDocs,
      delta: docDelta.delta,
      trend: docDelta.trend,
      spark: docSpark,
    },
    {
      label: 'Audits Completed',
      value: completedAudits,
      delta: audDelta.delta,
      trend: audDelta.trend,
      spark: audSpark,
    },
    {
      label: 'Open Non-Conformities',
      value: openNc,
      delta: ncDelta.delta,
      trend: ncDelta.trend === 'up' ? 'down' : 'up',
      spark: ncSpark,
    },
    {
      label: 'Products Tracked',
      value: productCount,
      delta: prodDelta.delta,
      trend: prodDelta.trend,
      spark: prodSpark,
    },
  ];
}

export function buildEvaluationsByStatus(evals: TimedEntity[]): Array<{ team: string; completed: number; pending: number }> {
  const by: Record<string, { completed: number; pending: number }> = {};
  for (const e of evals) {
    const st = String(e.status || 'QUEUED').toUpperCase();
    const team = String(e.isoStandard || 'General').slice(0, 24);
    if (!by[team]) by[team] = { completed: 0, pending: 0 };
    if (st === 'COMPLETED') by[team].completed += 1;
    else by[team].pending += 1;
  }
  return Object.entries(by)
    .map(([team, v]) => ({ team, ...v }))
    .sort((a, b) => b.completed + b.pending - (a.completed + a.pending))
    .slice(0, 8);
}

export type CalendarBackendEvent = {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  color: 'sky' | 'violet' | 'rose' | 'emerald' | 'amber' | 'teal';
  source: 'audit' | 'capa';
  href: string;
};

const AUDIT_STATUS_COLOR: Record<string, CalendarBackendEvent['color']> = {
  PLANNED: 'sky',
  IN_PROGRESS: 'amber',
  COMPLETED: 'emerald',
  CANCELLED: 'rose',
};

export function buildCalendarEvents(
  audits: TimedEntity[],
  ncs: TimedEntity[],
): CalendarBackendEvent[] {
  const out: CalendarBackendEvent[] = [];

  for (const a of audits) {
    const startRaw = a.scheduledAt || a.createdAt;
    if (!startRaw) continue;
    const start = new Date(startRaw);
    let end: Date;
    if (a.scheduledEndAt) {
      end = new Date(a.scheduledEndAt);
    } else {
      end = new Date(start);
      end.setHours(end.getHours() + 2);
    }
    const allDay =
      start.getHours() === 0 &&
      start.getMinutes() === 0 &&
      (!a.scheduledEndAt || end.getTime() - start.getTime() >= 23 * 3600000);
    out.push({
      id: `audit-${a.id}`,
      title: String(a.title || 'Audit'),
      description: a.status ? `Status: ${String(a.status).replace(/_/g, ' ')}` : undefined,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
      color: AUDIT_STATUS_COLOR[String(a.status || 'PLANNED').toUpperCase()] || 'sky',
      source: 'audit',
      href: `/audits`,
    });
  }

  for (const nc of ncs) {
    for (const capa of nc.capaActions || []) {
      if (!capa.dueDate) continue;
      const due = new Date(capa.dueDate);
      const end = new Date(due);
      end.setHours(end.getHours() + 1);
      out.push({
        id: `capa-${capa.id}`,
        title: `CAPA: ${capa.title}`,
        description: nc.title ? `NC: ${nc.title}` : undefined,
        start: due.toISOString(),
        end: end.toISOString(),
        allDay: false,
        color: capa.actionStatus === 'DONE' ? 'emerald' : 'rose',
        source: 'capa',
        href: `/nc`,
      });
    }
  }

  return out;
}

export const NC_KANBAN_COLUMNS = [
  { id: 'OPEN', label: 'Open', accent: 'slate' as const },
  { id: 'ROOT_CAUSE_ANALYSIS', label: 'Root cause', accent: 'sky' as const },
  { id: 'CAPA_DEFINED', label: 'CAPA plan', accent: 'amber' as const },
  { id: 'IN_PROGRESS', label: 'In progress', accent: 'violet' as const },
  { id: 'PENDING_VERIFICATION', label: 'Verification', accent: 'teal' as const },
  { id: 'CLOSED', label: 'Closed / rejected', accent: 'emerald' as const },
];

export function ncColumnForStatus(status: string): string {
  if (status === 'REJECTED') return 'CLOSED';
  return NC_KANBAN_COLUMNS.some((c) => c.id === status) ? status : 'OPEN';
}

export function classificationPriority(classification?: string): 'low' | 'medium' | 'high' | 'urgent' {
  const c = String(classification || 'MINOR').toUpperCase();
  if (c === 'CRITICAL') return 'urgent';
  if (c === 'MAJOR') return 'high';
  return 'medium';
}

/** Apply a workflow transition when dragging an NC card between columns. */
export async function transitionNcStatus(
  ncId: string,
  from: string,
  to: string,
): Promise<{ ok: boolean; message?: string }> {
  if (from === to) return { ok: true };
  try {
    if (from === 'OPEN' && to === 'ROOT_CAUSE_ANALYSIS') {
      await ncApi.startRca(ncId);
      return { ok: true };
    }
    if (from === 'CAPA_DEFINED' && to === 'IN_PROGRESS') {
      await ncApi.startCapa(ncId);
      return { ok: true };
    }
    return {
      ok: false,
      message:
        'This status change must be done from the NC page (add CAPA actions, verification, etc.).',
    };
  } catch (err: unknown) {
    const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return { ok: false, message: typeof m === 'string' ? m : 'Could not update NC status' };
  }
}
