/**
 * Company.capacity matches registration bands (see register-company CAPACITIES).
 * Returns null when there is no numeric cap (unknown band or "500+").
 */
export function parseCapacityMax(capacity: string | null | undefined): number | null {
  const raw = (capacity ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.endsWith('+')) return null;

  const m = raw.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return Math.max(0, parseInt(m[2], 10));

  const single = raw.match(/^(\d+)$/);
  if (single) return Math.max(0, parseInt(single[1], 10));

  return null;
}

/** Director (company login) counts as one; each User row with this companyId counts as one. */
export function totalSeatsUsed(teamMemberCount: number): number {
  return 1 + teamMemberCount;
}
