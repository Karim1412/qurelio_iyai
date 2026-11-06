/**
 * Safe presentation resolver for Applicability.
 *
 * This module resolves display details from the shared reference catalog and live product
 * record only. Persisted human-reviewed decisions are loaded from the tenant-scoped
 * applicability-assessments API and displayed separately by ApplicabilityReasonModal.
 * It must not infer a decision, score, obligation, evidence trail, or current legal status
 * from catalog matching or sample data.
 */

import catalogData from '@/data/regulatory_reference_catalog.json';

export interface ProductCertification {
  standardName?: string;
  certificateNumber?: string;
  certifyingBody?: string;
  issueDate?: string;
  expiryDate?: string;
  marketScope?: string;
}

export interface ApplicabilityProduct {
  id: string;
  name: string;
  reference?: string;
  sku?: string;
  physicalForm?: string;
  productType?: string;
  productFamily?: string;
  countryOfOrigin?: string;
  intendedUse?: string;
  categoryTags?: string[];
  industryLabels?: string[];
  targetMarkets?: string[];
  targetUsers?: string[];
  productionSites?: string[];
  productionProcesses?: string[];
  keyMaterials?: string[];
  criticalSuppliers?: string[];
  requiredCertifications?: string[];
  applicableRegulations?: string[];
  productCertifications?: ProductCertification[];
}

export type DetailKind = 'ASSESSED' | 'CATALOG_ONLY' | 'CERTIFICATE' | 'UNRESOLVED';
export type VerdictTone = 'applicable' | 'conditional' | 'must' | 'review' | 'na' | 'neutral';
export type Coverage = 'COVERED' | 'PARTIAL' | 'MISSING' | 'NOT_ASSESSED';
export type LegalTier = 'INGESTIBLE' | 'REFERENCE_ONLY' | 'USER_UPLOAD';

export interface Signal { k: string; v: string }
export interface EvidenceItem { kind: 'attribute' | 'document' | 'external'; label: string; detail?: string }
export interface MetaCell { label: string; value: string; tone?: 'default' | 'warn' | 'bad'; mono?: boolean }
export interface Obligation { clause: string; text: string }

export interface ApplicabilityDetail {
  key: string;
  kind: DetailKind;
  label: string;
  reference: string;
  shortCode?: string;
  regulationId?: string;
  title?: string;
  verdict: string;
  verdictTone: VerdictTone;
  verdictText: string;
  condition?: string;
  applicabilityScore?: number;
  confidenceScore?: number;
  impact?: string;
  role?: string;
  tier?: LegalTier;
  tierLabel?: string;
  engineCapability?: string;
  versionHeld?: string;
  versionInForce?: string;
  versionStatus?: string;
  versionDriftDays?: number;
  versionNote?: string;
  meta: MetaCell[];
  signals: Signal[];
  reason: string;
  evidence: EvidenceItem[];
  obligations: Obligation[];
  gapIds: string[];
  changeEventIds: string[];
  engineNote?: string;
  assessedAt?: string;
  assignmentSource?: string;
  sourceUrl?: string;
  catalogAsOf?: string;
  alternates: { key: string; label: string }[];
}

interface CatalogEntry {
  regulation_id: string;
  reference: string;
  short_code?: string;
  title?: string;
  aliases?: string[];
  type?: string;
  authority?: string;
  jurisdiction?: string;
  country_region?: string;
  category?: string;
  legal_status?: string;
  engine_capability?: string;
  current_version?: string;
  previous_version?: string;
  source?: string;
  source_url?: string;
}

const CATALOG_DATA = catalogData as unknown as {
  _meta?: { as_of_date?: string; version?: string; count_note?: string; legal_boundary_note?: string };
  catalog: CatalogEntry[];
};
const CATALOG: CatalogEntry[] = Array.isArray(CATALOG_DATA.catalog) ? CATALOG_DATA.catalog : [];
const CATALOG_AS_OF = CATALOG_DATA._meta?.as_of_date;
const META_BY_ID = new Map(CATALOG.map((entry) => [entry.regulation_id, entry]));

