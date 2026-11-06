/** Display helpers for audit clause checklists (yes/no phrasing, default lines). */

export type EvidenceCheckRow = {
  id: string;
  label: string;
  checked: boolean;
  source?: 'default' | 'ai' | 'user';
};

export const CRITERION_MAIN_ID = 'criterion_main';

const DEFAULT_EVIDENCE_ID_SET = new Set([
  CRITERION_MAIN_ID,
  'applied_in_product',
  'documented_info',
  'records_seen',
  'requirements_met',
  'gap_noted',
]);

/** Default yes/no checklist lines (per criterion). */
export const DEFAULT_EVIDENCE_CHECKS: EvidenceCheckRow[] = [
  {
    id: 'applied_in_product',
    label: 'Is this requirement applied in your product or process?',
    checked: false,
    source: 'default',
  },
  {
    id: 'documented_info',
    label: 'Is documented information (procedure, policy, or plan) available for this criterion?',
    checked: false,
    source: 'default',
  },
  {
    id: 'records_seen',
    label: 'Are records or objective evidence available to verify this?',
    checked: false,
    source: 'default',
  },
  {
    id: 'requirements_met',
    label: 'Does implementation meet this requirement?',
    checked: false,
    source: 'default',
  },
  {
    id: 'gap_noted',
    label: 'Was a gap, deviation, or nonconformity identified?',
    checked: false,
    source: 'default',
  },
];

export function inferEvidenceSource(row: { id: string; source?: string }): 'default' | 'ai' | 'user' {
  if (row.source === 'ai' || row.source === 'user' || row.source === 'default') return row.source;
  if (String(row.id).startsWith('ai-')) return 'ai';
  if (DEFAULT_EVIDENCE_ID_SET.has(String(row.id).trim())) return 'default';
  return 'user';
}

/** Strip clause headings and turn stored criterion text into a yes/no checklist line. */
export function formatCriterionAsYesNoQuestion(
  question: string,
  isoClause: string,
  isoStandard?: string | null,
): string {
  let q = String(question ?? '').trim();
  q = q.replace(/^Clause\s+[\d.]+\s*[—–-]\s*/i, '').trim();
  q = q.replace(/\s*—\s*(Verify|Assess|Confirm|Review).*$/i, '').trim();
  q = q.replace(/\s*\(Suggested verification[^)]*\)\s*$/i, '').trim();

  if (!q) {
    const std = (isoStandard || 'the standard').trim();
    return `Is clause ${isoClause || '-'} applied in your product or process per ${std}?`;
  }

  if (/^(is|are|does|do|has|have|can|was|were)\b/i.test(q)) {
    return q.endsWith('?') ? q : `${q}?`;
  }

  if (/^assess\b/i.test(q) || /^verify\b/i.test(q)) {
    const std = (isoStandard || 'this standard').trim();
    return `Is ${std} applied in your product or process for clause ${isoClause || '-'}?`;
  }

  if (/^chapter\s+\d+/i.test(q) || /^\d+(\.\d+)*\s+[A-Z]/.test(q)) {
    const tail = q.replace(/^chapter\s+\d+:\s*/i, '').replace(/^\d+(\.\d+)*\s+/, '').trim();
    if (tail) {
      return `Is "${tail}" addressed and applied in your product or process?`;
    }
  }

  const body = q.length > 240 ? `${q.slice(0, 237)}…` : q;
  return `Does your organization meet this requirement: ${body}?`;
}

export function isLeafChecklistItem(item: { hierarchyLevel?: number | null }) {
  const hl = item.hierarchyLevel;
  return !hl || hl === 3;
}

export function mergeEvidenceChecksForItem(
  item: {
    question?: string | null;
    isoClause?: string;
    evidenceChecks?: EvidenceCheckRow[] | null;
  },
  isoStandard?: string | null,
): EvidenceCheckRow[] {
  const mainLabel = formatCriterionAsYesNoQuestion(
    item.question || '',
    item.isoClause || '',
    isoStandard,
  );
  const labelById = new Map<string, string>([
    [CRITERION_MAIN_ID, mainLabel],
    ...DEFAULT_EVIDENCE_CHECKS.map((d) => [d.id, d.label] as const),
  ]);

  const stored = item.evidenceChecks;
  if (Array.isArray(stored) && stored.length) {
    const merged = stored.map((r) => {
      const id = String(r.id).trim();
      const src = inferEvidenceSource(r);
      const defaultLabel = labelById.get(id);
      const storedLabel = r.label && String(r.label).trim();
      const label =
        (src === 'default' && defaultLabel)
        || defaultLabel
        || storedLabel
        || id;
      return {
        id,
        label,
        checked: Boolean(r.checked),
        source: src,
      };
    });
    if (item.question?.trim() && !merged.some((r) => r.id === CRITERION_MAIN_ID)) {
      return [
        { id: CRITERION_MAIN_ID, label: mainLabel, checked: false, source: 'default' },
        ...merged,
      ];
    }
    return merged.map((r) =>
      r.id === CRITERION_MAIN_ID ? { ...r, label: mainLabel } : r,
    );
  }

  return [
    { id: CRITERION_MAIN_ID, label: mainLabel, checked: false, source: 'default' },
    ...DEFAULT_EVIDENCE_CHECKS.map((r) => ({ ...r })),
  ];
}
