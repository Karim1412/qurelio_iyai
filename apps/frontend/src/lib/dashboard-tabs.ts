/**
 * Ordered list of top-level dashboard tabs, mirroring the vertical order of the
 * Sidebar (see `src/components/layout/Sidebar.tsx`). This is the single source
 * of truth for the trackpad/touch swipe navigation between tabs.
 *
 * Keep this in sync with the Sidebar nav order when adding new top-level routes.
 */

export interface DashboardTab {
  label: string;
  href: string;
}

const TENANT_TABS: DashboardTab[] = [
  { label: 'My Dashboard', href: '/dashboard' },
  { label: 'My File Library', href: '/docs' },
  { label: 'File Manager', href: '/file-manager' },
  { label: 'My company', href: '/company' },
  { label: 'Kanban', href: '/kanban' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Training', href: '/training/my' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Compliance Engine', href: '/evaluations' },
  { label: 'Audits', href: '/audits' },
  { label: 'Non-Conformities', href: '/nc' },
];

/**
 * Tabs available to swipe through for the given role. SUPER_ADMIN only has the
 * admin area, so swipe navigation is disabled for them (empty list).
 */
export function getDashboardTabs(role?: string | null): DashboardTab[] {
  if (role === 'SUPER_ADMIN') return [];
  return TENANT_TABS;
}

/**
 * Index of the currently active tab for a pathname, or -1 when the current
 * route is not a top-level tab (e.g. a detail page): in that case swipe
 * navigation should stay inert.
 */
export function activeTabIndex(tabs: DashboardTab[], pathname: string | null): number {
  if (!pathname) return -1;
  let best = -1;
  let bestLen = -1;
  tabs.forEach((t, i) => {
    if ((pathname === t.href || pathname.startsWith(`${t.href}/`)) && t.href.length > bestLen) {
      best = i;
      bestLen = t.href.length;
    }
  });
  return best;
}
