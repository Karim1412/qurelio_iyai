import type { ComponentType } from 'react';
import {
  DashboardIllustration,
  FileLibraryIllustration,
  CompanyIllustration,
  KanbanIllustration,
  CalendarIllustration,
  TrainingIllustration,
  AnalyticsIllustration,
  ProductsIllustration,
  StandardsIllustration,
  ComplianceIllustration,
  AuditsIllustration,
  NonConformitiesIllustration,
  ReportsIllustration,
  CompanyManagementIllustration,
  UserManagementIllustration,
  MyTrainingIllustration,
  OrganizationTrainingIllustration,
  TrainingRulesIllustration,
} from '@/components/icons/sidebar-illustrations';

export type TabOverview = {
  /** Eyebrow text above the title (small uppercase). */
  eyebrow: string;
  title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: ComponentType<any>;
  /** Single brand-aligned tint per tab. */
  tint: string;
  /** Light pastel for the tile background. */
  tintBg: string;
  /** 3 short feature chips shown under the description. */
  highlights: string[];
};

/**
 * Keyed by the sidebar tab's href.
 * The dashboard banner reads `hoveredHref` from the preview store and
 * renders the matching overview: falling back to the dashboard one.
 */
export const TAB_OVERVIEWS: Record<string, TabOverview> = {
  '/dashboard': {
    eyebrow: 'Overview',
    title: 'My dashboard',
    description:
      'Your home base: KPI cards, system activity charts, and your team at a glance.',
    Icon: DashboardIllustration,
    tint: '#1B1BF5',
    tintBg: 'rgba(27,27,245,0.10)',
    highlights: ['6 KPI cards', 'Live charts', 'Team list'],
  },

  '/docs': {
    eyebrow: 'Files',
    title: 'My file library',
    description:
      'A single place for all your documents: product files, standards and shared assets.',
    Icon: FileLibraryIllustration,
    tint: '#118D57',
    tintBg: 'rgba(17,141,87,0.10)',
    highlights: ['Upload & preview', 'Smart search', 'Drag & drop'],
  },

  '/company': {
    eyebrow: 'Workspace',
    title: 'My company',
    description:
      'Identity of your organization: logo, members, settings and workspace details.',
    Icon: CompanyIllustration,
    tint: '#1565C0',
    tintBg: 'rgba(21,101,192,0.10)',
    highlights: ['Logo & brand', 'Members', 'Workspace code'],
  },

  '/kanban': {
    eyebrow: 'Tasks',
    title: 'Kanban board',
    description:
      'Visual workflow: drag cards across columns to move work forward, end to end.',
    Icon: KanbanIllustration,
    tint: '#7C4DFF',
    tintBg: 'rgba(124,77,255,0.10)',
    highlights: ['Drag & drop', 'Priorities', 'Assignees'],
  },

  '/calendar': {
    eyebrow: 'Schedule',
    title: 'Calendar',
    description:
      'Plan events across month, week, day or agenda, gently and clearly.',
    Icon: CalendarIllustration,
    tint: '#B76E00',
    tintBg: 'rgba(183,110,0,0.10)',
    highlights: ['4 views', 'Events', 'Today indicator'],
  },

  '/training/my': {
    eyebrow: 'Learning',
    title: 'Training',
    description:
      'Your training plan, organization-wide modules and rules in one place.',
    Icon: TrainingIllustration,
    tint: '#1B1BF5',
    tintBg: 'rgba(27,27,245,0.10)',
    highlights: ['My training', 'Organization', 'Rules'],
  },

  '/training/organization': {
    eyebrow: 'Learning',
    title: 'Organization training',
    description:
      'Modules and curricula shared across teams. Track completion company-wide.',
    Icon: OrganizationTrainingIllustration,
    tint: '#7C4DFF',
    tintBg: 'rgba(124,77,255,0.10)',
    highlights: ['Curricula', 'Team progress', 'Reports'],
  },

  '/training/rules': {
    eyebrow: 'Learning',
    title: 'Training rules',
    description:
      'Policy and compliance rules that govern who must complete which training.',
    Icon: TrainingRulesIllustration,
    tint: '#118D57',
    tintBg: 'rgba(17,141,87,0.10)',
    highlights: ['Policies', 'Roles & scopes', 'Audit trail'],
  },

  '/analytics': {
    eyebrow: 'Insights',
    title: 'Analytics',
    description:
      'Compliance trends, document status, audits, training and non-conformities.',
    Icon: AnalyticsIllustration,
    tint: '#1B1BF5',
    tintBg: 'rgba(27,27,245,0.10)',
    highlights: ['Trends', 'Donuts', 'Bars'],
  },

  '/docs?view=product': {
    eyebrow: 'Modules',
    title: 'Products management',
    description:
      'All product files, specs and documentation organized per product line.',
    Icon: ProductsIllustration,
    tint: '#B76E00',
    tintBg: 'rgba(183,110,0,0.10)',
    highlights: ['Product files', 'Versions', 'Approvals'],
  },

  '/docs?view=standard': {
    eyebrow: 'Modules',
    title: 'Standards & regulations',
    description:
      'ISO standards, regulations and reference texts, searchable and always current.',
    Icon: StandardsIllustration,
    tint: '#1565C0',
    tintBg: 'rgba(21,101,192,0.10)',
    highlights: ['ISO norms', 'References', 'Updates'],
  },

  '/evaluations': {
    eyebrow: 'Modules',
    title: 'Compliance engine',
    description:
      'Run evaluations against your standards. Turn evidence into clear pass/fail scores.',
    Icon: ComplianceIllustration,
    tint: '#1B1BF5',
    tintBg: 'rgba(27,27,245,0.10)',
    highlights: ['Run evals', 'Scoring', 'Evidence'],
  },

  '/audits': {
    eyebrow: 'Quality',
    title: 'Audits',
    description:
      'Plan, conduct and close audits: every step tracked, every finding captured.',
    Icon: AuditsIllustration,
    tint: '#7C4DFF',
    tintBg: 'rgba(124,77,255,0.10)',
    highlights: ['Planning', 'Findings', 'Closure'],
  },

  '/nc': {
    eyebrow: 'Quality',
    title: 'Non-conformities',
    description:
      'Capture issues, assign CAPAs, track them through to verified closure.',
    Icon: NonConformitiesIllustration,
    tint: '#DC2626',
    tintBg: 'rgba(220,38,38,0.10)',
    highlights: ['CAPAs', 'Severity', 'Closure'],
  },

  '/reports': {
    eyebrow: 'Quality',
    title: 'Reports',
    description:
      'Generated reports across documents, audits and non-conformities, ready to export.',
    Icon: ReportsIllustration,
    tint: '#118D57',
    tintBg: 'rgba(17,141,87,0.10)',
    highlights: ['Export', 'Filters', 'Templates'],
  },

  '/admin/companies': {
    eyebrow: 'Admin',
    title: 'Company management',
    description:
      'Manage every tenant on the platform: onboarding, status, verifications.',
    Icon: CompanyManagementIllustration,
    tint: '#1B1BF5',
    tintBg: 'rgba(27,27,245,0.10)',
    highlights: ['Onboarding', 'Status', 'Verification'],
  },

  '/company/users': {
    eyebrow: 'Admin',
    title: 'User management',
    description:
      'Invite, activate and manage every member of your organization.',
    Icon: UserManagementIllustration,
    tint: '#7C4DFF',
    tintBg: 'rgba(124,77,255,0.10)',
    highlights: ['Invitations', 'Roles', 'Activity'],
  },
};

export const DASHBOARD_OVERVIEW_KEY = '/dashboard';

/**
 * Used by sub-tab nested children that don't have their own overview yet,
 * e.g. /training/my falls back to /training/my if missing.
 */
export function resolveOverview(href: string | null | undefined): TabOverview {
  if (!href) return TAB_OVERVIEWS[DASHBOARD_OVERVIEW_KEY];
  return TAB_OVERVIEWS[href] ?? TAB_OVERVIEWS[DASHBOARD_OVERVIEW_KEY];
}

// Re-export to help with discoverability.
export { MyTrainingIllustration };
