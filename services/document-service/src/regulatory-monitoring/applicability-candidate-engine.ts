/**
 * Conservative, explainable candidate discovery for Regulatory Applicability.
 *
 * This is NOT a legal rules engine. It uses the curated reference catalog plus
 * explicit product-context signals to identify references worth human review.
 * It never returns APPLICABLE / NOT_APPLICABLE decisions or probability scores.
 *
 * Candidate rules are retrieval hints, not authoritative interpretations of law.
 * Each candidate therefore includes matched product signals and a mandatory
 * scope/source verification caveat.
 */
import catalogData from './regulatory_reference_catalog.json';

type CatalogEntry = {
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
  industry?: string[];
  tags?: string[];
};

type ProvenanceEntry = {
  value?: string;
  documentId?: string;
  documentName?: string;
  grounded?: boolean | null;
  confidence?: number | null;
  sourceAuthority?: string;
};

type ProductInput = {
  id: string;
  name?: string;
  description?: string;
  productFamily?: string;
  productType?: string;
  categoryTags?: string[];
  industryLabels?: string[];
  intendedUse?: string;
  targetUsers?: string[];
  targetMarkets?: string[];
  physicalForm?: string;
  keyMaterials?: string[];
  productionProcesses?: string[];
  productionSites?: string[];
  countryOfOrigin?: string;
  applicableRegulations?: string[];
  requiredCertifications?: string[];
  mergedProfile?: Record<string, unknown> | null;
  fieldProvenance?: Record<string, ProvenanceEntry> | null;
  fieldConflicts?: Record<string, unknown> | null;
};

type ProductSignal = {
  field: string;
  value: string;
  source: 'PRODUCT_PROFILE' | 'GROUNDED_DOCUMENT_EXTRACTION';
  sourceDocumentName?: string;
  sourceAuthority?: string;
};

type MatchType = 'RECORDED_REFERENCE' | 'TOPIC_MATCH' | 'INDUSTRY_MARKET_SCREEN';

type ApplicabilityCandidate = {
  regulationId: string;
  reference: string;
  shortCode?: string;
  title?: string;
  type?: string;
  authority?: string;
  jurisdiction?: string;
  countryRegion?: string;
  category?: string;
  legalStatus?: string;
  currentVersion?: string;
  sourceUrl?: string;
  sourceUrlStatus: 'URL_RECORDED_NOT_VERIFIED' | 'NO_SOURCE_URL_RECORDED';
  matchType: MatchType;
  matchLabel: string;
  reasons: string[];
  matchedSignals: ProductSignal[];
  matchedRecordedValues?: string[];
  scopeWarning: string;
  requiresHumanReview: true;
};

type CatalogMeta = { as_of_date?: string; version?: string; target_industries?: string[]; target_markets?: string; count_note?: string; legal_boundary_note?: string };
const CATALOG_FILE = catalogData as unknown as { _meta?: CatalogMeta; catalog?: CatalogEntry[] };
const CATALOG = Array.isArray(CATALOG_FILE.catalog) ? CATALOG_FILE.catalog : [];
const CATALOG_AS_OF = CATALOG_FILE._meta?.as_of_date ?? null;

