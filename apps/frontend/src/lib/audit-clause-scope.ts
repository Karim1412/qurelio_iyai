/** Clause numbers from an ISO norm document's OCR / structured extraction. */
export function extractSectionClauseNumbers(doc: { extractedStructured?: unknown }): string[] {
  const st = doc?.extractedStructured as { sections?: Array<{ clauseNumber?: string | null }> } | undefined;
  const sections = st?.sections;
  if (!Array.isArray(sections)) return [];
  const out = new Set<string>();
  for (const s of sections) {
    const cn = String(s?.clauseNumber ?? '').trim();
    if (cn) out.add(cn);
  }
  return sortIsoClauseRefs(Array.from(out));
}

/** Natural sort for ISO clause refs (4 < 4.1 < 4.1.1 < 10). */
export function compareIsoClauseRefs(a: string, b: string): number {
  const na = (a || '').trim();
  const nb = (b || '').trim();
  if (na === nb) return 0;
  const sa = na.split('.');
  const sb = nb.split('.');
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const pa = sa[i];
    const pb = sb[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    const ia = /^\d+$/.test(pa) ? parseInt(pa, 10) : NaN;
    const ib = /^\d+$/.test(pb) ? parseInt(pb, 10) : NaN;
    if (!Number.isNaN(ia) && !Number.isNaN(ib)) {
      if (ia !== ib) return ia - ib;
    } else {
      const c = pa.localeCompare(pb, undefined, { numeric: true });
      if (c !== 0) return c;
    }
  }
  return na.localeCompare(nb, undefined, { numeric: true });
}

export function sortIsoClauseRefs(refs: string[]): string[] {
  return [...refs].sort(compareIsoClauseRefs);
}

/** Extract clause number only (e.g. "4.1") from a ref that may include title text. */
export function normalizeIsoClauseRef(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  const leading = s.match(/^(\d+(?:\.\d+)*)\b/);
  if (leading) return leading[1];
  const beforeSep = s.split(/\s*[—–\-]\s*/)[0]?.trim();
  return beforeSep || s;
}

/** Trim OCR filler (trailing dots) from clause headings for display. */
export function trimClauseHeading(heading: string): string {
  return (heading || '').replace(/\.{2,}\s*$/g, '').replace(/\s+/g, ' ').trim();
}

/** Build stored audit scope text from the selected standard and clause refs. */
export function buildAuditScopeFromClauses(isoStandard: string, clauseRefs: string[]): string {
  const iso = isoStandard.trim() || 'ISO standard';
  return `${iso} clauses: ${clauseRefs.join(', ')}`;
}

export type ClauseSectionSummary = {
  clauseNumber: string;
  heading: string;
  summary?: string | null;
};

/** Lookup one clause section from structured extraction (prefers richest summary). */
export function findClauseSection(
  doc: { extractedStructured?: unknown },
  clauseRef: string,
): ClauseSectionSummary | null {
  const ref = clauseRef.trim();
  if (!ref) return null;
  const st = doc?.extractedStructured as {
    sections?: Array<{ clauseNumber?: string | null; heading?: string; summary?: string | null }>;
  } | undefined;
  const sections = st?.sections;
  if (!Array.isArray(sections)) return null;
  let best: ClauseSectionSummary | null = null;
  for (const s of sections) {
    const cn = String(s?.clauseNumber ?? '').trim();
    if (cn !== ref) continue;
    const pick: ClauseSectionSummary = {
      clauseNumber: cn,
      heading: String(s?.heading ?? '').trim(),
      summary: s?.summary ?? null,
    };
    if (!best || (pick.summary?.length ?? 0) > (best.summary?.length ?? 0)) best = pick;
  }
  return best;
}

/** Map clause ref → section metadata for radio labels and RCA hints. */
export function buildClauseSectionMap(
  doc: { extractedStructured?: unknown },
): Record<string, ClauseSectionSummary> {
  const st = doc?.extractedStructured as {
    sections?: Array<{ clauseNumber?: string | null; heading?: string; summary?: string | null }>;
  } | undefined;
  const sections = st?.sections;
  if (!Array.isArray(sections)) return {};
  const out: Record<string, ClauseSectionSummary> = {};
  for (const s of sections) {
    const cn = String(s?.clauseNumber ?? '').trim();
    if (!cn) continue;
    const pick: ClauseSectionSummary = {
      clauseNumber: cn,
      heading: String(s?.heading ?? '').trim(),
      summary: s?.summary ?? null,
    };
    const prev = out[cn];
    if (!prev || (pick.summary?.length ?? 0) > (prev.summary?.length ?? 0)) out[cn] = pick;
  }
  return out;
}

export function formatClauseRefLabel(
  clauseRef: string,
  section?: ClauseSectionSummary | null,
): string {
  const ref = clauseRef.trim();
  if (!ref) return '';
  const heading = section?.heading?.trim();
  return heading ? `${ref}: ${heading}` : ref;
}
