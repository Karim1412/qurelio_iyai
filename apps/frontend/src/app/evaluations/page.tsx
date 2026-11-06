'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, BarChart3, ExternalLink, Loader2, Trash2, LayoutGrid, List } from '@/components/icons';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getPageMeta } from '@/lib/page-meta';
import { evaluationApi, documentApi, productApi } from '@/lib/api';
import { formatEvaluationPair } from '@/lib/evaluation-pair-label';
import { formatEvaluationRetryError } from '@/lib/evaluation-retry-error';
import { formatIsoNormSelectLabel, isoNormEvalReference, slicePage, totalPages } from '@/lib/file-library-helpers';
import { collectProductStandards, standardMatchesRef } from '@/lib/product-standards';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissions } from '@/hooks/usePermissions';
import { SectionPagination, DEFAULT_SECTION_PAGE_SIZE } from '@/components/ui/section-pagination';
import { useConfirmAction } from '@/hooks/use-confirm-action';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ACTIVE_EVALUATION_STATUSES,
  EvaluationProgress,
} from '@/components/evaluations/EvaluationProgress';
const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  QUEUED: { color: '#637381', bg: 'rgba(145,158,171,0.12)' },
  PROCESSING: { color: '#ffab00', bg: 'rgba(255,171,0,0.12)' },
  COMPLETED: { color: '#36b37e', bg: 'rgba(54,179,126,0.12)' },
  FAILED: { color: '#ff5630', bg: 'rgba(255,86,48,0.12)' },
};

function ScoreGauge({
  score,
  status,
  evaluationId,
  startedAt,
}: {
  score: number | null;
  status?: string;
  evaluationId?: string;
  startedAt?: string | null;
}) {
  if (score === null) {
    // A queued/running evaluation gets a live 0→100% bar instead of a static label.
    if (status && evaluationId && ACTIVE_EVALUATION_STATUSES.has(status)) {
      return (
        <EvaluationProgress evaluationId={evaluationId} status={status} startedAt={startedAt} />
      );
    }
    return <span className="text-sm text-[#919eab]">{status === 'COMPLETED' ? 'Review needed' : 'Pending'}</span>;
  }
  const color = score >= 90 ? '#118d57' : score >= 70 ? '#b76e00' : '#b71d18';
  return (
    <div className="text-center">
      <p className="text-2xl font-black" style={{ color }}>
        {score.toFixed(1)}%
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--page-bg)]">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, score)}%`, background: color }} />
      </div>
    </div>
  );
}

