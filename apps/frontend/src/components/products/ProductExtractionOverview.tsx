'use client';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { CircleCheck, CircleAlert, Sparkles, FileText, ShieldCheck, Layers } from '@/components/icons';
import { documentApi, productApi } from '@/lib/api';

type PredefinedFieldCheck = { field: string; label: string; detected: boolean; value?: string | null; grounded?: boolean | null };
type CategoryChecklistResult = {
  label: string;
  checklist: PredefinedFieldCheck[];
  missingFields: string[];
  ungroundedFields?: string[];
  detectedFieldCount: number;
  totalPredefinedFields: number;
  overallConfidence: number;
};
type FieldProvenanceEntry = {
  value: string;
  documentId: string;
  documentName: string;
  updatedAt: string;
  locationHint?: string;
  resolvedManuallyBy?: string;
  grounded?: boolean | null;
  evidence?: string | null;
  confidence?: number | null;
  sourceAuthority?: string | null;
};
type FieldConflictCandidate = { value: string; documentId: string; documentName: string; detectedAt: string };
type RequirementCoverageItem = { requirement: string; covered: boolean; matchedAgainst?: string };
type RequirementCoverageData = { required: RequirementCoverageItem[]; coveredCount: number; totalRequired: number };
type CustomFieldData = { label: string; value: string; category?: string | null };
type ProductFactSource = { documentId: string; documentName: string; sourceHint?: string | null; evidence?: string | null; grounded?: boolean | null; detectedAt: string };
type ProductFactData = { category: string; label: string; value: string; unit?: string | null; importance?: 'critical' | 'high' | 'medium' | 'low' | null; grounded?: boolean | null; conflict?: boolean; sources: ProductFactSource[] };
type ProductMergedProfile = Record<string, any>;

export interface ProductExtractionQualityData {
  detectedCategories: string[];
  predefinedFieldsChecklist: PredefinedFieldCheck[];
  missingFields: string[];
  ungroundedFields?: string[];
  detectedFieldCount: number;
  totalPredefinedFields: number;
  overallConfidence: number;
  categoryChecklists: Record<string, CategoryChecklistResult>;
  documentsContributing?: number;
  productFactCount?: number;
  groundedProductFactCount?: number;
  productFactGroundingRate?: number;
  ungroundedProductFactCount?: number;
}

function ConfidenceBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 75
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
      : pct >= 45
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}
      title="Detected predefined fields divided by total predefined fields — computed from the merged data, not self-rated by the AI"
    >
      {pct}% complete
    </span>
  );
}

function factCategoryLabel(key: string): string {
  const labels: Record<string, string> = {
    identity: 'Identity & Traceability', commercial: 'Commercial', technical: 'Technical', performance: 'Performance',
    materials: 'Materials & Composition', quality: 'Quality & Testing', regulatory: 'Regulatory & Compliance',
    safety: 'Safety', packaging: 'Packaging', logistics: 'Logistics & Storage', environmental: 'Environmental',
    lifecycle: 'Installation & Lifecycle', traceability: 'Traceability', other: 'Other',
  };
  return labels[key] ?? key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function factStatus(fact: ProductFactData): { label: string; cls: string } {
  if (fact.conflict) return { label: 'Conflicting values — review', cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' };
  if (fact.grounded === true) return { label: 'Source verified', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
  if (fact.grounded === false) return { label: 'Verify', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
  return { label: 'Review source', cls: 'bg-[var(--page-bg)] text-[var(--muted)]' };
}

function FieldStatusBadge({ item, hasConflict }: { item: PredefinedFieldCheck; hasConflict?: boolean }) {
  if (hasConflict) {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-300"><CircleAlert className="h-3 w-3" /> Conflict</span>;
  }
  if (!item.detected) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Missing
      </span>
    );
  }
  if (item.grounded === false) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        title="This value could not be confirmed against the source document's text — double-check it before relying on it."
      >
        <CircleAlert className="h-3 w-3" /> Verify
      </span>
    );
  }
  if (item.grounded === true) {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CircleCheck className="h-3 w-3" /> Verified</span>;
  }
  return <span title="The value was detected, but source verification is not available." className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Detected</span>;
}

