/** Turns "4.1 / 4.2, 5.1" into equal weights (1) per clause reference. */
export function parseClauseRefListToWeights(input: string): Record<string, number> | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/[/,;|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 0) return undefined;
  const out: Record<string, number> = {};
  for (const k of parts) out[k] = 1;
  return out;
}
