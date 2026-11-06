/**
 * AI pre-fill for the product onboarding wizard.
 *
 * The Documents step runs first: uploaded files are OCR'd and structured by the
 * RAG service, which returns `extractedStructured.productProfile`. This module
 * folds one or more of those extractions into the wizard's step data so the user
 * lands on Identity with the form already filled, and only has to verify or
 * correct it.
 *
 * Every value produced here is a *suggestion*: the caller records which fields
 * were AI-filled (`filled`) so the UI can flag them for review.
 */

import type { ProductIdentityData } from '@/components/products/ProductStepIdentity';
import type { ProductTechnicalData } from '@/components/products/ProductStepTechnical';
import type { ProductMarketsData } from '@/components/products/ProductStepMarkets';
import type { ProductManufacturingData } from '@/components/products/ProductStepManufacturing';
import type { ProductCertificationsData, ProductCertEntry } from '@/components/products/ProductStepCertifications';
import {
  COUNTRIES, INDUSTRY_LABELS, MARKETS, PHYSICAL_FORMS,
  PRODUCTION_PROCESSES, PRODUCT_TYPE_VALUES, TARGET_USERS,
} from '@/components/products/product-options';

// ─── Extraction shapes (mirror services/document-service/src/ocr/extracted-structure.ts) ───

export interface OnboardingDraft {
  productName?: string | null;
  sku?: string | null;
  brandName?: string | null;
  productFamily?: string | null;
  category?: string | null;
  productType?: string | null;
  description?: string | null;
  intendedUse?: string | null;
  targetUsers?: string[] | null;
  keyMaterials?: string[] | null;
  physicalForm?: string | null;
  hsTariffCode?: string | null;
  countryOfOrigin?: string | null;
  targetMarkets?: string[] | null;
  requiredCertifications?: string[] | null;
  applicableRegulations?: string[] | null;
  industryLabels?: string[] | null;
  productionSites?: string[] | null;
  productionProcesses?: string[] | null;
  criticalSuppliers?: string[] | null;
  productCertifications?: Array<Partial<ProductCertEntry>> | null;
}

export interface ExtractedProductProfile {
  basicInformation?: {
    reference?: string | null;
    modelNumber?: string | null;
    revision?: string | null;
    category?: string | null;
    subCategory?: string | null;
    tradeMark?: string | null;
    manufacturer?: string | null;
    countryOfOrigin?: string | null;
  } | null;
  certifications?: {
    marks?: string[] | null;
    standards?: string[] | null;
    approvalNumbers?: string[] | null;
  } | null;
  usage?: { users?: string | null; environment?: string | null } | null;
  generalDescription?: string | null;
  applications?: string | null;
  regulatoryNotes?: string | null;
  technicalCharacteristics?: string | null;
  traceabilityRows?: Array<{
    category?: string | null;
    parameter?: string | null;
    value?: string | null;
    unit?: string | null;
  }> | null;
  onboarding?: OnboardingDraft | null;
}

export interface ExtractedStructure {
  title?: string | null;
  fileSummary?: string | null;
  visualDescription?: string | null;
  productProfile?: ExtractedProductProfile | null;
}

/** Wizard state that a pre-fill can write into. */
export interface WizardPrefill {
  identity: Partial<ProductIdentityData>;
  technical: Partial<ProductTechnicalData>;
  markets: Partial<ProductMarketsData>;
  manufacturing: Partial<ProductManufacturingData>;
  certifications: Partial<ProductCertificationsData>;
  /** Field keys the AI supplied, e.g. `identity.name`, `technical.targetUsers`. */
  filled: string[];
}