const TOPIC_RULES: Record<string, Array<{ term: string; pattern: RegExp }>> = {
  'GUID-EU-GMP-ANX1': [
    { term: 'sterile product or sterility', pattern: /\bsterile\b|\bsterility\b|\bsteril(?:e|ity|ization|isation)\b/i },
    { term: 'aseptic processing', pattern: /\baseptic\b/i },
    { term: 'contamination control strategy', pattern: /contamination control|\bccs\b/i },
    { term: 'lyophilisation', pattern: /lyophili[sz](?:ation|ed|ing)?/i },
    { term: 'cleanroom / sterile manufacturing', pattern: /clean ?room|sterile manufacturing/i },
  ],
  'GUID-EU-GMP-ANX15': [
    { term: 'qualification or validation', pattern: /\bqualification\b|\bvalidation\b|\bqualifizierung\b/i },
    { term: 'process or cleaning validation', pattern: /process validation|cleaning validation|equipment qualification/i },
  ],
  'GUID-EU-GMP-ANX16': [
    { term: 'batch release', pattern: /batch release|release of batches/i },
    { term: 'Qualified Person certification', pattern: /qualified person|\bqp release\b|batch certification/i },
  ],
  'REG-EC-2008-1234': [
    { term: 'marketing authorisation variation', pattern: /variation.{0,45}marketing authori[sz]ation|marketing authori[sz]ation.{0,45}variation|post approval change/i },
  ],
  'REG-EU-2016-161': [
    { term: 'safety features / serialisation', pattern: /safety features|seriali[sz]ation|anti.?tampering|anti.?falsification|unique identifier|data matrix/i },
  ],
  'GUID-EU-EXCIPIENTS': [
    { term: 'excipients or excipient warnings', pattern: /\bexcipient(?:s)?\b|excipient warnings|propylene glycol|sorbitol|parabens/i },
  ],
  'GUID-EU-BE': [
    { term: 'bioequivalence / bioavailability', pattern: /bioequivalence|bioavailability|generic medicine|generic medicinal product/i },
  ],
  'GUID-EU-TOPICAL': [
    { term: 'topical / cutaneous dosage form', pattern: /\btopical\b|\bcutaneous\b|\bdermal\b|\bcream\b|\bointment\b|\bsemi.?solid\b|\bivrt\b/i },
  ],
  'REG-EC-2006-1901': [
    { term: 'paediatric / pediatric medicine', pattern: /paediatric|pediatric|paediatric investigation|pediatric investigation|child.?specific/i },
  ],
  'ICH-M7': [
    { term: 'mutagenic / DNA-reactive impurities', pattern: /mutagenic impurit|genotoxic impurit|dna.?reactive|\bich\s*m7\b/i },
  ],
  'ICH-M9': [
    { term: 'BCS biowaiver / biopharmaceutics classification', pattern: /biopharmaceutics classification|\bbcs\b.{0,30}biowaiv|\bbiowaiver\b|\bich\s*m9\b/i },
  ],
  'GUID-EMA-NITROSAMINE': [
    { term: 'nitrosamine impurities', pattern: /nitrosamine|\bndma\b|\bndea\b|n.?nitroso/i },
  ],
  'GUID-WHO-DEG-EG': [
    { term: 'DEG/EG or high-risk excipient contamination', pattern: /diethylene glycol|ethylene glycol|\bdeg\s*[/&-]\s*eg\b|glycerol contamination|glycerin adulteration|propylene glycol contamination|syrup contamination|oral liquid.{0,30}(?:contamination|medicine|medication)/i },
  ],
  'ORD-TN-DPM-2025-09': [
    { term: 'Tunisian DPM oral-liquid / high-risk-excipient controls', pattern: /diethylene glycol|ethylene glycol|\bdeg\s*[/&-]\s*eg\b|glycerol|glycerin|propylene glycol|sorbitol|polyethylene glycol|oral liquid|syrup/i },
  ],
  'CERT-EDQM-CEP': [
    { term: 'active substance / CEP', pattern: /active substance|active pharmaceutical ingredient|\bapi\b|certificate of suitability|\bcep\b/i },
  ],
  'SCHEME-WHO-CPP': [
    { term: 'pharmaceutical export / CPP', pattern: /export|international commerce|certificate of a pharmaceutical product|\bcpp\b|export market/i },
  ],
};

const INDUSTRY_ALIASES: Record<string, string[]> = {
  Pharmaceuticals: ['pharmaceutical', 'pharmaceuticals', 'pharma', 'medicinal product', 'medicinal products', 'medicine', 'medicines', 'drug product', 'active pharmaceutical ingredient', 'api'],
  'Medical Devices': ['medical device', 'medical devices', 'medical equipment', 'surgical device', 'implantable device'],
  IVD: ['ivd', 'in vitro diagnostic', 'in-vitro diagnostic', 'diagnostic reagent'],
  Cosmetics: ['cosmetic', 'cosmetics', 'personal care', 'skin care', 'skincare'],
  'Cross-industry': ['cross-industry', 'cross industry', 'general industry'],
};

