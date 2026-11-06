/**
 * Tenant RBAC aligned with the product permissions matrix.
 * DIRECTOR = Company Admin. C_LEVEL = C-Level (read-heavy); add to auth when backend supports it.
 */
import type { UserRole } from '@/lib/auth-store';

export type TenantRole = Exclude<UserRole, 'SUPER_ADMIN'>;

export const PERMISSIONS = {
  inviteRemoveMembers: ['DIRECTOR'],
  configureTenantSettings: ['DIRECTOR'],
  /** Company Admin + Quality Manager: ISO library upload, archive, activate, edit clauses */
  uploadStandards: ['DIRECTOR', 'QUALITY_MANAGER'],
  uploadEvidenceDocuments: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  approveRejectDocuments: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  launchComplianceEvaluation: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  createManageAudits: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  createNcRecords: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR'],
  validateCapaClosure: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR'],
  exportReports: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'C_LEVEL'],
  useAiChatbot: ['DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR', 'C_LEVEL'],
} as const satisfies Record<string, readonly TenantRole[]>;

export type Permission = keyof typeof PERMISSIONS;

const TENANT_ROLES: readonly TenantRole[] = [
  'DIRECTOR',
  'QUALITY_MANAGER',
  'AUDITOR',
  'OPERATOR',
  'C_LEVEL',
];

export function isTenantRole(role: string | undefined | null): role is TenantRole {
  return !!role && role !== 'SUPER_ADMIN' && (TENANT_ROLES as readonly string[]).includes(role);
}

export function hasPermission(role: string | undefined | null, permission: Permission): boolean {
  if (!role || role === 'SUPER_ADMIN') return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

/** Full dashboard / reports access (create, edit workflows). */
export function hasFullDashboardReportsAccess(role: string | undefined | null): boolean {
  return (
    role === 'DIRECTOR' || role === 'QUALITY_MANAGER' || role === 'AUDITOR'
  );
}

/** Operator: view dashboards/reports with restricted actions. */
export function hasLimitedDashboardReportsAccess(role: string | undefined | null): boolean {
  return role === 'OPERATOR';
}

/** C-Level: read-only dashboards and reports. */
export function hasReadOnlyDashboardReportsAccess(role: string | undefined | null): boolean {
  return role === 'C_LEVEL';
}

export function canViewDashboardReports(role: string | undefined | null): boolean {
  if (!role || role === 'SUPER_ADMIN') return false;
  return (
    hasFullDashboardReportsAccess(role) ||
    hasLimitedDashboardReportsAccess(role) ||
    hasReadOnlyDashboardReportsAccess(role)
  );
}

export function canCreateOrEditReports(role: string | undefined | null): boolean {
  return hasFullDashboardReportsAccess(role);
}

export function isReadOnlyTenantUser(role: string | undefined | null): boolean {
  return hasReadOnlyDashboardReportsAccess(role);
}

function normalizePath(pathname: string): string {
  const base = (pathname.split('?')[0] || '/').replace(/\/$/, '') || '/';
  return base;
}

export type RouteAccessContext = {
  pathname: string;
  search?: string;
};

function searchParams(ctx: RouteAccessContext): URLSearchParams {
  const q = ctx.search ?? (ctx.pathname.includes('?') ? ctx.pathname.split('?')[1] : '');
  return new URLSearchParams(q || '');
}

/**
 * Whether the signed-in tenant user may open this app route.
 * Super-admin rules live in route-access.ts.
 */
export function canAccessTenantAppRoute(
  role: string | undefined | null,
  ctx: RouteAccessContext,
): boolean {
  if (!role || role === 'SUPER_ADMIN') return true;
  const p = normalizePath(ctx.pathname);
  const sp = searchParams(ctx);

  if (p === '/company/users' || p.startsWith('/company/users/')) {
    return hasPermission(role, 'inviteRemoveMembers');
  }

  if (p.startsWith('/evaluations')) {
    return hasPermission(role, 'launchComplianceEvaluation');
  }

  if (p.startsWith('/audits')) {
    return hasPermission(role, 'createManageAudits');
  }

  if (p.startsWith('/nc')) {
    return (
      hasPermission(role, 'createNcRecords') || hasPermission(role, 'validateCapaClosure')
    );
  }

  if (p.startsWith('/reports')) {
    return canViewDashboardReports(role);
  }

  if (p === '/docs' || p.startsWith('/docs/') || p === '/documents' || p.startsWith('/documents/')) {
    if (hasReadOnlyDashboardReportsAccess(role)) return false;
    const view = sp.get('view');
    if (view === 'standard') {
      return hasPermission(role, 'uploadStandards');
    }
    return (
      hasPermission(role, 'uploadEvidenceDocuments') ||
      hasPermission(role, 'uploadStandards')
    );
  }

  if (p.startsWith('/kanban') || p.startsWith('/calendar') || p.startsWith('/training')) {
    return !hasReadOnlyDashboardReportsAccess(role) && !hasLimitedDashboardReportsAccess(role);
  }

  if (p === '/company' || (p.startsWith('/company/') && !p.startsWith('/company/users'))) {
    return !hasReadOnlyDashboardReportsAccess(role);
  }

  if (p.startsWith('/analytics')) {
    return canViewDashboardReports(role);
  }

  if (p === '/dashboard' || p.startsWith('/dashboard/')) {
    return canViewDashboardReports(role);
  }

  return true;
}

export const TENANT_DEFAULT_HOME: Partial<Record<TenantRole, string>> = {
  C_LEVEL: '/dashboard',
  OPERATOR: '/dashboard',
};

export function tenantHomePath(role: string | undefined | null): string {
  if (!role || role === 'SUPER_ADMIN') return '/admin/companies';
  return TENANT_DEFAULT_HOME[role as TenantRole] ?? '/dashboard';
}

export function buildPermissionFlags(role: string | undefined | null) {
  return {
    inviteRemoveMembers: hasPermission(role, 'inviteRemoveMembers'),
    configureTenantSettings: hasPermission(role, 'configureTenantSettings'),
    uploadStandards: hasPermission(role, 'uploadStandards'),
    uploadEvidenceDocuments: hasPermission(role, 'uploadEvidenceDocuments'),
    approveRejectDocuments: hasPermission(role, 'approveRejectDocuments'),
    launchComplianceEvaluation: hasPermission(role, 'launchComplianceEvaluation'),
    createManageAudits: hasPermission(role, 'createManageAudits'),
    createNcRecords: hasPermission(role, 'createNcRecords'),
    validateCapaClosure: hasPermission(role, 'validateCapaClosure'),
    exportReports: hasPermission(role, 'exportReports'),
    useAiChatbot: hasPermission(role, 'useAiChatbot'),
    canViewDashboardReports: canViewDashboardReports(role),
    canCreateOrEditReports: canCreateOrEditReports(role),
    isReadOnly: isReadOnlyTenantUser(role),
    isLimitedReports: hasLimitedDashboardReportsAccess(role),
  };
}

export type PermissionFlags = ReturnType<typeof buildPermissionFlags>;
