'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ReportPaneLayoutToggle, type ReportPaneLayout } from '@/components/reports/ReportPaneLayoutToggle';
import { AuditChangeLogTimeline } from '@/components/audits/AuditChangeLogTimeline';
import { buildAuditChangeEvents } from '@/lib/audit-history-utils';
import { useCompanyUserNameMap } from '@/hooks/useCompanyUserNameMap';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Plus, Play, ClipboardList, Calendar as CalendarIcon, Download,
  History, Sparkles, Trash2, ChevronDown, Activity, Layers, CheckCircle, CircleCheck, Ban, ChevronLeft,
  Check, Loader2, FileSpreadsheet, Info, UserCircle, FileText, Edit,
} from '@/components/icons';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getPageMeta } from '@/lib/page-meta';
import { auditApi, companyApi, documentApi, normalizeCompanyUsersResponse } from '@/lib/api';
import {
  buildAuditScopeFromClauses,
  extractSectionClauseNumbers,
} from '@/lib/audit-clause-scope';
import { formatIsoNormSelectLabel } from '@/lib/file-library-helpers';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/cn';
import {
  inferEvidenceSource,
  isLeafChecklistItem,
  mergeEvidenceChecksForItem,
  type EvidenceCheckRow,
} from '@/lib/audit-checklist-display';
import {
  currentUserLeadAuditorName,
  mapCompanyMemberOptions,
  resolveLeadAuditorName,
  type CompanyMemberOption,
} from '@/lib/company-user-display';

const AUDIT_TYPE_COLORS: Record<string, string> = {
  INTERNAL: '#1565c0',
  SUPPLIER: '#e65100',
  CERTIFICATION: '#4a148c',
};

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  PLANNED: { color: '#637381', bg: 'rgba(145,158,171,0.12)' },
  IN_PROGRESS: { color: '#ffab00', bg: 'rgba(255,171,0,0.12)' },
  COMPLETED: { color: '#36b37e', bg: 'rgba(54,179,126,0.12)' },
  CANCELLED: { color: '#ff5630', bg: 'rgba(255,86,48,0.12)' },
};

const FINDING_COLORS: Record<string, string> = {
  CONFORMANT: '#36b37e',
  NON_CONFORMANT: '#ff5630',
  OBSERVATION: '#ffab00',
  STRENGTH: '#1565c0',
};

const AUDIT_TAB_LABELS = ['All', 'Planned', 'In progress', 'Completed', 'Cancelled'] as const;
const AUDIT_TAB_STATUSES: (string | undefined)[] = [undefined, 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/** Dot colors for the audit status pill bar (aligned with app semantics). */
const AUDIT_STATUS_BAR: Record<string, { color: string; label: string }> = {
  PLANNED: { color: '#637381', label: 'Planned' },
  IN_PROGRESS: { color: '#ffab00', label: 'In progress' },
  COMPLETED: { color: '#36b37e', label: 'Completed' },
  CANCELLED: { color: '#ff5630', label: 'Cancelled' },
};

function statusCountRow(row: { status?: string; count?: string | number; _count?: string | number; a_status?: string }) {
  return Number(row?.count ?? row?._count ?? 0) || 0;
}

function complianceStatusLabel(
  score: number | null | undefined,
  answer: string | null | undefined,
): string {
  if (answer === 'NON_CONFORMANT') return 'Non compliant - address root cause and evidence';
  if (answer === 'CONFORMANT' && (score == null || score >= 80)) return 'Conformity: process effective for the intended purpose';
  if (answer === 'STRENGTH') return 'Strong point - maintain and share as good practice';
  if (answer === 'OBSERVATION') return 'Observation - opportunity for improvement';
  if (score != null && score < 25) return 'The process is either not implemented or is performed very inefficiently';
  if (score != null && score < 50) return 'Conformity level 1: review the operation of your activities';
  if (score != null && score < 80) return 'Partial conformity - close gaps to reach full effectiveness';
  if (score != null) return 'Conformant (score-based)';
  if (answer === 'CONFORMANT') return 'Conformant (evaluation)';
  return '-';
}

/** date-fns v3 parseISO() calls .split on the argument - must not pass null/undefined. */
function safeParseISODate(iso: string | null | undefined): Date | null {
  if (iso == null || String(iso).trim() === '') return null;
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function kpiStatusCount(kpis: { byStatus?: Array<Record<string, unknown>> }, status: string) {
  const row = (kpis.byStatus ?? []).find(
    (r) => String(r.a_status ?? r.status ?? r.audit_status ?? '').trim() === status,
  );
  return statusCountRow((row ?? {}) as { count?: string | number; _count?: string | number });
}

const ANSWER_CHIP_OPTIONS = [
  { value: 'CONFORMANT', label: 'Conformant' },
  { value: 'NON_CONFORMANT', label: 'Non-conformant' },
  { value: 'OBSERVATION', label: 'Observation' },
  { value: 'STRENGTH', label: 'Strong point' },
] as const;

function ChecklistProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 52 52" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <motion.circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums"
        style={{ color }}
      >
        {pct}%
      </span>
    </div>
  );
}

