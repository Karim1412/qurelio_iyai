'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { companyApi, documentApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  X,
  Loader2,
  Users,
  Activity,
  Search,
  Check,
  Eye,
  UserPlus,
  Edit,
  Download,
  Upload,
  Star,
} from '@/components/icons';
import { cn } from '@/utils/cn';

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: string;
  department?: string;
}

interface AccessRule {
  kind: 'ROLE' | 'DEPARTMENT' | 'USER';
  roleRef?: string;
  department?: string;
  userId?: string;
}

interface AuditEntry {
  id?: string;
  userId?: string;
  actorUserId?: string;
  action?: string;
  at?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
}

const EDIT_ACTIONS = new Set([
  'VERSION',
  'UPDATE',
  'MANUAL_TEXT',
  'EXTRACTION_EDIT',
  'APPROVAL',
  'SUBMIT_REVIEW',
  'OWNER_CHANGE',
]);

function actionVerb(action: string | undefined): string {
  switch ((action || '').toUpperCase()) {
    case 'VIEW':
      return 'opened this file';
    case 'DOWNLOAD':
      return 'downloaded this file';
    case 'VERSION':
      return 'edited this file';
    case 'UPDATE':
      return 'updated this file';
    case 'MANUAL_TEXT':
      return 'edited the text';
    case 'EXTRACTION_EDIT':
      return 'edited the extraction';
    case 'UPLOAD':
      return 'uploaded this file';
    case 'APPROVAL':
      return 'changed the approval';
    case 'SUBMIT_REVIEW':
      return 'submitted for review';
    case 'OWNER_CHANGE':
      return 'transferred ownership';
    case 'SHARE_COMPANY':
      return 'shared with the company';
    case 'ARCHIVE':
      return 'archived this file';
    case 'RESTORE':
      return 'restored this file';
    default:
      return `${(action || 'changed').toLowerCase()} this file`;
  }
}

interface ActionStyle {
  icon: React.ReactNode;
  ring: string;
  bg: string;
  fg: string;
}

function actionStyle(action: string | undefined): ActionStyle {
  const a = (action || '').toUpperCase();
  if (a === 'VIEW')
    return {
      icon: <Eye className="h-3.5 w-3.5" />,
      ring: 'ring-sky-500/20',
      bg: 'bg-sky-50 dark:bg-sky-500/10',
      fg: 'text-sky-600 dark:text-sky-400',
    };
  if (a === 'DOWNLOAD')
    return {
      icon: <Download className="h-3.5 w-3.5" />,
      ring: 'ring-violet-500/20',
      bg: 'bg-violet-50 dark:bg-violet-500/10',
      fg: 'text-violet-600 dark:text-violet-400',
    };
  if (EDIT_ACTIONS.has(a))
    return {
      icon: <Edit className="h-3.5 w-3.5" />,
      ring: 'ring-amber-500/20',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      fg: 'text-amber-600 dark:text-amber-400',
    };
  if (a === 'UPLOAD')
    return {
      icon: <Upload className="h-3.5 w-3.5" />,
      ring: 'ring-emerald-500/20',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      fg: 'text-emerald-600 dark:text-emerald-400',
    };
  return {
    icon: <Star className="h-3.5 w-3.5" />,
    ring: 'ring-[var(--brand-primary)]/20',
    bg: 'bg-[var(--brand-primary)]/8',
    fg: 'text-[var(--brand-primary)]',
  };
}

interface Props {
  docId: string;
  docName: string;
  onClose: () => void;
  /** Called after rules are saved, with the list of user IDs currently sharing the file. */
  onSaved?: (userIds: string[]) => void;
}

function displayName(u: User | undefined): string {
  if (!u) return 'Unknown user';
  const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return full || u.email;
}

function initials(u: User): string {
  const f = (u.firstName ?? '').trim()[0];
  const l = (u.lastName ?? '').trim()[0];
  return ((f ?? '') + (l ?? '')).toUpperCase() || u.email[0].toUpperCase();
}

