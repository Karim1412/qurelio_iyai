'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  FileText,
  LineChart,
  AlertTriangle,
  ClipboardCheck,
  Bot,
  BarChart3,
  Building2,
  Users,
  ScrollText,
  UserCircle,
  Package,
  BookOpen,
  type LucideIcon,
} from '@/components/icons';
import { cn } from '@/utils/cn';
import { useSidebarPreviewStore } from '@/lib/sidebar-preview-store';
import { useAuthStore } from '@/lib/auth-store';
import {
  adminApi,
  documentApi,
  evaluationApi,
  ncApi,
  auditApi,
  productApi,
} from '@/lib/api';
import { Input } from '@/components/ui/input';

type Hit = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: string;
  Icon: LucideIcon;
};

type PreviewAccent = 'sky' | 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'teal';

interface PreviewSpec {
  title: string;
  description: string;
  accent: PreviewAccent;
  /** Short list of representative items shown inside the preview. */
  samples: string[];
  /** Optional small badge in the upper right (e.g. "12 active"). */
  badge?: string;
  /** Optional real screenshot: when set, replaces the synthetic icon hero. */
  image?: string;
}

const PREVIEW_BY_PATH: Record<string, PreviewSpec> = {
  '/dashboard': {
    title: 'My Dashboard',
    description: 'KPIs, latest activity and quick links to your workspace.',
    accent: 'sky',
    samples: ['Compliance score 92%', 'Pending audits · 4', 'Open NCs · 12', 'Documents in review'],
    badge: 'Overview',
    image: '/previews/dashboard.jpg',
  },
  '/docs': {
    title: 'My File Library',
    description: 'Browse, upload and manage every product & standard document.',
    accent: 'indigo',
    samples: ['ISO 13485 · Quality Manual.pdf', 'Risk Management Plan.docx', 'Supplier Audit Report.xlsx', 'Validation Protocol v2.pdf'],
    badge: '1.2k files',
    image: '/previews/file-library.jpg',
  },
  '/docs?view=product': {
    title: 'Products Management',
    description: 'Every product folder, its specs and linked documents.',
    accent: 'violet',
    samples: ['Cardio Monitor X3', 'Infusion Pump Pro', 'Glucose Sensor v2', 'Diagnostic Kit DX-12'],
    badge: '86 products',
    image: '/previews/products.jpg',
  },
  '/docs?view=standard': {
    title: 'Standards & Regulations',
    description: 'The complete catalogue of normative references.',
    accent: 'teal',
    samples: ['ISO 13485:2016', 'ISO 14971:2019', 'EU MDR 2017/745', 'IEC 62366-1:2015'],
    badge: '42 standards',
    image: '/previews/standard.jpg',
  },
  '/evaluations': {
    title: 'Compliance Engine',
    description: 'Conformity score per requirement, traceability, gap analysis.',
    accent: 'violet',
    samples: ['Risk Management · 94%', 'Design Controls · 88%', 'CAPA Process · 91%', 'Post-Market Surveillance'],
    image: '/previews/compliance.jpg',
  },
  '/audits': {
    title: 'Audits',
    description: 'Plan, run and track internal & external audits end-to-end.',
    accent: 'emerald',
    samples: ['Q2-2026 Internal Audit', 'Supplier Audit · ACME', 'Certification · Notified Body', 'Follow-up · Production Line'],
    badge: '6 active',
    image: '/previews/audit.jpg',
  },
  '/nc': {
    title: 'Non-Conformities',
    description: 'Track NCs, CAPA actions and root-cause analyses.',
    accent: 'amber',
    samples: ['NC-2026-014 · Major', 'NC-2026-013 · Minor', 'NC-2026-012 · Observation', 'NC-2026-011 · Critical'],
    badge: '47 open',
    image: '/previews/nc.jpg',
  },
  '/reports': {
    title: 'Reports',
    description: 'Generated reports, exports and management reviews.',
    accent: 'sky',
    samples: ['Management Review · 2026 Q1', 'Audit Summary · March', 'NC Trend Report', 'Training Coverage'],
    image: '/previews/analytics.jpg',
  },
  '/analytics': {
    title: 'Analytics',
    description: 'Charts, trends and KPIs across every quality module.',
    accent: 'indigo',
    samples: ['Compliance trend · 12 months', 'Document status donut', 'Audits vs NCs', 'Training by team'],
    badge: 'Live',
    image: '/previews/analytics.jpg',
  },
  '/calendar': {
    title: 'Calendar',
    description: 'Audits, training deadlines, reviews, all in one timeline.',
    accent: 'teal',
    samples: ['Internal audit · May 18', 'ISO 13485 training · May 22', 'CAPA review · May 27', 'Mgmt review · Jun 03'],
    image: '/previews/calendar.jpg',
  },
  '/kanban': {
    title: 'Kanban',
    description: 'Tasks across To-do, In progress, Review and Done.',
    accent: 'violet',
    samples: ['Update SOP-012', 'Close NC-2026-009', 'Prep audit checklist', 'Review supplier file'],
    image: '/previews/kanban.jpg',
  },
  '/company': {
    title: 'My Company',
    description: 'Company profile, departments, sites and certifications.',
    accent: 'emerald',
    samples: ['Profile & branding', 'Departments · 8', 'Sites · 3', 'Active certifications'],
    image: '/previews/user.jpg',
  },
  '/company/users': {
    title: 'User Management',
    description: 'Invite, assign roles and manage permissions.',
    accent: 'sky',
    samples: ['Quality Director · 1', 'Auditors · 4', 'Editors · 12', 'Viewers · 38'],
    image: '/previews/user.jpg',
  },
  '/rag-chat': {
    title: 'AI Assistant',
    description: 'Ask questions about your quality data, get instant answers.',
    accent: 'rose',
    samples: ['“Show me open NCs by severity”', '“Latest audit findings”', '“ISO 13485 §7.5 summary”', '“Documents expiring soon”'],
    badge: 'Beta',
  },
  '/training/my': {
    title: 'My Training',
    description: 'Assigned trainings, progress and certificates.',
    accent: 'violet',
    samples: ['ISO 13485 awareness', 'GDP refresher', 'Cybersecurity basics', 'Risk Management 101'],
  },
  '/training/organization': {
    title: 'Organization Training',
    description: 'Company-wide training programs and assignments.',
    accent: 'indigo',
    samples: ['Quality · 92% completed', 'Production · 78%', 'R&D · 85%', 'Logistics · 68%'],
  },
  '/training/rules': {
    title: 'Training Rules',
    description: 'Define auto-assignments by role, function or product.',
    accent: 'teal',
    samples: ['Director onboarding pack', 'New auditor mandatory', 'Production change rule', 'Annual refresher'],
  },
  '/admin/companies': {
    title: 'Organizations',
    description: 'Manage tenant companies on the platform.',
    accent: 'rose',
    samples: ['MedTech Innovations Inc.', 'Bio Devices SA', 'Pharma Logistics Ltd.', 'Surgical Pro GmbH'],
  },
  '/profile': {
    title: 'Account & Profile',
    description: 'Personal info, preferences, security and notifications.',
    accent: 'amber',
    samples: ['Personal info', 'Password & 2FA', 'Notification settings', 'Sessions & devices'],
  },
  '/activity-log': {
    title: 'Activity Log',
    description: 'Audit-grade trail of every change in your workspace.',
    accent: 'sky',
    samples: ['Document approved · 2 min', 'NC opened · 18 min', 'Audit scheduled · 1 h', 'User invited · 3 h'],
  },
};

