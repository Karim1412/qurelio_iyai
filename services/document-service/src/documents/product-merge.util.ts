/**
 * Deep, field-aware merging of productProfile across MANY documents attached
 * to one Product (a product can have tens of documents/photos).
 *
 * REPLACES a previous shallow-spread merge:
 *   const next = { ...prev, ...JSON.parse(JSON.stringify(profile)) };
 * which silently OVERWROTE entire nested objects (basicInformation,
 * certifications, etc.) every time a new document was processed — so a
 * later, lower-quality document could erase a correctly-extracted field from
 * an earlier document, non-deterministically (documents finish processing in
 * whatever order the async pipeline completes them, not upload order).
 *
 * This module instead:
 *  - fills gaps (keeps the first non-empty value for a field)
 *  - never silently overwrites an existing non-empty value with a different
 *    non-empty value — it records a CONFLICT for human review instead
 *  - unions array fields (certifications, safety warnings, etc.) instead of
 *    replacing them
 *  - tracks, per field, which document supplied the value currently shown
 *    (provenance) — this is the traceability layer: "this manufacturer name
 *    came from Certificate_2024.pdf"
 */

export interface FieldProvenanceEntry {
  value: string;
  documentId: string;
  documentName: string;
  updatedAt: string; // ISO timestamp
  locationHint?: string;
  evidence?: string;
  /**
   * true = the source document's own extraction confirmed this value against
   * its raw text (see rag-service's grounding check); false = could not be
   * confirmed — flagged for human verification before this value should be
   * trusted downstream (e.g. by the compliance engine); undefined = not
   * evaluated for this field. Cleared (set to true) once a human manually
   * resolves a conflict, since a human pick no longer needs AI grounding.
   */
  grounded?: boolean | null;
  confidence?: number | null;
  sourceAuthority?: 'certificate' | 'test_report' | 'datasheet' | 'declaration' | 'manual' | 'label' | 'marketing' | 'other';
}

export interface FieldConflictCandidate {
  value: string;
  documentId: string;
  documentName: string;
  detectedAt: string; // ISO timestamp
  grounded?: boolean | null;
  confidence?: number | null;
  sourceAuthority?: FieldProvenanceEntry['sourceAuthority'];
  evidence?: string;
}

export type FieldProvenanceMap = Record<string, FieldProvenanceEntry>;
export type FieldConflictMap = Record<string, FieldConflictCandidate[]>;


export interface ProductFactSource {
  documentId: string;
  documentName: string;
  sourceHint?: string | null;
  evidence?: string | null;
  grounded?: boolean | null;
  detectedAt: string;
}

export interface ProductFactRecord {
  category: string;
  label: string;
  value: string;
  unit?: string | null;
  importance?: 'critical' | 'high' | 'medium' | 'low' | null;
  grounded?: boolean | null;
  conflict?: boolean;
  sources: ProductFactSource[];
}

