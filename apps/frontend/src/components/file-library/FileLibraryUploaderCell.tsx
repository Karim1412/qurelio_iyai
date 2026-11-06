'use client';

import React, { useEffect, useState } from 'react';
import { ManagedUserAvatar } from '@/components/avatars/ManagedUserAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';
import {
  ensureCompanyWorkspaceAvatarUrl,
  getCachedCompanyAvatarObjectUrl,
} from '@/lib/company-workspace-avatar-cache';
import { displayUserName } from '@/lib/file-library-helpers';

function initialsFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  if (t === 'You') return 'Me';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}

export function FileLibraryUploaderCell({
  uploadedBy,
  nameMap,
  userAvatarKeyById,
}: {
  uploadedBy: string | undefined;
  nameMap: Map<string, string>;
  userAvatarKeyById: Map<string, string | null>;
}) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const workspaceId = user?.companyId ?? user?.company?.id ?? null;
  const workspaceAvatarKey = user?.company?.avatarKey ?? null;
  const label =
    uploadedBy && user?.id && uploadedBy === user.id
      ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email?.split('@')[0] ||
        '-'
      : displayUserName(uploadedBy, user?.id, nameMap);
  const isCompanyUploader = Boolean(uploadedBy && workspaceId && uploadedBy === workspaceId);
  const userKey = uploadedBy && !isCompanyUploader ? userAvatarKeyById.get(uploadedBy) ?? null : null;

  const [companyBlob, setCompanyBlob] = useState<string | null>(() => {
    if (!isCompanyUploader || !workspaceAvatarKey) return null;
    return getCachedCompanyAvatarObjectUrl(workspaceAvatarKey);
  });

  useEffect(() => {
    if (!isCompanyUploader || !workspaceAvatarKey || !token) {
      setCompanyBlob(null);
      return;
    }
    const cached = getCachedCompanyAvatarObjectUrl(workspaceAvatarKey);
    if (cached) {
      setCompanyBlob(cached);
      return;
    }
    const ac = new AbortController();
    void ensureCompanyWorkspaceAvatarUrl(workspaceAvatarKey, token, ac.signal).then((url) => {
      if (!ac.signal.aborted) setCompanyBlob(url);
    });
    return () => {
      ac.abort();
    };
  }, [isCompanyUploader, workspaceAvatarKey, token]);

  if (!uploadedBy) {
    return <span className="text-sm text-[var(--muted)]">-</span>;
  }

  const initials = initialsFromDisplayName(
    label === 'You' && user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'You' : label,
  );

  if (isCompanyUploader) {
    return (
      <div className="flex min-w-0 max-w-[220px] items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0 ring-1 ring-[var(--border)]">
          {companyBlob ? <AvatarImage src={companyBlob} alt="" className="object-cover" /> : null}
          <AvatarFallback className="bg-[var(--nav-hover)] text-[10px] font-semibold text-[var(--brand-primary)]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]" title={label}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-[220px] items-center gap-2.5">
      <ManagedUserAvatar userId={uploadedBy} avatarKey={userKey} initials={initials} size="sm" />
      <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]" title={label}>
        {label}
      </span>
    </div>
  );
}