const TIER_LABEL: Record<LegalTier, string> = {
  INGESTIBLE: 'Public text · verify source terms',
  REFERENCE_ONLY: 'Reference only · licensed text',
  USER_UPLOAD: 'User-uploaded text · licensing review',
};

interface Anchor { re: RegExp; w: number }
const ANCHORS: Record<string, Anchor[]> = {
  'GUID-EU-GMP-ANX1': [
    { re: /annexe?\s*1\b/, w: 90 },
    { re: /sterile gmp/, w: 70 },
    { re: /contamination control/, w: 70 },
  ],
  'GUID-EU-GMP-ANX15': [{ re: /annexe?s?\s*15\b/, w: 90 }],
  'GUID-EU-GMP-ANX16': [{ re: /annexe?s?\s*16\b/, w: 90 }],
  'GUID-EU-GMP-V4': [
    { re: /eudralex/, w: 50 },
    { re: /eu gmp/, w: 40 },
    { re: /bonnes pratiques de fabrication/, w: 40 },
  ],
  'DIR-EU-2001-83': [
    { re: /2001\/83/, w: 95 },
    { re: /community code/, w: 60 },
  ],
  'REG-EC-2008-1234': [
    { re: /1234\/2008/, w: 95 },
    { re: /\bvariations?\b/, w: 45 },
  ],
  'REG-EU-2016-161': [
    { re: /2016\/161/, w: 95 },
    { re: /safety features/, w: 60 },
  ],
  'REG-EC-2006-1901': [
    { re: /1901\/2006/, w: 95 },
    { re: /paediatric regulation/, w: 70 },
  ],
  'REG-EU-2014-536': [{ re: /clinical trials?/, w: 60 }],
  'GUID-EU-EXCIPIENTS': [{ re: /excipients?/, w: 65 }],
  'GUID-EU-TOPICAL': [{ re: /topical products?/, w: 75 }],
  'GUID-EU-BE': [{ re: /bioequivalence/, w: 75 }],
  'GUID-EMA-NITROSAMINE': [{ re: /nitrosamines?/, w: 80 }],
  'GUID-WHO-DEG-EG': [
    { re: /deg\s*\/\s*eg/, w: 90 },
    { re: /diethylene glycol/, w: 85 },
    { re: /contaminated paediatric oral/, w: 85 },
    { re: /oral liquid/, w: 55 },
  ],
  'GUID-TN-GMP': [
    { re: /guide des b/, w: 85 },
    { re: /\bbpf\b/, w: 80 },
    { re: /gmp certificate[^.]*dpm/, w: 60 },
  ],
  'ORD-TN-DPM-2025-09': [
    { re: /circulaire dpm/, w: 90 },
    { re: /dpm circular/, w: 90 },
    { re: /2025-09-04/, w: 85 },
    { re: /04\/09\/2025/, w: 85 },
  ],
  'LAW-TN-85-91': [
    { re: /85-91/, w: 95 },
    { re: /marketing authorisation/, w: 45 },
    { re: /\bamm\b/, w: 45 },
  ],
  'CERT-EDQM-CEP': [
    { re: /\bcep\b/, w: 80 },
    { re: /certification of suitability/, w: 85 },
  ],
  'SCHEME-WHO-CPP': [
    { re: /\bcpp\b/, w: 80 },
    { re: /certificate of a pharmaceutical product/, w: 85 },
  ],
  'PH-EUR': [
    { re: /ph\.?\s*eur/, w: 85 },
    { re: /european pharmacopoeia/, w: 85 },
  ],
  'PH-USP-NF': [
    { re: /\busp\b/, w: 80 },
    { re: /usp\s*[-–]\s*nf/, w: 85 },
  ],
  // Same weight as the other compendial citations, so when a label cites several
  // ("Ph. Eur. 5.1.3 / 5.1.4 and ISO 15378") the one written first leads.
  'STD-ISO-15378': [{ re: /iso\s*15378/, w: 85 }],
  'CFR-21-211': [{ re: /21\s*cfr/, w: 90 }],
  'ICH-M7': [{ re: /\bm7\b/, w: 80 }],
  'ICH-M9': [{ re: /\bm9\b/, w: 80 }],
  'ICH-Q1': [{ re: /\bq1[ab]?\b/, w: 80 }],
  'ICH-Q2': [{ re: /\bq2\b/, w: 80 }],
  'ICH-Q3': [{ re: /\bq3[cd]?\b/, w: 80 }],
  'ICH-Q7': [{ re: /\bq7\b/, w: 80 }],
  'ICH-Q9': [{ re: /\bq9\b/, w: 80 }],
  'ICH-Q10': [{ re: /\bq10\b/, w: 80 }],
};