/** Dotted-path leaf fields that get scalar merge-with-conflict-detection treatment. */
const SCALAR_LEAF_PATHS = [
  'basicInformation.reference',
  'basicInformation.modelNumber',
  'basicInformation.serialNumber',
  'basicInformation.revision',
  'basicInformation.category',
  'basicInformation.subCategory',
  'basicInformation.tradeMark',
  'basicInformation.manufacturer',
  'basicInformation.countryOfOrigin',
  'usage.environment',
  'usage.users',
  'usage.tempHumidity',
  'usage.ipRating',
  'usage.voltageFrequency',
  'generalDescription',
  'applications',
  'qualitySpecificationNarrative',
  'regulatoryNotes',
  'technicalCharacteristics',
  'dimensions',
  'weight',
  'pharmaceuticalDetails.productName',
  'pharmaceuticalDetails.activeIngredient',
  'pharmaceuticalDetails.strengthDosage',
  'pharmaceuticalDetails.pharmaceuticalForm',
  'pharmaceuticalDetails.volumeOrPackSize',
  'pharmaceuticalDetails.storageConditions',
  'pharmaceuticalDetails.expirationDate',
  'pharmaceuticalDetails.batchNumber',
  'pharmaceuticalDetails.registrationNumber',
  'pharmaceuticalDetails.certificateNumber',
  'pharmaceuticalDetails.routeOfAdministration',
  'pharmaceuticalDetails.shelfLifeMonths',
  'pharmaceuticalDetails.prescriptionStatus',
  'pharmaceuticalDetails.coaReference',
  'pharmaceuticalDetails.ndcOrGtinCode',
  'medicalDeviceDetails.deviceClass',
  'medicalDeviceDetails.udiCode',
  'medicalDeviceDetails.intendedPurpose',
  'medicalDeviceDetails.sterility',
  'medicalDeviceDetails.singleUseOrReusable',
  'medicalDeviceDetails.implantable',
  'medicalDeviceDetails.biocompatibilityStandard',
  'medicalDeviceDetails.clinicalEvaluationReference',
  'medicalDeviceDetails.deviceLifeSpan',
  'medicalDeviceDetails.contraindications',
  'medicalDeviceDetails.accessoriesIncluded',
  'medicalDeviceDetails.softwareVersion',
  'electronicsDetails.voltageRating',
  'electronicsDetails.currentRating',
  'electronicsDetails.powerConsumption',
  'electronicsDetails.frequencyRange',
  'electronicsDetails.protectionRating',
  'electronicsDetails.batteryType',
  'electronicsDetails.connectivityStandards',
  'electronicsDetails.firmwareVersion',
  'electronicsDetails.emcCompliance',
  'electronicsDetails.energyEfficiencyClass',
  'electronicsDetails.operatingTemperatureRange',
  'electronicsDetails.warrantyPeriod',
  'foodBeverageDetails.ingredientsList',
  'foodBeverageDetails.allergens',
  'foodBeverageDetails.nutritionalInformation',
  'foodBeverageDetails.netWeight',
  'foodBeverageDetails.servingSize',
  'foodBeverageDetails.bestBeforeDate',
  'foodBeverageDetails.foodSafetyCertification',
  'foodBeverageDetails.countryOfProcessing',
  'foodBeverageDetails.preservatives',
  'foodBeverageDetails.organicCertification',
  'foodBeverageDetails.halalKosherCertification',
  'cosmeticsDetails.inciIngredientsList',
  'cosmeticsDetails.netContent',
  'cosmeticsDetails.batchCode',
  'cosmeticsDetails.periodAfterOpening',
  'cosmeticsDetails.skinType',
  'cosmeticsDetails.dermatologicallyTested',
  'cosmeticsDetails.animalTestingStatus',
  'cosmeticsDetails.spfRating',
  'cosmeticsDetails.expirationDate',
  'cosmeticsDetails.manufacturingDate',
  'cosmeticsDetails.cosmeticRegulationCompliance',
  'chemicalDetails.casNumber',
  'chemicalDetails.hazardClassificationGHS',
  'chemicalDetails.safetyDataSheetReference',
  'chemicalDetails.flashPoint',
  'chemicalDetails.phValue',
  'chemicalDetails.physicalState',
  'chemicalDetails.hazardPictograms',
  'chemicalDetails.handlingPrecautions',
  'chemicalDetails.storageTemperatureRange',
  'chemicalDetails.unNumber',
  'chemicalDetails.packagingGroup',
  'machineryDetails.powerRating',
  'machineryDetails.operatingPressure',
  'machineryDetails.noiseLevel',
  'machineryDetails.weightCapacity',
  'machineryDetails.safetyGuardsPresent',
  'machineryDetails.machineryDirectiveCompliance',
  'machineryDetails.maintenanceSchedule',
  'machineryDetails.operatingSpeed',
  'machineryDetails.requiredPPE',
  'machineryDetails.installationRequirements',
  'textileDetails.fiberComposition',
  'textileDetails.fabricConstruction',
  'textileDetails.gsmWeight',
  'textileDetails.colorfastnessRating',
  'textileDetails.flammabilityRating',
  'textileDetails.careInstructions',
  'textileDetails.countryOfManufacture',
  'textileDetails.oekoTexOrOtherCertification',
  'textileDetails.shrinkageRate',
  'textileDetails.threadCount',
  'constructionMaterialsDetails.materialGrade',
  'constructionMaterialsDetails.loadBearingCapacity',
  'constructionMaterialsDetails.fireResistanceRating',
  'constructionMaterialsDetails.compressiveStrength',
  'constructionMaterialsDetails.thermalConductivity',
  'constructionMaterialsDetails.ceMarkingDoP',
  'constructionMaterialsDetails.standardCompliance',
  'constructionMaterialsDetails.dimensionsTolerance',
  'constructionMaterialsDetails.durabilityWarranty',
  'constructionMaterialsDetails.environmentalRating',
];