export default function EvaluationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const perms = usePermissions();
  const pageMeta = getPageMeta(pathname || '/evaluations');
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [isoNorms, setIsoNorms] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tenantDocs, setTenantDocs] = useState<
    { id: string; productId?: string | null; productName?: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    isoDocumentId: '',
    productDocumentId: '',
    productId: '',
    evidenceDocumentIds: [] as string[],
    isoStandard: '',
    /** Declared standard/regulation picked from the product's own profile. */
    productStandardRef: '',
  });
  const [creating, setCreating] = useState(false);
  const [evalListPage, setEvalListPage] = useState(1);
  const [evalPageSize, setEvalPageSize] = useState(DEFAULT_SECTION_PAGE_SIZE);

  const pagedEvaluations = useMemo(
    () => slicePage(evaluations, evalListPage, evalPageSize),
    [evaluations, evalListPage, evalPageSize],
  );

  const evalLastPage = totalPages(evaluations.length, evalPageSize);

  /** Standards & regulations the selected product declared in the product wizard. */
  const declaredStandards = useMemo(
    () => collectProductStandards(products.find((p) => p.id === form.productId)),
    [products, form.productId],
  );

  /**
   * Options for the standard dropdown, built from what the product declares.
   *
   * Each declared certificate / standard / regulation is resolved to the library
   * document that satisfies it. A declaration with no activated document is still
   * listed, disabled, so the gap is visible rather than silently absent, an
   * evaluation needs a real document with clauses to score against.
   *
   * `value` is `documentId::declaration` so choosing an entry records both the
   * document to run and the obligation it was chosen for.
   */
  const { declaredOptions, unmatchedDeclarations, otherNorms } = useMemo(() => {
    const declared: Array<{ value: string; label: string; sourceLabel: string }> = [];
    const unmatched: Array<{ value: string; sourceLabel: string }> = [];
    const usedNormIds = new Set<string>();

    for (const s of declaredStandards) {
      const hits = isoNorms.filter((n) => standardMatchesRef(n, s.value));
      if (hits.length === 0) {
        unmatched.push({ value: s.value, sourceLabel: s.sourceLabel });
        continue;
      }
      for (const n of hits) {
        usedNormIds.add(n.id);
        declared.push({
          value: `${n.id}::${s.value}`,
          label: `${s.value} → ${formatIsoNormSelectLabel(n)}`,
          sourceLabel: s.sourceLabel,
        });
      }
    }

    return {
      declaredOptions: declared,
      unmatchedDeclarations: unmatched,
      // Never a dead end: any other activated standard stays selectable.
      otherNorms: isoNorms.filter((n) => !usedNormIds.has(n.id)),
    };
  }, [isoNorms, declaredStandards]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadEvaluations, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEvalListPage(1);
  }, [evaluations.length]);

  useEffect(() => {
    setEvalListPage(1);
  }, [evalPageSize]);

  useEffect(() => {
    if (evalListPage > evalLastPage) setEvalListPage(Math.max(1, evalLastPage));
  }, [evalListPage, evalLastPage]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [evRes, normsRes, prodRes, docsRes] = await Promise.all([
        evaluationApi.list(),
        documentApi.getIsoNorms(),
        productApi.list(),
        documentApi.list(),
      ]);
      setEvaluations(evRes.data);
      setIsoNorms(normsRes.data);
      setProducts(prodRes.data ?? []);
      const rawDocs = Array.isArray(docsRes.data) ? docsRes.data : [];
      setTenantDocs(
        rawDocs.map(
          (d: { id: string; productId?: string | null; product?: { name?: string } | null }) => ({
            id: d.id,
            productId: d.productId ?? null,
            productName: d.product?.name ?? null,
          }),
        ),
      );
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadEvaluations = async () => {
    try {
      const res = await evaluationApi.list();
      setEvaluations(res.data);
    } catch {
      /* ignore poll errors */
    }
  };

  const handleCreate = async () => {
    if (!form.productId || !form.productDocumentId) return toast.error('Select a product document first');
    if (!form.isoDocumentId) return toast.error('Select the standard document to evaluate against');
    setCreating(true);
    try {
      const norm = isoNorms.find((n) => n.id === form.isoDocumentId);
      const pr = products.find((p) => p.id === form.productId);
      const docMeta = (pr?.documents ?? []).find((d: { id: string; name?: string }) => d.id === form.productDocumentId) as
        | { id: string; name?: string }
        | undefined;
      await evaluationApi.create({
        isoDocumentId: form.isoDocumentId,
        productDocumentId: form.productDocumentId,
        isoStandard: form.isoStandard || isoNormEvalReference(norm ?? null),
        productName: typeof pr?.name === 'string' ? pr.name : undefined,
        evaluationMetadata: {
          standardReference: norm?.isoStandard?.trim() || norm?.name?.trim() || null,
          standardTitle:
            norm?.name?.trim() && norm?.isoStandard?.trim() && norm.name.trim() !== norm.isoStandard.trim()
              ? norm.name.trim()
              : null,
          standardName: norm?.name ?? norm?.isoStandard ?? null,
          isoStandard: norm?.isoStandard ?? norm?.name ?? null,
          productName: pr?.name ?? null,
          productId: form.productId || null,
          productDocumentName: docMeta?.name ?? null,
          /** Which declared obligation this run was started for, when one was chosen. */
          productDeclaredStandard: form.productStandardRef || null,
          companyName: user?.company?.name?.trim() || null,
        },
        reportContext: {
          company: {
            companyName: user?.company?.name?.trim() || '',
            address: (user?.company as { field?: string } | undefined)?.field?.trim() || '',
            email: '',
            phone: user?.phone?.trim() || '',
          },
          initiator: {
            firstName: user?.firstName?.trim() || '',
            lastName: user?.lastName?.trim() || '',
            email: user?.email?.trim() || '',
          },
        },
        evidenceDocumentIds:
          form.evidenceDocumentIds.length > 1 ? form.evidenceDocumentIds : undefined,
      });
      toast.success('Evaluation queued! You will be notified when complete.');
      setCreateOpen(false);
      setForm({
        isoDocumentId: '',
        productDocumentId: '',
        productId: '',
        evidenceDocumentIds: [],
        isoStandard: '',
        productStandardRef: '',
      });
      loadEvaluations();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create evaluation'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (evaluationId: string) => {
    const ok = await confirm({
      title: 'Delete forever?',
      description:
        'This permanently removes the evaluation record and related draft data. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await evaluationApi.delete(evaluationId);
      toast.success('Evaluation deleted');
      loadEvaluations();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Delete failed');
    }
  };

  const handleRetry = async (ev: { id: string; isoStandard?: string; isoDocumentId?: string; productDocumentId?: string }) => {
    const pair = formatEvaluationPair(ev, isoNorms, products, tenantDocs);
    try {
      await evaluationApi.retry(ev.id);
      toast.success(`Re-queued: ${pair.summary}`);
      loadEvaluations();
    } catch (err: unknown) {
      toast.error(formatEvaluationRetryError(err));
    }
  };

  return (
    <DashboardLayout showRouteHeader={false}>
      {confirmDialog}
      <header className="mb-6 flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">{pageMeta.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">{pageMeta.tagline}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="mr-1 flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1 px-2.5',
                viewMode === 'grid' ? 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]' : 'text-[var(--muted)]',
              )}
              title="Card grid"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1 px-2.5',
                viewMode === 'list' ? 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]' : 'text-[var(--muted)]',
              )}
              title="Table list"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
             
            </Button>
          </div>
          {perms.launchComplianceEvaluation && (
            <Button type="button" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New evaluation
            </Button>
          )}
        </div>
      </header>

      {loading && <div className="mb-4 h-1 w-full animate-pulse rounded bg-[var(--brand-primary)]/30" />}

      {evaluations.length === 0 && !loading ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-12 text-center">
          <BarChart3 className="mx-auto mb-4 h-14 w-14 text-[#919eab]" />
          <p className="mb-4 text-[var(--muted)]">No evaluations yet</p>
          {perms.launchComplianceEvaluation && (
            <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Start your first evaluation
            </Button>
          )}
        </div>
      ) : evaluations.length > 0 ? (
        <>
        {viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pagedEvaluations.map((ev, i) => {
            const cfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.QUEUED;
            const pair = formatEvaluationPair(ev, isoNorms, products, tenantDocs);
            return (
              <motion.div key={ev.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="relative overflow-hidden border-[var(--border)] shadow-none transition-hover hover:shadow-sm">
                  <div className="h-1 w-full" style={{ background: cfg.color }} />
                  <CardContent className="p-5">
                    <div className="mb-4 flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--text-primary)]">{pair.isoLine}</p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-[var(--muted)]" title={pair.isoLine}>
                          <span className="font-medium text-[var(--text-primary)]">ISO</span> {pair.isoLine}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-[var(--muted)]" title={pair.productLine}>
                          <span className="font-medium text-[var(--text-primary)]">Product</span> {pair.productLine}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">{format(new Date(ev.createdAt), 'MMM d, yyyy HH:mm')}</p>
                      </div>
                      <Badge variant="default" className="h-6 text-[10px]" style={{ background: cfg.bg, color: cfg.color }}>
                        {ev.status === 'PROCESSING' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                        {ev.status}
                      </Badge>
                    </div>
                    <ScoreGauge
                      score={ev.conformityScore}
                      status={ev.status}
                      evaluationId={ev.id}
                      startedAt={ev.startedAt ?? ev.createdAt}
                    />
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-[var(--muted)]">{ev._count?.nonConformities || 0} non-conformities</span>
                      <div className="flex items-center gap-1">
                        {ev.status === 'COMPLETED' && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            aria-label="Open report"
                            title="Open report"
                            onClick={() => router.push(`/evaluations/${ev.id}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {ev.status === 'FAILED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            title={pair.summary}
                            onClick={() => void handleRetry(ev)}
                          >
                            Retry
                          </Button>
                        )}
                        {perms.launchComplianceEvaluation && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Delete evaluation"
                            title="Delete evaluation"
                            onClick={() => void handleDelete(ev.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedEvaluations.map((ev) => {
                const cfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.QUEUED;
                const pair = formatEvaluationPair(ev, isoNorms, products, tenantDocs);
                const score =
                  ev.conformityScore != null && typeof ev.conformityScore === 'number'
                    ? `${ev.conformityScore.toFixed(1)}%`
                    : '-';
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="font-medium">{pair.isoLine}</TableCell>
                    <TableCell className="max-w-[20rem] truncate text-sm font-medium text-[var(--text-primary)]" title={pair.productLine}>
                      {pair.productLine}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="h-6 text-[10px]" style={{ background: cfg.bg, color: cfg.color }}>
                        {ev.status === 'PROCESSING' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                        {ev.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {ev.conformityScore == null && ACTIVE_EVALUATION_STATUSES.has(ev.status) ? (
                        <EvaluationProgress
                          evaluationId={ev.id}
                          status={ev.status}
                          startedAt={ev.startedAt ?? ev.createdAt}
                          compact
                        />
                      ) : (
                        score
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--muted)]">
                      {format(new Date(ev.createdAt), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <div className="flex w-full items-center justify-end gap-1">
                        {ev.status === 'COMPLETED' && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label="Open report"
                            onClick={() => router.push(`/evaluations/${ev.id}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {ev.status === 'FAILED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => void handleRetry(ev)}
                          >
                            Retry
                          </Button>
                        )}
                        {perms.launchComplianceEvaluation && (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            aria-label="Delete"
                            onClick={() => void handleDelete(ev.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        )}
        <SectionPagination
          className="mt-4"
          variant="indigo"
          activeStyle="prime"
          page={evalListPage}
          onPageChange={setEvalListPage}
          totalItems={evaluations.length}
          pageSize={evalPageSize}
          onPageSizeChange={setEvalPageSize}
          rowsPerPageOptions={[6, 10, 20, 30]}
        />
        </>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New conformity evaluation</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* 1: the product drives which standards are relevant below. */}
            <div>
              <Label>
                <span className="mr-1.5 text-[var(--brand-primary)]">1.</span>Product document
              </Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.productId}
                onChange={(e) => {
                  const pid = e.target.value;
                  const pr = products.find((p) => p.id === pid);
                  const docs = (pr?.documents ?? []) as { id: string }[];
                  const ids = docs.map((d) => d.id).filter(Boolean);
                  const primary = ids[0] || '';
                  // A standard chosen for the previous product no longer applies.
                  setForm((p) => ({
                    ...p,
                    productId: pid,
                    productDocumentId: primary,
                    evidenceDocumentIds: ids,
                    productStandardRef: '',
                    isoDocumentId: '',
                    isoStandard: '',
                  }));
                }}
              >
                {products.length === 0 ? (
                  <option value="" disabled>
                    No products yet. Upload under Product documents
                  </option>
                ) : (
                  <>
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {(p.documents?.length ?? 0) > 0 ? ` (${p.documents.length} file(s))` : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* 2: the standard to evaluate against, listed from what the product declares. */}
            <div>
              <Label>
                <span className="mr-1.5 text-[var(--brand-primary)]">2.</span>Standard document
              </Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm disabled:opacity-60"
                value={
                  form.isoDocumentId
                    ? `${form.isoDocumentId}::${form.productStandardRef}`
                    : ''
                }
                disabled={!form.productId}
                onChange={(e) => {
                  const [docId, declaredRef = ''] = e.target.value.split('::');
                  const doc = isoNorms.find((n) => n.id === docId);
                  setForm((p) => ({
                    ...p,
                    isoDocumentId: docId,
                    productStandardRef: declaredRef,
                    isoStandard: isoNormEvalReference(doc ?? null),
                  }));
                }}
              >
                <option value="">
                  {!form.productId
                    ? 'Select a product first…'
                    : isoNorms.length === 0
                      ? 'No standards activated yet'
                      : 'Select a standard…'}
                </option>

                {declaredOptions.length > 0 && (
                  <optgroup label="Declared by this product">
                    {declaredOptions.map((o) => (
                      <option key={o.value} value={o.value} title={o.label}>
                        {o.sourceLabel}: {o.label.length > 95 ? `${o.label.slice(0, 95)}…` : o.label}
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* Declared but not in the library: shown so the gap is obvious, not selectable. */}
                {unmatchedDeclarations.length > 0 && (
                  <optgroup label="Declared: not in Standards Library">
                    {unmatchedDeclarations.map((o) => (
                      <option key={o.value} value="" disabled title={o.value}>
                        {o.sourceLabel}: {o.value.length > 80 ? `${o.value.slice(0, 80)}…` : o.value}
                      </option>
                    ))}
                  </optgroup>
                )}

                {otherNorms.length > 0 && (
                  <optgroup
                    label={declaredOptions.length > 0 ? 'Other standards in the library' : 'Standards library'}
                  >
                    {otherNorms.map((n) => (
                      <option key={n.id} value={`${n.id}::`}>
                        {formatIsoNormSelectLabel(n)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {form.productId && declaredStandards.length === 0 && (
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  This product declares no certifications or regulations yet. Add them in the
                  product form (Markets and Certifications steps) to see them listed here.
                </p>
              )}
              {form.productId && declaredOptions.length === 0 && unmatchedDeclarations.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  This product declares {unmatchedDeclarations.length} standard
                  {unmatchedDeclarations.length > 1 ? 's' : ''}, but none is activated in the
                  Standards Library yet. Upload and activate them, or pick another document.
                </p>
              )}
            </div>
            {form.isoStandard && (
              <div className="rounded-lg bg-[var(--nav-hover)] px-3 py-2 text-xs font-semibold text-[var(--brand-primary)]">
                Evaluating against: {form.isoStandard}
              </div>
            )}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The AI will perform semantic mapping of Standards clauses against your document. This may take 1–5 minutes.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !form.isoDocumentId || !form.productId || !form.productDocumentId}
            >
              {creating ? 'Queuing…' : 'Start evaluation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
