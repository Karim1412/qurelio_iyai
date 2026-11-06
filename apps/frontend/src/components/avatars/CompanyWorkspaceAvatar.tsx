'use client';

import { memo, useEffect, useState } from 'react';
import { CompanyIllustration } from '@/components/icons/sidebar-illustrations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/utils/cn';
import {
  ensureCompanyWorkspaceAvatarUrl,
  getCachedCompanyAvatarObjectUrl,
} from '@/lib/company-workspace-avatar-cache';

/** Tenant company logo: uses a session cache so route changes do not refetch bytes. */
export const CompanyWorkspaceAvatar = memo(function CompanyWorkspaceAvatar({
  avatarKey,
  className,
  size = 'md',
}: {
  avatarKey: string | null | undefined;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const token = useAuthStore((s) => s.token);
  const key = avatarKey?.trim() || '';
  const hasPhoto = Boolean(key);
  const [url, setUrl] = useState<string | null>(() => (key ? getCachedCompanyAvatarObjectUrl(key) : null));

  useEffect(() => {
    if (!hasPhoto || !token) {
      setUrl(null);
      return;
    }
    const cached = getCachedCompanyAvatarObjectUrl(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const resolved = await ensureCompanyWorkspaceAvatarUrl(key, token, ac.signal);
        if (!cancelled && resolved) setUrl(resolved);
        else if (!cancelled) setUrl(null);
      } catch (err) {
        // Aborting the fetch on unmount is expected: silence it.
        const name = (err as { name?: string } | null)?.name;
        if (name === 'AbortError' || name === 'CanceledError') return;
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      // Pass a DOMException so AbortSignal.reason is set (silences
      // "signal is aborted without reason" in modern browsers).
      ac.abort(new DOMException('Component unmounted', 'AbortError'));
    };
  }, [hasPhoto, token, key]);

  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <Avatar
      className={cn(
        dim,
        'rounded-2xl border border-[var(--border)]',
        className,
      )}
      style={{
        background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
      }}
    >
      {url ? <AvatarImage src={url} alt="" className="rounded-2xl object-cover" /> : null}
      <AvatarFallback className="rounded-2xl bg-transparent text-[var(--brand-primary)]">
        <CompanyIllustration size={size === 'sm' ? 18 : 22} />
      </AvatarFallback>
    </Avatar>
  );
});