const TARGET_MARKET_CODES: Array<{ code: string; aliases: string[] }> = [
  { code: 'EU', aliases: ['eu', 'european union', 'eu/eea'] },
  { code: 'EU', aliases: ['austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia', 'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary', 'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia', 'spain', 'sweden'] },
  { code: 'EEA', aliases: ['eea', 'european economic area', 'norway', 'iceland', 'liechtenstein'] },
  { code: 'US', aliases: ['us', 'usa', 'united states', 'united states of america', 'u.s.'] },
  { code: 'TN', aliases: ['tunisia', 'tunisie', 'tn'] },
  { code: 'GCC', aliases: ['gcc', 'gulf cooperation council', 'gcc countries'] },
  { code: 'SA', aliases: ['saudi arabia', 'kingdom of saudi arabia', 'ksa'] },
  { code: 'UK', aliases: ['uk', 'united kingdom', 'great britain'] },
  { code: 'CA', aliases: ['canada', 'ca'] },
  { code: 'AU', aliases: ['australia', 'au'] },
  { code: 'JP', aliases: ['japan', 'jp'] },
  { code: 'CH', aliases: ['switzerland', 'ch'] },
];

function norm(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
/** Match a complete normalized phrase, never an arbitrary substring (e.g. `us` must not match `Russia`). */
function hasPhrase(haystack: string, phrase: string): boolean {
  const text = ` ${norm(haystack)} `;
  const needle = ` ${norm(phrase)} `;
  return text.includes(needle);
}
function list(value: unknown): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function hasConflict(conflicts: Record<string, unknown>, path: string): boolean {
  const target = norm(path);
  return Object.entries(conflicts).some(([key, values]) => {
    const sameField = norm(key) === target || norm(key).endsWith(` ${target}`) || norm(key).endsWith(` ${target.replace(/ /g, ' ')}`);
    return sameField && Array.isArray(values) && values.length > 0;
  });
}
function leafTextValues(value: unknown, prefix = '', depth = 0): Array<{ path: string; value: string }> {
  if (depth > 4 || value == null) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text ? [{ path: prefix || 'profile', value: text }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafTextValues(entry, prefix ? `${prefix}.${index}` : String(index), depth + 1));
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, entry]) => leafTextValues(entry, prefix ? `${prefix}.${key}` : key, depth + 1));
  return [];
}

function directSignals(product: ProductInput): ProductSignal[] {
  const fields: Array<[string, unknown]> = [
    ['industryLabels', product.industryLabels], ['categoryTags', product.categoryTags],
    ['productFamily', product.productFamily], ['productType', product.productType],
    ['intendedUse', product.intendedUse], ['physicalForm', product.physicalForm], ['targetUsers', product.targetUsers],
    ['keyMaterials', product.keyMaterials], ['productionProcesses', product.productionProcesses],
    ['productionSites', product.productionSites], ['description', product.description],
  ];
  const result: ProductSignal[] = [];
  for (const [field, raw] of fields) {
    for (const value of Array.isArray(raw) ? list(raw) : typeof raw === 'string' ? [raw] : []) {
      const conflict = hasConflict(asRecord(product.fieldConflicts), field);
      if (conflict && ['intendedUse', 'physicalForm', 'keyMaterials', 'productionProcesses', 'industryLabels', 'categoryTags'].includes(field)) continue;
      result.push({ field, value: value.trim(), source: 'PRODUCT_PROFILE' });
    }
  }
  // Supplemental extracted facts are only used when the merger marked them as grounded and non-conflicted.
  // Product names/SKUs are deliberately excluded from candidate triggers.
  const provenance = asRecord(product.fieldProvenance) as Record<string, ProvenanceEntry>;
  const conflicts = asRecord(product.fieldConflicts);
  for (const item of leafTextValues(product.mergedProfile)) {
    const path = item.path;
    if (!/^(basicInformation\.(category|subCategory)|usage\.(users|environment)|applications|qualitySpecificationNarrative|technicalCharacteristics|pharmaceuticalDetails\.(activeIngredient|pharmaceuticalForm|routeOfAdministration)|medicalDeviceDetails\.(intendedPurpose|deviceClass|sterility|implantable))(\.\d+)*$/.test(path)) continue;
    // Arrays are flattened to paths such as `usage.users.0`, while provenance is recorded on `usage.users`.
    const provenancePath = path.replace(/(?:\.\d+)+$/, '');
    const prov = provenance[provenancePath] ?? provenance[path];
    if (!prov || prov.grounded !== true || hasConflict(conflicts, provenancePath)) continue;
    result.push({ field: provenancePath, value: item.value, source: 'GROUNDED_DOCUMENT_EXTRACTION', sourceDocumentName: prov.documentName, sourceAuthority: prov.sourceAuthority });
  }
  return result.filter((signal, index, arr) => arr.findIndex((other) => other.field === signal.field && norm(other.value) === norm(signal.value)) === index);
}