/** Dotted-path array fields that get union+dedupe treatment instead of scalar treatment. */
const ARRAY_PATHS = [
  'certifications.marks',
  'certifications.standards',
  'certifications.approvalNumbers',
  'safetyWarnings',
  'technicalBullets',
];

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), obj);
}

function setPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

function isNonEmpty(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function sourceAuthorityFromName(name: string): FieldProvenanceEntry['sourceAuthority'] {
  const n = String(name || '').toLowerCase();
  if (/certificate|certificat|test\s*report|inspection|laboratory/.test(n)) return 'certificate';
  if (/test|validation|qualification|verification/.test(n)) return 'test_report';
  if (/datasheet|data\s*sheet|specification|spec|technical/.test(n)) return 'datasheet';
  if (/declaration|declaration\s+of\s+conformity|\bdoc\b/.test(n)) return 'declaration';
  if (/manual|user\s*guide|installation|maintenance/.test(n)) return 'manual';
  if (/label|nameplate|plate|packaging/.test(n)) return 'label';
  if (/brochure|catalog|catalogue|marketing|flyer|sales/.test(n)) return 'marketing';
  return 'other';
}

function provenanceScore(entry: { grounded?: boolean | null; confidence?: number | null; sourceAuthority?: FieldProvenanceEntry['sourceAuthority'] }): number {
  const authority = { certificate: 1.0, test_report: 0.97, datasheet: 0.92, declaration: 0.9, manual: 0.78, label: 0.75, marketing: 0.45, other: 0.6 }[entry.sourceAuthority ?? 'other'];
  const grounded = entry.grounded === true ? 1 : entry.grounded === false ? 0.35 : 0.65;
  const confidence = typeof entry.confidence === 'number' ? Math.max(0, Math.min(1, entry.confidence)) : grounded;
  return authority * 0.55 + grounded * 0.25 + confidence * 0.20;
}

export interface MergeResult {
  merged: Record<string, unknown>;
  provenance: FieldProvenanceMap;
  conflicts: FieldConflictMap;
}

/**
 * Merge one document's freely-invented customFields (see PRODUCT_EXTRA's
 * "customFields" instruction — the AI's creative-freedom output for facts
 * that don't fit any predefined field) into the product's accumulated list.
 * Deduped by (label, value) so the same fact repeated across documents
 * doesn't pile up; capped higher than the per-document limit (15) since a
 * product with tens of documents can legitimately accumulate more distinct
 * custom facts than any single document would report on its own.
 */
export function mergeCustomFields(
  existing: { label: string; value: string; category?: string | null; importance?: string | null }[] | null | undefined,
  incoming: { label: string; value: string; category?: string | null; importance?: string | null }[] | null | undefined,
  cap = 30,
): { label: string; value: string; category?: string | null }[] {
  const result = [...(existing ?? [])];
  const seen = new Set(result.map((f) => `${f.label.trim().toLowerCase()}::${f.value.trim().toLowerCase()}`));
  for (const f of incoming ?? []) {
    if (!f?.label || !f?.value) continue;
    const key = `${String(f.label).trim().toLowerCase()}::${String(f.value).trim().toLowerCase()}`;
    if (!seen.has(key)) {
      result.push({ label: String(f.label).trim().slice(0, 120), value: String(f.value).trim().slice(0, 500), category: f.category ?? null, importance: f.importance ?? null });
      seen.add(key);
    }
  }
  return result.slice(0, cap);
}

/** Merge compact source-grounded product facts across documents. */
export function mergeProductFacts(
  existing: ProductFactRecord[] | null | undefined,
  incoming: Array<{
    category?: string | null;
    label?: string | null;
    value?: string | null;
    unit?: string | null;
    importance?: ProductFactRecord['importance'];
    grounded?: boolean | null;
    sourceHint?: string | null;
    evidence?: string | null;
  }> | null | undefined,
  documentId: string,
  documentName: string,
  cap = 120,
): ProductFactRecord[] {
  const result: ProductFactRecord[] = JSON.parse(JSON.stringify(existing ?? []));
  const now = new Date().toISOString();
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  for (const fact of incoming ?? []) {
    const category = String(fact?.category ?? 'other').trim().slice(0, 50) || 'other';
    const label = String(fact?.label ?? '').trim().slice(0, 140);
    const value = String(fact?.value ?? '').trim().slice(0, 800);
    const unit = fact?.unit == null ? null : String(fact.unit).trim().slice(0, 40) || null;
    if (!label || !value) continue;

    const key = `${norm(category)}::${norm(label)}::${norm(value)}::${norm(unit)}`;
    const sameGroup = result.filter((r) =>
      `${norm(r.category)}::${norm(r.label)}::${norm(r.unit)}` === `${norm(category)}::${norm(label)}::${norm(unit)}`,
    );
    const existingIndex = result.findIndex((r) =>
      `${norm(r.category)}::${norm(r.label)}::${norm(r.value)}::${norm(r.unit)}` === key,
    );
    const hasValueConflict = sameGroup.some((r) => norm(r.value) !== norm(value));
    if (hasValueConflict) {
      for (const existingFact of sameGroup) existingFact.conflict = true;
    }
    const source: ProductFactSource = {
      documentId,
      documentName,
      sourceHint: fact.sourceHint ? String(fact.sourceHint).trim().slice(0, 240) : null,
      evidence: fact.evidence ? String(fact.evidence).trim().slice(0, 400) : null,
      grounded: fact.grounded ?? null,
      detectedAt: now,
    };

    if (existingIndex >= 0) {
      const current = result[existingIndex];
      const sources = Array.isArray(current.sources) ? current.sources : [];
      const sourceKey = `${source.documentId}::${norm(source.evidence)}::${norm(source.sourceHint)}`;
      if (!sources.some((x) => `${x.documentId}::${norm(x.evidence)}::${norm(x.sourceHint)}` === sourceKey)) sources.push(source);
      current.sources = sources.slice(-20);
      current.conflict = Boolean(current.conflict || hasValueConflict);
      current.grounded = current.grounded === true || source.grounded === true
        ? true
        : current.grounded === false && source.grounded === false ? false : null;
      if ((rank[fact.importance ?? ''] ?? 0) > (rank[current.importance ?? ''] ?? 0)) current.importance = fact.importance ?? current.importance ?? null;
      continue;
    }

    result.push({ category, label, value, unit, importance: fact.importance ?? null, grounded: fact.grounded ?? null, conflict: hasValueConflict, sources: [source] });
    if (result.length >= cap) break;
  }
  return result.slice(0, cap);
}

/**
 * Merge one document's extracted productProfile into the product's existing
 * merged profile + provenance + conflict state. Pure function — no I/O — so
 * it's directly unit-testable.
 */
export function mergeProductProfileFields(
  prevMerged: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
  documentId: string,
  documentName: string,
  fieldSources: Record<string, string> | null | undefined,
  fieldEvidence: Record<string, string> | null | undefined,
  prevProvenance: FieldProvenanceMap | null | undefined,
  prevConflicts: FieldConflictMap | null | undefined,
  groundedFields?: string[] | null,
): MergeResult {
  const merged: Record<string, unknown> = JSON.parse(JSON.stringify(prevMerged ?? {}));
  const provenance: FieldProvenanceMap = { ...(prevProvenance ?? {}) };
  const conflicts: FieldConflictMap = JSON.parse(JSON.stringify(prevConflicts ?? {}));
  const now = new Date().toISOString();
  const sources = fieldSources ?? {};
  const evidence = fieldEvidence ?? {};
  const grounded = new Set(groundedFields ?? []);

  for (const path of SCALAR_LEAF_PATHS) {
    const incomingValue = getPath(incoming, path);
    if (!isNonEmpty(incomingValue)) continue;
    const incomingStr = String(incomingValue).trim();
    const existingValue = getPath(merged, path);

    const incomingAuthority = sourceAuthorityFromName(documentName);
    const incomingConfidence = grounded.has(path) ? 0.90 : 0.55;
    const incomingProv: FieldProvenanceEntry = {
      value: incomingStr, documentId, documentName, updatedAt: now,
      locationHint: sources[path], evidence: evidence[path], grounded: grounded.has(path),
      confidence: incomingConfidence, sourceAuthority: incomingAuthority,
    };

    if (!isNonEmpty(existingValue)) {
      setPath(merged, path, incomingStr);
      provenance[path] = incomingProv;
      continue;
    }

    const existingStr = String(existingValue).trim();
    if (existingStr.toLowerCase() === incomingStr.toLowerCase()) {
      const prev = provenance[path];
      if (prev) {
        const corroborated = new Set<string>((prev as any).corroboratedBy ?? []);
        corroborated.add(documentId);
        (prev as any).corroboratedBy = Array.from(corroborated).slice(-20);
        prev.confidence = Math.min(0.99, Math.max(Number(prev.confidence ?? 0.55), incomingConfidence + 0.03));
      }
      continue;
    }

    const existingProv = provenance[path] ?? {
      value: existingStr, documentId: '', documentName: 'unknown', updatedAt: now, grounded: null, confidence: 0.4, sourceAuthority: 'other' as const,
    };
    const existingScore = provenanceScore(existingProv);
    const incomingScore = provenanceScore(incomingProv);

    const existingConflicts = conflicts[path] ?? [];
    const alreadyRecorded = existingConflicts.some(
      (c) => c.value.toLowerCase() === incomingStr.toLowerCase() && c.documentId === documentId,
    );
    if (!alreadyRecorded) {
      existingConflicts.push({
        value: incomingStr, documentId, documentName, detectedAt: now,
        grounded: incomingProv.grounded, confidence: incomingProv.confidence, sourceAuthority: incomingProv.sourceAuthority, evidence: incomingProv.evidence,
      });
      conflicts[path] = existingConflicts;
    }

    // Select the stronger source as the displayed merged value, while retaining
    // the conflict record. Compliance is blocked from treating conflicted facts
    // as deterministic truth until a human resolves the conflict.
    if (incomingScore > existingScore + 0.05) {
      setPath(merged, path, incomingStr);
      provenance[path] = incomingProv;
    }
  }

  for (const path of ARRAY_PATHS) {
    const incomingArr = getPath(incoming, path);
    if (!Array.isArray(incomingArr) || incomingArr.length === 0) continue;
    const existingArr: string[] = Array.isArray(getPath(merged, path)) ? getPath(merged, path) : [];
    const existingLower = new Set(existingArr.map((x) => String(x).trim().toLowerCase()));
    const combined = [...existingArr];
    for (const item of incomingArr) {
      const s = String(item).trim();
      if (s && !existingLower.has(s.toLowerCase())) {
        combined.push(s);
        existingLower.add(s.toLowerCase());
      }
    }
    setPath(merged, path, combined);
  }

  // traceabilityRows: additive, dedupe exact-duplicate rows across documents.
  const incomingRows = Array.isArray((incoming as any).traceabilityRows) ? (incoming as any).traceabilityRows : [];
  if (incomingRows.length > 0) {
    const existingRows: any[] = Array.isArray((merged as any).traceabilityRows) ? (merged as any).traceabilityRows : [];
    const seen = new Set(existingRows.map((r) => JSON.stringify(r)));
    const combinedRows = [...existingRows];
    for (const row of incomingRows) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        combinedRows.push(row);
        seen.add(key);
      }
    }
    (merged as any).traceabilityRows = combinedRows;
  }

  return { merged, provenance, conflicts };
}
