import { cn } from '@/utils/cn';

const REPORT_STATUS_KEYS = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'closed',
  'archived',
] as const;

function reportStatusKey(status: string | undefined): string {
  const normalized = (status ?? 'DRAFT').toUpperCase().replace(/\s+/g, '_');
  const slug = normalized.toLowerCase();
  return REPORT_STATUS_KEYS.includes(slug as (typeof REPORT_STATUS_KEYS)[number]) ? slug : 'draft';
}

export function reportStatusBadgeClass(status: string | undefined): string {
  return cn('report-status-badge', `report-status-${reportStatusKey(status)}`);
}

export function reportSeverityBadgeClass(severity: string | undefined): string {
  const key = (severity ?? '').toLowerCase();
  const allowed = ['low', 'medium', 'high', 'critical'] as const;
  const slug = allowed.includes(key as (typeof allowed)[number]) ? key : null;
  return cn('report-severity-badge', slug ? `report-severity-${slug}` : 'report-severity-low');
}

export type EvalStatusTone = 'pass' | 'minor' | 'major' | 'critical' | 'missing' | 'inconclusive' | 'na';

const EVAL_STATUS_TONE: Record<string, EvalStatusTone> = {
  CONFORMANT: 'pass',
  SATISFIED: 'pass',
  FAIL: 'major',
  MINOR_NC: 'minor',
  PARTIALLY_SATISFIED: 'missing',
  MISSING_INFO: 'missing',
  INCONCLUSIVE: 'inconclusive',
  MAJOR_NC: 'major',
  NOT_SATISFIED: 'major',
  CRITICAL_NC: 'critical',
  'N/A': 'na',
};

export function evalStatusTone(statusKey: string | undefined): EvalStatusTone {
  const key = (statusKey ?? 'N/A').toUpperCase();
  return EVAL_STATUS_TONE[key] ?? 'na';
}

export function evalStatusRowClass(
  statusKey: string | undefined,
  opts?: { open?: boolean; striped?: boolean },
): string {
  const tone = evalStatusTone(statusKey);
  return cn(
    'eval-status-row',
    `eval-status-row--${tone}`,
    opts?.open && 'eval-status-row--open',
    opts?.striped ? 'eval-status-row--striped' : 'eval-status-row--alt',
  );
}

export function evalStatCardClass(tone: EvalStatusTone): string {
  return cn('eval-stat-card', `eval-stat-card--${tone}`);
}

export const EVAL_STATUS_LABELS: Record<string, string> = {
  CONFORMANT: 'PASS',
  SATISFIED: 'SATISFIED',
  FAIL: 'FAIL',
  MINOR_NC: 'MINOR NC',
  PARTIALLY_SATISFIED: 'MISSING INFO',
  MISSING_INFO: 'MISSING INFO',
  INCONCLUSIVE: 'INCONCLUSIVE',
  MAJOR_NC: 'MAJOR NC',
  NOT_SATISFIED: 'NOT SAT.',
  CRITICAL_NC: 'CRITICAL',
  'N/A': 'N/A',
};

export function evalStatusLabel(statusKey: string | undefined): string {
  const key = (statusKey ?? 'N/A').toUpperCase();
  return EVAL_STATUS_LABELS[key] ?? key.replace(/_/g, ' ');
}
