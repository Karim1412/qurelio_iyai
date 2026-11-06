'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';

const AVATAR_IMAGE_PATH = '/api/auth/profile/avatar/image';

/**
 * Loads the profile photo with the JWT (img src cannot send Authorization).
 * `avatarKey` must be in the dependency chain: it changes on every new upload so we refetch.
 */
export function useAvatarBlobUrl(hasCustomAvatar: boolean, avatarKey: string | null | undefined): string | null {
  const token = useAuthStore((s) => s.token);
  const [url, setUrl] = useState<string | null>(null);
  /** Changes when MinIO key changes (new upload) or when key loads from /me */
  const keyRev = avatarKey ?? '';

  useEffect(() => {
    if (!hasCustomAvatar || !token) {
      setUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      return;
    }

    const ac = new AbortController();
    let created: string | null = null;

    const bust = encodeURIComponent(keyRev || '0');
    const imageUrl = `${AVATAR_IMAGE_PATH}?v=${bust}`;

    (async () => {
      try {
        const res = await fetch(imageUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          setUrl((u) => {
            if (u) URL.revokeObjectURL(u);
            return null;
          });
          return;
        }
        const blob = await res.blob();
        created = URL.createObjectURL(blob);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return created;
        });
      } catch {
        if (!ac.signal.aborted) {
          setUrl((u) => {
            if (u) URL.revokeObjectURL(u);
            return null;
          });
        }
      }
    })();

    return () => {
      ac.abort();
      setUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, [hasCustomAvatar, token, keyRev]);

  return url;
}