function lookupPreview(href: string): PreviewSpec | null {
  if (PREVIEW_BY_PATH[href]) return PREVIEW_BY_PATH[href];
  // Try path-only (strip query)
  const pathOnly = href.split('?')[0];
  if (PREVIEW_BY_PATH[pathOnly]) return PREVIEW_BY_PATH[pathOnly];
  // Try longest matching prefix
  const keys = Object.keys(PREVIEW_BY_PATH).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (href.startsWith(k) || pathOnly.startsWith(k)) return PREVIEW_BY_PATH[k];
  }
  return null;
}

const ACCENT_STYLES: Record<PreviewAccent, { grad: string; ring: string; chip: string; text: string }> = {
  sky:     { grad: 'from-sky-400/25 to-indigo-400/15',      ring: 'ring-sky-400/30',     chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',         text: 'text-sky-700 dark:text-sky-300' },
  indigo:  { grad: 'from-indigo-400/25 to-violet-400/15',   ring: 'ring-indigo-400/30',  chip: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300', text: 'text-indigo-700 dark:text-indigo-300' },
  emerald: { grad: 'from-emerald-400/25 to-teal-400/15',    ring: 'ring-emerald-400/30', chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', text: 'text-emerald-700 dark:text-emerald-300' },
  amber:   { grad: 'from-amber-400/25 to-orange-400/15',    ring: 'ring-amber-400/30',   chip: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',   text: 'text-amber-700 dark:text-amber-300' },
  violet:  { grad: 'from-violet-400/25 to-fuchsia-400/15',  ring: 'ring-violet-400/30',  chip: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', text: 'text-violet-700 dark:text-violet-300' },
  rose:    { grad: 'from-rose-400/25 to-pink-400/15',       ring: 'ring-rose-400/30',    chip: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',       text: 'text-rose-700 dark:text-rose-300' },
  teal:    { grad: 'from-teal-400/25 to-cyan-400/15',       ring: 'ring-teal-400/30',    chip: 'bg-teal-500/12 text-teal-700 dark:text-teal-300',       text: 'text-teal-700 dark:text-teal-300' },
};

function SearchPreviewCard({
  hit,
  spec,
  anchorRect,
  preferRight = true,
}: {
  hit: Hit;
  spec: PreviewSpec;
  anchorRect: DOMRect;
  preferRight?: boolean;
}) {
  const Icon = hit.Icon;
  const accent = ACCENT_STYLES[spec.accent];
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(spec.image) && !imgFailed;

  // Reset failure flag when the spec changes
  useEffect(() => {
    setImgFailed(false);
  }, [spec.image]);

  const CARD_W = 280;
  const CARD_H = 230; // hero (180) + title row (~50)
  const MARGIN = 12;
  const PAD = 8;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;

  // ── Horizontal placement ───────────────────────────────────────────────
  let left = preferRight
    ? anchorRect.right + MARGIN
    : anchorRect.left - CARD_W - MARGIN;
  if (preferRight && left + CARD_W > viewportW - PAD) {
    left = anchorRect.left - CARD_W - MARGIN;
  }
  if (left < PAD) left = PAD;
  if (left + CARD_W > viewportW - PAD) left = viewportW - CARD_W - PAD;

  // ── Vertical placement: try to center on anchor, then clamp ────────────
  let top = anchorRect.top + anchorRect.height / 2 - CARD_H / 2;
  if (top < PAD) top = PAD;
  if (top + CARD_H > viewportH - PAD) top = viewportH - CARD_H - PAD;

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] animate-in fade-in zoom-in-95 duration-200"
      style={{ left, top, width: CARD_W }}
    >
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[0_20px_60px_-12px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.08)] backdrop-blur">
        {/* Hero visual: real screenshot when available, else synthetic icon */}
        <div className={cn('relative h-44 w-full overflow-hidden bg-gradient-to-br', accent.grad)}>
          {showImage && spec.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={spec.image}
              src={spec.image}
              alt={spec.title}
              className="absolute inset-0 z-[1] h-full w-full object-cover"
              draggable={false}
              onError={() => setImgFailed(true)}
            />
          )}
          {!showImage && (
            <>
              <div className="absolute inset-0 opacity-60 [background:radial-gradient(160px_80px_at_20%_20%,rgba(255,255,255,0.7),transparent_60%),radial-gradient(180px_90px_at_85%_80%,rgba(255,255,255,0.45),transparent_60%)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn('flex h-20 w-20 items-center justify-center rounded-3xl bg-white/80 ring-1 ring-inset shadow-md backdrop-blur-sm dark:bg-white/[0.08]', accent.ring)}>
                  <Icon className={cn('h-10 w-10', accent.text)} strokeWidth={1.5} />
                </span>
              </div>
            </>
          )}
          {spec.badge && (
            <span className={cn('absolute right-3 top-3 z-[2] rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold backdrop-blur-sm shadow-sm', accent.chip)}>
              {spec.badge}
            </span>
          )}
        </div>

        {/* Title only */}
        <div className="px-4 py-3">
          <h4 className="truncate text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
            {spec.title}
          </h4>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function norm(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function matchesQuery(q: string, ...parts: (string | undefined)[]): boolean {
  const needle = norm(q);
  if (!needle) return true;
  return parts.some((p) => norm(p).includes(needle));
}

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  const d = data as { data?: unknown };
  if (Array.isArray(d?.data)) return d.data as T[];
  return [];
}

export function SidebarGlobalSearch({
  onNavigate,
  variant = 'sidebar',
}: {
  onNavigate?: () => void;
  variant?: 'sidebar' | 'topbar';
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const role = user?.role ?? '';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteHits, setRemoteHits] = useState<Hit[]>([]);
  const [hoveredHitId, setHoveredHitId] = useState<string | null>(null);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const staticHits = useMemo(() => {
    const q = debounced;
    if (!q) return [] as Hit[];

    const all: Hit[] = [];

    const push = (h: Omit<Hit, 'id'> & { id?: string }) => {
      all.push({ ...h, id: h.id ?? `${h.href}-${h.label}` });
    };

    if (matchesQuery(q, 'dashboard', 'overview', 'home')) {
      push({
        label: 'Dashboard',
        sub: 'Overview',
        href: '/dashboard',
        group: 'Pages',
        Icon: LayoutDashboard,
      });
    }
    if (matchesQuery(q, 'profile', 'account', 'settings')) {
      push({
        label: 'Account & profile',
        href: '/profile',
        group: 'Pages',
        Icon: UserCircle,
      });
    }
    if (matchesQuery(q, 'activity', 'log', 'history')) {
      push({
        label: 'Activity log',
        href: '/activity-log',
        group: 'Pages',
        Icon: ScrollText,
      });
    }

    if (role === 'SUPER_ADMIN') {
      if (matchesQuery(q, 'company', 'companies', 'organization', 'admin', 'tenant')) {
        push({
          label: 'Organizations',
          sub: 'Company management',
          href: '/admin/companies',
          group: 'Admin',
          Icon: Building2,
        });
      }
    } else {
      if (matchesQuery(q, 'document', 'library', 'file', 'pdf', 'product', 'standard', 'iso')) {
        push({ label: 'File library', sub: 'All files', href: '/docs', group: 'Quality', Icon: FileText });
        push({
          label: 'Product documents',
          href: '/docs?view=product',
          group: 'Quality',
          Icon: Package,
        });
        push({
          label: 'Standard documents',
          href: '/docs?view=standard',
          group: 'Quality',
          Icon: BookOpen,
        });
      }
      if (matchesQuery(q, 'report', 'reports')) {
        push({
          label: 'Reports',
          href: '/docs',
          group: 'Quality',
          Icon: BarChart3,
        });
      }
      if (matchesQuery(q, 'evaluation', 'conformity', 'score')) {
        push({
          label: 'Evaluations',
          href: '/evaluations',
          group: 'Quality',
          Icon: LineChart,
        });
      }
      if (matchesQuery(q, 'non', 'conformity', 'nc', 'capa')) {
        push({
          label: 'Non-conformities',
          href: '/nc',
          group: 'Quality',
          Icon: AlertTriangle,
        });
      }
      if (matchesQuery(q, 'audit')) {
        push({
          label: 'Audits',
          href: '/audits',
          group: 'Quality',
          Icon: ClipboardCheck,
        });
      }
      if (matchesQuery(q, 'ai', 'assistant', 'chat', 'rag')) {
        push({
          label: 'AI assistant',
          href: '/rag-chat',
          group: 'Quality',
          Icon: Bot,
        });
      }
      if (role === 'DIRECTOR' && matchesQuery(q, 'user', 'team', 'invite', 'people', 'company')) {
        push({
          label: 'My company',
          href: '/company/users',
          group: 'Overview',
          Icon: Users,
        });
      }
    }

    const seen = new Set<string>();
    return all.filter((h) => {
      const k = `${h.href}|${h.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [debounced, role]);

  const runRemote = useCallback(async () => {
    const q = debounced;
    if (!q || q.length < 2 || !user || role === 'SUPER_ADMIN') {
      setRemoteHits([]);
      return;
    }

    setLoading(true);
    try {
      const [docsR, evalsR, ncsR, auditsR, productsR] = await Promise.allSettled([
        documentApi.list(),
        evaluationApi.list(),
        ncApi.list(),
        auditApi.list(),
        productApi.list(),
      ]);

      const next: Hit[] = [];

      if (docsR.status === 'fulfilled') {
        const rows = asArray<{ id: string; name?: string }>(docsR.value.data);
        for (const d of rows) {
          if (matchesQuery(q, d.name, d.id)) {
            next.push({
              id: `doc-${d.id}`,
              label: d.name || 'Untitled document',
              sub: 'Document · open library',
              href: '/docs',
              group: 'Your workspace',
              Icon: FileText,
            });
          }
        }
      }

      if (evalsR.status === 'fulfilled') {
        const rows = asArray<{ id: string; name?: string; isoStandard?: string }>(evalsR.value.data);
        for (const e of rows) {
          const label = [e.isoStandard, e.name].filter(Boolean).join(' · ') || e.id;
          if (matchesQuery(q, label, e.isoStandard, e.name, e.id)) {
            next.push({
              id: `eval-${e.id}`,
              label: label.slice(0, 120),
              sub: 'Evaluation',
              href: `/evaluations/${e.id}`,
              group: 'Your workspace',
              Icon: LineChart,
            });
          }
        }
      }

      if (ncsR.status === 'fulfilled') {
        const rows = asArray<{ id: string; title?: string; reference?: string }>(ncsR.value.data);
        for (const n of rows) {
          const label = n.title || n.reference || n.id;
          if (matchesQuery(q, label, n.reference, n.title)) {
            next.push({
              id: `nc-${n.id}`,
              label,
              sub: 'Non-conformity · open list',
              href: '/nc',
              group: 'Your workspace',
              Icon: AlertTriangle,
            });
          }
        }
      }

      if (auditsR.status === 'fulfilled') {
        const rows = asArray<{ id: string; title?: string; reference?: string }>(auditsR.value.data);
        for (const a of rows) {
          const label = a.title || a.reference || a.id;
          if (matchesQuery(q, label, a.reference, a.title)) {
            next.push({
              id: `audit-${a.id}`,
              label,
              sub: 'Audit · open list',
              href: '/audits',
              group: 'Your workspace',
              Icon: ClipboardCheck,
            });
          }
        }
      }

      if (productsR.status === 'fulfilled') {
        const rows = asArray<{ id: string; name?: string; sku?: string }>(productsR.value.data);
        for (const p of rows) {
          if (matchesQuery(q, p.name, p.sku, p.id)) {
            next.push({
              id: `prod-${p.id}`,
              label: p.name || p.sku || 'Product',
              sub: 'Product documents',
              href: '/docs?view=product',
              group: 'Your workspace',
              Icon: Package,
            });
          }
        }
      }

      setRemoteHits(next.slice(0, 25));
    } catch {
      setRemoteHits([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, user, role]);

  const runRemoteAdmin = useCallback(async () => {
    const q = debounced;
    if (!q || q.length < 2 || role !== 'SUPER_ADMIN') {
      setRemoteHits([]);
      return;
    }

    setLoading(true);
    try {
      const res = await adminApi.getCompanies();
      const rows = asArray<{ id: string; name?: string; email?: string; field?: string }>(res.data);
      const next: Hit[] = [];
      for (const c of rows) {
        if (matchesQuery(q, c.name, c.email, c.field, c.id)) {
          next.push({
            id: `co-${c.id}`,
            label: c.name || c.email || 'Company',
            sub: c.email,
            href: `/admin/companies`,
            group: 'Organizations',
            Icon: Building2,
          });
        }
      }
      setRemoteHits(next.slice(0, 25));
    } catch {
      setRemoteHits([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, role]);

  useEffect(() => {
    if (role === 'SUPER_ADMIN') {
      void runRemoteAdmin();
    } else {
      void runRemote();
    }
  }, [role, runRemote, runRemoteAdmin]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const grouped = useMemo(() => {
    const hits = [...staticHits, ...remoteHits];
    const map = new Map<string, Hit[]>();
    for (const h of hits) {
      const g = h.group;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(h);
    }
    return map;
  }, [staticHits, remoteHits]);

  const hasResults = grouped.size > 0;
  const showPanel = open && debounced.length > 0;

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    onNavigate?.();
    router.push(href);
  };

  const isTopbar = variant === 'topbar';

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative',
        isTopbar
          ? open
            ? 'w-56 md:w-72 lg:w-80'
            : 'w-auto'
          : 'px-3 pb-3',
      )}
    >
      {/* ── Pill trigger button (closed state: compact) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-full text-[var(--muted)]',
            'transition-hover hover:bg-[var(--topbar-hover)]',
            'px-3',
          )}
          aria-label="Search (⌘K)"
        >
          <Search className="h-5 w-5 shrink-0" aria-hidden />
          <kbd
            className={cn(
              'hidden md:inline-flex items-center gap-0.5 rounded-md',
              'border border-[var(--border)] bg-[var(--surface-elevated,var(--surface))]',
              'px-1.5 py-0.5 text-[11px] font-medium',
              'leading-none',
            )}
            aria-hidden
          >
            <span className="text-[13px] leading-none">⌘</span>K
          </kbd>
        </button>
      )}

      {/* ── Expanded search input (open state) ── */}
      {open && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className={cn(
              'h-10 rounded-xl border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm placeholder:text-[var(--muted)]',
              isTopbar && 'w-full',
            )}
            aria-label="Search across the app"
            autoComplete="off"
          />
        </div>
      )}

      {/* ── Results dropdown ── */}
      {showPanel && (
        <div
          className={cn(
            'absolute z-50 max-h-[min(70vh,22rem)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-2 shadow-xl shadow-black/20',
            isTopbar
              ? 'right-0 top-[calc(100%+6px)] w-[min(22rem,90vw)]'
              : 'left-3 right-3 top-[calc(100%+4px)]',
          )}
          role="listbox"
        >
          {loading && debounced.length >= 2 && (
            <p className="px-3 pb-2 text-[11px] text-[var(--muted)]">Searching…</p>
          )}
          {!hasResults && !loading && (
            <p className="px-3 py-4 text-center text-sm text-[var(--muted)]">No matches</p>
          )}
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group} className="mb-2 last:mb-0">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((h) => {
                  const Icon = h.Icon;
                  const spec = lookupPreview(h.href);
                  const isHovered = hoveredHitId === h.id;
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-hover',
                          'hover:bg-[var(--nav-hover)]',
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          go(h.href);
                        }}
                        onMouseEnter={(e) => {
                          if (previewTimer.current) clearTimeout(previewTimer.current);
                          const rect = e.currentTarget.getBoundingClientRect();
                          // Broadcast hover to the dashboard's TV preview banner.
                          useSidebarPreviewStore.getState().setHoveredHref(h.href);
                          previewTimer.current = setTimeout(() => {
                            setHoveredHitId(h.id);
                            setHoveredRect(rect);
                          }, 160);
                        }}
                        onMouseLeave={() => {
                          if (previewTimer.current) clearTimeout(previewTimer.current);
                          useSidebarPreviewStore.getState().setHoveredHref(null);
                          previewTimer.current = setTimeout(() => {
                            setHoveredHitId(null);
                            setHoveredRect(null);
                          }, 120);
                        }}
                        onFocus={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          useSidebarPreviewStore.getState().setHoveredHref(h.href);
                          setHoveredHitId(h.id);
                          setHoveredRect(rect);
                        }}
                        onBlur={() => {
                          useSidebarPreviewStore.getState().setHoveredHref(null);
                          setHoveredHitId(null);
                          setHoveredRect(null);
                        }}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 font-medium text-[var(--text-primary)]">{h.label}</span>
                          {h.sub ? (
                            <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">{h.sub}</span>
                          ) : null}
                        </span>
                      </button>
                      {isHovered && spec && hoveredRect && (
                        <SearchPreviewCard
                          hit={h}
                          spec={spec}
                          anchorRect={hoveredRect}
                          preferRight={!isTopbar}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {debounced.length >= 2 && (
            <p className="border-t border-[var(--border)] px-3 pt-2 text-[10px] text-[var(--muted)]">
              Workspace results need at least 2 characters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}