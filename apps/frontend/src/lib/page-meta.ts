/** Auto breadcrumb + taglines for the top bar (replaces Workspace / raw route labels). */

export interface PageMeta {
  /** Short path segments shown as "A / B / C" */
  trail: string[];
  /** Main heading */
  title: string;
  /** One-line guidance for the user */
  tagline: string;
}

const META: Record<string, PageMeta> = {
  '/dashboard': {
    trail: ['Dashboard'],
    title: 'Overview',
    tagline: 'See your quality KPIs, trends, and what needs attention in one place.',
  },
  '/documents': {
    trail: ['Dashboard', 'File library'],
    title: 'File library',
    tagline: 'Your company files, product packs, and ISO standards in one place (this route redirects to the library).',
  },
  '/docs': {
    trail: ['Dashboard', 'File library'],
    title: 'File library',
    tagline:
      'A home for your files: product folders, standards used for AI extraction....',
  },
  '/file-manager': {
    trail: ['Dashboard', 'File Manager'],
    title: 'File Manager',
    tagline: 'Organise your files into folders, upload from your computer, and import documents from your library.',
  },
  '/docs?view=product': {
    trail: ['Dashboard', 'Compliance Hub', 'Products Management'],
    title: 'Products Management',
    tagline: 'Manage product documents, organize them by product family, and prepare them for AI extraction.',
  },
  '/docs?view=standard': {
    trail: ['Dashboard', 'Compliance Hub', 'Standards & Regulations Portal'],
    title: 'Standards & Regulations Portal',
    tagline: 'Browse the ISO standards and regulations activated for your company. Used as references in audits and evaluations.',
  },
  '/evaluations': {
    trail: ['Dashboard', 'Compliance Hub', 'Compliance Engine'],
    title: 'Compliance Engine',
    tagline: 'Run conformity checks against your standards and track results over time.',
  },
  '/nc': {
    trail: ['Dashboard', 'Non-conformities'],
    title: 'Non-conformities',
    tagline: 'Record issues, drive CAPAs, and close the loop with evidence.',
  },
  '/audits': {
    trail: ['Dashboard', 'Audits'],
    title: 'Audits',
    tagline: 'Plan internal audits, capture findings, and follow up on actions.',
  },
  '/reports': {
    trail: ['Dashboard', 'Reports'],
    title: 'Reports',
    tagline: 'Manage audit, compliance, and quality reports with templates, workflows, and approval tracking.',
  },
  '/rag-chat': {
    trail: ['Dashboard', 'AI assistant'],
    title: 'AI assistant',
    tagline: 'Ask questions about your documents and quality processes.',
  },
  '/activity-log': {
    trail: ['Dashboard', 'Activity log'],
    title: 'Activity log',
    tagline: 'Chronological view of organizations, documents, audits, and related updates.',
  },
  '/kanban': {
    trail: ['Dashboard', 'Kanban'],
    title: 'Kanban board',
    tagline: 'Plan, track, and ship work. Drag tasks across columns to update their status.',
  },
  '/calendar': {
    trail: ['Dashboard', 'Calendar'],
    title: 'Calendar',
    tagline: 'See your events, deadlines, and meetings across month, week, day, or agenda views.',
  },
  '/profile': {
    trail: ['Dashboard', 'Account'],
    title: 'Account',
    tagline: 'Update your profile, security, and notification preferences.',
  },
  '/admin/companies': {
    trail: ['Dashboard', 'Admin', 'Organizations'],
    title: 'Organizations',
    tagline: 'Approve new companies, monitor status, and support onboarding.',
  },
  '/company/users': {
    trail: ['Dashboard', 'My company'],
    title: 'My company',
    tagline: 'Invite people, assign roles, and keep access aligned with ISO responsibilities.',
  },
};

export function getPageMeta(pathname: string, view?: string | null): PageMeta {
  const path = pathname.replace(/\/$/, '') || '/dashboard';

  if (view) {
    const keyed = `${path}?view=${view}`;
    if (META[keyed]) return META[keyed];
  }

  if (META[path]) return META[path];

  if (path.startsWith('/evaluations/') && path !== '/evaluations') {
    return {
      trail: ['Dashboard', 'Evaluations', 'Report'],
      title: 'Evaluation report',
      tagline: 'Review clause-level results and evidence for this run.',
    };
  }

  return {
    trail: ['Dashboard'],
    title: 'Qurelio',
    tagline: 'Quality management workspace.',
  };
}
