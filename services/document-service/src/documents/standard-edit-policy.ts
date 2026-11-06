/** A manual change to source sections or requirement rows invalidates AI review. */
export function markStandardExtractionForReview(previous: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  const changed = JSON.stringify(previous?.sections ?? []) !== JSON.stringify(incoming?.sections ?? []) ||
    JSON.stringify(previous?.requirementsSummary ?? null) !== JSON.stringify(incoming?.requirementsSummary ?? null);
  const oldQuality = previous?.standardExtractionQuality && typeof previous.standardExtractionQuality === 'object'
    ? previous.standardExtractionQuality : {};
  const newQuality = incoming?.standardExtractionQuality && typeof incoming.standardExtractionQuality === 'object'
    ? incoming.standardExtractionQuality : {};
  if (!changed && oldQuality.processingComplete !== false) return incoming;
  if (!changed) return { ...incoming, standardExtractionQuality: { ...oldQuality, ...newQuality, processingComplete: false, productionReady: false } };
  const warning = 'The section or requirement data was manually edited. Existing requirements may not match the revised text; retry extraction and review before activation.';
  const warnings = [...new Set([...(Array.isArray(newQuality.warnings) ? newQuality.warnings : []), warning])];
  return { ...incoming, standardExtractionQuality: { ...newQuality, processingComplete: false, productionReady: false, needsHumanReview: true, warnings } };
}