// ─── Value normalisation ─────────────────────────────────────────────────────

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = text(item);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function normalizeKey(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Snap a free-text suggestion onto one of the wizard's options (exact, then loose containment). */
function matchOption(value: unknown, options: string[]): string | null {
  const raw = text(value);
  if (!raw) return null;
  const key = normalizeKey(raw);
  if (!key) return null;

  const exact = options.find((o) => normalizeKey(o) === key);
  if (exact) return exact;

  return (
    options.find((o) => {
      const ok = normalizeKey(o);
      return ok.includes(key) || key.includes(ok);
    }) ?? null
  );
}

/** Map every suggestion onto the option list, dropping anything that has no match. */
function matchOptions(values: unknown, options: string[]): string[] {
  const out: string[] = [];
  for (const v of list(values)) {
    const hit = matchOption(v, options);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** ISO date accepted by <input type="date">; anything else is dropped. */
function isoDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  const direct = /^\d{4}-\d{2}-\d{2}$/.exec(raw);
  if (direct) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

/** Longest non-empty candidate: later documents often carry a fuller value than the first. */
function richest(...candidates: unknown[]): string {
  let best = '';
  for (const c of candidates) {
    const s = text(c);
    if (s.length > best.length) best = s;
  }
  return best;
}

function unionLists(...candidates: unknown[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    for (const item of list(c)) {
      if (!out.includes(item)) out.push(item);
    }
  }
  return out;
}

// ─── Fallbacks from the legacy productProfile shape ──────────────────────────

const MATERIAL_ROW = /(material|composition|substance|ingredient|matiere|matière|bom)/i;
const HS_ROW = /(hs\s*code|tariff|customs|nomenclature|douan)/i;

function materialsFromRows(profile: ExtractedProductProfile): string[] {
  const out: string[] = [];
  for (const row of profile.traceabilityRows ?? []) {
    const bucket = `${text(row?.category)} ${text(row?.parameter)}`;
    if (!MATERIAL_ROW.test(bucket)) continue;
    const value = text(row?.value);
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

function hsCodeFromRows(profile: ExtractedProductProfile): string {
  for (const row of profile.traceabilityRows ?? []) {
    const bucket = `${text(row?.category)} ${text(row?.parameter)}`;
    if (!HS_ROW.test(bucket)) continue;
    const value = text(row?.value);
    if (value) return value;
  }
  return '';
}

/** Certificate rows built from the legacy `certifications` block when `onboarding` is absent. */
function certsFromLegacy(profile: ExtractedProductProfile): ProductCertEntry[] {
  const names = unionLists(profile.certifications?.standards, profile.certifications?.marks);
  const numbers = list(profile.certifications?.approvalNumbers);
  return names.slice(0, 12).map((standardName, i) => ({
    standardName,
    certifyingBody: '',
    certificateNumber: numbers[i] ?? '',
    marketScope: '',
    issueDate: '',
    expiryDate: '',
  }));
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Fold the extractions of every uploaded document into one wizard pre-fill.
 * Later documents extend lists and win on a field only when they say more.
 */
export function buildPrefill(structures: Array<ExtractedStructure | null | undefined>): WizardPrefill {
  const valid = structures.filter((s): s is ExtractedStructure => !!s);

  const profiles = valid.map((s) => s.productProfile).filter((p): p is ExtractedProductProfile => !!p);
  const drafts = profiles.map((p) => p.onboarding).filter((o): o is OnboardingDraft => !!o);

  const basics = profiles.map((p) => p.basicInformation ?? {});

  // ── Identity ──
  const name = richest(
    ...drafts.map((d) => d.productName),
    ...basics.map((b) => b.tradeMark),
    ...valid.map((s) => s.title),
  );
  const sku = richest(...drafts.map((d) => d.sku), ...basics.map((b) => b.reference ?? b.modelNumber));
  const brandName = richest(...drafts.map((d) => d.brandName), ...basics.map((b) => b.tradeMark ?? b.manufacturer));
  const productFamily = richest(...drafts.map((d) => d.productFamily), ...basics.map((b) => b.subCategory));
  const category = richest(...drafts.map((d) => d.category), ...basics.map((b) => b.category));
  const description = richest(
    ...drafts.map((d) => d.description),
    ...profiles.map((p) => p.generalDescription),
    ...valid.map((s) => s.fileSummary),
  );
  const productType = drafts
    .map((d) => matchOption(d.productType, PRODUCT_TYPE_VALUES))
    .find((v): v is string => !!v) ?? '';

  // ── Technical ──
  const intendedUse = richest(
    ...drafts.map((d) => d.intendedUse),
    ...profiles.map((p) => p.applications),
    ...profiles.map((p) => p.technicalCharacteristics),
  );
  const targetUsers = unionLists(
    ...drafts.map((d) => matchOptions(d.targetUsers, TARGET_USERS)),
    ...profiles.map((p) => (matchOption(p.usage?.users, TARGET_USERS) ? [matchOption(p.usage?.users, TARGET_USERS)] : [])),
  );
  const keyMaterials = unionLists(
    ...drafts.map((d) => d.keyMaterials),
    ...profiles.map((p) => materialsFromRows(p)),
  ).slice(0, 30);
  const physicalForm = drafts
    .map((d) => matchOption(d.physicalForm, PHYSICAL_FORMS))
    .find((v): v is string => !!v) ?? '';
  const hsTariffCode = richest(...drafts.map((d) => d.hsTariffCode), ...profiles.map((p) => hsCodeFromRows(p)));
  const countryOfOrigin =
    drafts.map((d) => matchOption(d.countryOfOrigin, COUNTRIES)).find((v): v is string => !!v) ??
    basics.map((b) => matchOption(b.countryOfOrigin, COUNTRIES)).find((v): v is string => !!v) ??
    '';

  // ── Markets ──
  const targetMarkets = unionLists(...drafts.map((d) => matchOptions(d.targetMarkets, MARKETS)));
  const requiredCertifications = unionLists(
    ...drafts.map((d) => d.requiredCertifications),
    ...profiles.map((p) => p.certifications?.standards),
  ).slice(0, 30);
  const applicableRegulations = unionLists(...drafts.map((d) => d.applicableRegulations)).slice(0, 30);
  const industryLabels = unionLists(
    ...drafts.map((d) => matchOptions(d.industryLabels, INDUSTRY_LABELS)),
    ...profiles.map((p) => matchOptions(p.certifications?.marks, INDUSTRY_LABELS)),
  );

  // ── Manufacturing ──
  const productionSites = unionLists(...drafts.map((d) => d.productionSites)).slice(0, 20);
  const productionProcesses = unionLists(...drafts.map((d) => matchOptions(d.productionProcesses, PRODUCTION_PROCESSES)));
  const criticalSuppliers = unionLists(...drafts.map((d) => d.criticalSuppliers)).slice(0, 30);

  // ── Certifications ──
  const certRows: ProductCertEntry[] = [];
  const seenCerts = new Set<string>();
  const rawCerts: Array<Partial<ProductCertEntry>> = drafts.flatMap((d) => d.productCertifications ?? []);
  for (const row of rawCerts.length > 0 ? rawCerts : profiles.flatMap(certsFromLegacy)) {
    const standardName = text(row?.standardName);
    const certificateNumber = text(row?.certificateNumber);
    if (!standardName && !certificateNumber) continue;
    const key = `${standardName.toLowerCase()}|${certificateNumber.toLowerCase()}`;
    if (seenCerts.has(key)) continue;
    seenCerts.add(key);
    certRows.push({
      standardName,
      certifyingBody: text(row?.certifyingBody),
      certificateNumber,
      marketScope: text(row?.marketScope),
      issueDate: isoDate(row?.issueDate),
      expiryDate: isoDate(row?.expiryDate),
    });
    if (certRows.length >= 15) break;
  }

  // ── Assemble, keeping only fields the extraction actually produced ──
  const identity: Partial<ProductIdentityData> = {};
  const technical: Partial<ProductTechnicalData> = {};
  const markets: Partial<ProductMarketsData> = {};
  const manufacturing: Partial<ProductManufacturingData> = {};
  const certifications: Partial<ProductCertificationsData> = {};
  const filled: string[] = [];

  const put = <T extends object>(target: T, group: string, key: keyof T & string, value: unknown) => {
    const empty =
      value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    if (empty) return;
    (target as Record<string, unknown>)[key] = value;
    filled.push(`${group}.${key}`);
  };

  put(identity, 'identity', 'name', name);
  put(identity, 'identity', 'sku', sku);
  put(identity, 'identity', 'brandName', brandName);
  put(identity, 'identity', 'productFamily', productFamily);
  put(identity, 'identity', 'category', category);
  put(identity, 'identity', 'productType', productType);
  put(identity, 'identity', 'description', description);

  put(technical, 'technical', 'intendedUse', intendedUse);
  put(technical, 'technical', 'targetUsers', targetUsers);
  put(technical, 'technical', 'keyMaterials', keyMaterials);
  put(technical, 'technical', 'physicalForm', physicalForm);
  put(technical, 'technical', 'hsTariffCode', hsTariffCode);
  put(technical, 'technical', 'countryOfOrigin', countryOfOrigin);

  put(markets, 'markets', 'targetMarkets', targetMarkets);
  put(markets, 'markets', 'requiredCertifications', requiredCertifications);
  put(markets, 'markets', 'applicableRegulations', applicableRegulations);
  put(markets, 'markets', 'industryLabels', industryLabels);

  put(manufacturing, 'manufacturing', 'productionSites', productionSites);
  put(manufacturing, 'manufacturing', 'productionProcesses', productionProcesses);
  put(manufacturing, 'manufacturing', 'criticalSuppliers', criticalSuppliers);

  put(certifications, 'certifications', 'productCertifications', certRows);
  // Per-row keys so the step can flag exactly the cards the AI created, not ones the user adds after.
  certRows.forEach((_, i) => filled.push(`certifications.productCertifications.${i}`));

  return { identity, technical, markets, manufacturing, certifications, filled };
}

/** Human labels for the fields a pre-fill can write, used by the suggestion review UI. */
export const FIELD_LABELS: Record<string, string> = {
  'identity.name': 'Product name',
  'identity.sku': 'Internal reference / SKU',
  'identity.brandName': 'Brand / Trade name',
  'identity.productFamily': 'Product family',
  'identity.category': 'Category',
  'identity.productType': 'Product type',
  'identity.description': 'Description',
  'technical.intendedUse': 'Intended use',
  'technical.targetUsers': 'Target users',
  'technical.keyMaterials': 'Key materials',
  'technical.physicalForm': 'Physical form',
  'technical.hsTariffCode': 'HS tariff code',
  'technical.countryOfOrigin': 'Country of origin',
  'markets.targetMarkets': 'Target markets',
  'markets.requiredCertifications': 'Required certifications',
  'markets.applicableRegulations': 'Applicable regulations',
  'markets.industryLabels': 'Industry labels',
  'manufacturing.productionSites': 'Production sites',
  'manufacturing.productionProcesses': 'Production processes',
  'manufacturing.criticalSuppliers': 'Critical suppliers',
  'certifications.productCertifications': 'Product certifications',
};

/** One field the document disagrees with, offered to the user rather than applied silently. */
export interface PrefillSuggestion {
  /** Fully-qualified key, e.g. `technical.intendedUse`. */
  key: string;
  group: string;
  field: string;
  label: string;
  current: string;
  suggested: string;
  /** Raw value to write when the suggestion is accepted. */
  value: unknown;
}

function preview(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    if (typeof value[0] === 'object') return `${value.length} entr${value.length > 1 ? 'ies' : 'y'}`;
    return value.join(', ');
  }
  const s = text(value);
  return s || '-';
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = Array.isArray(a) ? a : [];
    const lb = Array.isArray(b) ? b : [];
    if (la.length !== lb.length) return false;
    return JSON.stringify(la) === JSON.stringify(lb);
  }
  return text(a).trim().toLowerCase() === text(b).trim().toLowerCase();
}

/**
 * Fields the document disagrees with.
 *
 * Editing an existing product means almost every field is already filled, so
 * `applyPrefill` writes nothing and the upload looks like it did nothing at all.
 * These are surfaced for the user to accept or ignore per field instead.
 */
export function diffPrefill<T extends Record<string, any>>(
  group: string,
  current: T,
  incoming: Partial<T>,
  skipKeys: string[] = [],
): PrefillSuggestion[] {
  const out: PrefillSuggestion[] = [];
  for (const [field, value] of Object.entries(incoming)) {
    if (skipKeys.includes(field)) continue;
    const existing = current[field];
    const existingEmpty =
      existing === '' || existing === null || existing === undefined ||
      (Array.isArray(existing) && existing.length === 0);
    // Empty fields are filled outright; only real disagreements need a decision.
    if (existingEmpty) continue;
    if (sameValue(existing, value)) continue;
    const key = `${group}.${field}`;
    out.push({
      key,
      group,
      field,
      label: FIELD_LABELS[key] ?? field,
      current: preview(existing),
      suggested: preview(value),
      value,
    });
  }
  return out;
}

/**
 * Merge a pre-fill into current step data.
 *
 * A field is written when it is still empty, or when it holds a value an earlier
 * analysis produced (`replaceable`). Anything the user typed or corrected is left
 * alone: re-running the analysis must never overwrite their work.
 */
export function applyPrefill<T extends Record<string, any>>(
  current: T,
  incoming: Partial<T>,
  replaceable: string[] = [],
): { next: T; applied: string[] } {
  const next = { ...current };
  const applied: string[] = [];

  for (const [key, value] of Object.entries(incoming)) {
    const existing = current[key];
    const existingEmpty =
      existing === '' || existing === null || existing === undefined ||
      (Array.isArray(existing) && existing.length === 0);
    if (!existingEmpty && !replaceable.includes(key)) continue;
    (next as Record<string, unknown>)[key] = value;
    applied.push(key);
  }

  return { next, applied };
}