function classifyIndustries(signals: ProductSignal[]): { industries: string[]; explanations: string[] } {
  const industries = new Set<string>();
  const explanations: string[] = [];
  const structuredFields = new Set(['industryLabels', 'categoryTags', 'productFamily']);
  for (const signal of signals) {
    const value = norm(signal.value);
    // Structured industry/category fields may use a taxonomy label or a clear longer description.
    if (structuredFields.has(signal.field)) {
      for (const [industry, aliases] of Object.entries(INDUSTRY_ALIASES)) {
        const matches = aliases.some((alias) => {
          const token = norm(alias);
          return value === token || hasPhrase(value, token);
        });
        if (matches) {
          industries.add(industry);
          explanations.push(`${industry} classification in ${signal.field}: “${signal.value}”`);
        }
      }
    }
    // Free text uses only high-specificity phrases. Generic “medical”, “API”, or “GMP” alone is not enough.
    const pharmaRegex = /\bpharmaceuticals?\b|\bpharma\b|medicinal product|active pharmaceutical ingredient|\bmedicine\b|\bmedicines\b|\bdrug product\b|\btablet\b|\bcapsule\b|\boral liquid\b|\binjectable\b|\bexcipient\b|pharmacopoeia|bioequivalence|nitrosamine/i;
    const deviceRegex = /medical device|surgical device|implantable device|in vitro diagnostic|\bivd\b|diagnostic reagent/i;
    const cosmeticRegex = /\bcosmetic\b|\bskincare\b|\bskin care\b|personal care product|\bshampoo\b|\bperfume\b|\bmake.?up\b/i;
    if (pharmaRegex.test(signal.value)) {
      industries.add('Pharmaceuticals');
      if (!structuredFields.has(signal.field)) explanations.push(`Pharmaceuticals inferred from a high-specificity signal in ${signal.field}: “${signal.value}”.`);
    }
    if (deviceRegex.test(signal.value)) {
      const inferred = /in vitro diagnostic|\bivd\b|diagnostic reagent/i.test(signal.value) ? 'IVD' : 'Medical Devices';
      industries.add(inferred);
      if (!structuredFields.has(signal.field)) explanations.push(`${inferred} inferred from a high-specificity signal in ${signal.field}: “${signal.value}”.`);
    }
    if (cosmeticRegex.test(signal.value)) {
      industries.add('Cosmetics');
      if (!structuredFields.has(signal.field)) explanations.push(`Cosmetics inferred from a high-specificity signal in ${signal.field}: “${signal.value}”.`);
    }
  }
  return { industries: Array.from(industries), explanations: Array.from(new Set(explanations)) };
}

function normalizeMarketCodes(targetMarkets: string[]): { codes: string[]; raw: string[]; ambiguous: string[] } {
  const codes = new Set<string>();
  const ambiguous: string[] = [];
  for (const market of targetMarkets) {
    const value = norm(market);
    if (value === 'europe' || value === 'european region') { ambiguous.push(market); continue; }
    for (const item of TARGET_MARKET_CODES) {
      if (item.aliases.some((alias) => hasPhrase(value, alias))) codes.add(item.code);
    }
    if (/\bich\b/.test(value)) codes.add('ICH');
    if (/\bwho\b|world health organization|world health organisation/.test(value)) codes.add('WHO');
    if (/\bglobal\b|\binternational\b|\bworldwide\b/.test(value)) codes.add('INT');
    // Allow known catalog codes entered directly in a structured target-market field.
    const rawCode = market.trim().toUpperCase();
    if (['EU', 'US', 'TN', 'GCC', 'SA', 'UK', 'CA', 'AU', 'JP', 'CH', 'ICH', 'WHO', 'INT'].includes(rawCode)) codes.add(rawCode);
  }
  return { codes: Array.from(codes), raw: targetMarkets, ambiguous };
}

