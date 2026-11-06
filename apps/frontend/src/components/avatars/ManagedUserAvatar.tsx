'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';

/** Loads another user’s photo (same company) via authenticated GET. */
export function ManagedUserAvatar({
  userId,
  avatarKey,
  initials,
  className,
  size = 'md',
}: {
  userId: string;
  avatarKey: string | null | undefined;
  initials: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const token = useAuthStore((s) => s.token);
  const hasPhoto = Boolean(avatarKey);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPhoto || !token || !userId) {
      setUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      return;
    }
    const ac = new AbortController();
    const path = `/api/company/users/${encodeURIComponent(userId)}/avatar/image?v=${encodeURIComponent(avatarKey!)}`;
    (async () => {
      try {
        const res = await fetch(path, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          setUrl(null);
          return;
        }
        const blob = await res.blob();
        const u = URL.createObjectURL(blob);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return u;
        });
      } catch {
        if (!ac.signal.aborted) setUrl(null);
      }
    })();
    return () => {
      ac.abort();
      setUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, [hasPhoto, token, userId, avatarKey]);

  const dim =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-9 w-9 text-sm';

  return (
    <Avatar className={className ?? dim}>
      {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-[var(--nav-hover)] text-[var(--brand-primary)]">{initials}</AvatarFallback>
    </Avatar>
  );
}
