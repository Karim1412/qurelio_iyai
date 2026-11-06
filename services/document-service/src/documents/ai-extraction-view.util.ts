/**
 * Builds the "AI Extraction" view: a bounded, flat, versioned projection of
 * a Product's extraction storage (mergedProfile / extractionQuality /
 * fieldProvenance / fieldConflicts / customFields).
 *
 * This is intentionally a PURE, READ-ONLY function — nothing here is ever
 * persisted. The storage side stays exactly as-is (compact, incremental,
 * conflict-safe merge across potentially tens of documents); this module is
 * the one place that reshapes it into something simple enough to hand to a
 * UI or to a downstream engine without either of them needing to understand
 * dotted-path profiles, per-category registries, or how conflicts/provenance
 * are tracked internally.
 *
 * Every consumer — the product results "AI Extraction" tab today, the
 * compliance engine later — should read THIS shape, not mergedProfile /
 * extractionQuality / fieldConflicts directly. Reshaping this view (e.g.
 * adding a field) never requires a migration, because it computes from
 * storage on every read.
 */
import {
  AiExtractionCategoryBlock,
  AiExtractionField,
  AiExtractionOtherField,
  AiExtractionView,
} from '../ocr/extracted-structure';
import { FieldConflictMap, FieldProvenanceMap } from './product-merge.util';
import { ProductExtractionQuality } from './product-quality.util';
import { ProductFactRecord } from './product-merge.util';

interface ProductLike {
  mergedProfile?: Record<string, unknown> | null;
  extractionQuality?: unknown;
  fieldProvenance?: unknown;
  fieldConflicts?: unknown;
  customFields?: unknown;
  productFacts?: unknown;
}

function toField(
  item: { field: string; label: string; detected: boolean; value?: string | null; grounded?: boolean | null },
  provenance: FieldProvenanceMap,
  conflicts: FieldConflictMap,
): AiExtractionField {
  const conflictCandidates = conflicts[item.field];
  const hasConflict = Array.isArray(conflictCandidates) && conflictCandidates.length > 0;
  const prov = provenance[item.field];

  let status: AiExtractionField['status'];
  if (hasConflict) status = 'conflict';
  else if (!item.detected) status = 'missing';
  else if (item.grounded === false) status = 'needs_verification';
  else status = 'found';

  return {
    key: item.field,
    label: item.label,
    value: item.value ?? null,
    status,
    grounded: item.grounded ?? null,
    sourceDocumentId: prov?.documentId ?? null,
    sourceDocumentName: prov?.documentName ?? null,
    ...(hasConflict
      ? {
          alternates: conflictCandidates!.map((c) => ({
            value: c.value,
            documentId: c.documentId,
            documentName: c.documentName,
          })),
        }
      : {}),
  };
}

export function buildAiExtractionView(product: ProductLike): AiExtractionView {
  const quality = (product.extractionQuality as ProductExtractionQuality | null) ?? null;
  const provenance = (product.fieldProvenance as FieldProvenanceMap | null) ?? {};
  const conflicts = (product.fieldConflicts as FieldConflictMap | null) ?? {};
  const customFields =
    (product.customFields as { label: string; value: string; category?: string | null }[] | null) ?? [];

  if (!quality) {
    return {
      schemaVersion: 2,
      detectedCategories: [],
      universalFields: [],
      categoryFields: [],
      otherFields: [],
      missingRequiredFields: [],
      conflictedFields: [],
      needsVerificationFields: [],
      completeness: 0,
      documentsContributing: 0,
      lastExtractedAt: null,
      productFacts: [],
    };
  }

  const universalFields = quality.predefinedFieldsChecklist.map((item) => toField(item, provenance, conflicts));

  const categoryFields: AiExtractionCategoryBlock[] = Object.entries(quality.categoryChecklists ?? {}).map(
    ([key, cc]) => ({
      key,
      label: cc.label,
      fields: cc.checklist.map((item) => toField(item, provenance, conflicts)),
      completeness: Math.round((cc.overallConfidence ?? 0) * 100),
    }),
  );

  const otherFields: AiExtractionOtherField[] = customFields.map((f) => ({
    label: f.label,
    value: f.value,
    category: f.category ?? null,
  }));

  const rawFacts = (product.productFacts as ProductFactRecord[] | null) ?? [];
  const productFacts = rawFacts.map((f) => ({
    category: f.category,
    label: f.label,
    value: f.value,
    unit: f.unit ?? null,
    importance: f.importance ?? null,
    grounded: f.grounded ?? null,
    conflict: Boolean(f.conflict),
    sources: (Array.isArray(f.sources) ? f.sources : []).map((source) => ({
      documentId: source.documentId,
      documentName: source.documentName,
      sourceHint: source.sourceHint ?? null,
      evidence: source.evidence ?? null,
      grounded: source.grounded ?? null,
      detectedAt: source.detectedAt,
    })),
  }));

  const allFields = [...universalFields, ...categoryFields.flatMap((c) => c.fields)];
  const missingRequiredFields = universalFields.filter((f) => f.status === 'missing').map((f) => f.key);
  const conflictedFields = allFields.filter((f) => f.status === 'conflict').map((f) => f.key);
  const needsVerificationFields = allFields.filter((f) => f.status === 'needs_verification').map((f) => f.key);

  let lastExtractedAt: string | null = null;
  for (const entry of Object.values(provenance)) {
    if (entry?.updatedAt && (!lastExtractedAt || entry.updatedAt > lastExtractedAt)) lastExtractedAt = entry.updatedAt;
  }

  return {
    schemaVersion: 2,
    detectedCategories: quality.detectedCategories ?? [],
    universalFields,
    categoryFields,
    otherFields,
    missingRequiredFields,
    conflictedFields,
    needsVerificationFields,
    completeness: Math.round((quality.overallConfidence ?? 0) * 100),
    documentsContributing: quality.documentsContributing ?? 0,
    lastExtractedAt,
    productFacts,
  };
}
