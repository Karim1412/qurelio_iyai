'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';

/** Super-admin: company director photo / logo from MinIO. */
export function ManagedCompanyAvatar({
  companyId,
  avatarKey,
  initial,
  className,
}: {
  companyId: string;
  avatarKey: string | null | undefined;
  initial: string;
  className?: string;
}) {
  const token = useAuthStore((s) => s.token);
  const hasPhoto = Boolean(avatarKey);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPhoto || !token) {
      setUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      return;
    }
    const ac = new AbortController();
    const path = `/api/admin/companies/${encodeURIComponent(companyId)}/avatar/image?v=${encodeURIComponent(avatarKey!)}`;
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
  }, [hasPhoto, token, companyId, avatarKey]);

  return (
    <Avatar className={className ?? 'h-9 w-9'}>
      {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-[var(--nav-hover)] text-[var(--brand-primary)]">{initial}</AvatarFallback>
    </Avatar>
  );
}
