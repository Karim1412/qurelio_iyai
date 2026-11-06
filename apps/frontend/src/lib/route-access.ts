/**
 * Super admins manage platform companies only: no tenant quality modules.
 */

import {
  canAccessTenantAppRoute,
  tenantHomePath,
  type RouteAccessContext,
} from '@/lib/permissions';

export const SUPER_ADMIN_HOME_PATH = '/admin/companies';

export function getForbiddenRedirectPath(
  role: string | undefined,
  ctx: RouteAccessContext,
): string | null {
  if (!role) return '/auth/login';
  if (role === 'SUPER_ADMIN') {
    return isSuperAdminForbiddenAppPath(ctx.pathname) ? SUPER_ADMIN_HOME_PATH : null;
  }
  if (!canAccessTenantAppRoute(role, ctx)) {
    return tenantHomePath(role);
  }
  return null;
}

const SUPER_ADMIN_FORBIDDEN_PREFIXES = [
  '/documents',
  '/evaluations',
  '/nc',
  '/audits',
  '/rag-chat',
  '/activity-log',
  '/company',
  '/docs',
  '/file-manager',
  '/reports',
  '/kanban',
  '/calendar',
  '/training',
  '/analytics',
  '/regulatory-monitoring',
] as const;

/** True if this app route should redirect super admins to {@link SUPER_ADMIN_HOME_PATH}. */
export function isSuperAdminForbiddenAppPath(pathname: string): boolean {
  const p = (pathname.split('?')[0] || '/').replace(/\/$/, '') || '/';
  // Platform-level source registry settings and scheduler operations are shared
  // across tenants; only super-admins may open the monitoring control page.
  if (p === '/regulatory-monitoring/monitoring') return false;
  return SUPER_ADMIN_FORBIDDEN_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}
