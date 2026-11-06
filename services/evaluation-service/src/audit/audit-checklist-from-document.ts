/** Build audit checklist rows from ISO norm structured extraction (document-service). */

export type ChecklistRowDef = { isoClause: string; question: string; hierarchyLevel: number | null };

export type ExtractedSection = {
  clauseNumber?: string | null;
  heading?: string;
  content?: string;
  bullets?: string[];
  summary?: string | null;
  importantNotes?: string[] | null;
};

export function rowMatchesHierarchicalScope(rowIso: string, ref: string): boolean {
  const r = ref.trim();
  if (!r) return false;
  if (rowIso === r) return true;
  if (rowIso.startsWith(`${r}.`)) return true;
  if (r.startsWith(`${rowIso}.`)) return true;
  return false;
}

export function inferHierarchyLevel(isoClause: string): number {
  const parts = (isoClause || '').trim().split('.').filter(Boolean);
  if (parts.length <= 1) return 1;
  if (parts.length === 2) return 2;
  return 3;
}

/** Turn one extracted standard section into a yes/no auditor checklist question (no clause title prefix). */
export function formatSectionAsAuditCriterion(
  section: ExtractedSection,
  isoStandard?: string | null,
): string {
  const cn = String(section.clauseNumber ?? '').trim();
  const heading = String(section.heading ?? '').trim();
  const summary = String(section.summary ?? '').trim();
  const content = String(section.content ?? '').trim();
  const bullets = (section.bullets ?? []).map((b) => String(b).trim()).filter(Boolean);
  const notes = (section.importantNotes ?? []).map((n) => String(n).trim()).filter(Boolean);
  const std = (isoStandard || 'this standard').trim();
  const clauseBit = cn ? `clause ${cn}` : 'this requirement';

  if (summary.length >= 24) {
    const body = summary.length > 280 ? `${summary.slice(0, 277)}…` : summary;
    return `Does your organization meet ${clauseBit}: ${body}?`;
  }

  const shallLine =
    content.split(/\n+/).find((l) => /\b(shall|must|should)\b/i.test(l))
    || bullets.find((l) => /\b(shall|must|should)\b/i.test(l));
  if (shallLine && shallLine.length >= 12) {
    const body = shallLine.length > 280 ? `${shallLine.slice(0, 277)}…` : shallLine;
    const normalized = body.replace(/^(the organization\s+)/i, 'your organization ');
    return `Is ${normalized.endsWith('?') ? normalized.slice(0, -1) : normalized}?`;
  }

  const lead = content.split(/\n+/).map((l) => l.trim()).find((l) => l.length >= 20)
    || bullets[0]
    || notes[0];
  if (lead) {
    const body = lead.length > 260 ? `${lead.slice(0, 257)}…` : lead;
    return `Is ${clauseBit} implemented and effective in your product or process: ${body}?`;
  }

  if (heading) {
    return `Is ${std} applied in your product or process for ${clauseBit} (${heading})?`;
  }

  return `Is ${std} applied in your product or process for ${clauseBit}?`;
}

export function sectionMatchesScope(sectionClause: string, scopeRefs: string[]): boolean {
  const cn = sectionClause.trim();
  if (!cn || !scopeRefs.length) return false;
  return scopeRefs.some((ref) => rowMatchesHierarchicalScope(cn, ref.trim()));
}

/** Find the best matching extracted section for a clause ref (exact number match). */
export function findClauseSectionByRef(
  sections: ExtractedSection[] | undefined,
  clauseRef: string,
): ExtractedSection | null {
  const ref = (clauseRef || '').trim();
  if (!ref || !sections?.length) return null;
  let best: ExtractedSection | null = null;
  let bestScore = -1;
  for (const s of sections) {
    const cn = String(s.clauseNumber ?? '').trim();
    if (cn !== ref) continue;
    const score =
      (String(s.summary ?? '').trim().length)
      + (String(s.heading ?? '').trim().length)
      + (String(s.content ?? '').trim().length) / 4;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Prefer the richest section when duplicate clause numbers appear in extraction. */
function sectionRichness(s: ExtractedSection): number {
  return (
    String(s.summary ?? '').length
    + String(s.content ?? '').length
    + (s.bullets?.length ?? 0) * 40
    + (s.importantNotes?.length ?? 0) * 30
  );
}

export function rowsFromExtractedSections(
  sections: ExtractedSection[],
  scopeClauseRefs: string[],
  isoStandard?: string | null,
): ChecklistRowDef[] {
  const refs = scopeClauseRefs.map((r) => String(r).trim()).filter(Boolean);
  if (!refs.length || !sections.length) return [];

  const byClause = new Map<string, ExtractedSection>();
  for (const s of sections) {
    const cn = String(s.clauseNumber ?? '').trim();
    if (!cn || !sectionMatchesScope(cn, refs)) continue;
    const prev = byClause.get(cn);
    if (!prev || sectionRichness(s) > sectionRichness(prev)) {
      byClause.set(cn, s);
    }
  }

  const rows: ChecklistRowDef[] = [];
  for (const [cn, section] of byClause) {
    rows.push({
      isoClause: cn,
      question: formatSectionAsAuditCriterion(section, isoStandard),
      hierarchyLevel: 3,
    });
  }

  rows.sort((a, b) => compareIsoClauseRefs(a.isoClause, b.isoClause));
  return rows;
}

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

/** Merge document-derived rows with built-in templates for scope refs missing from extraction. */
export function mergeDocumentAndTemplateRows(
  fromDoc: ChecklistRowDef[],
  fromTemplate: ChecklistRowDef[],
  scopeClauseRefs: string[],
): ChecklistRowDef[] {
  const refs = scopeClauseRefs.map((r) => String(r).trim()).filter(Boolean);
  const docClauses = new Set(fromDoc.map((r) => r.isoClause));
  const merged = [...fromDoc];
  for (const t of fromTemplate) {
    if (docClauses.has(t.isoClause)) continue;
    if (!refs.some((ref) => rowMatchesHierarchicalScope(t.isoClause, ref))) continue;
    merged.push(t);
  }
  merged.sort((a, b) => {
    const c = compareIsoClauseRefs(a.isoClause, b.isoClause);
    if (c !== 0) return c;
    return (a.hierarchyLevel ?? 99) - (b.hierarchyLevel ?? 99);
  });
  return merged;
}
