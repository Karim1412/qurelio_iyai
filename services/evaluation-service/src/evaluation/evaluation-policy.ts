/** Pure decision helpers shared by evaluation workflows and regression tests. */
export function scoreIsPublishable(statuses: string[]): boolean {
  const normalized = statuses.map((status) => String(status || '').toUpperCase());
  if (normalized.some((status) => status !== 'PASS' && status !== 'FAIL' && status !== 'N/A')) return false;
  return normalized.some((status) => status === 'PASS' || status === 'FAIL');
}

/** -2 means an old clause-only identifier is ambiguous; -1 means not found. */
export function findEvaluationResultIndex(rows: Array<{ resultId?: string; clauseReference: string }>, target: string): number {
  const direct = rows.findIndex((row) => row.resultId === target);
  if (direct >= 0) return direct;
  const matches = rows.map((row, index) => row.clauseReference === target ? index : -1).filter((index) => index >= 0);
  return matches.length > 1 ? -2 : matches.length === 1 ? matches[0] : -1;
}
