'use client';

import { useEffect } from 'react';
import { useAuthStore, type User } from '@/lib/auth-store';
import { authApi } from '@/lib/api';

/** Avoid hammering /me on every DashboardLayout remount (each route change). */
let lastMeSync = { userId: '', at: 0 };
const ME_SYNC_COOLDOWN_MS = 90_000;

/**
 * Keeps the persisted user (including `company.avatarKey` for the org logo) aligned with the server
 * so tenant users see the current organization image without opening Profile first.
 */
export function AuthUserSync() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  useEffect(() => {
    if (!token || !user?.id) {
      lastMeSync = { userId: '', at: 0 };
      return;
    }
    const now = Date.now();
    if (lastMeSync.userId === user.id && now - lastMeSync.at < ME_SYNC_COOLDOWN_MS) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await authApi.me();
        if (cancelled || !data) return;
        lastMeSync = { userId: user.id, at: Date.now() };
        const row = data as User & { isEmailVerified?: boolean };
        updateUser({
          ...row,
          isVerified: row.isVerified ?? Boolean(row.isEmailVerified),
        });
      } catch {
        /* invalid session: api interceptor may redirect */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, user?.id, updateUser]);

  return null;
}