export default function AuditsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const pageMeta = getPageMeta(pathname || '/audits');
  const { user } = useAuthStore();
  const perms = usePermissions();
  const { nameMap } = useCompanyUserNameMap();
  const [paneLayout, setPaneLayout] = useState<ReportPaneLayout>('split');
  const [generalInfo, setGeneralInfo] = useState({ title: '', leadAuditor: '', scope: '' });
  const [savingAudit, setSavingAudit] = useState(false);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>(null);
  const [tab, setTab] = useState('0');
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [changeLog, setChangeLog] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [findingOpen, setFindingOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const [deleteAuditTarget, setDeleteAuditTarget] = useState<{ id: string; title: string } | null>(null);
  const [cancelAuditTarget, setCancelAuditTarget] = useState<{ id: string; title: string } | null>(null);
  const [deletingAudit, setDeletingAudit] = useState(false);
  const [cancellingAudit, setCancellingAudit] = useState(false);
  const [checklistDrafts, setChecklistDrafts] = useState<
    Record<string, { notes: string; score: string; evidenceChecks: EvidenceCheckRow[] }>
  >({});
  const [addLineDraftByChecklistId, setAddLineDraftByChecklistId] = useState<Record<string, string>>({});
  const [generatingClauseAiId, setGeneratingClauseAiId] = useState<string | null>(null);
  const [aiScoreChecklistId, setAiScoreChecklistId] = useState<string | null>(null);
  const [collapsedChecklistIds, setCollapsedChecklistIds] = useState<Set<string>>(new Set());
  const [companyUsers, setCompanyUsers] = useState<CompanyMemberOption[]>([]);
  const [isoNorms, setIsoNorms] = useState<any[]>([]);
  const [auditClauseOptions, setAuditClauseOptions] = useState<string[]>([]);
  const [loadingIsoDetail, setLoadingIsoDetail] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: 'INTERNAL',
    scheduledAt: '',
    scheduledEndAt: '',
    leadAuditor: '',
    isoDocumentId: '',
    isoStandard: '',
    scopeClauseRefs: [] as string[],
  });
  const resetNewAuditForm = useCallback(() => {
    setForm({
      title: '',
      type: 'INTERNAL',
      scheduledAt: '',
      scheduledEndAt: '',
      leadAuditor: currentUserLeadAuditorName(user),
      isoDocumentId: '',
      isoStandard: '',
      scopeClauseRefs: [],
    });
    setAuditClauseOptions([]);
  }, [user]);

  const [findingForm, setFindingForm] = useState({
    type: 'CONFORMANT',
    description: '',
    isoClause: '',
    evidence: '',
    recordedBy: '',
  });

  const statusFilters = [undefined, 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  const loadKpis = useCallback(async () => {
    try {
      const res = await auditApi.kpis();
      setKpis(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadAudits = useCallback(async () => {
    setLoading(true);
    try {
      const idx = Number.parseInt(tab, 10);
      const res = await auditApi.list(statusFilters[idx] ? { status: statusFilters[idx] } : {});
      setAudits(res.data);
    } catch {
      toast.error('Failed to load audits');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadAudits();
    loadKpis();
  }, [loadAudits, loadKpis]);

  useEffect(() => {
    (async () => {
      try {
        const res = await documentApi.getIsoNorms();
        setIsoNorms(res.data ?? []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await companyApi.getUsers();
        const { users } = normalizeCompanyUsersResponse(res.data);
        setCompanyUsers(
          mapCompanyMemberOptions(users as { id: string; firstName?: string; lastName?: string; email?: string }[]),
        );
      } catch {
        setCompanyUsers([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedAudit?.leadAuditor || !companyUsers.length) return;
    setGeneralInfo((p) => {
      const resolved = resolveLeadAuditorName(selectedAudit.leadAuditor, companyUsers);
      if (p.leadAuditor === resolved) return p;
      return { ...p, leadAuditor: resolved };
    });
  }, [selectedAudit?.id, selectedAudit?.leadAuditor, companyUsers]);

  const onIsoNormChange = async (documentId: string) => {
    const norm = isoNorms.find((n) => n.id === documentId);
    const iso = norm?.isoStandard?.trim() || '';
    setForm((p) => ({
      ...p,
      isoDocumentId: documentId,
      isoStandard: iso,
      scopeClauseRefs: [],
    }));
    if (!documentId) {
      setAuditClauseOptions([]);
      return;
    }
    setLoadingIsoDetail(true);
    try {
      const res = await documentApi.get(documentId);
      const extracted = extractSectionClauseNumbers(res.data);
      setAuditClauseOptions(extracted);
      if (!extracted.length) {
        toast.error('No clauses found in this document. Run extraction on the standard in the file library first.');
      }
    } catch {
      setAuditClauseOptions([]);
      toast.error('Could not load clauses from the selected standard.');
    } finally {
      setLoadingIsoDetail(false);
    }
  };

  const loadAuditDetail = async (id: string) => {
    try {
      const [ev, log] = await Promise.all([auditApi.get(id), auditApi.changeLog(id)]);
      setSelectedAudit(ev.data);
      setChangeLog(log.data);
      setGeneralInfo({
        title: ev.data.title ?? '',
        leadAuditor: resolveLeadAuditorName(ev.data.leadAuditor ?? '', companyUsers),
        scope: ev.data.scope ?? '',
      });
      setChecklistDrafts({});
      setAddLineDraftByChecklistId({});
      setCollapsedChecklistIds(new Set());
      setPaneLayout((prev) => (prev === 'list' ? 'split' : prev));
    } catch {
      toast.error('Failed to load audit details');
    }
  };

  const canEditAuditGeneral =
    !!selectedAudit &&
    (selectedAudit.status === 'PLANNED' || selectedAudit.status === 'IN_PROGRESS');

  const changeLogCount = useMemo(
    () => buildAuditChangeEvents(changeLog, nameMap).length,
    [changeLog, nameMap],
  );

  const handleSaveAuditGeneral = async () => {
    if (!selectedAudit?.id) return;
    if (!generalInfo.title.trim() || !generalInfo.leadAuditor.trim() || !generalInfo.scope.trim()) {
      toast.error('Name, lead auditor, and scope are required');
      return;
    }
    try {
      setSavingAudit(true);
      await auditApi.update(selectedAudit.id, {
        title: generalInfo.title.trim(),
        leadAuditor: generalInfo.leadAuditor.trim(),
        scope: generalInfo.scope.trim(),
      });
      toast.success('Changes saved');
      await loadAuditDetail(selectedAudit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to save audit');
    } finally {
      setSavingAudit(false);
    }
  };

  /** Persist evidence checklist + notes, then AI-suggest conformity and score (auditor can edit after). */
  const saveChecklistEvidenceAndEvaluate = async (item: any) => {
    if (!selectedAudit) return;
    const ec = checklistDrafts[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard);
    const notesVal = checklistDrafts[item.id]?.notes ?? item.notes ?? '';
    setAiScoreChecklistId(item.id);
    try {
      await auditApi.updateChecklist(item.id, {
        notes: notesVal,
        evidenceChecks: ec,
      });
      const res = await auditApi.suggestChecklistAiScore(item.id);
      const score = res.data.score;
      const answer = res.data.answer;
      await auditApi.updateChecklist(item.id, {
        ...(answer ? { answer: String(answer) } : {}),
        score,
      });
      const hint = res.data.rationale?.trim();
      const evalLabel = answer ? String(answer).replace(/_/g, ' ') : 'Score';
      toast.success(hint ? `Saved   ${evalLabel}   ${score}% - ${hint}` : `Saved   ${evalLabel}   ${score}%`);
      void loadAuditDetail(selectedAudit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Save or evaluation failed');
    } finally {
      setAiScoreChecklistId(null);
    }
  };

  const saveChecklistScore = async (item: any) => {
    const d = checklistDrafts[item.id];
    if (d?.score === undefined) return;
    const raw = d.score;
    let score: number | null;
    if (raw === '' || (typeof raw === 'string' && raw.trim() === '')) {
      score = null;
    } else {
      const n = Number.parseInt(String(raw).replace(/\D/g, ''), 10);
      score = Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
    }
    const before = item.score;
    if (before === score || (before == null && score == null)) return;
    try {
      await auditApi.updateChecklist(item.id, { score });
      if (selectedAudit) void loadAuditDetail(selectedAudit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Update failed');
    }
  };

  const handleGenerateClauseChecklist = async (item: { id: string }) => {
    if (!selectedAudit || selectedAudit.status !== 'IN_PROGRESS') return;
    setGeneratingClauseAiId(item.id);
    try {
      const res = await auditApi.generateAiClauseEvidenceItems(item.id);
      const merged: EvidenceCheckRow[] = (res.data.items ?? []).map((row) => ({
        id: String(row.id).trim(),
        label: String(row.label ?? '').trim(),
        checked: Boolean(row.checked),
        source: inferEvidenceSource(row),
      }));
      toast.success(res.data.message || `Added ${res.data.added} line(s)`);
      const checklistRow = selectedAudit.checklists?.find((c: { id: string }) => c.id === item.id);
      setChecklistDrafts((p) => ({
        ...p,
        [item.id]: {
          notes: p[item.id]?.notes ?? checklistRow?.notes ?? '',
          score:
            p[item.id]?.score
            ?? (checklistRow?.score != null ? String(checklistRow.score) : ''),
          evidenceChecks: merged,
        },
      }));
      void loadAuditDetail(selectedAudit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Could not generate checklist');
    } finally {
      setGeneratingClauseAiId(null);
    }
  };

  const handleCreate = async () => {
    if (!form.title?.trim() || !form.scheduledAt || !form.scheduledEndAt || !form.leadAuditor?.trim()) {
      toast.error('Name, type, lead auditor, start date, and end date are required.');
      return;
    }
    if (!form.isoDocumentId || !form.isoStandard?.trim()) {
      toast.error('Select a Standard).');
      return;
    }
    if (!form.scopeClauseRefs.length) {
      toast.error('Select at least one clause in scope.');
      return;
    }
    if (!auditClauseOptions.length) {
      toast.error('This standard has no extracted clauses. Activate it in the file library after OCR extraction.');
      return;
    }
    try {
      await auditApi.create({
        title: form.title.trim(),
        type: form.type,
        scheduledAt: `${form.scheduledAt}T09:00:00`,
        scheduledEndAt: `${form.scheduledEndAt}T17:00:00`,
        leadAuditor: form.leadAuditor.trim(),
        scope: buildAuditScopeFromClauses(form.isoStandard, form.scopeClauseRefs),
        isoStandard: form.isoStandard.trim() || undefined,
        isoDocumentId: form.isoDocumentId || undefined,
        scopeClauseRefs: form.scopeClauseRefs,
      });
      toast.success('Audit scheduled with checklist');
      setCreateOpen(false);
      resetNewAuditForm();
      loadAudits();
      loadKpis();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Failed to create audit');
    }
  };

  const handleApplyAiToPlannedAudit = async () => {
    if (!selectedAudit?.id || selectedAudit.status !== 'PLANNED') {
      toast.error('Select a PLANNED audit first.');
      return;
    }
    const iso = selectedAudit.isoStandard || 'ISO 9001:2015';
    try {
      const res = await auditApi.suggestChecklist({
        isoStandard: iso,
        scopeClauseRefs: Array.isArray(selectedAudit.scopeClauseRefs) ? selectedAudit.scopeClauseRefs : undefined,
      });
      const items = res.data?.suggestions || [];
      if (!items.length) return toast.error('No suggestions.');
      await auditApi.replaceChecklists(selectedAudit.id, items);
      toast.success('Checklist replaced with AI suggestions - edit items in the checklist as needed.');
      loadAuditDetail(selectedAudit.id);
      loadAudits();
      loadKpis();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to apply suggestions');
    }
  };

  const handleStartAudit = async (id: string) => {
    try {
      await auditApi.start(id);
      toast.success('Audit started');
      loadAudits();
      loadKpis();
      if (selectedAudit?.id === id) loadAuditDetail(id);
    } catch {
      toast.error('Failed');
    }
  };

  const confirmCancelAudit = async () => {
    const t = cancelAuditTarget;
    if (!t) return;
    setCancellingAudit(true);
    try {
      await auditApi.cancel(t.id);
      toast.success('Audit cancelled');
      setCancelAuditTarget(null);
      setTab('4');
      if (selectedAudit?.id === t.id) {
        await loadAuditDetail(t.id);
      }
      loadAudits();
      loadKpis();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Cancel failed');
    } finally {
      setCancellingAudit(false);
    }
  };

  const handleAddFinding = async () => {
    if (!findingForm.description?.trim()) return toast.error('Description is required');
    try {
      await auditApi.addFinding(selectedAudit.id, {
        ...findingForm,
        recordedBy: findingForm.recordedBy || user?.id || user?.email || 'auditor',
      });
      toast.success('Finding recorded');
      setFindingOpen(false);
      setFindingForm({ type: 'CONFORMANT', description: '', isoClause: '', evidence: '', recordedBy: '' });
      loadAuditDetail(selectedAudit.id);
    } catch {
      toast.error('Failed to add finding');
    }
  };

  const onChecklistAnswer = async (item: any, answer: string) => {
    if (!answer) return;
    try {
      await auditApi.updateChecklist(item.id, { answer });
      if (selectedAudit) void loadAuditDetail(selectedAudit.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Update failed');
    }
  };

  const handleComplete = async () => {
    if (!conclusion.trim() || !selectedAudit) return toast.error('Conclusion required');
    try {
      await auditApi.complete(selectedAudit.id, conclusion);
      toast.success('Audit completed - report generated');
      setCompleteOpen(false);
      setConclusion('');
      loadAuditDetail(selectedAudit.id);
      loadAudits();
      loadKpis();
    } catch {
      toast.error('Failed to complete');
    }
  };

  const confirmDeleteAudit = async () => {
    const t = deleteAuditTarget;
    if (!t) return;
    setDeletingAudit(true);
    try {
      await auditApi.remove(t.id);
      toast.success('Audit deleted');
      setDeleteAuditTarget(null);
      if (selectedAudit?.id === t.id) {
        setSelectedAudit(null);
        setChangeLog([]);
        setChecklistDrafts({});
        setAddLineDraftByChecklistId({});
      }
      loadAudits();
      loadKpis();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || 'Delete failed');
    } finally {
      setDeletingAudit(false);
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseFilenameFromContentDisposition = (cd: string | undefined): string | null => {
    if (!cd) return null;
    const star = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star) {
      try {
        return decodeURIComponent(star[1].trim());
      } catch {
        return star[1].trim();
      }
    }
    const q = cd.match(/filename="([^"]+)"/i);
    if (q) return q[1].trim();
    const u = cd.match(/filename=([^;\s]+)/i);
    return u ? u[1].trim().replace(/^["']|["']$/g, '') : null;
  };

  const auditExportFallbackName = (title: string | undefined, id: string, format: 'xlsx' | 'pdf') => {
    const slug = (title || '')
      .trim()
      .replace(/[/\\?%*|"<>]/g, '-')
      .replace(/:/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120)
      .replace(/[_-]+$/, '');
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    return slug ? `${slug}.${ext}` : `audit-${id}.${ext}`;
  };

  const handleExportAudit = async (format: 'xlsx' | 'pdf') => {
    if (!selectedAudit?.id) return;
    try {
      const res = await auditApi.export(selectedAudit.id, format);
      const ct = String(res.headers['content-type'] ?? '').toLowerCase();
      if (res.status >= 400 || ct.includes('application/json')) {
        let msg = 'Export failed';
        try {
          const text = typeof (res.data as Blob).text === 'function' ? await (res.data as Blob).text() : '';
          if (text) {
            const j = JSON.parse(text) as { message?: string };
            if (j?.message) msg = Array.isArray(j.message) ? j.message[0] : j.message;
          }
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      const cd = res.headers['content-disposition'] as string | undefined;
      const name =
        parseFilenameFromContentDisposition(cd)
        ?? auditExportFallbackName(selectedAudit.title, selectedAudit.id, format);
      downloadBlob(new Blob([res.data]), name);
      toast.success(format === 'pdf' ? 'PDF downloaded' : 'Excel report downloaded');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Export failed');
    }
  };

  const tabCounts = useMemo(() => {
    const m = new Map<number, number>();
    if (!kpis) return m;
    let sum = 0;
    for (const row of (kpis.byStatus ?? []) as Array<Record<string, unknown>>) {
      const status = String(row.a_status ?? row.status ?? row.audit_status ?? '').trim();
      const c = statusCountRow(row as { status?: string; count?: string | number; _count?: string | number });
      sum += c;
      const idx = AUDIT_TAB_STATUSES.findIndex((s) => s === status);
      if (idx > 0) m.set(idx, c);
    }
    m.set(0, typeof kpis.total === 'number' ? kpis.total : sum);
    return m;
  }, [kpis]);

  const kpiTiles = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        label: 'Total audits',
        value: kpis.total ?? 0,
        color: '#7c4dff',
        soft: 'rgba(124,77,255,0.10)',
        Icon: Layers,
        tabIndex: 0,
      },
      {
        label: 'Planned',
        value: kpiStatusCount(kpis, 'PLANNED'),
        color: AUDIT_STATUS_BAR.PLANNED.color,
        soft: 'rgba(99,115,129,0.12)',
        Icon: CalendarIcon,
        tabIndex: 1,
      },
      {
        label: 'In progress',
        value: kpiStatusCount(kpis, 'IN_PROGRESS'),
        color: AUDIT_STATUS_BAR.IN_PROGRESS.color,
        soft: 'rgba(255,171,0,0.12)',
        Icon: Activity,
        tabIndex: 2,
      },
      {
        label: 'Completed',
        value: kpiStatusCount(kpis, 'COMPLETED'),
        color: AUDIT_STATUS_BAR.COMPLETED.color,
        soft: 'rgba(54,179,126,0.12)',
        Icon: CheckCircle,
        tabIndex: 3,
      },
    ];
  }, [kpis]);

  const checklistStats = useMemo(() => {
    const items = selectedAudit?.checklists as Array<{ hierarchyLevel?: number; answer?: string; score?: number }> | undefined;
    if (!items?.length) return null;
    const leaves = items.filter((c) => isLeafChecklistItem(c));
    const evaluated = leaves.filter((c) => c.answer).length;
    const scored = leaves.filter((c) => c.score != null).length;
    const pct = leaves.length ? Math.round((evaluated / leaves.length) * 100) : 0;
    return { leaves: leaves.length, evaluated, scored, pct };
  }, [selectedAudit?.checklists]);

  const toggleChecklistCollapsed = useCallback((id: string) => {
    setCollapsedChecklistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <DashboardLayout showRouteHeader={false}>
      <header className="mb-7">
        <motion.div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/calendar')}
            className="gap-1"
          >
            <CalendarIcon className="h-4 w-4" />
            Calendar
          </Button>
          {perms.createManageAudits && (
            <Button
              type="button"
              onClick={() => {
                resetNewAuditForm();
                setCreateOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New audit
            </Button>
          )}
        </div>
        </motion.div>
        <motion.div
          aria-hidden
          className="mt-5 h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--border) 12%, var(--border) 88%, transparent)',
          }}
        />
      </header>

      {kpis && kpiTiles.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="mb-7"
          aria-label="Audit key indicators"
        >
          <motion.div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--surface-elevated)]">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#7c4dff]/8 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-[var(--brand-accent)]/6 blur-3xl" />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, #7c4dff 40%, transparent), transparent)',
              }}
            />
            <div className="relative grid grid-cols-2 sm:grid-cols-4">
              {kpiTiles.map((kpi, i) => (
                <motion.button
                  key={kpi.label}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setTab(String(kpi.tabIndex))}
                  className={cn(
                    'group relative flex items-center gap-4 px-5 py-5 text-left transition-colors duration-300 sm:px-6 sm:py-6',
                    i === 1 && 'border-l border-[var(--border)]/60',
                    i === 2 && 'border-t border-[var(--border)]/60 sm:border-l sm:border-t-0',
                    i === 3 && 'border-l border-t border-[var(--border)]/60 sm:border-t-0',
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
                    style={{ background: kpi.soft }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-5 top-0 h-[2px] origin-center scale-x-0 rounded-full opacity-0 transition-all duration-500 ease-out group-hover:scale-x-100 group-hover:opacity-100"
                    style={{ background: `linear-gradient(90deg, transparent, ${kpi.color}, transparent)` }}
                  />
                  <span
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 ease-out group-hover:scale-110 group-hover:-rotate-3"
                    style={{ background: kpi.soft, color: kpi.color }}
                  >
                    <kpi.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
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
                      transition={{ delay: 0.18 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {kpi.value ?? 0}
                    </motion.p>
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
          </motion.div>
        </motion.section>
      )}


      {kpis && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6 -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="inline-flex gap-1 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)] p-1">
            {AUDIT_TAB_LABELS.map((label, i) => {
              const active = tab === String(i);
              const status = AUDIT_TAB_STATUSES[i];
              const dotColor =
                i === 0
                  ? 'var(--brand-primary)'
                  : (status && AUDIT_STATUS_BAR[status]?.color) || 'var(--muted)';
              const count = tabCounts.get(i) ?? (i === 0 ? (kpis.total as number) : 0);
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
                      layoutId="audit-tab-pill"
                      className="absolute inset-0 rounded-xl bg-[var(--surface)]"
                      style={{
                        boxShadow:
                          'inset 0 0 0 1px color-mix(in srgb, var(--brand-primary) 22%, transparent)',
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  {active && (
                    <motion.span
                      layoutId="audit-tab-glow"
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
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {!kpis && (
        <div className="mb-6 h-10 w-full max-w-md animate-pulse rounded-2xl bg-[var(--nav-hover)]" aria-hidden />
      )}

      {loading && (
        <motion.div className="mb-4 h-1 w-full overflow-hidden rounded bg-[var(--page-bg)]">
          <motion.div className="h-full w-1/3 animate-pulse bg-[var(--brand-primary)]" />
        </motion.div>
      )}

      <motion.div className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-end shrink-0">
          <ReportPaneLayoutToggle
            value={paneLayout}
            onChange={setPaneLayout}
            disabledDetail={!selectedAudit}
          />
        </div>
        <div className="flex flex-1 gap-6 overflow-hidden min-h-0 items-stretch">
        {(paneLayout === 'split' || paneLayout === 'list') && (
        <div
          className={cn(
            'flex flex-col gap-5 min-h-0 overflow-y-auto',
            paneLayout === 'split' ? 'w-full lg:w-[38%] lg:shrink-0' : 'flex-1 w-full',
          )}
        >
          {audits.length === 0 && !loading ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-3xl border border-dashed border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)] px-6 py-16 text-center"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#7c4dff]/10 blur-3xl"
              />
              <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7c4dff]/10">
                <ClipboardList className="h-7 w-7 text-[#7c4dff]" />
              </div>
              <p className="relative text-sm font-medium text-[var(--text-primary)]">No audits found</p>
              <p className="relative mt-1 text-xs text-[var(--muted)]">Schedule an audit to track on-site compliance.</p>
              <Button
                variant="outline"
                className="relative mt-5 gap-2"
                onClick={() => {
                  resetNewAuditForm();
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Create audit
              </Button>
            </motion.div>
          ) : (
            audits.map((audit, i) => {
              const typColor = AUDIT_TYPE_COLORS[audit.type] || '#1565c0';
              const statusCfg = STATUS_CONFIG[audit.status] || STATUS_CONFIG.PLANNED;
              const isSelected = selectedAudit?.id === audit.id;
              const schedStart = safeParseISODate(audit.scheduledAt);
              const schedEnd = safeParseISODate(audit.scheduledEndAt);
              return (
                <motion.div key={audit.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card
                    className={cn(
                      'group relative cursor-pointer overflow-hidden rounded-xl border-[var(--border)] shadow-none',
                      'transition-all duration-200 ease-out',
                      'hover:-translate-y-0.5 hover:border-[var(--border)]/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.10)]',
                      isSelected && 'ring-2 ring-[var(--brand-primary)]',
                    )}
                    style={
                      {
                        ['--spot-x' as string]: '50%',
                        ['--spot-y' as string]: '40%',
                      } as React.CSSProperties
                    }
                    onMouseMove={(e) => {
                      const el = e.currentTarget;
                      const r = el.getBoundingClientRect();
                      const x = ((e.clientX - r.left) / Math.max(r.width, 1)) * 100;
                      const y = ((e.clientY - r.top) / Math.max(r.height, 1)) * 100;
                      el.style.setProperty('--spot-x', `${x}%`);
                      el.style.setProperty('--spot-y', `${y}%`);
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget;
                      el.style.setProperty('--spot-x', '50%');
                      el.style.setProperty('--spot-y', '40%');
                    }}
                    onClick={() => loadAuditDetail(audit.id)}
                  >
                    {/* Left accent - same language as NC / findings cards */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[3px] opacity-70"
                      style={{
                        background: `linear-gradient(180deg, ${typColor}, ${statusCfg.color})`,
                      }}
                    />
                    {/* Cursor-following wash (NC KPI-style depth) */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(520px circle at var(--spot-x) var(--spot-y), ${statusCfg.color}26, transparent 52%)`,
                      }}
                    />
                    <CardContent className="relative z-[2] p-4">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <Badge variant="default" className="text-[10px]" style={{ background: `${typColor}22`, color: typColor }}>
                              {audit.type}
                            </Badge>
                            <Badge variant="default" className="text-[10px]" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                              {audit.status}
                            </Badge>
                          </div>
                          <p className="mb-1 font-semibold leading-snug text-[var(--text-primary)]">{audit.title}</p>
                          {(schedStart || schedEnd) && (
                            <p className="text-xs leading-relaxed text-[var(--muted)]">
                              {[schedStart && format(schedStart, 'MMM d, yyyy'), schedEnd && format(schedEnd, 'MMM d, yyyy')]
                                .filter(Boolean)
                                .join(' to ')}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {audit.status === 'PLANNED' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="shrink-0 text-[#118d57]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartAudit(audit.id);
                              }}
                              aria-label="Start audit"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {(audit.status === 'PLANNED' || audit.status === 'IN_PROGRESS') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="shrink-0 text-[var(--muted)] hover:text-orange-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelAuditTarget({ id: audit.id, title: audit.title || 'this audit' });
                              }}
                              aria-label="Cancel audit"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                          {audit.status === 'CANCELLED' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="shrink-0 text-[var(--muted)] hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteAuditTarget({ id: audit.id, title: audit.title || 'this audit' });
                              }}
                              aria-label="Delete audit"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-1 border-t border-[var(--border)]/80 pt-3 text-xs text-[var(--muted)]">
                        <span>{audit._count?.checklists ?? 0} checklist</span>
                        <span>{audit._count?.findings ?? 0} findings</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
        )}

        {(paneLayout === 'split' || paneLayout === 'detail') && (
          <div
            className={cn(
              'flex flex-col min-h-0 min-w-0',
              paneLayout === 'split' ? 'flex-1 border-l border-[var(--border)] pl-6' : 'flex-1 w-full',
            )}
          >
            {paneLayout === 'detail' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start mb-2 gap-1 text-[var(--muted)] shrink-0"
                onClick={() => setPaneLayout('list')}
              >
                <ChevronLeft className="w-4 h-4" />
                Back to list
              </Button>
            )}
            {selectedAudit ? (
          <div className="flex flex-col min-h-0 flex-1 min-w-0">
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="border-[var(--border)] shadow-none">
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                          {generalInfo.title || selectedAudit.title}
                        </h2>
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)]/60 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-[var(--muted)]"
                          aria-label={`Status: ${selectedAudit.status}`}
                        >
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: STATUS_CONFIG[selectedAudit.status]?.color ?? 'var(--muted)' }}
                          />
                          {String(selectedAudit.status).replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                        {selectedAudit.isoStandard || 'No standard linked'}
                      </p>
                    </div>
                    <div
                      role="toolbar"
                      aria-label="Audit actions"
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 p-1"
                    >
                      {canEditAuditGeneral && (
                        <button
                          type="button"
                          className="group inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void handleSaveAuditGeneral()}
                          disabled={savingAudit}
                          aria-label={savingAudit ? 'Saving changes' : 'Save changes'}
                          title={savingAudit ? 'Saving…' : 'Save changes'}
                        >
                          {savingAudit ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      )}
                      {selectedAudit.status === 'PLANNED' && (
                        <>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-emerald-500/10 hover:text-emerald-600"
                            onClick={() => void handleStartAudit(selectedAudit.id)}
                            aria-label="Start audit"
                            title="Start audit"
                          >
                            <Play className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
                            onClick={handleApplyAiToPlannedAudit}
                            title="Apply AI checklist"
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            AI checklist
                          </button>
                        </>
                      )}
                      {selectedAudit.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
                          onClick={() => setFindingOpen(true)}
                          aria-label="Add finding"
                          title="Add finding"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {selectedAudit.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-emerald-500/10 hover:text-emerald-600"
                          onClick={() => setCompleteOpen(true)}
                          aria-label="Complete audit"
                          title="Complete audit"
                        >
                          <CheckCircle className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {(selectedAudit.status === 'PLANNED' || selectedAudit.status === 'IN_PROGRESS') && (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-orange-500/10 hover:text-orange-600"
                          onClick={() =>
                            setCancelAuditTarget({ id: selectedAudit.id, title: selectedAudit.title || 'this audit' })
                          }
                          aria-label="Cancel audit"
                          title="Cancel audit"
                        >
                          <Ban className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {selectedAudit.status === 'CANCELLED' && (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors duration-200 hover:bg-red-500/10 hover:text-red-600"
                          onClick={() =>
                            setDeleteAuditTarget({ id: selectedAudit.id, title: selectedAudit.title || 'this audit' })
                          }
                          aria-label="Delete audit"
                          title="Delete audit"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {selectedAudit.status === 'COMPLETED' && perms.exportReports && (
                        <>
                          <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--border)]" />
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors duration-200 hover:bg-emerald-500/10 hover:text-emerald-600"
                            onClick={() => void handleExportAudit('xlsx')}
                            title="Download Excel"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
                            Excel
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
                            onClick={() => void handleExportAudit('pdf')}
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            PDF
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <section
                    aria-labelledby="audit-general-info-heading"
                    className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/30"
                  >
                    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </span>
                        <h3
                          id="audit-general-info-heading"
                          className="text-[13px] font-semibold tracking-[-0.005em] text-[var(--text-primary)]"
                        >
                          General information
                        </h3>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                        {canEditAuditGeneral ? (
                          <>
                            <Edit className="h-2.5 w-2.5" aria-hidden />
                            Editable
                          </>
                        ) : (
                          'Read only'
                        )}
                      </span>
                    </header>
                    <div className="grid gap-4 p-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label
                          htmlFor="audit-info-name"
                          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]"
                        >
                          <FileText className="h-3 w-3" aria-hidden />
                          Audit name
                        </Label>
                        <Input
                          id="audit-info-name"
                          className="mt-1.5"
                          value={generalInfo.title}
                          onChange={(e) => setGeneralInfo((p) => ({ ...p, title: e.target.value }))}
                          disabled={!canEditAuditGeneral}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label
                          htmlFor="audit-info-lead"
                          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]"
                        >
                          <UserCircle className="h-3 w-3" aria-hidden />
                          Lead auditor
                        </Label>
                        {canEditAuditGeneral ? (
                          <select
                            id="audit-info-lead"
                            className="mt-1.5 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm transition-colors duration-200 focus:border-[var(--brand-primary)]/60 focus:outline-none"
                            value={generalInfo.leadAuditor}
                            onChange={(e) => setGeneralInfo((p) => ({ ...p, leadAuditor: e.target.value }))}
                          >
                            <option value="">{companyUsers.length ? 'Select a team member' : 'Loading team'}</option>
                            {companyUsers.map((m) => (
                              <option key={m.id} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="mt-1.5 inline-flex h-10 w-full items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]">
                            {resolveLeadAuditorName(generalInfo.leadAuditor, companyUsers) || '-'}
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <Label
                          htmlFor="audit-info-scope"
                          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]"
                        >
                          <ClipboardList className="h-3 w-3" aria-hidden />
                          Scope
                        </Label>
                        <Textarea
                          id="audit-info-scope"
                          className="mt-1.5 resize-none"
                          rows={3}
                          value={generalInfo.scope}
                          onChange={(e) => setGeneralInfo((p) => ({ ...p, scope: e.target.value }))}
                          disabled={!canEditAuditGeneral}
                        />
                      </div>
                    </div>
                  </section>

                  {selectedAudit.checklists?.length > 0 && (
                    <div className="mb-6">
                      <motion.div className="mb-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-elevated)] p-4 sm:p-5">
                        <div className="flex flex-wrap items-center gap-4">
                          {checklistStats && (
                            <ChecklistProgressRing
                              pct={checklistStats.pct}
                              color={
                                checklistStats.pct >= 80
                                  ? '#36b37e'
                                  : checklistStats.pct >= 40
                                    ? '#ffab00'
                                    : 'var(--brand-primary)'
                              }
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Clause checklist</p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {checklistStats
                                ? `${checklistStats.evaluated} of ${checklistStats.leaves} criteria evaluated   ${checklistStats.scored} scored`
                                : `${selectedAudit.checklists.length} rows`}
                            </p>
                            {checklistStats && checklistStats.leaves > 0 && (
                              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]/60">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{
                                    background: 'linear-gradient(90deg, var(--brand-primary), #36b37e)',
                                  }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${checklistStats.pct}%` }}
                                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
                          Answer each yes/no line for the clause, add notes, then <strong>Save & generate evaluation</strong>{' '}
                          for AI-assisted scoring. Use <strong>Generate checklist</strong> for more clause-specific questions.
                        </p>
                      </motion.div>
                      {selectedAudit.status === 'PLANNED' && (
                        <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                          <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
                          Checklist is read-only until you start the audit.
                        </p>
                      )}
                      {selectedAudit.status === 'CANCELLED' && (
                        <p className="mb-3 flex items-start gap-2 rounded-xl border border-orange-200/80 bg-orange-50/90 px-3 py-2.5 text-xs text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100">
                          <Ban className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
                          This audit was cancelled. Checklist is read-only. Use <strong>Delete</strong> to remove it permanently.
                        </p>
                      )}
                      <div className="max-h-[min(72vh,640px)] space-y-3 overflow-y-auto pr-1">
                        {selectedAudit.checklists.filter(isLeafChecklistItem).map((item: any) => {
                          const ec = checklistDrafts[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard);
                          const canEdit = selectedAudit.status === 'IN_PROGRESS';

                          const isCollapsed = collapsedChecklistIds.has(item.id);
                          const evidenceDone = ec.filter((r) => r.checked).length;
                          const evidenceTotal = ec.length;
                          const answerColor = item.answer ? FINDING_COLORS[item.answer] : undefined;

                          return (
                            <Card
                              key={item.id}
                              className={cn(
                                'overflow-hidden border shadow-sm',
                                item.answer === 'NON_CONFORMANT'
                                  ? 'border-red-200/80 dark:border-red-900/40'
                                  : item.answer === 'CONFORMANT'
                                    ? 'border-emerald-200/60 dark:border-emerald-900/30'
                                    : 'border-[var(--border)]',
                              )}
                            >
                              <button
                                type="button"
                                className="flex w-full items-start gap-3 border-b border-[var(--border)]/60 bg-[var(--surface-elevated)]/50 px-4 py-3 text-left transition-colors hover:bg-[var(--nav-hover)]/40"
                                onClick={() => toggleChecklistCollapsed(item.id)}
                              >
                                <ChevronDown
                                  className={cn(
                                    'mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200',
                                    isCollapsed && '-rotate-90',
                                  )}
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--brand-primary)]">
                                      {item.isoClause}
                                    </span>
                                    {item.answer && (
                                      <Badge
                                        variant="default"
                                        className="text-[9px]"
                                        style={{ background: `${answerColor}22`, color: answerColor }}
                                      >
                                        {item.answer === 'STRENGTH' ? 'Strong point' : item.answer.replace(/_/g, ' ')}
                                      </Badge>
                                    )}
                                    {item.score != null && (
                                      <span className="text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                                        {item.score}%
                                      </span>
                                    )}
                                    {evidenceTotal > 0 && (
                                      <span className="text-[10px] text-[var(--muted)]">
                                        {evidenceDone}/{evidenceTotal} answered
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                              <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                  >
                              <CardContent className="space-y-4 p-4">
                                <div>
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                                      <CircleCheck className="mr-1 inline h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden />
                                      Checklist
                                      {evidenceTotal > 0 && (
                                        <span className="ml-1 font-normal text-[var(--muted)]">
                                          {evidenceDone}/{evidenceTotal}
                                        </span>
                                      )}
                                    </p>
                                    {canEdit && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 text-[10px]"
                                        disabled={generatingClauseAiId === item.id}
                                        onClick={() => void handleGenerateClauseChecklist(item)}
                                      >
                                        <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                                        {generatingClauseAiId === item.id ? 'Generating...' : 'Generate checklist'}
                                      </Button>
                                    )}
                                  </div>
                                  <p className="mb-2 text-[10px] leading-relaxed text-[var(--muted)]">
                                    Tick each yes/no line for this clause. <strong>Generate checklist</strong> adds
                                    clause-specific AI questions and keeps the base lines. Add your own below, then{' '}
                                    <strong>Save & generate evaluation</strong> uses your ticks and notes for the AI score.
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {ec.map((row) => {
                                      const src = inferEvidenceSource(row);
                                      return (
                                        <div
                                          key={row.id}
                                          className={cn(
                                            'flex items-start gap-2 rounded-xl border p-2.5 text-[11px] transition-colors duration-200',
                                            row.checked
                                              ? 'border-emerald-300/70 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/25'
                                              : 'border-[var(--border)] bg-[var(--page-bg)]/60',
                                            !canEdit && 'opacity-80',
                                          )}
                                        >
                                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 leading-snug">
                                            <Checkbox
                                              className="mt-0.5 shrink-0"
                                              checked={row.checked}
                                              disabled={!canEdit}
                                              onCheckedChange={(v) => {
                                                if (!canEdit) return;
                                                const checked = v === true;
                                                setChecklistDrafts((p) => {
                                                  const prevChecks =
                                                    p[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard);
                                                  const nextChecks = prevChecks.map((c) =>
                                                    c.id === row.id ? { ...c, checked } : c,
                                                  );
                                                  return {
                                                    ...p,
                                                    [item.id]: {
                                                      notes: p[item.id]?.notes ?? (item.notes || ''),
                                                      score:
                                                        p[item.id]?.score ?? (item.score != null ? String(item.score) : ''),
                                                      evidenceChecks: nextChecks,
                                                    },
                                                  };
                                                });
                                              }}
                                            />
                                            <span className="min-w-0 flex-1">{row.label}</span>
                                          </label>
                                          <div className="flex shrink-0 flex-col items-end gap-1">
                                            <Badge
                                              variant="default"
                                              className="h-5 border border-[var(--border)] bg-[var(--nav-hover)] px-1.5 text-[9px] font-medium capitalize text-[var(--muted)]"
                                            >
                                              {src === 'default' ? 'Base' : src}
                                            </Badge>
                                            {canEdit && (src === 'ai' || src === 'user') && (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-[var(--muted)] hover:text-red-600"
                                                aria-label="Remove checklist line"
                                                onClick={() => {
                                                  setChecklistDrafts((p) => {
                                                    const prev =
                                                      p[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard);
                                                    const next = prev.filter((c) => c.id !== row.id);
                                                    return {
                                                      ...p,
                                                      [item.id]: {
                                                        notes: p[item.id]?.notes ?? (item.notes || ''),
                                                        score:
                                                          p[item.id]?.score ?? (item.score != null ? String(item.score) : ''),
                                                        evidenceChecks: next,
                                                      },
                                                    };
                                                  });
                                                }}
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {canEdit && (
                                    <div className="mt-3 flex flex-wrap items-end gap-2">
                                      <div className="min-w-[12rem] flex-1">
                                        <Label className="text-[10px] text-[var(--muted)]">Add your own line</Label>
                                        <Input
                                          className="mt-1 h-9 text-xs"
                                          placeholder="e.g. Is training documented for this process?"
                                          value={addLineDraftByChecklistId[item.id] ?? ''}
                                          onChange={(e) =>
                                            setAddLineDraftByChecklistId((p) => ({ ...p, [item.id]: e.target.value }))
                                          }
                                        />
                                      </div>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="h-9 shrink-0"
                                        onClick={() => {
                                          const text = (addLineDraftByChecklistId[item.id] ?? '').trim();
                                          if (!text) return;
                                          const uid =
                                            typeof crypto !== 'undefined' && crypto.randomUUID
                                              ? crypto.randomUUID()
                                              : String(Date.now());
                                          const newRow: EvidenceCheckRow = {
                                            id: `user-${uid}`,
                                            label: text.slice(0, 240),
                                            checked: false,
                                            source: 'user',
                                          };
                                          setChecklistDrafts((p) => {
                                            const prev = p[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard);
                                            return {
                                              ...p,
                                              [item.id]: {
                                                notes: p[item.id]?.notes ?? (item.notes || ''),
                                                score:
                                                  p[item.id]?.score ?? (item.score != null ? String(item.score) : ''),
                                                evidenceChecks: [...prev, newRow].slice(0, 48),
                                              },
                                            };
                                          });
                                          setAddLineDraftByChecklistId((p) => ({ ...p, [item.id]: '' }));
                                        }}
                                      >
                                        Add line
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <Label className="text-xs text-[var(--muted)]">Auditor notes</Label>
                                  {canEdit ? (
                                    <Textarea
                                      rows={3}
                                      className="mt-1 text-xs"
                                      placeholder="Observations, interviews, document refs..."
                                      value={checklistDrafts[item.id]?.notes ?? item.notes ?? ''}
                                      onChange={(e) =>
                                        setChecklistDrafts((p) => ({
                                          ...p,
                                          [item.id]: {
                                            notes: e.target.value,
                                            score:
                                              p[item.id]?.score ?? (item.score != null ? String(item.score) : ''),
                                            evidenceChecks:
                                              p[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard),
                                          },
                                        }))
                                      }
                                    />
                                  ) : (
                                    <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[var(--border)]/80 bg-[var(--nav-hover)]/40 p-2 text-xs text-[var(--muted)]">
                                      {item.notes || '-'}
                                    </p>
                                  )}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <p className="mb-1 text-[10px] font-semibold text-[var(--muted)]">Evaluation</p>
                                    {canEdit ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {ANSWER_CHIP_OPTIONS.map((o) => {
                                          const active = item.answer === o.value;
                                          const chipColor = FINDING_COLORS[o.value] || '#637381';
                                          return (
                                            <button
                                              key={o.value}
                                              type="button"
                                              className={cn(
                                                'rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all duration-200',
                                                active
                                                  ? 'shadow-sm'
                                                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand-primary)]/40',
                                              )}
                                              style={
                                                active
                                                  ? {
                                                      background: `${chipColor}18`,
                                                      borderColor: `${chipColor}55`,
                                                      color: chipColor,
                                                    }
                                                  : undefined
                                              }
                                              onClick={() => void onChecklistAnswer(item, o.value)}
                                            >
                                              {o.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    ) : item.answer ? (
                                      <Badge
                                        variant="default"
                                        className="text-[10px]"
                                        style={{
                                          background: `${FINDING_COLORS[item.answer] || '#637381'}22`,
                                          color: FINDING_COLORS[item.answer] || '#637381',
                                        }}
                                      >
                                        {item.answer === 'STRENGTH' ? 'Strong point' : item.answer.replace(/_/g, ' ')}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-rose-700">Pending</span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="mb-1 text-[10px] font-semibold text-[var(--muted)]">% score</p>
                                    {canEdit ? (
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        className="h-9 w-full text-center text-xs"
                                        placeholder="0-100"
                                        value={
                                          checklistDrafts[item.id]?.score !== undefined
                                            ? checklistDrafts[item.id]!.score
                                            : item.score != null
                                              ? String(item.score)
                                              : ''
                                        }
                                        onChange={(e) => {
                                          const t = e.target.value.replace(/\D/g, '');
                                          if (t.length > 3) return;
                                          setChecklistDrafts((p) => ({
                                            ...p,
                                            [item.id]: {
                                              notes: p[item.id]?.notes ?? (item.notes || ''),
                                              score: t,
                                              evidenceChecks: p[item.id]?.evidenceChecks ?? mergeEvidenceChecksForItem(item, selectedAudit?.isoStandard),
                                            },
                                          }));
                                        }}
                                        onBlur={() => void saveChecklistScore(item)}
                                      />
                                    ) : (
                                      <span className="text-sm font-medium tabular-nums">
                                        {item.score != null ? `${item.score}%` : '-'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {canEdit && (
                                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)]/80 pt-3">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="h-8 text-xs"
                                      disabled={aiScoreChecklistId === item.id}
                                      onClick={() => void saveChecklistEvidenceAndEvaluate(item)}
                                    >
                                      {aiScoreChecklistId === item.id ? 'Saving...' : 'Save & generate evaluation'}
                                    </Button>
                                  </div>
                                )}

                                <p
                                  className={cn(
                                    'text-[11px] leading-snug text-[var(--muted)]',
                                    item.answer === 'NON_CONFORMANT' && 'text-red-700',
                                    item.score != null && item.score < 40 && 'text-amber-900',
                                  )}
                                >
                                  {complianceStatusLabel(item.score, item.answer)}
                                </p>
                                {item.ncId && (
                                  <p className="text-[10px] font-medium text-rose-800">Linked NC: {item.ncId.slice(0, 8)}...</p>
                                )}
                              </CardContent>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedAudit.findings?.length > 0 && (
                    <div className="mb-6">
                      <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Findings ({selectedAudit.findings.length})</p>
                      <div className="space-y-2">
                        {selectedAudit.findings.map((f: any) => (
                          <div
                            key={f.id}
                            className="rounded-lg border border-[var(--border)] p-3 pl-4"
                            style={{ borderLeftWidth: 3, borderLeftColor: FINDING_COLORS[f.type] || '#637381' }}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <Badge variant="default" className="text-[10px]">
                                {f.type.replace('_', ' ')}
                              </Badge>
                              {f.isoClause && <span className="text-xs font-semibold">Clause {f.isoClause}</span>}
                            </div>
                            <p className="text-sm text-[var(--text-primary)]">{f.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAudit.completedReport && selectedAudit.status === 'COMPLETED' && (
                    <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#e8f4fc] via-[var(--surface)] to-[var(--surface-elevated)] shadow-sm dark:from-slate-900/80 dark:via-[var(--surface)] dark:to-[var(--surface-elevated)]">
                      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--border)]/60 bg-[#1565c0]/10 px-5 py-4 dark:bg-[#1565c0]/20">
                        <img
                          src="/brand/querlio-logo.png"
                          alt="Qurelio"
                          className="h-9 w-auto object-contain dark:opacity-90"
                          width={140}
                          height={36}
                        />
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">Audit report</p>
                          <p className="text-xs text-[var(--muted)]">Summary from completion</p>
                        </div>
                      </div>
                      <div className="p-5">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                          {selectedAudit.overallConclusion}
                        </p>
                      </div>
                    </div>
                  )}

                  <section
                    aria-labelledby="audit-change-log-heading"
                    className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/30"
                  >
                    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                        >
                          <History className="h-3.5 w-3.5" />
                        </span>
                        <h3
                          id="audit-change-log-heading"
                          className="text-[13px] font-semibold tracking-[-0.005em] text-[var(--text-primary)]"
                        >
                          Change log
                        </h3>
                      </div>
                      <span className="inline-flex min-w-[22px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[var(--muted)]">
                        {changeLogCount}
                      </span>
                    </header>
                    <div className="max-h-56 overflow-y-auto px-2 py-1 text-xs">
                      <AuditChangeLogTimeline logs={changeLog} nameMap={nameMap} />
                    </div>
                  </section>
                </CardContent>
              </Card>
            </motion.div>
          </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)] p-8">
                Select an audit from the list to view details
              </div>
            )}
          </div>
        )}
        </div>
      </motion.div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetNewAuditForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New audit</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label>Type *</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              >
                {['INTERNAL', 'SUPPLIER', 'CERTIFICATION'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
             <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date *</Label>
                <Input type="date" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} />
              </div>
              <div>
                <Label>End date *</Label>
                <Input type="date" value={form.scheduledEndAt} onChange={(e) => setForm((p) => ({ ...p, scheduledEndAt: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Standard reference *</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.isoDocumentId}
                disabled={loadingIsoDetail}
                onChange={(e) => void onIsoNormChange(e.target.value)}
              >
                <option value="">
                  {isoNorms.length === 0 ? 'No ISO norms uploaded yet' : 'Select a standard from the library...'}
                </option>
                {isoNorms.map((n) => (
                  <option key={n.id} value={n.id}>
                    {formatIsoNormSelectLabel(n)}
                  </option>
                ))}
              </select>
              {form.isoStandard && (
                <p className="mt-1 text-xs font-medium text-[var(--brand-primary)]">
                  Checklist reference: {form.isoStandard}
                </p>
              )}
              
            </div>
            <motion.div>
              <Label className="text-xs">Clause scope *</Label>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                Clauses come from the selected standard&apos;s extraction in the file library. Select at least one.
              </p>
              <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                {loadingIsoDetail ? (
                  <span className="text-xs text-[var(--muted)]">Loading clauses from documents</span>
                ) : !form.isoDocumentId ? (
                  <span className="text-xs text-[var(--muted)]">Select a standard to load clauses.</span>
                ) : auditClauseOptions.length === 0 ? (
                  <span className="text-xs text-amber-700">
                    No clauses in this document ” run extraction and activate the standard in the file library.
                  </span>
                ) : (
                  auditClauseOptions.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={form.scopeClauseRefs.includes(c)}
                        onChange={(e) => {
                          setForm((p) => ({
                            ...p,
                            scopeClauseRefs: e.target.checked
                              ? [...p.scopeClauseRefs, c]
                              : p.scopeClauseRefs.filter((x) => x !== c),
                          }));
                        }}
                      />
                      {c}
                    </label>
                  ))
                )}
              </div>
            </motion.div>
            <div>
              <Label>Lead auditor *</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.leadAuditor}
                onChange={(e) => setForm((p) => ({ ...p, leadAuditor: e.target.value }))}
              >
                <option value="">{companyUsers.length ? 'Select a team member' : 'Loading team'}</option>
                {companyUsers.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              {companyUsers.length === 0 && (
                <p className="mt-1 text-[10px] text-amber-700">Could not load company users - refresh the page or check your role.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={findingOpen} onOpenChange={setFindingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record finding</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Finding type</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-[var(--input-border)] px-2 text-sm"
                value={findingForm.type}
                onChange={(e) => setFindingForm((p) => ({ ...p, type: e.target.value }))}
              >
                {[
                  { value: 'CONFORMANT', label: 'Conformant' },
                  { value: 'NON_CONFORMANT', label: 'Non-conformant' },
                  { value: 'OBSERVATION', label: 'Observation' },
                  { value: 'STRENGTH', label: 'Strong point' },
                ].map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>ISO clause</Label>
              <Input placeholder="e.g. 8.1" value={findingForm.isoClause} onChange={(e) => setFindingForm((p) => ({ ...p, isoClause: e.target.value }))} />
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea rows={3} value={findingForm.description} onChange={(e) => setFindingForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <Label>Evidence</Label>
              <Textarea rows={2} value={findingForm.evidence} onChange={(e) => setFindingForm((p) => ({ ...p, evidence: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFindingOpen(false)}>Cancel</Button>
            <Button onClick={handleAddFinding}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete audit</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--muted)]">Generates the structured report (summary, scope, checklist, findings, NC links).</p>
          <Textarea className="mt-2" rows={4} placeholder="Overall conclusion / summary *" value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={handleComplete}>Complete &amp; save report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelAuditTarget} onOpenChange={(open) => !open && !cancellingAudit && setCancelAuditTarget(null)}>
        <DialogContent className="max-w-md gap-0 overflow-hidden border border-[var(--border)] p-0 shadow-2xl sm:rounded-2xl">
          <div className="bg-orange-500/[0.09] px-6 pb-6 pt-12 dark:bg-orange-950/45">
            <div className="flex gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200/70 bg-[var(--surface)] text-orange-600 shadow-sm dark:border-orange-800/45 dark:text-orange-400"
                aria-hidden
              >
                <Ban className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <DialogTitle className="text-left text-[17px] font-bold leading-snug tracking-tight text-[var(--text-primary)]">
                  Cancel this audit?
                </DialogTitle>
                <DialogDescription className="mt-2.5 text-left text-[13px] leading-relaxed text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text-primary)]">{cancelAuditTarget?.title}</span>
                  {' '}will move to <strong>Cancelled</strong>. You can delete it permanently from that tab.
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--text-primary)] shadow-sm hover:bg-[var(--nav-hover)]"
              disabled={cancellingAudit}
              onClick={() => setCancelAuditTarget(null)}
            >
              Keep audit
            </Button>
            <Button
              type="button"
              className="rounded-xl border-0 bg-orange-600 font-semibold text-white shadow-sm hover:bg-orange-700"
              disabled={cancellingAudit}
              onClick={() => void confirmCancelAudit()}
            >
              {cancellingAudit ? 'Cancelling...' : 'Cancel audit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteAuditTarget} onOpenChange={(open) => !open && !deletingAudit && setDeleteAuditTarget(null)}>
        <DialogContent className="max-w-md gap-0 overflow-hidden border border-[var(--border)] p-0 shadow-2xl sm:rounded-2xl">
          <div className="bg-red-500/[0.09] px-6 pb-6 pt-12 dark:bg-red-950/45">
            <div className="flex gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-[var(--surface)] text-red-600 shadow-sm dark:border-red-800/45 dark:text-red-400"
                aria-hidden
              >
                <Trash2 className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <DialogTitle className="text-left text-[17px] font-bold leading-snug tracking-tight text-[var(--text-primary)]">
                  Delete this audit?
                </DialogTitle>
                <DialogDescription className="mt-2.5 text-left text-[13px] leading-relaxed text-[var(--muted)]">
                  This permanently removes the cancelled audit{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{deleteAuditTarget?.title}</span>
                  {' '}and its checklist, findings, and history. Only audits in the <strong>Cancelled</strong> tab can be deleted.
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--text-primary)] shadow-sm hover:bg-[var(--nav-hover)]"
              disabled={deletingAudit}
              onClick={() => setDeleteAuditTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl font-semibold shadow-sm"
              disabled={deletingAudit}
              onClick={() => void confirmDeleteAudit()}
            >
              {deletingAudit ? 'Deleting...' : 'Delete audit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