function marketFit(entry: CatalogEntry, marketCodes: string[]): { fits: boolean; reason?: string; warning?: string } {
  const country = String(entry.country_region ?? '').toUpperCase();
  const jurisdictionText = norm(entry.jurisdiction ?? '');
  if (!marketCodes.length) return { fits: false, warning: 'Target markets are missing or ambiguous; jurisdiction fit cannot be evaluated.' };
  if (marketCodes.includes(country)) return { fits: true, reason: `Catalog jurisdiction ${country} matches a product target-market group. Country-specific scope must still be checked.` };
  if (marketCodes.includes('EEA') && jurisdictionText.includes('eea')) return { fits: true, reason: 'The catalog jurisdiction explicitly mentions the EEA; instrument-specific incorporation and dates still require verification.' };
  if (['ICH', 'WHO', 'INT'].includes(country)) return { fits: true, reason: `${country} is treated as an international/harmonisation reference candidate for the declared market(s), not as proof of a binding national obligation.` };
  // Direct mismatch is deliberately not overridden by the product's country of origin.
  return { fits: false, warning: `Catalog jurisdiction ${country || 'unknown'} does not match the declared target-market codes (${marketCodes.join(', ')}).` };
}

function industryFit(entry: CatalogEntry, industries: string[]): { fits: boolean; reason?: string } {
  const scopedIndustries = list(entry.industry).map(norm);
  if (!scopedIndustries.length) return { fits: false };
  const normalized = industries.map(norm);
  if (scopedIndustries.includes('cross industry')) {
    return { fits: true, reason: 'Catalog marks the reference as cross-industry; its specific scope still needs review.' };
  }
  const matching = list(entry.industry).filter((industry) => normalized.includes(norm(industry)));
  if (matching.length) return { fits: true, reason: `Product industry signal matches the catalog industry: ${matching.join(', ')}.` };
  return { fits: false };
}