function formatRelative(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '-';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatExact(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShareDialog({ docId, docName, onClose, onSaved }: Props) {
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'people' | 'activity'>('people');
  const [users, setUsers] = useState<User[]>([]);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [initialShared, setInitialShared] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Load users + current sharing rules
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const usersRes = await companyApi.getUsers();
        const raw = usersRes.data as { users?: User[] } | User[];
        const list = Array.isArray(raw) ? raw : raw.users ?? [];
        if (cancelled) return;
        // Exclude the current user (they own the doc, no need to "share" with self).
        setUsers(list.filter((u) => u.id !== me?.id));

        const docRes = await documentApi.get(docId);
        const doc = docRes.data as { accessRules?: AccessRule[] };
        const rules = doc.accessRules ?? [];
        const userIds = new Set(
          rules.filter((r) => r.kind === 'USER' && r.userId).map((r) => r.userId as string),
        );
        if (!cancelled) {
          setShared(userIds);
          setInitialShared(new Set(userIds));
        }
      } catch {
        if (!cancelled) setError('Could not load workspace members.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, me?.id]);

  // Lazy-load audit when tab changes
  useEffect(() => {
    if (tab !== 'activity' || audit !== null) return;
    let cancelled = false;
    (async () => {
      setAuditLoading(true);
      try {
        const r = await documentApi.audit(docId);
        const raw = r.data as AuditEntry[] | { items?: AuditEntry[] };
        const list = Array.isArray(raw) ? raw : raw.items ?? [];
        if (!cancelled) setAudit(list);

        // Persist last editor for this document so the file row can show an "Edited by" badge.
        try {
          const lastEdit = list.find((e) =>
            EDIT_ACTIONS.has((e.action || '').toUpperCase()),
          );
          if (lastEdit) {
            const lsKey = 'qurelio-fm-last-editor';
            const raw = window.localStorage.getItem(lsKey);
            const map = raw ? (JSON.parse(raw) as Record<string, { userId: string; at: string }>) : {};
            map[docId] = {
              userId: lastEdit.actorUserId || lastEdit.userId || '',
              at: lastEdit.at || lastEdit.createdAt || '',
            };
            window.localStorage.setItem(lsKey, JSON.stringify(map));
            window.dispatchEvent(new Event('qurelio-fm-last-editor-updated'));
          }
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) setAudit([]);
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, docId, audit]);

  const dirty = useMemo(() => {
    if (shared.size !== initialShared.size) return true;
    for (const id of shared) if (!initialShared.has(id)) return true;
    return false;
  }, [shared, initialShared]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = displayName(u).toLowerCase();
      const mail = u.email.toLowerCase();
      return name.includes(q) || mail.includes(q);
    });
  }, [users, query]);

  const toggle = (id: string) => {
    setShared((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Preserve existing non-USER rules (ROLE / DEPARTMENT) by re-fetching them first.
      const docRes = await documentApi.get(docId);
      const doc = docRes.data as { accessRules?: AccessRule[] };
      const nonUserRules = (doc.accessRules ?? []).filter((r) => r.kind !== 'USER');
      const userRules: AccessRule[] = Array.from(shared).map((uid) => ({
        kind: 'USER',
        userId: uid,
      }));
      await documentApi.accessRules(docId, [...nonUserRules, ...userRules]);
      setInitialShared(new Set(shared));
      onSaved?.(Array.from(shared));
      onClose();
    } catch {
      setError(
        "Could not update sharing. You may not have the Director role required to change access rules.",
      );
    } finally {
      setSaving(false);
    }
  }, [docId, shared, onSaved, onClose]);

  const usersById = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    if (me) m.set(me.id, me as unknown as User);
    return m;
  }, [users, me]);

  // Activity feed: opens, downloads, edits: anything meaningful for collaborators.
  const activityEvents = useMemo(() => {
    if (!audit) return [];
    const allowed = new Set(['VIEW', 'DOWNLOAD', 'UPLOAD', ...EDIT_ACTIONS]);
    return audit.filter((e) => allowed.has((e.action || '').toUpperCase()));
  }, [audit]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(80vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--border)]/60 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">Share file</p>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={docName}>
              {docName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)]/60 px-5 pt-2">
          {(
            [
              { id: 'people' as const, label: 'People', icon: <Users className="h-3.5 w-3.5" /> },
              { id: 'activity' as const, label: 'Activity', icon: <Activity className="h-3.5 w-3.5" /> },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12px] font-semibold transition-colors duration-150',
                tab === t.id
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="border-b border-red-500/20 bg-red-500/5 px-5 py-2 text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          {tab === 'people' ? (
            <>
              <div className="border-b border-[var(--border)]/60 px-5 py-3">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search workspace members…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                  />
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text-primary)]">{shared.size}</span>{' '}
                  {shared.size === 1 ? 'person has' : 'people have'} access
                </p>
              </div>
              <div className="flex-1 overflow-auto px-3 py-2">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <UserPlus className="h-8 w-8 text-[var(--muted)]" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {query ? 'No match' : 'No workspace members'}
                    </p>
                    <p className="max-w-xs text-xs text-[var(--muted)]">
                      {query
                        ? 'Try a different name or email.'
                        : 'Invite teammates from the User Management page to share with them.'}
                    </p>
                  </div>
                ) : (
                  filtered.map((u) => {
                    const isShared = shared.has(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle(u.id)}
                        className={cn(
                          'group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
                          isShared
                            ? 'bg-[var(--brand-primary)]/5 hover:bg-[var(--brand-primary)]/10'
                            : 'hover:bg-[var(--nav-hover)]/40',
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/15 text-[12px] font-semibold text-[var(--brand-primary)]">
                          {initials(u)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                            {displayName(u)}
                          </p>
                          <p className="truncate text-[11px] text-[var(--muted)]">
                            {u.email}
                            {u.role && (
                              <>
                                <span className="mx-1.5">·</span>
                                {u.role}
                              </>
                            )}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition-colors',
                            isShared
                              ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white'
                              : 'border-[var(--border)] text-[var(--muted)] group-hover:border-[var(--brand-primary)]/40 group-hover:text-[var(--text-primary)]',
                          )}
                        >
                          {isShared ? (
                            <>
                              <Check className="h-3 w-3" />
                              Shared
                            </>
                          ) : (
                            'Add'
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)]/60 px-5 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors duration-150 hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white transition-all duration-200',
                    dirty && !saving
                      ? 'cursor-pointer bg-[var(--brand-primary)] hover:opacity-90'
                      : 'cursor-not-allowed bg-[var(--brand-primary)]/40',
                  )}
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving ? 'Saving…' : 'Save sharing'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-auto px-3 py-2">
              {auditLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
                </div>
              ) : activityEvents.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Activity className="h-8 w-8 text-[var(--muted)]" />
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    No activity yet
                  </p>
                  <p className="max-w-xs text-xs text-[var(--muted)]">
                    When teammates open or edit this file, you'll see when and by whom right here.
                  </p>
                </div>
              ) : (
                activityEvents.slice(0, 80).map((e, i) => {
                  const actorId = e.actorUserId || e.userId;
                  const u = actorId ? usersById.get(actorId) : undefined;
                  const when = e.at || e.createdAt;
                  const style = actionStyle(e.action);
                  const verb = actionVerb(e.action);
                  return (
                    <div
                      key={e.id ?? `${actorId}-${when}-${i}`}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--nav-hover)]/30"
                    >
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 text-[12px] font-semibold text-[var(--brand-primary)]">
                        {u ? initials(u) : '?'}
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2',
                            style.bg,
                            style.fg,
                            style.ring,
                            'ring-[var(--surface)]',
                          )}
                        >
                          {style.icon}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug text-[var(--text-primary)]">
                          <span className="font-semibold">
                            {u ? displayName(u) : 'A teammate'}
                          </span>{' '}
                          <span className="text-[var(--muted)]">{verb}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]" title={formatExact(when)}>
                          {formatRelative(when)}
                          <span className="mx-1.5">·</span>
                          {formatExact(when)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
