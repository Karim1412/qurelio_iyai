/** Default audit checklist lines (aligned with apps/frontend audit-checklist-display.ts). */

export const CRITERION_MAIN_ID = 'criterion_main';

export type EvidenceCheckRow = {
  id: string;
  label: string;
  checked: boolean;
  source?: 'default' | 'ai' | 'user';
};

const DEFAULT_IDS = new Set([
  CRITERION_MAIN_ID,
  'applied_in_product',
  'documented_info',
  'records_seen',
  'requirements_met',
  'gap_noted',
]);

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
  const body = q.length > 240 ? `${q.slice(0, 237)}…` : q;
  return `Does your organization meet this requirement: ${body}?`;
}

function defaultEvidenceTemplate(
  question: string,
  isoClause: string,
  isoStandard?: string | null,
): EvidenceCheckRow[] {
  const mainLabel = formatCriterionAsYesNoQuestion(question, isoClause, isoStandard);
  return [
    { id: CRITERION_MAIN_ID, label: mainLabel, checked: false, source: 'default' },
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
}

/** Merge stored lines with default base lines (preserves ticked state; keeps user + default, drops old AI). */
export function mergeEvidenceChecksWithDefaults(
  stored: EvidenceCheckRow[] | null | undefined,
  question: string,
  isoClause: string,
  isoStandard?: string | null,
): EvidenceCheckRow[] {
  const defaults = defaultEvidenceTemplate(question, isoClause, isoStandard);
  const labelById = new Map(defaults.map((d) => [d.id, d.label]));
  const order: string[] = defaults.map((d) => d.id);
  const byId = new Map<string, EvidenceCheckRow>();

  for (const d of defaults) {
    byId.set(d.id, { ...d });
  }

  if (Array.isArray(stored)) {
    for (const s of stored) {
      const id = String(s?.id ?? '').trim();
      if (!id) continue;
      const src = s.source === 'ai' || id.startsWith('ai-') ? 'ai' : (
        s.source === 'user' ? 'user' : (
          DEFAULT_IDS.has(id) ? 'default' : 'user'
        )
      );
      if (src === 'ai' || id.startsWith('ai-')) continue;
      const defLabel = labelById.get(id);
      byId.set(id, {
        id,
        label: (s.label && String(s.label).trim()) || defLabel || id,
        checked: Boolean(s.checked),
        source: src as EvidenceCheckRow['source'],
      });
      if (!order.includes(id)) order.push(id);
    }
  }

  const main = formatCriterionAsYesNoQuestion(question, isoClause, isoStandard);
  if (byId.has(CRITERION_MAIN_ID)) {
    const row = byId.get(CRITERION_MAIN_ID)!;
    byId.set(CRITERION_MAIN_ID, { ...row, label: main });
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
}

/** Format ticked/unticked lines for the RAG evaluation prompt. */
export function formatEvidenceChecklistForAi(checks: EvidenceCheckRow[] | null | undefined): string {
  if (!Array.isArray(checks) || !checks.length) return '(none provided)';
  return checks
    .map((c) => {
      const tick = c.checked ? '[x]' : '[ ]';
      return `${tick} ${String(c.label ?? '').trim()}`;
    })
    .join('\n');
}
