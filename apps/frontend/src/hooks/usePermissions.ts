'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import {
  buildPermissionFlags,
  canAccessTenantAppRoute,
  hasPermission,
  type Permission,
  type RouteAccessContext,
} from '@/lib/permissions';

export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role);

  const flags = useMemo(() => buildPermissionFlags(role), [role]);

  return {
    role,
    ...flags,
    can: (permission: Permission) => hasPermission(role, permission),
    canAccessRoute: (ctx: RouteAccessContext) => canAccessTenantAppRoute(role, ctx),
  };
}
