'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import type { User } from '@/lib/auth-store';
import { companyApi, normalizeCompanyUsersResponse } from '@/lib/api';

function accountLabel(u: Pick<User, 'firstName' | 'lastName' | 'email'>) {
  const n = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return n || u.email || '-';
}

function teamMemberLabel(u: { firstName?: string; lastName?: string; email?: string }) {
  const n = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return n || u.email || '-';
}

/**
 * id → display name for document “Added by” / folder creator labels.
 * Falls back to current user label when company directory is unavailable.
 */
export function useCompanyUserNameMap() {
  const { user } = useAuthStore();
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const [avatarMap, setAvatarMap] = useState<Map<string, string | null>>(new Map());
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const m = new Map<string, string>();
    const av = new Map<string, string | null>();
    if (user) {
      m.set(user.id, accountLabel(user));
      av.set(user.id, user.avatarKey ?? null);
      const cid = user.companyId ?? user.company?.id;
      const cname = user.company?.name?.trim();
      if (cid) m.set(cid, cname || 'Company workspace');
    }
    if (!user?.companyId) {
      setMap(m);
      setAvatarMap(av);
      setReady(true);
      return m;
    }
    try {
      const { data } = await companyApi.getUsers();
      const { users: list } = normalizeCompanyUsersResponse(data);
      for (const row of list) {
        const r = row as {
          id: string;
          firstName?: string;
          lastName?: string;
          email?: string;
          avatarKey?: string | null;
        };
        if (r?.id) {
          m.set(r.id, teamMemberLabel(r));
          av.set(r.id, r.avatarKey ?? null);
        }
      }
    } catch {
      /* e.g. non–company-admin */
    }
    setMap(m);
    setAvatarMap(av);
    setReady(true);
    return m;
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { nameMap: map, userAvatarKeyById: avatarMap, ready, reload: load };
}
