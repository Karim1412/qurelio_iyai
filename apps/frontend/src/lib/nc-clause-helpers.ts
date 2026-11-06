import { normalizeIsoClauseRef, type ClauseSectionSummary } from '@/lib/audit-clause-scope';

export type NcWhyPlaceholders = {
  why1: string;
  why2: string;
  why3: string;
  why4: string;
  why5: string;
  rootCause: string;
};

/** Placeholder text for manual 5-Why fields, tailored to the NC clause. */
export function buildNcWhyPlaceholders(params: {
  title?: string;
  isoClause?: string | null;
  isoStandard?: string | null;
  clauseSection?: ClauseSectionSummary | null;
}): NcWhyPlaceholders {
  const title = (params.title || 'this non-conformance').replace(/\s+/g, ' ').trim();
  const clauseRef = normalizeIsoClauseRef(params.isoClause || '');
  const std = (params.isoStandard || 'the standard').trim();
  const section = params.clauseSection;
  const clauseLabel = clauseRef ? `clause ${clauseRef}` : 'the applicable requirement';
  const reqHint = section?.summary?.trim()
    ? section.summary.length > 140
      ? `${section.summary.slice(0, 137)}…`
      : section.summary
    : null;

  return {
    why1: clauseRef
      ? `Why was "${title}" observed as not meeting ${clauseLabel} of ${std}?`
      : `Why did "${title}" occur?`,
    why2: reqHint
      ? `Why did controls not ensure: ${reqHint}`
      : `Why did our process controls not prevent "${title}"?`,
    why3: clauseRef
      ? `Why was the gap in ${clauseLabel} not detected during audits, monitoring, or records review?`
      : 'Why was this gap not detected earlier?',
    why4: clauseRef
      ? `Why did the process responsible for ${clauseLabel} allow this outcome (inputs, criteria, competence)?`
      : 'Why did the responsible process allow this outcome?',
    why5: clauseRef
      ? `Why has a systemic fix for ${clauseLabel} not already been implemented?`
      : 'Why has a systemic fix not already been put in place?',
    rootCause: clauseRef
      ? `Summarize the root cause for ${clauseLabel}${reqHint ? `, requirement: ${reqHint}` : ''}.`
      : 'Summarize the verified root cause.',
  };
}
