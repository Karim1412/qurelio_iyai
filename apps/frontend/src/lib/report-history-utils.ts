export function resolveUserDisplayName(nameMap: Map<string, string>, userId: string): string {
  const name = nameMap.get(userId)?.trim();
  if (name) return name;
  return `User ${userId.slice(0, 8)}`;
}

export interface ReportVersionRow {
  id: string;
  versionNumber: number;
  createdByUserId: string;
  createdAt: string;
  reason?: string | null;
}

export interface ReportModificationRow {
  id: string;
  fieldName: string;
  oldValue?: unknown;
  newValue?: unknown;
  modifiedByUserId: string;
  createdAt: string;
}

export interface ReportChangeEvent {
  id: string;
  kind: 'created' | 'edited' | 'status';
  label: string;
  sublabel?: string;
  createdAt: string;
}

const GENERIC_REASONS = new Set([
  'Updated report',
  'Updated report fields',
  'Manual edit',
]);

function summarizeChangedFields(
  version: ReportVersionRow,
  modifications: ReportModificationRow[],
): string | undefined {
  const versionTime = new Date(version.createdAt).getTime();
  const matched = modifications.filter((m) => {
    if (m.fieldName === 'status') return false;
    const modTime = new Date(m.createdAt).getTime();
    return (
      m.modifiedByUserId === version.createdByUserId &&
      Math.abs(modTime - versionTime) < 5000
    );
  });

  if (matched.length === 0) return undefined;

  const labels = new Set<string>();
  for (const m of matched) {
    if (m.fieldName === 'title') labels.add('title');
    else if (m.fieldName === 'severity') labels.add('severity');
    else if (m.fieldName.startsWith('data.')) {
      labels.add(m.fieldName.slice(5).replace(/_/g, ' '));
    } else {
      labels.add(m.fieldName.replace(/_/g, ' '));
    }
  }

  const arr = [...labels];
  if (arr.length === 0) return undefined;
  if (arr.length <= 4) return arr.join(', ');
  return `${arr.slice(0, 3).join(', ')} +${arr.length - 3} more`;
}

export function buildReportChangeEvents(
  versions: ReportVersionRow[],
  modifications: ReportModificationRow[],
  nameMap: Map<string, string>,
): ReportChangeEvent[] {
  const events: ReportChangeEvent[] = [];

  for (const version of versions) {
    const name = resolveUserDisplayName(nameMap, version.createdByUserId);
    const changedFields = summarizeChangedFields(version, modifications);

    if (version.versionNumber === 1) {
      events.push({
        id: version.id,
        kind: 'created',
        label: `Created by ${name}`,
        createdAt: version.createdAt,
      });
      continue;
    }

    const reason =
      version.reason && !GENERIC_REASONS.has(version.reason) ? version.reason : undefined;

    events.push({
      id: version.id,
      kind: 'edited',
      label: `v${version.versionNumber} edited by ${name}`,
      sublabel: changedFields ?? reason,
      createdAt: version.createdAt,
    });
  }

  for (const mod of modifications) {
    if (mod.fieldName !== 'status') continue;
    const name = resolveUserDisplayName(nameMap, mod.modifiedByUserId);
    const newStatus = String(mod.newValue ?? '')
      .replace(/_/g, ' ')
      .toLowerCase();
    events.push({
      id: mod.id,
      kind: 'status',
      label: `Status changed to ${newStatus} by ${name}`,
      createdAt: mod.createdAt,
    });
  }

  return events.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