function normalise(s: string): string {
  return s.toLowerCase().replace(/\*\*/g, '').replace(/[—–]/g, ' ')
    .replace(/n[°º]/g, ' ').replace(/[⟨⟩«»"'`]/g, ' ')
    .replace(/[^a-z0-9/.\-()%\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface AnchorHit { regulationId: string; weight: number; position: number }
function anchorHits(label: string): AnchorHit[] {
  const n = normalise(label);
  const hits: AnchorHit[] = [];
  for (const [regulationId, anchors] of Object.entries(ANCHORS)) {
    let best: AnchorHit | undefined;
    for (const anchor of anchors) {
      const match = n.match(anchor.re);
      if (!match || match.index === undefined) continue;
      if (!best || anchor.w > best.weight) best = { regulationId, weight: anchor.w, position: match.index };
    }
    if (best && META_BY_ID.has(best.regulationId)) hits.push(best);
  }
  return hits.sort((a, b) => b.weight - a.weight || a.position - b.position);
}

function validTier(value?: string): LegalTier | undefined {
  return value === 'INGESTIBLE' || value === 'REFERENCE_ONLY' || value === 'USER_UPLOAD'
    ? value
    : undefined;
}

function safeHttpsUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function productSignals(product: ApplicabilityProduct): Signal[] {
  const signals: Signal[] = [];
  if (product.categoryTags?.length) signals.push({ k: 'Product category', v: product.categoryTags.join(' · ') });
  if (product.physicalForm) signals.push({ k: 'Physical form', v: product.physicalForm });
  if (product.productType) signals.push({ k: 'Product type', v: product.productType });
  if (product.intendedUse) signals.push({ k: 'Intended use', v: product.intendedUse });
  if (product.productionSites?.length) signals.push({ k: 'Manufacturing site', v: product.productionSites.join(' · ') });
  if (product.targetMarkets?.length) signals.push({ k: 'Target markets', v: product.targetMarkets.join(' · ') });
  if (product.targetUsers?.length) signals.push({ k: 'Target users', v: product.targetUsers.join(' · ') });
  if (product.productionProcesses?.length) signals.push({ k: 'Production processes', v: product.productionProcesses.join(' · ') });
  if (product.keyMaterials?.length) signals.push({ k: 'Key materials', v: product.keyMaterials.join(' · ') });
  if (product.countryOfOrigin) signals.push({ k: 'Country of origin', v: product.countryOfOrigin });
  return signals;
}

function exactCatalogMatch(label: string): CatalogEntry | undefined {
  const needle = normalise(label);
  return CATALOG.find((entry) => {
    const candidates = [entry.regulation_id, entry.reference, entry.short_code, ...(entry.aliases ?? [])]
      .filter((value): value is string => Boolean(value))
      .map(normalise);
    return candidates.some((candidate) => candidate && candidate === needle);
  });
}

function catalogMatches(label: string): CatalogEntry[] {
  const exact = exactCatalogMatch(label);
  if (exact) return [exact];
  const anchored = anchorHits(label)
    .map((hit) => META_BY_ID.get(hit.regulationId))
    .filter((entry): entry is CatalogEntry => Boolean(entry));
  if (anchored.length) {
    return Array.from(new Map(anchored.map((entry) => [entry.regulation_id, entry])).values());
  }
  // Conservative alias fallback. Short/common aliases are deliberately excluded.
  const needle = normalise(label);
  const aliases = CATALOG.map((entry) => ({ entry, score: Math.max(0, ...(entry.aliases ?? [])
    .filter((alias) => normalise(alias).length >= 6 && needle.includes(normalise(alias)))
    .map((alias) => normalise(alias).length)) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!aliases.length) return [];
  const bestScore = aliases[0].score;
  return aliases.filter((item) => item.score === bestScore).map((item) => item.entry);
}

function certificateMatch(label: string, certs: ProductCertification[] | undefined): ProductCertification | undefined {
  if (!certs?.length) return undefined;
  const needle = normalise(label);
  let best: { certificate: ProductCertification; score: number } | undefined;
  certs.forEach((certificate) => {
    const name = normalise(certificate.standardName ?? '');
    if (!name) return;
    if (name === needle || needle.includes(name) || name.includes(needle)) {
      const score = Math.min(name.length, needle.length);
      if (!best || score > best.score) best = { certificate, score };
      return;
    }
    const words = name.split(' ').filter((word) => word.length > 3);
    const overlap = words.filter((word) => needle.includes(word)).length;
    const score = words.length ? overlap / words.length : 0;
    if (score >= 0.75 && (!best || score > best.score)) best = { certificate, score };
  });
  return best?.certificate;
}

export const CERTIFICATE_KEY = '__certificate__';

function certificateDetail(
  key: string,
  label: string,
  product: ApplicabilityProduct,
  certificate: ProductCertification,
  alternates: { key: string; label: string }[],
): ApplicabilityDetail {
  const expiry = certificate.expiryDate ? new Date(certificate.expiryDate) : undefined;
  const daysLeft = expiry && !Number.isNaN(expiry.getTime())
    ? Math.ceil((expiry.getTime() - Date.now()) / 86_400_000)
    : undefined;
  const expiryPassed = daysLeft !== undefined && daysLeft < 0;
  const expiringSoon = daysLeft !== undefined && daysLeft >= 0 && daysLeft <= 180;
  const validity = expiryPassed
    ? `Recorded expiry date passed ${Math.abs(daysLeft!)} days ago`
    : expiringSoon
      ? `Recorded expiry date is in ${daysLeft} days`
      : daysLeft !== undefined
        ? `Recorded expiry date is in ${daysLeft} days; authenticity is not verified`
        : 'Expiry not recorded';

  return {
    key, kind: 'CERTIFICATE', label,
    reference: certificate.standardName ?? label,
    title: 'Certificate metadata recorded on the product',
    verdict: expiryPassed ? 'Review required · recorded expiry passed' : 'Certificate record · verification required',
    verdictTone: expiryPassed || expiringSoon ? 'review' : 'neutral',
    verdictText: 'This information comes from the product record only. It does not verify certificate authenticity, scope, issuer status, or acceptance by a regulator. Compare it with the original certificate and confirm its status with the issuing body before relying on it.',
    meta: [
      { label: 'Certifying body on record', value: certificate.certifyingBody ?? 'Not recorded' },
      { label: 'Certificate number', value: certificate.certificateNumber ?? 'Not recorded', mono: true },
      { label: 'Market scope on record', value: certificate.marketScope ?? 'Not recorded' },
      { label: 'Issue date on record', value: formatDate(certificate.issueDate) ?? 'Not recorded' },
      { label: 'Expiry date on record', value: formatDate(certificate.expiryDate) ?? 'Not recorded', tone: expiryPassed ? 'bad' : expiringSoon ? 'warn' : 'default' },
      { label: 'Record check', value: validity, tone: expiryPassed ? 'bad' : expiringSoon ? 'warn' : 'default' },
      { label: 'Source', value: 'Product record · not independently verified' },
    ],
    signals: productSignals(product),
    reason: 'A certificate record and a regulatory applicability decision are different things. This section displays only the metadata saved for the product; a document review and issuer/status verification are still required.',
    evidence: [], obligations: [], gapIds: [], changeEventIds: [], alternates,
  };
}

export function buildDetail(
  product: ApplicabilityProduct,
  label: string,
  focusRegulationId?: string,
): ApplicabilityDetail {
  const matches = catalogMatches(label);
  const certificate = certificateMatch(label, product.productCertifications);
  const alternates = matches.map((entry) => ({
    key: entry.regulation_id,
    label: entry.short_code ?? entry.reference,
  }));
  if (certificate) alternates.unshift({ key: CERTIFICATE_KEY, label: 'Certificate record' });

  if (focusRegulationId === CERTIFICATE_KEY && certificate) {
    return certificateDetail(CERTIFICATE_KEY, label, product, certificate, alternates);
  }
  if (!matches.length && certificate) {
    return certificateDetail(CERTIFICATE_KEY, label, product, certificate, alternates);
  }

  const focused = focusRegulationId ? matches.find((entry) => entry.regulation_id === focusRegulationId) : undefined;
  const entry = focused ?? matches[0];
  const context = productSignals(product);

  if (!entry) {
    return {
      key: label, kind: 'UNRESOLVED', label, reference: label,
      verdict: 'Not assessed', verdictTone: 'neutral',
      verdictText: 'No applicability decision is available for this entry. It did not match a known reference in the local catalog; this does not mean the regulation is irrelevant or does not apply.',
      meta: [
        { label: 'Product', value: product.name },
        { label: 'Product reference', value: product.reference || product.sku || 'Not recorded', mono: true },
        { label: 'Lookup result', value: 'No catalog match · not a legal conclusion' },
        { label: 'Reference catalog snapshot', value: CATALOG_AS_OF ? `${formatDate(CATALOG_AS_OF)} · verify currency` : 'Date not recorded', tone: 'warn' },
      ],
      signals: context,
      reason: 'The label may be a free-text note, an alias not yet in the reference catalog, or a reference outside the catalog scope. Resolve the canonical instrument with a regulatory owner and verify it against the official source before recording an applicability decision.',
      evidence: [], obligations: [], gapIds: [], changeEventIds: [], alternates,
      catalogAsOf: CATALOG_AS_OF,
    };
  }

  const tier = validTier(entry.legal_status);
  const referenceId = entry.regulation_id;
  const sourceUrl = safeHttpsUrl(entry.source_url);
  const meta = [
    { label: 'Issuing authority', value: entry.authority ?? 'Not recorded' },
    { label: 'Instrument type', value: entry.type ?? 'Not recorded' },
    { label: 'Jurisdiction', value: entry.jurisdiction ?? entry.country_region ?? 'Not recorded' },
    { label: 'Category', value: entry.category ?? 'Not recorded' },
    { label: 'Edition text in catalog', value: entry.current_version ?? 'Not recorded', tone: 'warn' as const },
    { label: 'Catalog snapshot', value: CATALOG_AS_OF ? `${formatDate(CATALOG_AS_OF)} · verify currentness` : 'Date not recorded', tone: 'warn' as const },
    { label: 'Reference handling', value: tier ? TIER_LABEL[tier] : 'Not classified · legal review required', tone: tier ? 'default' as const : 'warn' as const },
    { label: 'Source organization', value: entry.source ?? 'Not recorded' },
    { label: 'Reference ID', value: referenceId, mono: true },
  ];
  if (entry.previous_version) meta.splice(6, 0, { label: 'Previous-edition text in catalog', value: entry.previous_version, tone: 'warn' });

  return {
    key: referenceId, kind: 'CATALOG_ONLY', label,
    reference: entry.reference,
    shortCode: entry.short_code,
    regulationId: referenceId,
    title: entry.title,
    verdict: 'Not assessed for this product',
    verdictTone: 'neutral',
    verdictText: 'A reference-catalog match was found. This page does not automatically determine legal applicability or product compliance. Review the official source and product context, then record a human-reviewed decision if you are authorized. A catalog match alone is not a legal conclusion.',
    tier,
    tierLabel: tier ? TIER_LABEL[tier] : undefined,
    engineCapability: entry.engine_capability,
    meta,
    signals: context,
    reason: 'Applicability must be determined from the product type, intended use, formulation/materials, manufacturing context, target markets and the current authoritative legal source. The product attributes shown here are context for a qualified reviewer; they have not been evaluated by an applicability engine in this screen.',
    evidence: [], obligations: [], gapIds: [], changeEventIds: [], alternates,
    sourceUrl,
    catalogAsOf: CATALOG_AS_OF,
  };
}

