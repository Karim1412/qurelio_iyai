'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ClipboardCheck, FileText, Search, Shield, X } from '@/components/icons';
import { productApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { ApplicabilityReasonModal } from './ApplicabilityReasonModal';
import { CERTIFICATE_KEY, type ApplicabilityProduct } from './applicability-detail';
import { DECISION_LABEL, type ApplicabilityCandidateResponse, type SavedApplicabilityAssessment } from './applicability-assessment';

type Product = ApplicabilityProduct;

interface ReviewRow {
  id: string;
  product: Product;
  regulations: string[];
  requiredStandards: string[];
  certificates: string[];
  assessments: SavedApplicabilityAssessment[];
  matching: ApplicabilityCandidateResponse | null;
  matchingUnavailable: boolean;
  assessmentsUnavailable: boolean;
}

function uniqueValues(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => (value ?? '').trim()).filter(Boolean)));
}

function rowFromProduct(product: Product): ReviewRow {
  return {
    id: product.id,
    product,
    regulations: uniqueValues(product.applicableRegulations ?? []),
    requiredStandards: uniqueValues(product.requiredCertifications ?? []),
    certificates: uniqueValues((product.productCertifications ?? []).map((certificate) => certificate.standardName)),
    assessments: [],
    matching: null,
    matchingUnavailable: false,
    assessmentsUnavailable: false,
  };
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function RecordChip({
  label,
  onClick,
  kind,
}: {
  label: string;
  onClick: () => void;
  kind: 'regulation' | 'standard' | 'certificate';
}) {
  const kindClass = kind === 'regulation'
    ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
    : kind === 'standard'
      ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Review saved record: ${label}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${kindClass}`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="break-words">{label}</span>
    </button>
  );
}

export default function ApplicabilityPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<ReviewRow[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ product: Product; label: string; focusId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await productApi.list();
        const data = Array.isArray(response.data)
          ? response.data
          : Array.isArray((response.data as { products?: unknown[] } | undefined)?.products)
            ? (response.data as { products: Product[] }).products
            : [];
        if (!cancelled) {
          setProducts(data as Product[]);
          setLoadError(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
          toast.error('Could not load products. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.name, product.reference, product.sku]
        .some((value) => (value ?? '').toLocaleLowerCase().includes(needle)),
    );
  }, [products, query]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selected.has(product.id)),
    [products, selected],
  );
  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every((product) => selected.has(product.id));
  const previewRows = useMemo(() => reviewed ?? [], [reviewed]);

  const invalidateReview = () => setReviewed(null);
  const toggleOne = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    invalidateReview();
  };
  const toggleAllFiltered = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allFilteredSelected) filteredProducts.forEach((product) => next.delete(product.id));
      else filteredProducts.forEach((product) => next.add(product.id));
      return next;
    });
    invalidateReview();
  };

  const beginReview = async () => {
    if (!selectedProducts.length || reviewing) return;
    setReviewing(true);
    try {
      const rows = await Promise.all(selectedProducts.map(async (product) => {
        const base = rowFromProduct(product);
        const [assessmentResult, matchingResult] = await Promise.allSettled([
          productApi.listApplicabilityAssessments(product.id),
          productApi.findApplicabilityCandidates(product.id),
        ]);
        const assessmentsUnavailable = assessmentResult.status === 'rejected';
        const matchingUnavailable = matchingResult.status === 'rejected';
        const assessments = assessmentResult.status === 'fulfilled' && Array.isArray(assessmentResult.value.data)
          ? assessmentResult.value.data as SavedApplicabilityAssessment[]
          : [];
        const matching = matchingResult.status === 'fulfilled' && matchingResult.value.data
          ? matchingResult.value.data as ApplicabilityCandidateResponse
          : null;
        return { ...base, assessments, matching, matchingUnavailable, assessmentsUnavailable };
      }));
      setReviewed(rows);
      if (rows.some((row) => row.assessmentsUnavailable)) {
        toast.error('Some saved assessment histories could not be retrieved. An empty history is not treated as proof that no review exists.');
      }
      if (rows.some((row) => row.matchingUnavailable)) {
        toast.error('Candidate matching was unavailable for some products. Those products are marked as unavailable, not as having no applicable regulations.');
      }
    } finally {
      setReviewing(false);
    }
  };

  const openRecord = (product: Product, label: string, focusId?: string) => setDetail({ product, label, focusId });
  const refreshAssessments = async (productId: string) => {
    const response = await productApi.listApplicabilityAssessments(productId);
    const assessments = Array.isArray(response.data) ? response.data as SavedApplicabilityAssessment[] : [];
    setReviewed((previous) => previous?.map((row) => row.id === productId ? { ...row, assessments, assessmentsUnavailable: false } : row) ?? previous);
  };
  const currentDecisions = (assessments: SavedApplicabilityAssessment[]) => {
    const seen = new Set<string>();
    return assessments.filter((assessment) => {
      const key = assessment.regulationId || assessment.reference.trim().toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const totalDecisions = previewRows.reduce((sum, row) => sum + currentDecisions(row.assessments).length, 0);
  const totalRegulations = previewRows.reduce((sum, row) => sum + row.regulations.length, 0);
  const totalRequiredStandards = previewRows.reduce((sum, row) => sum + row.requiredStandards.length, 0);
  const totalCertificates = previewRows.reduce((sum, row) => sum + row.certificates.length, 0);
  const totalTopicMatches = previewRows.reduce((sum, row) => sum + (row.matching?.summary.topicMatches ?? 0), 0);
  const profilesNeedingMoreData = previewRows.filter((row) => !row.matching || row.matching.profile.missingProfileFields.length > 0 || row.matching.profile.warnings.length > 0).length;
  const currentAssessmentRows = previewRows.flatMap((row) => currentDecisions(row.assessments));
  const sourceReviewNeeded = currentAssessmentRows.filter((assessment) => ['SOURCE_CHANGED', 'CHECK_UNAVAILABLE', 'CHECK_OVERDUE', 'UNVERIFIED'].includes(assessment.sourceFreshness || '')).length;

  return (
    <DashboardLayout pageTitle="Applicability" pageTagline="Regulatory Monitoring">
      <div className="space-y-6">
        <p className="text-sm text-[var(--muted)]">Review product-linked regulatory references, saved reviewer decisions and certificate metadata.</p>

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <p className="text-sm text-[var(--muted)]">Loading products…</p>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
            <p className="text-base font-semibold text-[var(--text-primary)]">Products could not be loaded</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Refresh the page after checking your connection and access permissions.</p>
            <Button type="button" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] py-14 text-center">
            <ClipboardCheck className="mx-auto h-8 w-8 text-[var(--muted)]" />
            <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">No products yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
              Add products in Products Management before reviewing regulatory references.
            </p>
          </div>
        ) : (
          <>
            {/* Product selection */}
            <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">Choose products to review</h2>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">
                    {selected.size} selected · {products.length} available
                  </p>
                </div>
                <Button type="button" onClick={beginReview} disabled={selected.size === 0 || reviewing} className="gap-2">
                  {reviewing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <ClipboardCheck className="h-4 w-4" />}
                  {reviewing ? 'Matching products…' : 'Find matches & review'}
                </Button>
              </div>

              <div className="space-y-3 px-5 py-4">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Select products"
                      aria-expanded={pickerOpen}
                      className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-left text-sm text-[var(--text-primary)] shadow-sm transition-colors hover:border-[var(--brand-primary)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    >
                      <span className={selected.size === 0 ? 'text-[var(--muted)]' : undefined}>
                        {selected.size === 0 ? 'Select one or more products…' : `${selected.size} product${selected.size === 1 ? '' : 's'} selected`}
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={6}
                    className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <div className="border-b border-[var(--border)] p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                        <Input
                          autoFocus
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Search by product, reference or SKU…"
                          className="h-9 pl-9"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                      <button type="button" onClick={toggleAllFiltered} disabled={!filteredProducts.length} className="text-[12px] font-semibold text-[var(--brand-primary)] disabled:opacity-40">
                        {allFilteredSelected ? 'Deselect visible' : 'Select visible'}{query.trim() ? ` (${filteredProducts.length})` : ''}
                      </button>
                      <button type="button" onClick={() => { setSelected(new Set()); invalidateReview(); }} disabled={!selected.size} className="text-[12px] font-semibold text-[var(--muted)] disabled:opacity-40">
                        Clear selection
                      </button>
                    </div>
                    <div role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
                      {filteredProducts.length === 0 ? (
                        <p className="px-3 py-6 text-center text-[13px] text-[var(--muted)]">No products match “{query}”.</p>
                      ) : filteredProducts.map((product) => {
                        const checked = selected.has(product.id);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            role="option"
                            aria-selected={checked}
                            onClick={() => toggleOne(product.id)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--nav-hover)]/50"
                          >
                            <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{product.name}</span>
                              <span className="block truncate font-mono text-[11px] text-[var(--muted)]">{product.reference || product.sku || 'No reference recorded'}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                {selectedProducts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Selected products">
                    {selectedProducts.map((product) => (
                      <span key={product.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--brand-primary)]/10 py-1 pl-3 pr-1 text-[11px] font-semibold text-[var(--brand-primary)]">
                        <span className="max-w-[220px] truncate">{product.name}</span>
                        <button type="button" onClick={() => toggleOne(product.id)} aria-label={`Remove ${product.name}`} className="rounded-full p-1 transition-colors hover:bg-[var(--brand-primary)]/20">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Results/review */}
            {previewRows.length > 0 && (
              <>
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  <Metric label="Products in review" value={previewRows.length} detail="Selected product records" />
                  <Metric label="Regulatory references" value={totalRegulations} detail="Saved on product records" />
                  <Metric label="Reviewer decisions" value={totalDecisions} detail="Latest saved decision per reference" />
                  <Metric label="Required standards" value={totalRequiredStandards} detail="Declared requirements" />
                  <Metric label="Certificate records" value={totalCertificates} detail="Metadata on file" />
                  <Metric label="Topic matches" value={totalTopicMatches} detail="Candidate references from product-context signals" />
                  <Metric label="Profiles to improve" value={profilesNeedingMoreData} detail="Missing or uncertain matching inputs" />
                  <Metric label="Source review needed" value={sourceReviewNeeded} detail="Changed, unverified or unavailable source snapshots" />
                </section>

                <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--text-primary)]">Regulatory applicability review</h2>
                      <p className="mt-1 text-[13px] text-[var(--muted)]">
                        Open a reference to inspect its source and product context, then record a human-reviewed decision with rationale and evidence.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                      <Shield className="h-3.5 w-3.5" /> Reviewer-owned decisions
                    </span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[170px] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Product</TableHead>
                        <TableHead className="min-w-[190px] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Regulatory references</TableHead>
                        <TableHead className="min-w-[180px] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Required standards</TableHead>
                        <TableHead className="min-w-[160px] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Certificates on record</TableHead>
                        <TableHead className="min-w-[140px] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Assessment state</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="align-top">
                            <div className="font-semibold text-[var(--text-primary)]">{row.product.name}</div>
                            <div className="mt-1 font-mono text-xs text-[var(--muted)]">{row.product.reference || row.product.sku || 'No reference'}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            {row.regulations.length ? (
                              <div className="flex max-w-[360px] flex-wrap gap-1.5">
                                {row.regulations.map((label, index) => <RecordChip key={`${row.id}-reg-${index}`} label={label} kind="regulation" onClick={() => openRecord(row.product, label)} />)}
                              </div>
                            ) : <span className="text-xs text-[var(--muted)]">No regulatory references recorded</span>}
                          </TableCell>
                          <TableCell className="align-top">
                            {row.requiredStandards.length ? (
                              <div className="flex max-w-[340px] flex-wrap gap-1.5">
                                {row.requiredStandards.map((label, index) => <RecordChip key={`${row.id}-std-${index}`} label={label} kind="standard" onClick={() => openRecord(row.product, label)} />)}
                              </div>
                            ) : <span className="text-xs text-[var(--muted)]">No required standards recorded</span>}
                          </TableCell>
                          <TableCell className="align-top">
                            {row.certificates.length ? (
                              <div className="flex max-w-[300px] flex-wrap gap-1.5">
                                {row.certificates.map((label, index) => <RecordChip key={`${row.id}-cert-${index}`} label={label} kind="certificate" onClick={() => openRecord(row.product, label, CERTIFICATE_KEY)} />)}
                              </div>
                            ) : <span className="text-xs text-[var(--muted)]">No certificate metadata</span>}
                          </TableCell>
                          <TableCell className="align-top">
                            {currentDecisions(row.assessments).length ? (
                              <div className="space-y-1.5">
                                {currentDecisions(row.assessments).slice(0, 3).map((assessment) => {
                                  const tone = assessment.decision === 'APPLICABLE' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : assessment.decision === 'NOT_APPLICABLE' ? 'border-slate-200 bg-slate-50 text-slate-700'
                                      : 'border-amber-200 bg-amber-50 text-amber-800';
                                  return (
                                    <div key={assessment.id} className="flex max-w-full flex-col items-start gap-0.5">
                                      <span className={`inline-flex max-w-full items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${tone}`} title={assessment.reference}>{DECISION_LABEL[assessment.decision]}</span>
                                      <span className="max-w-[180px] truncate text-[10px] text-[var(--muted)]" title={assessment.reference}>{assessment.reference}</span>
                                      {assessment.sourceFreshness && assessment.sourceFreshness !== 'CURRENT' && (
                                        <span className={`mt-0.5 inline-flex max-w-[210px] items-center rounded-md px-2 py-1 text-[10px] font-semibold ${['SOURCE_CHANGED', 'CHECK_UNAVAILABLE', 'CHECK_OVERDUE', 'UNVERIFIED'].includes(assessment.sourceFreshness) ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                                          {assessment.sourceFreshness === 'SOURCE_CHANGED' ? 'Source changed · re-review' :
                                            assessment.sourceFreshness === 'CHECK_UNAVAILABLE' ? 'Source check failed' :
                                              assessment.sourceFreshness === 'CHECK_OVERDUE' ? 'Source check overdue' :
                                                assessment.sourceFreshness === 'UNVERIFIED' ? 'Source snapshot unverified' : 'Not linked to monitor'}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                                {currentDecisions(row.assessments).length > 3 && <p className="text-[11px] text-[var(--muted)]">+{currentDecisions(row.assessments).length - 3} more decisions</p>}
                              </div>
                            ) : row.assessmentsUnavailable ? (
                              <div className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800">
                                <span className="h-2 w-2 rounded-full bg-rose-500" /> History unavailable
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                                <span className="h-2 w-2 rounded-full bg-amber-500" /> No saved decision found
                              </div>
                            )}
                            <p className="mt-1.5 max-w-[180px] text-[11px] leading-4 text-[var(--muted)]">
                              {currentDecisions(row.assessments).length ? `${currentDecisions(row.assessments).length} latest saved decision(s) · history retained` : row.assessmentsUnavailable ? 'History could not be retrieved; retry before concluding no review exists.' : 'No saved decision was returned. Open a regulatory reference to record a review.'}
                            </p>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {previewRows.every((row) => !row.regulations.length && !row.requiredStandards.length && !row.certificates.length) && (
                    <div className="border-t border-[var(--border)] px-5 py-8 text-center">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">No regulatory records found for this selection</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Candidate discovery below can identify references from the limited catalog, but a missing match does not mean no regulation applies.</p>
                    </div>
                  )}
                </section>

                <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <div className="border-b border-[var(--border)] px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-bold text-[var(--text-primary)]">Potential regulatory references</h2>
                        <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[var(--muted)]">Candidate discovery compares recorded product attributes with catalog industry, jurisdiction and topic signals. These are review candidates—not legal applicability decisions or proof of compliance.</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"><Shield className="h-3.5 w-3.5" /> Human verification required</span>
                    </div>
                    {previewRows.find((row) => row.matching)?.matching && (() => {
                      const sample = previewRows.find((row) => row.matching)!.matching!;
                      const stale = ['STALE_REVALIDATION_REQUIRED', 'AS_OF_DATE_MISSING', 'AS_OF_DATE_IN_FUTURE'].includes(sample.catalog.status);
                      return <div className={`mt-3 rounded-xl border px-3 py-2.5 text-xs leading-5 ${stale ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'}`}><span className="font-semibold">Catalog snapshot:</span> {sample.catalog.version} · as of {sample.catalog.asOfDate || 'date not recorded'} · {sample.catalog.referenceCount} instrument records · actual industry coverage: {sample.catalog.industriesActuallyCovered.join(', ') || 'not recorded'}. {sample.catalog.status === 'STALE_REVALIDATION_REQUIRED' ? 'This snapshot is over 90 days old and must be revalidated before production reliance. ' : ''}{sample.catalog.coverageNote}</div>;
                    })()}
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {previewRows.map((row) => {
                      const match = row.matching;
                      return (
                        <div key={`${row.id}-candidate-matches`} className="space-y-3 px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div><h3 className="text-sm font-bold text-[var(--text-primary)]">{row.product.name}</h3><p className="mt-0.5 text-xs text-[var(--muted)]">Markets: {row.product.targetMarkets?.length ? row.product.targetMarkets.join(', ') : 'Not recorded'} · Industry labels: {[...(row.product.industryLabels ?? []), ...(row.product.categoryTags ?? [])].join(', ') || 'Not recorded'}</p></div>
                            {match && <span className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)]">{match.summary.topicMatches} topic match(es)</span>}
                          </div>
                          {row.matchingUnavailable || !match ? (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900"><p className="font-semibold">Candidate discovery unavailable</p><p className="mt-1 text-xs leading-5">The matching endpoint did not return a result. This is a service error, not evidence that no regulations apply. Check that the updated document service is running and retry.</p></div>
                          ) : (
                            <>
                              {match.profile.missingProfileFields.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-950"><p className="font-semibold">Improve product data for better matching</p><p className="mt-1">Missing: {match.profile.missingProfileFields.join(', ')}.</p></div>}
                              {match.profile.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--muted)]">{match.profile.warnings.map((warning, index) => <li key={`${row.id}-warning-${index}`}>{warning}</li>)}</ul>}
                              {(match.recordedReferenceMatches.length > 0 || match.topicMatches.length > 0) ? (
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                  {[...match.recordedReferenceMatches, ...match.topicMatches].map((candidate) => (
                                    <article key={`${row.id}-${candidate.regulationId}`} className="rounded-xl border border-[var(--border)] p-3">
                                      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--text-primary)]">{candidate.title || candidate.reference}</p><p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">{candidate.reference} · {candidate.regulationId}</p></div><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${candidate.matchType === 'RECORDED_REFERENCE' ? 'bg-sky-100 text-sky-900' : 'bg-violet-100 text-violet-900'}`}>{candidate.matchLabel}</span></div>
                                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{candidate.jurisdiction || candidate.countryRegion || 'Jurisdiction not recorded'} · {candidate.category || candidate.type || 'Type not recorded'} · {candidate.legalStatus || 'Handling status unclassified'}</p>
                                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--text-secondary)]">{candidate.reasons.map((reason, index) => <li key={`${candidate.regulationId}-reason-${index}`}>{reason}</li>)}</ul>
                                      {candidate.matchedSignals.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{candidate.matchedSignals.map((signal, index) => <span key={`${candidate.regulationId}-signal-${index}`} title={signal.sourceDocumentName ? `Grounded in ${signal.sourceDocumentName}` : signal.source} className="rounded-md bg-[var(--surface-secondary)] px-2 py-1 text-[10px] text-[var(--muted)]">{signal.field}: {signal.value}</span>)}</div>}
                                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">{candidate.sourceUrl ? <span className="flex flex-col gap-1"><a href={candidate.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-[var(--brand-primary)] underline underline-offset-2">Open listed source ↗</a><span className="text-[10px] text-[var(--muted)]">URL recorded · not independently verified</span></span> : <span className="text-[11px] text-amber-800">No source URL recorded</span>}<Button type="button" size="sm" onClick={() => openRecord(row.product, candidate.reference, candidate.regulationId)}>Review reference</Button></div>
                                      <p className="mt-2 text-[10px] leading-4 text-amber-800">{candidate.scopeWarning}</p>
                                    </article>
                                  ))}
                                </div>
                              ) : <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted)]">{match.summary.note} A missing match does not prove that no regulation applies.</div>}
                              {match.broaderScreeningCandidates.length > 0 && <details className="rounded-xl border border-[var(--border)] px-3 py-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--text-primary)]">Additional same-industry / market references to screen ({match.broaderScreeningCandidates.length})</summary><p className="mt-2 text-xs leading-5 text-[var(--muted)]">These entries fit catalog industry and jurisdiction metadata but had no specific product-topic trigger. They are shown separately to avoid presenting them as close matches.</p><div className="mt-3 space-y-2">{match.broaderScreeningCandidates.map((candidate) => <div key={`${row.id}-broad-${candidate.regulationId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--text-primary)]">{candidate.title || candidate.reference}</p><p className="text-[10px] text-[var(--muted)]">{candidate.reference} · {candidate.jurisdiction || candidate.countryRegion} · scope not established</p></div><Button type="button" size="sm" variant="outline" onClick={() => openRecord(row.product, candidate.reference, candidate.regulationId)}>Screen</Button></div>)}</div></details>}
                              {match.unrecognizedRecordedReferences.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"><p className="text-xs font-semibold text-amber-950">Recorded references not found in this catalog</p><ul className="mt-2 space-y-2">{match.unrecognizedRecordedReferences.map((item, index) => <li key={`${row.id}-unknown-${index}`} className="text-xs leading-5 text-amber-950"><span className="font-semibold">{item.value}</span> — {item.note}</li>)}</ul></div>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {!previewRows.length && (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
                <ClipboardCheck className="mx-auto h-7 w-7 text-[var(--muted)]" />
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">Select products to review their saved regulatory records</p>
                <p className="mt-1 text-xs text-[var(--muted)]">After loading products, open a regulatory reference to inspect its source details or record a reviewed applicability decision.</p>
              </div>
            )}
          </>
        )}
      </div>

      <ApplicabilityReasonModal
        product={detail?.product ?? null}
        label={detail?.label ?? null}
        initialFocusId={detail?.focusId}
        savedAssessments={previewRows.find((row) => row.id === detail?.product.id)?.assessments ?? []}
        onAssessmentSaved={refreshAssessments}
        onOpenChange={(open) => { if (!open) setDetail(null); }}
      />
    </DashboardLayout>
  );
}