function explicitReferenceMatches(product: ProductInput, entry: CatalogEntry): string[] {
  const recorded = [
    ...list(product.applicableRegulations).map((value) => ({ value, source: 'applicableRegulations' })),
    ...list(product.requiredCertifications).map((value) => ({ value, source: 'requiredCertifications' })),
  ];
  const strong = [entry.regulation_id, entry.reference, entry.short_code].filter(Boolean).map((x) => norm(x));
  const aliases = list(entry.aliases).filter((x) => norm(x).length >= 6).map((x) => norm(x));
  return recorded.filter(({ value }) => {
    const n = norm(value);
    if (strong.some((term) => term === n)) return true;
    return [...strong, ...aliases].some((term) => term.length >= 6 && new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}($| )`, 'i').test(n));
  }).map(({ value, source }) => `${source}: ${value}`);
}

function topicMatches(entry: CatalogEntry, signals: ProductSignal[]): { terms: string[]; matchedSignals: ProductSignal[] } {
  const rules = TOPIC_RULES[entry.regulation_id] ?? [];
  const terms = new Set<string>();
  const matched: ProductSignal[] = [];
  for (const signal of signals) {
    for (const rule of rules) {
      if (rule.pattern.test(signal.value)) {
        terms.add(rule.term);
        matched.push(signal);
      }
    }
  }
  return {
    terms: Array.from(terms),
    matchedSignals: matched.filter((signal, index, arr) => arr.findIndex((s) => s.field === signal.field && norm(s.value) === norm(signal.value)) === index),
  };
}

function toCandidate(
  entry: CatalogEntry,
  matchType: MatchType,
  reasons: string[],
  matchedSignals: ProductSignal[],
  matchedRecordedValues?: string[],
): ApplicabilityCandidate {
  const sourceUrl = typeof entry.source_url === 'string' && /^https:\/\//i.test(entry.source_url) ? entry.source_url : undefined;
  return {
    regulationId: entry.regulation_id,
    reference: entry.reference,
    shortCode: entry.short_code,
    title: entry.title,
    type: entry.type,
    authority: entry.authority,
    jurisdiction: entry.jurisdiction ?? entry.country_region,
    countryRegion: entry.country_region,
    category: entry.category,
    legalStatus: entry.legal_status,
    currentVersion: entry.current_version,
    sourceUrl,
    sourceUrlStatus: sourceUrl ? 'URL_RECORDED_NOT_VERIFIED' : 'NO_SOURCE_URL_RECORDED',
    matchType,
    matchLabel: matchType === 'RECORDED_REFERENCE' ? 'Exact / alias match to a recorded reference'
      : matchType === 'TOPIC_MATCH' ? 'Product topic signal + industry + market match'
        : 'Same industry and market — broader screening only',
    reasons,
    matchedSignals,
    matchedRecordedValues,
    scopeWarning: 'Candidate discovery only. It does not establish that the instrument legally applies, that all criteria were evaluated, or that the product is compliant. Verify current official text, jurisdiction, exclusions and product-specific scope with an authorized reviewer.',
    requiresHumanReview: true,
  };
}

function catalogAgeDays(now: Date): number | null {
  if (!CATALOG_AS_OF) return null;
  const date = new Date(`${CATALOG_AS_OF}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export function matchProductToRegulatoryCandidates(product: ProductInput, now = new Date()) {
  const signals = directSignals(product);
  const industry = classifyIndustries(signals);
  const markets = normalizeMarketCodes(list(product.targetMarkets));
  const conflictedFields = Object.entries(asRecord(product.fieldConflicts))
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key]) => key);
  const missingProfileFields: string[] = [];
  if (!markets.raw.length) missingProfileFields.push('Target markets');
  if (!industry.industries.length) missingProfileFields.push('Industry / product category');
  if (!String(product.intendedUse ?? '').trim()) missingProfileFields.push('Intended use');
  const profileWarnings: string[] = [];
  if (markets.ambiguous.length) profileWarnings.push(`Ambiguous market label(s): ${markets.ambiguous.join(', ')}. Select specific countries or an explicit legal-market group such as EU/EEA; “Europe” alone is not a jurisdiction.`);
  if (industry.industries.length > 1) profileWarnings.push(`Multiple product-industry signals were detected (${industry.industries.join(', ')}). Verify the product's primary regulatory classification; multi-category products may need separate assessments.`);
  if (markets.raw.length && !markets.codes.length) profileWarnings.push('Target markets are recorded but could not be mapped to a supported jurisdiction code. Normalize the market values before matching.');
  if (!String(product.physicalForm ?? '').trim()) profileWarnings.push('Physical form is not recorded; dosage-form-specific candidates may be missed.');
  if (!list(product.productionProcesses).length) profileWarnings.push('Production processes are not recorded; process-specific candidates may be missed.');
  if (conflictedFields.length) profileWarnings.push(`Unresolved AI-extraction conflicts exist for: ${conflictedFields.join(', ')}. Conflicted fields are not used as matching evidence where recognized.`);

  const explicit: ApplicabilityCandidate[] = [];
  const topic: ApplicabilityCandidate[] = [];
  const broader: ApplicabilityCandidate[] = [];
  const unknownRecordedReferences: Array<{ value: string; field: 'applicableRegulations' | 'requiredCertifications'; note: string }> = [];
  const recordedValues = [
    ...list(product.applicableRegulations).map((value) => ({ value, field: 'applicableRegulations' as const })),
    ...list(product.requiredCertifications).map((value) => ({ value, field: 'requiredCertifications' as const })),
  ];

  for (const entry of CATALOG) {
    const recordedMatches = explicitReferenceMatches(product, entry);
    const industryMatch = industryFit(entry, industry.industries);
    const marketMatch = marketFit(entry, markets.codes);
    const topicMatch = topicMatches(entry, signals);
    if (recordedMatches.length) {
      const reasons = [`Reference label on the product matches the catalog entry ${entry.regulation_id}.`];
      if (industryMatch.fits) reasons.push(industryMatch.reason!);
      if (marketMatch.fits) reasons.push(marketMatch.reason!);
      else if (marketMatch.warning) reasons.push(marketMatch.warning);
      explicit.push(toCandidate(entry, 'RECORDED_REFERENCE', reasons, [], recordedMatches));
      continue;
    }
    if (!industryMatch.fits || !marketMatch.fits) continue;
    if (topicMatch.terms.length) {
      topic.push(toCandidate(entry, 'TOPIC_MATCH', [
        industryMatch.reason!, marketMatch.reason!,
        `Product profile contains scope-related signal(s): ${topicMatch.terms.join('; ')}. This is a retrieval hint, not a legal applicability rule.`,
      ], topicMatch.matchedSignals));
    } else {
      broader.push(toCandidate(entry, 'INDUSTRY_MARKET_SCREEN', [
        industryMatch.reason!, marketMatch.reason!,
        'No specific product-topic trigger was found in the available profile. This is a broader screening item, not a close match or a recommendation that the reference is required.',
      ], []));
    }
  }

  for (const item of recordedValues) {
    const n = norm(item.value);
    const recognized = explicit.some((candidate) => candidate.matchedRecordedValues?.some((v) => norm(v.split(': ').slice(1).join(': ')) === n));
    if (!recognized) unknownRecordedReferences.push({ value: item.value, field: item.field, note: 'No exact or sufficiently specific alias match in the current catalog. The record is retained; do not treat it as irrelevant. Resolve its canonical ID and source.' });
  }

  const ageDays = catalogAgeDays(now);
  const catalogStatus = ageDays === null ? 'AS_OF_DATE_MISSING' : ageDays > 90 ? 'STALE_REVALIDATION_REQUIRED' : ageDays < 0 ? 'AS_OF_DATE_IN_FUTURE' : 'SNAPSHOT_DATED';
  const sortedTopic = topic.sort((a, b) => b.matchedSignals.length - a.matchedSignals.length || b.reasons.length - a.reasons.length || a.reference.localeCompare(b.reference));
  // International/harmonisation references without a product-specific topic trigger are not added to the broad list merely because a product has a market.
  const sortedBroader = broader.filter((candidate) => !['ICH', 'WHO', 'INT'].includes(candidate.countryRegion ?? '')).sort((a, b) => {
    const categoryRank = (candidate: ApplicabilityCandidate) => /good manufacturing practice/i.test(candidate.category ?? '') ? 0 : /market access|export/i.test(candidate.category ?? '') ? 1 : 2;
    return categoryRank(a) - categoryRank(b) || (a.reference || '').localeCompare(b.reference || '');
  });

  return {
    productId: product.id,
    evaluatedAt: now.toISOString(),
    catalog: {
      version: CATALOG_FILE._meta?.version ?? 'unknown',
      asOfDate: CATALOG_AS_OF,
      ageDays,
      status: catalogStatus,
      referenceCount: CATALOG.length,
      targetIndustries: CATALOG_FILE._meta?.target_industries ?? [],
      industriesActuallyCovered: Array.from(new Set(CATALOG.flatMap((entry) => list(entry.industry)))).sort(),
      coverageNote: `The matcher only searches ${CATALOG.length} records in the local curated reference catalog. Industry coverage actually present in those records: ${Array.from(new Set(CATALOG.flatMap((entry) => list(entry.industry)))).join(', ') || 'not specified'}. The catalog metadata lists intended target industries, which must not be mistaken for actual coverage. The workbook contains monitored websites, not a complete legal-instrument database. A missing candidate means the reference may be outside current catalog coverage; it does not prove that no regulation applies.`,
      legalBoundaryNote: CATALOG_FILE._meta?.legal_boundary_note ?? null,
    },
    profile: {
      detectedIndustries: industry.industries,
      industryReasons: industry.explanations,
      targetMarkets: markets.raw,
      mappedMarketCodes: markets.codes,
      missingProfileFields,
      warnings: profileWarnings,
      unresolvedConflictFields: conflictedFields,
    },
    summary: {
      recordedReferenceMatches: explicit.length,
      topicMatches: topic.length,
      broaderScreeningCandidates: sortedBroader.length,
      unresolvedRecordedReferences: unknownRecordedReferences.length,
      status: missingProfileFields.includes('Target markets') || missingProfileFields.includes('Industry / product category') || missingProfileFields.includes('Intended use') || (!markets.codes.length && markets.raw.length)
        ? 'INCOMPLETE_PRODUCT_CONTEXT'
        : explicit.length || topic.length ? 'CANDIDATES_FOUND' : 'NO_SCOPED_CANDIDATES_IN_CATALOG',
      note: !markets.codes.length
        ? 'Add and normalize target markets before relying on jurisdiction-based matching.'
        : !industry.industries.length
          ? 'Add a controlled industry/product-category label before relying on this matcher.'
          : explicit.length || topic.length
            ? 'Candidates are ranked by recorded-reference matching or explicit product-topic signals. A reviewer must verify legal scope.'
            : 'No specific match was found in the current catalog. This does not mean no regulation applies; review coverage and product data.',
    },
    recordedReferenceMatches: explicit,
    topicMatches: sortedTopic,
    broaderScreeningCandidates: sortedBroader,
    unrecognizedRecordedReferences: unknownRecordedReferences,
  };
}

export const applicabilityCatalogInfo = {
  version: CATALOG_FILE._meta?.version ?? 'unknown',
  asOfDate: CATALOG_AS_OF,
  referenceCount: CATALOG.length,
};
