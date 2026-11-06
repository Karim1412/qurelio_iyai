/** Select only IDs already validated for tenant, product, status and ACL. */
export function selectEvaluationEvidence(allowed: string[], requested: string[], primary: string): string[] {
  const permitted = new Set(allowed);
  if (!primary || !permitted.has(primary) || requested.some((id) => !permitted.has(id))) {
    throw new Error('Evidence must be accessible, processed and linked to the selected product');
  }
  return requested.length ? Array.from(new Set([primary, ...requested])) : Array.from(new Set(allowed));
}