/**
 * Every predefined field for one checklist (general or one detected
 * category), with its actual value — not just a presence checkmark. This is
 * the literal "extract predefined data ... and show missing data and
 * fields" view: every field always has a row, whether it was found or not.
 */
function FieldChecklistTable({ checklist, provenance, conflicts }: { checklist: PredefinedFieldCheck[]; provenance?: Record<string, FieldProvenanceEntry>; conflicts?: Record<string, FieldConflictCandidate[]> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <tbody>
          {checklist.map((item, i) => (
            <tr key={item.field} className={i % 2 === 0 ? 'bg-[var(--surface)]' : 'bg-[var(--page-bg)]/40'}>
              <td className="w-2/5 px-3 py-3 align-top text-xs font-semibold text-[var(--text-primary)]">{item.label}</td>
              <td className="px-3 py-3 align-top text-sm leading-relaxed text-[var(--text-primary)]">
                {item.detected ? (
                  <div>
                    <span className={item.grounded === false ? 'text-amber-800 dark:text-amber-300' : ''}>{item.value}</span>
                    {provenance?.[item.field] && (
                      <div className="mt-1 space-y-0.5 text-[10px] text-[var(--muted)]">
                        <div>Source: {provenance[item.field].documentName}{provenance[item.field].locationHint ? ` — ${provenance[item.field].locationHint}` : ''}</div>
                        {provenance[item.field].evidence && (
                          <details>
                            <summary className="cursor-pointer select-none hover:text-[var(--text-primary)]">View source evidence</summary>
                            <p className="mt-1 rounded-md bg-[var(--page-bg)] px-2 py-1 italic leading-relaxed">“{provenance[item.field].evidence}”</p>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="italic text-[var(--muted)]">Not found in any attached document</span>
                )}
              </td>
              <td className="px-3 py-2 text-right align-top">
                <FieldStatusBadge item={item} hasConflict={(conflicts?.[item.field]?.length ?? 0) > 0} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Product-level AI extraction summary: completeness across ALL attached
 * documents (a product can have tens of them), one checklist card per
 * DETECTED CATEGORY (registry-driven — a combination product like a
 * drug-eluting stent shows both Pharmaceutical and Medical Device cards,
 * automatically, with zero special-casing here), which document each field
 * came from, whether required certifications are actually covered by
 * evidence on file, AI-invented custom fields beyond any fixed schema, and
 * any conflicts between documents that need a human decision — plus a
 * one-paragraph, deterministic readiness summary at the top.
 *
 * Nothing here is invented data: every value/label comes straight from
 * Product.extractionQuality / fieldProvenance / fieldConflicts /
 * requirementCoverage / readinessSummary / customFields, all computed by the
 * backend. Adding a new product category is purely a backend registry change
 * — this component needs no changes to support it.
 */
export function ProductExtractionOverview({
  productId,
  quality,
  fieldProvenance,
  fieldConflicts,
  requirementCoverage,
  readinessSummary,
  customFields,
  productFacts,
  mergedProfile,
  onResolved,
}: {
  productId: string;
  quality: ProductExtractionQualityData | null | undefined;
  fieldProvenance: Record<string, FieldProvenanceEntry> | null | undefined;
  fieldConflicts: Record<string, FieldConflictCandidate[]> | null | undefined;
  requirementCoverage?: RequirementCoverageData | null;
  readinessSummary?: string | null;
  customFields?: CustomFieldData[] | null;
  productFacts?: ProductFactData[] | null;
  mergedProfile?: ProductMergedProfile | null;
  onResolved?: () => void;
}) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'summary' | 'fields' | 'facts' | 'review' | 'sources'>('summary');
  const [fieldFilter, setFieldFilter] = useState<'all' | 'missing' | 'verify' | 'found' | 'conflict'>('all');
  const conflicts = fieldConflicts ?? {};
  const provenance = fieldProvenance ?? {};
  const conflictEntries = Object.entries(conflicts).filter(([, candidates]) => (candidates?.length ?? 0) > 0);

  const conflictingDocs = new Map<string, string>();
  for (const [fieldPath, candidates] of conflictEntries) {
    const current = provenance[fieldPath];
    if (current) conflictingDocs.set(current.documentId, current.documentName);
    for (const c of candidates) conflictingDocs.set(c.documentId, c.documentName);
  }
  const [detaching, setDetaching] = useState<string | null>(null);

  async function detachDocument(documentId: string, documentName: string) {
    if (!confirm(`Remove "${documentName}" from this product? The document itself will not be deleted — only its data will stop counting toward this product's profile.`)) return;
    setDetaching(documentId);
    try {
      await documentApi.moveToFolder(documentId, null);
      toast.success(`${documentName} removed from this product`);
      onResolved?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to remove document');
    } finally {
      setDetaching(null);
    }
  }

  if (!quality) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"><Sparkles className="h-6 w-6" /></div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Your extraction results will appear here</h3>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--muted)]">Upload product documents from the Files tab. Qurelio will extract structured fields and product facts, then show missing information, source evidence and any conflicting values here.</p>
      </div>
    );
  }

  const confidencePct = Math.round((quality.overallConfidence ?? 0) * 100);
  const categoryEntries = Object.entries(quality.categoryChecklists ?? {});
  const categoryLabel =
    categoryEntries.length > 0 ? categoryEntries.map(([, c]) => c.label).join(' / ') + ' product' : 'General product';
  const facts = Array.isArray(productFacts) ? productFacts : [];
  const profile = mergedProfile ?? {};
  const rows = Array.isArray(profile.traceabilityRows) ? profile.traceabilityRows : [];
  const safetyWarnings = Array.isArray(profile.safetyWarnings) ? profile.safetyWarnings : [];
  const narrativeSections: Array<[string, string | null | undefined]> = [
    ['General Description', profile.generalDescription],
    ['Applications', profile.applications],
    ['Technical Characteristics', profile.technicalCharacteristics],
    ['Quality Specification', profile.qualitySpecificationNarrative],
    ['Regulatory Notes', profile.regulatoryNotes],
  ];
  const predefinedChecklist = quality.predefinedFieldsChecklist ?? [];
  const generalMissingFieldCount = Math.max(quality.missingFields?.length ?? 0, predefinedChecklist.filter((item) => !item.detected).length);
  const generalUngroundedFieldCount = predefinedChecklist.filter((item) => item.detected && item.grounded === false && (conflicts[item.field]?.length ?? 0) === 0).length;
  const categoryMissingFieldCount = categoryEntries.reduce((sum, [, category]) => sum + Math.max(category.missingFields?.length ?? 0, category.checklist.filter((item) => !item.detected).length), 0);
  const categoryUngroundedFieldCount = categoryEntries.reduce((sum, [, category]) => sum + category.checklist.filter((item) => item.detected && item.grounded === false && (conflicts[item.field]?.length ?? 0) === 0).length, 0);
  const missingFieldCount = generalMissingFieldCount + categoryMissingFieldCount;
  const ungroundedFieldCount = generalUngroundedFieldCount + categoryUngroundedFieldCount;
  const allFieldCount = predefinedChecklist.length + categoryEntries.reduce((sum, [, category]) => sum + category.checklist.length, 0);
  const allFieldEntries = [...predefinedChecklist, ...categoryEntries.flatMap(([, category]) => category.checklist)];
  const foundFieldCount = allFieldEntries.filter((item) => item.detected && item.grounded !== false && (conflicts[item.field]?.length ?? 0) === 0).length;
  const missingRequirementCount = requirementCoverage?.required?.filter((item) => !item.covered).length ?? 0;
  const groundedFactCount = facts.filter((f) => f.grounded === true).length;
  const factsToVerifyCount = facts.filter((fact) => fact.grounded !== true || fact.conflict).length;
  const hasIssues = conflictEntries.length > 0 || missingFieldCount > 0 || ungroundedFieldCount > 0 || missingRequirementCount > 0 || factsToVerifyCount > 0 || safetyWarnings.length > 0;
  const hasExtractionData = quality.totalPredefinedFields > 0 || facts.length > 0 || categoryEntries.length > 0 || Object.keys(provenance).length > 0;
  const attentionItems = [
    { key: 'conflicts', label: 'Conflicting values', count: conflictEntries.length, description: 'Different documents report different values.', panel: 'review' as const },
    { key: 'missing', label: 'Missing fields', count: missingFieldCount, description: 'Important product fields were not found in the uploaded documents.', panel: 'fields' as const },
    { key: 'ungrounded', label: 'Values to verify', count: ungroundedFieldCount, description: 'Extracted values could not be confirmed against their source text.', panel: 'fields' as const },
    { key: 'requirements', label: 'Requirements not found', count: missingRequirementCount, description: 'Required certifications or requirements lack supporting evidence.', panel: 'review' as const },
    { key: 'facts', label: 'Facts to review', count: factsToVerifyCount, description: 'Additional AI-discovered facts need source verification.', panel: 'facts' as const },
    { key: 'safety', label: 'Safety warnings', count: safetyWarnings.length, description: 'The source documents contain safety-related information that should be read carefully.', panel: 'facts' as const },
  ].filter((item) => item.count > 0);
  const attentionCount = attentionItems.reduce((sum, item) => sum + item.count, 0);
  const matchesFieldFilter = (item: PredefinedFieldCheck) => fieldFilter === 'all' || (fieldFilter === 'missing' && !item.detected) || (fieldFilter === 'verify' && item.detected && item.grounded === false && (conflicts[item.field]?.length ?? 0) === 0) || (fieldFilter === 'found' && item.detected && item.grounded !== false && (conflicts[item.field]?.length ?? 0) === 0) || (fieldFilter === 'conflict' && (conflicts[item.field]?.length ?? 0) > 0);
  const visibleFieldCount = predefinedChecklist.filter(matchesFieldFilter).length + categoryEntries.reduce((sum, [, category]) => sum + category.checklist.filter(matchesFieldFilter).length, 0);
  const orderedFacts = [...facts].sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.importance ?? 'medium'] ?? 2) - ({ critical: 0, high: 1, medium: 2, low: 3 }[b.importance ?? 'medium'] ?? 2));
  const factGroups = Array.from(orderedFacts.reduce((map, fact) => {
    const key = fact.category || 'other';
    const arr = map.get(key) ?? [];
    arr.push(fact);
    map.set(key, arr);
    return map;
  }, new Map<string, ProductFactData[]>()).entries());
  async function resolveConflict(fieldPath: string, candidate: FieldConflictCandidate) {
    setResolving(fieldPath);
    try {
      await productApi.resolveFieldConflict(productId, {
        fieldPath,
        documentId: candidate.documentId,
        value: candidate.value,
      });
      toast.success('Conflict resolved');
      onResolved?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to resolve conflict');
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">AI extraction results</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
              Review the product information extracted from your documents, verify its sources, and resolve any gaps before relying on it.
            </p>
          </div>
        </div>
        <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${hasIssues ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : hasExtractionData ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-[var(--page-bg)] text-[var(--muted)]'}`}>
          {hasIssues ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
          {hasIssues ? 'Review recommended' : hasExtractionData ? 'No detected issues' : 'Waiting for extraction'}
        </span>
      </div>

      {/* Decision-first summary metrics */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]"><span>Core field completeness</span><FileText className="h-4 w-4" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{confidencePct}%</span><span className="text-xs text-[var(--muted)]">complete</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--page-bg)]"><div className="h-full rounded-full bg-[var(--brand-primary)] transition-all" style={{ width: `${Math.max(0, Math.min(100, confidencePct))}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-[var(--muted)]">{quality.detectedFieldCount} of {quality.totalPredefinedFields} core fields</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]"><span>Source-verified facts</span><ShieldCheck className="h-4 w-4" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{groundedFactCount}</span><span className="text-xs text-[var(--muted)]">of {facts.length}</span></div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">AI-discovered facts confirmed against source evidence</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]"><span>Review flags</span><CircleAlert className="h-4 w-4" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className={`text-2xl font-semibold tracking-tight ${attentionCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--text-primary)]'}`}>{attentionCount}</span><span className="text-xs text-[var(--muted)]">items</span></div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">Missing data, unresolved conflicts and values that need verification</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]"><span>Requirements covered</span><CircleCheck className="h-4 w-4" /></div>
          <div className="mt-2 flex items-baseline gap-1.5"><span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{requirementCoverage && requirementCoverage.totalRequired > 0 ? requirementCoverage.coveredCount : '—'}</span>{requirementCoverage && requirementCoverage.totalRequired > 0 && <span className="text-xs text-[var(--muted)]">of {requirementCoverage.totalRequired}</span>}</div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">{requirementCoverage && requirementCoverage.totalRequired > 0 ? 'Required certifications found in uploaded evidence' : 'No required certifications configured'}</p>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-1 rounded-xl border border-[var(--border)] bg-[var(--page-bg)]/60 p-1" aria-label="AI extraction result sections">
          {([
            { id: 'summary', label: 'Overview' },
            { id: 'fields', label: 'Extracted fields', count: missingFieldCount + ungroundedFieldCount },
            { id: 'facts', label: 'Product facts', count: facts.length },
            { id: 'review', label: 'Requirements & conflicts', count: missingRequirementCount + conflictEntries.length },
            { id: 'sources', label: 'Sources', count: Object.keys(provenance).length },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={activePanel === item.id}
              onClick={() => setActivePanel(item.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activePanel === item.id ? 'bg-[var(--surface)] text-[var(--brand-primary)] shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--surface)]/70 hover:text-[var(--text-primary)]'}`}
            >
              {item.label}
              {'count' in item && typeof item.count === 'number' && item.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activePanel === item.id ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'bg-[var(--border)]/60 text-[var(--muted)]'}`}>{item.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activePanel === 'summary' && (
        <div className="space-y-4">
          {readinessSummary && (
            <div className="flex gap-3 rounded-xl border border-[var(--brand-primary)]/25 bg-gradient-to-br from-[var(--brand-primary)]/[0.07] to-transparent p-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"><Sparkles className="h-4 w-4" /></div>
              <div><p className="mb-1 text-xs font-bold text-[var(--brand-primary)]">Product readiness</p><p className="text-sm leading-relaxed text-[var(--text-primary)]">{readinessSummary}</p></div>
            </div>
          )}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h4 className="text-sm font-semibold text-[var(--text-primary)]">What needs your attention</h4><p className="mt-1 text-xs text-[var(--muted)]">Start with items that may affect the reliability or completeness of this product profile.</p></div>
              {attentionItems.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{attentionItems.reduce((sum, item) => sum + item.count, 0)} items</span>}
            </div>
            {attentionItems.length > 0 ? (
              <div className="divide-y divide-[var(--border)]/70">
                {attentionItems.map((item) => (
                  <div key={item.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300"><CircleAlert className="h-4 w-4" /></span>
                      <div><p className="text-sm font-medium text-[var(--text-primary)]">{item.label}<span className="ml-2 rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">{item.count}</span></p><p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{item.description}</p></div>
                    </div>
                    <button type="button" onClick={() => setActivePanel(item.panel)} className="ml-11 inline-flex w-fit items-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--page-bg)] sm:ml-0">Review details <span className="ml-1" aria-hidden="true">→</span></button>
                  </div>
                ))}
              </div>
            ) : hasExtractionData ? (
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50/70 p-3 dark:bg-emerald-950/30"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div><p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">No immediate issues detected</p><p className="mt-1 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-200/80">The available extraction checks did not flag missing fields, unresolved conflicts or uncovered requirements. Review the extracted fields and source evidence before approving the information.</p></div></div>
            ) : (
              <div className="rounded-lg bg-[var(--page-bg)] p-3"><p className="text-sm font-medium text-[var(--text-primary)]">Waiting for extraction results</p><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Upload a product document and let AI extraction finish to see the product profile, missing information and source evidence here.</p></div>
            )}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-[var(--muted)]">AI extraction is a starting point, not a certification decision. Confirm important values against the original documents.</p>
        </div>
      )}

      {activePanel === 'fields' && (
      <div className="space-y-3">
      {/* Completeness summary — general checklist always shown */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Extraction completeness</p>
            <span className="rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
              {categoryLabel}
            </span>
          </div>
          <ConfidenceBadge pct={confidencePct} />
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          {quality.detectedFieldCount} of {quality.totalPredefinedFields} core fields detected
          {typeof quality.documentsContributing === 'number' &&
            ` across ${quality.documentsContributing} document${quality.documentsContributing === 1 ? '' : 's'}`}
          {ungroundedFieldCount > 0 &&
            ` — ${ungroundedFieldCount} field${ungroundedFieldCount === 1 ? '' : 's'} could not be confirmed against the source text and are flagged "Verify" below`}
          .
        </p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Field checklist</p>
          <div className="flex flex-wrap gap-1" aria-label="Filter extracted fields">
            {([
              { id: 'all', label: 'All fields', count: allFieldCount },
              { id: 'missing', label: 'Missing', count: missingFieldCount },
              { id: 'verify', label: 'Verify', count: ungroundedFieldCount },
              { id: 'found', label: 'Detected', count: foundFieldCount },
              { id: 'conflict', label: 'Conflicts', count: conflictEntries.length },
            ] as const).map((filter) => (
              <button key={filter.id} type="button" aria-pressed={fieldFilter === filter.id} onClick={() => setFieldFilter(filter.id)} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${fieldFilter === filter.id ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'border-[var(--border)] text-[var(--muted)] hover:bg-[var(--page-bg)]'}`}>
                {filter.label} <span className="ml-1 opacity-75">{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mb-1.5 text-xs text-[var(--muted)]">Showing {visibleFieldCount} of {allFieldCount} fields. Select Missing or Verify to focus on items that need attention.</p>
        {predefinedChecklist.filter(matchesFieldFilter).length > 0 && (
          <>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Core product fields</p>
            <FieldChecklistTable checklist={predefinedChecklist.filter(matchesFieldFilter)} provenance={provenance} conflicts={conflicts} />
          </>
        )}

        {/* One card per detected category — category definitions remain backend-driven. */}
        {categoryEntries.map(([key, cc]) => {
          const filteredChecklist = cc.checklist.filter(matchesFieldFilter);
          if (filteredChecklist.length === 0) return null;
          return (
            <div key={key} className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{cc.label} fields</span>
                <ConfidenceBadge pct={Math.round(cc.overallConfidence * 100)} />
              </div>
              <FieldChecklistTable checklist={filteredChecklist} provenance={provenance} conflicts={conflicts} />
            </div>
          );
        })}
        {visibleFieldCount === 0 && <p className="rounded-lg bg-[var(--page-bg)] px-3 py-4 text-center text-xs text-[var(--muted)]">No fields match this filter.</p>}
      </div>

      </div>
      )}

      {/* Source-grounded AI fact inventory — dynamic facts beyond the fixed profile schema */}
      {activePanel === 'facts' && facts.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                <Sparkles className="h-3.5 w-3.5" /> AI-discovered product facts ({facts.length})
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">Additional explicit facts found in the attached product documents, grouped by subject. Source verification requires the evidence excerpt and value to match the source text.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {groundedFactCount}/{facts.length} source verified
            </span>
          </div>
          <div className="space-y-3">
            {factGroups.map(([category, group]) => (
              <div key={category} className="rounded-lg border border-[var(--border)]/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-primary)]">{factCategoryLabel(category)}</span>
                  <span className="text-[10px] text-[var(--muted)]">{group.length} fact{group.length === 1 ? '' : 's'}</span>
                </div>
                <div className="divide-y divide-[var(--border)]/50">
                  {group.map((fact, i) => {
                    const status = factStatus(fact);
                    const source = fact.sources?.[0];
                    return (
                      <div key={`${fact.label}-${i}`} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold text-[var(--text-primary)]">{fact.label}</div>
                            <div className="mt-0.5 text-sm text-[var(--text-primary)]">{fact.value}{fact.unit ? ` ${fact.unit}` : ''}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {fact.sources.length > 1 && <span className="rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">{fact.sources.length} sources</span>}
                            {fact.importance && <span className="rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{fact.importance}</span>}
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
                          </div>
                        </div>
                        {source && (
                          <div className="mt-1.5 text-[10px] text-[var(--muted)]">
                            <div>Source: {source.documentName}{source.sourceHint ? ` — ${source.sourceHint}` : ''}{fact.sources.length > 1 ? ` · ${fact.sources.length} sources` : ''}</div>
                            {source.evidence && (
                              <details className="mt-1">
                                <summary className="cursor-pointer select-none hover:text-[var(--text-primary)]">View exact evidence</summary>
                                <p className="mt-1 rounded-md bg-[var(--page-bg)] px-2 py-1 italic leading-relaxed">“{source.evidence}”</p>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing merged narrative and technical evidence that was previously hidden from this tab */}
      {activePanel === 'facts' && (narrativeSections.some(([, value]) => value) || rows.length > 0 || safetyWarnings.length > 0) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <FileText className="h-3.5 w-3.5" /> Extracted product intelligence
          </p>
          <div className="space-y-2">
            {narrativeSections.map(([label, value]) => value ? (
              <details key={label} className="rounded-lg border border-[var(--border)]/60 bg-[var(--page-bg)]/30 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">{value}</p>
              </details>
            ) : null)}
            {safetyWarnings.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900 dark:bg-red-950">
                <p className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300"><CircleAlert className="h-4 w-4" /> Safety warnings ({safetyWarnings.length})</p>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-red-800 dark:text-red-200">
                  {safetyWarnings.map((warning: any, i: number) => <li key={i}>• {String(warning)}</li>)}
                </ul>
              </div>
            )}
          </div>
          {rows.length > 0 && (
            <div className="mt-3 overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-[680px] w-full text-xs">
                <thead className="bg-[var(--page-bg)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Category</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Parameter</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Value</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Unit</th>
                    <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((row: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[var(--surface)]' : 'bg-[var(--page-bg)]/40'}>
                      <td className="px-3 py-2 align-top">{row.category || '—'}</td>
                      <td className="px-3 py-2 align-top font-medium">{row.parameter || '—'}</td>
                      <td className="px-3 py-2 align-top">{row.value || '—'}</td>
                      <td className="px-3 py-2 align-top">{row.unit || '—'}</td>
                      <td className="px-3 py-2 align-top text-[var(--muted)]">{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Custom insights — facts the AI freely captured beyond any fixed schema */}
      {activePanel === 'facts' && customFields && customFields.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <Layers className="h-3.5 w-3.5" /> Additional insights ({customFields.length})
          </p>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Facts specific to this product that the AI captured but that don't fit any standard field.
          </p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {customFields.map((f, i) => (
              <div key={i} className="flex flex-col">
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  {f.label}
                  {f.category && <span className="ml-1.5 normal-case text-[var(--muted)]/70">({f.category})</span>}
                </dt>
                <dd className="mt-0.5 font-semibold text-[var(--text-primary)]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {activePanel === 'facts' && facts.length === 0 && !narrativeSections.some(([, value]) => value) && rows.length === 0 && safetyWarnings.length === 0 && !(customFields?.length) && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center"><Sparkles className="mx-auto mb-2 h-6 w-6 text-[var(--muted)]" /><p className="text-sm font-medium text-[var(--text-primary)]">No additional product facts yet</p><p className="mt-1 text-xs text-[var(--muted)]">Upload product documents and run AI extraction to discover technical facts and supporting evidence.</p></div>
      )}

      {/* Requirement coverage — what you SAID you need (onboarding) vs what was actually FOUND in documents */}
      {activePanel === 'review' && requirementCoverage && requirementCoverage.totalRequired > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Required certifications — coverage
            </p>
            <span className="rounded-full bg-[var(--page-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
              {requirementCoverage.coveredCount}/{requirementCoverage.totalRequired}
            </span>
          </div>
          <div className="space-y-1.5">
            {requirementCoverage.required.map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs ${
                  item.covered ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-red-50 dark:bg-red-950'
                }`}
              >
                <span className={item.covered ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}>
                  {item.requirement}
                  {item.covered && item.matchedAgainst && (
                    <span className="ml-1.5 text-[10px] opacity-70">— matched "{item.matchedAgainst}"</span>
                  )}
                </span>
                {item.covered ? (
                  <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-red-600">Not found</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflicts needing resolution */}
      {activePanel === 'review' && conflictEntries.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
            <CircleAlert className="h-3.5 w-3.5" /> Needs your review — documents disagree ({conflictEntries.length})
          </p>

          {conflictingDocs.size > 1 && (
            <div className="mb-3 rounded-lg bg-white/70 p-3 dark:bg-red-900/30">
              <p className="mb-2 text-[11px] text-red-800 dark:text-red-200">
                If these disagreements are because one of these documents actually describes a{' '}
                <strong>different product entirely</strong> (not just a wording difference), remove it from this product
                instead of picking a value below:
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(conflictingDocs.entries()).map(([docId, docName]) => (
                  <button
                    key={docId}
                    onClick={() => detachDocument(docId, docName)}
                    disabled={detaching === docId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
                  >
                    {detaching === docId ? 'Removing…' : `Remove "${docName}" from this product`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {conflictEntries.map(([fieldPath, candidates]) => {
              const current = provenance[fieldPath];
              return (
                <div key={fieldPath} className="rounded-lg bg-white p-3 dark:bg-red-900/40">
                  <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">
                    {fieldPath.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  {current && (
                    <div className="mb-2 flex items-center justify-between rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs dark:bg-emerald-950">
                      <span className="text-emerald-800 dark:text-emerald-200">
                        Current: <strong>{current.value}</strong> — from {current.documentName}
                      </span>
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {candidates.map((c, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-[var(--page-bg)] px-2.5 py-1.5 text-xs">
                        <span className="text-[var(--text-primary)]">
                          <strong>{c.value}</strong> — from {c.documentName}
                        </span>
                        <button
                          onClick={() => resolveConflict(fieldPath, c)}
                          disabled={resolving === fieldPath}
                          className="rounded-md bg-[var(--brand-primary)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                        >
                          {resolving === fieldPath ? 'Saving…' : 'Use this value'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activePanel === 'review' && (!requirementCoverage || requirementCoverage.totalRequired === 0) && conflictEntries.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center"><CircleCheck className="mx-auto mb-2 h-6 w-6 text-emerald-600" /><p className="text-sm font-medium text-[var(--text-primary)]">No outstanding requirement checks</p><p className="mt-1 text-xs text-[var(--muted)]">No required certifications or document conflicts are currently available for review.</p></div>
      )}

      {/* Per-field traceability */}
      {activePanel === 'sources' && Object.keys(provenance).length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <FileText className="h-3.5 w-3.5" /> Field sources
          </p>
          <div className="space-y-1.5">
            {Object.entries(provenance).map(([fieldPath, entry]) => (
              <div key={fieldPath} className="flex items-center justify-between gap-3 border-b border-[var(--border)]/40 py-1.5 text-xs last:border-0">
                <span className="text-[var(--muted)]">{fieldPath.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span className="truncate text-right font-medium text-[var(--text-primary)]" title={entry.locationHint}>
                  {entry.value}
                  <span className="ml-1.5 text-[var(--muted)]">— {entry.documentName}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePanel === 'sources' && Object.keys(provenance).length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center"><FileText className="mx-auto mb-2 h-6 w-6 text-[var(--muted)]" /><p className="text-sm font-medium text-[var(--text-primary)]">No source links available</p><p className="mt-1 text-xs text-[var(--muted)]">Field-level document traceability will appear here when extraction produces source metadata.</p></div>
      )}
      {activePanel === 'fields' && predefinedChecklist.length === 0 && categoryEntries.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center"><FileText className="mx-auto mb-2 h-6 w-6 text-[var(--muted)]" /><p className="text-sm font-medium text-[var(--text-primary)]">No structured fields available</p><p className="mt-1 text-xs text-[var(--muted)]">Run AI extraction on the product documents to populate the field checklist.</p></div>
      )}
    </div>
  );
}
