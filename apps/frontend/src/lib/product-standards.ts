/**
 * Standards & regulations a product declares in the product wizard.
 *
 * The Markets and Certifications steps capture what the product must comply with
 * (required certifications, applicable regulations, industry labels, and issued
 * certificates). The compliance engine reuses those declarations so picking a
 * product document narrows the standard to evaluate against, instead of leaving
 * the user to remember which of the library's standards applies.
 */

export type ProductStandardSource =
  | 'requiredCertification'
  | 'applicableRegulation'
  | 'industryLabel'
  | 'certificate';

export interface ProductStandardRef {
  /** Display value, e.g. "ISO 13485" or "Regulation (EU) 2017/745". */
  value: string;
  source: ProductStandardSource;
  /** Where it came from, shown as a grouping label. */
  sourceLabel: string;
}

const SOURCE_LABELS: Record<ProductStandardSource, string> = {
  requiredCertification: 'Required certification',
  applicableRegulation: 'Applicable regulation',
  industryLabel: 'Industry label',
  certificate: 'Product certificate',
};

interface ProductLike {
  requiredCertifications?: string[] | null;
  applicableRegulations?: string[] | null;
  industryLabels?: string[] | null;
  productCertifications?: Array<{ standardName?: string | null }> | null;
}

/** Everything the product declares, de-duplicated, in a stable order. */
export function collectProductStandards(product: ProductLike | null | undefined): ProductStandardRef[] {
  if (!product) return [];
  const out: ProductStandardRef[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown, source: ProductStandardSource) => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return;
    const key = normalizeRef(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ value, source, sourceLabel: SOURCE_LABELS[source] });
  };

  (product.requiredCertifications ?? []).forEach((v) => push(v, 'requiredCertification'));
  (product.applicableRegulations ?? []).forEach((v) => push(v, 'applicableRegulation'));
  (product.productCertifications ?? []).forEach((c) => push(c?.standardName, 'certificate'));
  (product.industryLabels ?? []).forEach((v) => push(v, 'industryLabel'));

  return out;
}

/** Comparison key: case- and punctuation-insensitive ("EN ISO 13485:2016" → "eniso134852016"). */
export function normalizeRef(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Does a library standard document satisfy a declared reference?
 *
 * Declarations are written by hand ("ISO 13485") while documents carry a full
 * designation ("EN ISO 13485:2016"), so containment either way is the useful
 * test. Very short keys are required to match exactly, otherwise "CE" would
 * match almost everything.
 */
export function standardMatchesRef(
  norm: { isoStandard?: string | null; name?: string | null },
  ref: string,
): boolean {
  const key = normalizeRef(ref);
  if (!key) return false;
  const haystacks = [norm.isoStandard, norm.name]
    .map((v) => (typeof v === 'string' ? normalizeRef(v) : ''))
    .filter(Boolean);
  if (haystacks.length === 0) return false;

  return haystacks.some((h) => {
    if (key.length < 4) return h === key;
    return h.includes(key) || key.includes(h);
  });
}
