'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { documentApi } from '@/lib/api';
import {
  X,
  Loader2,
  FileText,
  Edit,
  Eye,
  Download,
  Users,
  Star,
  Upload,
  Activity,
  Folder as FolderIcon,
  Check,
  Shield,
  Lock,
  Plus,
} from '@/components/icons';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { FileGlyph, FolderGlyph, typeLabel } from '@/components/file-manager/FileTypeIcon';

interface WorkspaceUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: string;
}

interface AccessRule {
  kind: 'ROLE' | 'DEPARTMENT' | 'USER';
  userId?: string;
  roleRef?: string;
  department?: string;
}

const APP_ROLES: { id: string; label: string; description: string }[] = [
  { id: 'DIRECTOR', label: 'Director', description: 'Company admin, always has access.' },
  {
    id: 'QUALITY_MANAGER',
    label: 'Quality Manager',
    description: 'Can manage standards and approvals.',
  },
  { id: 'AUDITOR', label: 'Auditor', description: 'Read-only across most surfaces.' },
  { id: 'OPERATOR', label: 'Operator', description: 'Day-to-day worker access.' },
];

interface AuditEntry {
  id?: string;
  userId?: string;
  actorUserId?: string;
  action?: string;
  at?: string;
  createdAt?: string;
}

interface FolderTarget {
  kind: 'folder';
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  sizeBytes?: number;
  createdAt: string;
  updatedAt?: string;
}

interface DocTarget {
  kind: 'doc';
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  uploadedBy?: string;
  folderId?: string | null;
}

interface FolderRef {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
}

interface Props {
  target: FolderTarget | DocTarget;
  usersById: Map<string, WorkspaceUser>;
  /** All workspace folders, used to derive the path / sub-folder counts. */
  folders: FolderRef[];
  starred: boolean;
  onClose: () => void;
}

function formatBytes(b?: number): string {
  if (!b || b < 0) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatExact(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function displayName(u: WorkspaceUser | undefined): string {
  if (!u) return 'Unknown';
  const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return full || u.email;
}

function initials(u: WorkspaceUser): string {
  const f = (u.firstName ?? '').trim()[0];
  const l = (u.lastName ?? '').trim()[0];
  return ((f ?? '') + (l ?? '')).toUpperCase() || u.email[0].toUpperCase();
}

const EDIT_ACTIONS = new Set(['VERSION', 'UPDATE', 'MANUAL_TEXT', 'EXTRACTION_EDIT']);

export function PropertiesDialog({ target, usersById, folders, starred, onClose }: Props) {
  const foldersById = useMemo(() => {
    const m = new Map<string, FolderRef>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  /** Build the breadcrumb path from root down to the target folder (or the file's parent). */
  const path = useMemo(() => {
    const out: string[] = [];
    let pid: string | null | undefined =
      target.kind === 'folder' ? target.parentId : target.folderId ?? null;
    while (pid) {
      const f = foldersById.get(pid);
      if (!f) break;
      out.unshift(f.name);
      pid = f.parentId;
    }
    return out;
  }, [target, foldersById]);

  const subfolderCount = useMemo(
    () => (target.kind === 'folder' ? folders.filter((f) => f.parentId === target.id).length : 0),
    [folders, target],
  );
  const isDoc = target.kind === 'doc';
  const [tab, setTab] = useState<'overview' | 'access'>('overview');
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(isDoc);

  // Access control state.
  const [rules, setRules] = useState<AccessRule[] | null>(null);
  const [originalRules, setOriginalRules] = useState<AccessRule[] | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [departmentInput, setDepartmentInput] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Fetch doc audit + access rules
  useEffect(() => {
    if (!isDoc) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [a, d] = await Promise.allSettled([
          documentApi.audit(target.id),
          documentApi.get(target.id),
        ]);
        if (cancelled) return;
        if (a.status === 'fulfilled') {
          const raw = a.value.data as AuditEntry[] | { items?: AuditEntry[] };
          setAudit(Array.isArray(raw) ? raw : raw.items ?? []);
        } else {
          setAudit([]);
        }
        if (d.status === 'fulfilled') {
          const docData = d.value.data as { accessRules?: AccessRule[] };
          const fetched = docData.accessRules ?? [];
          const ids = fetched
            .filter((r) => r.kind === 'USER' && r.userId)
            .map((r) => r.userId as string);
          setSharedUserIds(ids);
          // Normalise (drop ids: we don't need them on the client to re-save).
          const clean = fetched.map((r) => ({
            kind: r.kind,
            userId: r.userId,
            roleRef: r.roleRef,
            department: r.department,
          })) as AccessRule[];
          setRules(clean);
          setOriginalRules(clean);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDoc, target.id]);

  const uploader = isDoc ? usersById.get((target as DocTarget).uploadedBy ?? '') : undefined;

  // Derive last editor from audit
  const lastEditor = useMemo(() => {
    if (!audit) return null;
    const e = audit.find((x) => EDIT_ACTIONS.has((x.action || '').toUpperCase()));
    if (!e) return null;
    const uid = e.actorUserId || e.userId;
    return uid ? { user: usersById.get(uid), at: e.at || e.createdAt } : null;
  }, [audit, usersById]);

  // Distinct viewers (unique users with VIEW action) + count of opens
  const viewers = useMemo(() => {
    if (!audit) return [] as { user?: WorkspaceUser; at?: string; count: number }[];
    const map = new Map<string, { user?: WorkspaceUser; at?: string; count: number }>();
    for (const e of audit) {
      const action = (e.action || '').toUpperCase();
      if (action !== 'VIEW' && action !== 'DOWNLOAD') continue;
      const uid = e.actorUserId || e.userId || '?';
      const prev = map.get(uid);
      const at = e.at || e.createdAt;
      if (!prev) {
        map.set(uid, { user: usersById.get(uid), at, count: 1 });
      } else {
        prev.count += 1;
        // keep the most recent timestamp
        if (at && (!prev.at || at > prev.at)) prev.at = at;
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }, [audit, usersById]);

  const sharedUsers = sharedUserIds
    .map((id) => usersById.get(id))
    .filter((u): u is WorkspaceUser => Boolean(u));

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scroll while the dialog is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Access control helpers ──────────────────────────────────────────────
  const rulesUserIds = useMemo(
    () => new Set((rules ?? []).filter((r) => r.kind === 'USER' && r.userId).map((r) => r.userId!)),
    [rules],
  );
  const rulesRoles = useMemo(
    () => new Set((rules ?? []).filter((r) => r.kind === 'ROLE' && r.roleRef).map((r) => r.roleRef!)),
    [rules],
  );
  const rulesDepartments = useMemo(
    () =>
      Array.from(
        new Set(
          (rules ?? [])
            .filter((r) => r.kind === 'DEPARTMENT' && r.department)
            .map((r) => r.department!),
        ),
      ).sort(),
    [rules],
  );

  const toggleUserRule = (uid: string) =>
    setRules((prev) => {
      const cur = prev ?? [];
      const has = cur.some((r) => r.kind === 'USER' && r.userId === uid);
      return has
        ? cur.filter((r) => !(r.kind === 'USER' && r.userId === uid))
        : [...cur, { kind: 'USER', userId: uid }];
    });

  const toggleRoleRule = (role: string) =>
    setRules((prev) => {
      const cur = prev ?? [];
      const has = cur.some((r) => r.kind === 'ROLE' && r.roleRef === role);
      return has
        ? cur.filter((r) => !(r.kind === 'ROLE' && r.roleRef === role))
        : [...cur, { kind: 'ROLE', roleRef: role }];
    });

  const addDepartmentRule = () => {
    const name = departmentInput.trim();
    if (!name) return;
    setRules((prev) => {
      const cur = prev ?? [];
      if (cur.some((r) => r.kind === 'DEPARTMENT' && r.department === name)) return cur;
      return [...cur, { kind: 'DEPARTMENT', department: name }];
    });
    setDepartmentInput('');
  };

  const removeDepartmentRule = (dept: string) =>
    setRules((prev) =>
      (prev ?? []).filter((r) => !(r.kind === 'DEPARTMENT' && r.department === dept)),
    );

  const rulesDirty = useMemo(() => {
    const a = JSON.stringify(rules ?? []);
    const b = JSON.stringify(originalRules ?? []);
    return a !== b;
  }, [rules, originalRules]);

  const handleSaveRules = async () => {
    if (!isDoc || !rulesDirty || savingRules) return;
    setSavingRules(true);
    try {
      await documentApi.accessRules(target.id, rules ?? []);
      setOriginalRules(rules);
      toast.success('Access rules updated');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(
        typeof msg === 'string'
          ? msg
          : "Could not save. The Director role is required to change access rules.",
      );
    } finally {
      setSavingRules(false);
    }
  };

  const handleResetRules = () => setRules(originalRules);

  // Pre-build a sorted list of workspace users for the user picker.
  const allUsers = useMemo(() => {
    return Array.from(usersById.values())
      .filter((u): u is WorkspaceUser => Boolean(u && u.id))
      .sort((a, b) =>
        `${a.firstName ?? ''} ${a.lastName ?? ''}`
          .trim()
          .localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''}`.trim()),
      );
  }, [usersById]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => {
      const name = displayName(u).toLowerCase();
      return name.includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [allUsers, userSearch]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(80vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--border)]/60 px-5 py-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center">
            {isDoc ? (
              <FileGlyph name={target.name} mime={(target as DocTarget).mimeType} size={42} />
            ) : (
              <FolderGlyph size={42} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[15px] font-semibold text-[var(--text-primary)]"
              title={target.name}
            >
              {target.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              {isDoc ? typeLabel(target.name, (target as DocTarget).mimeType) : 'Folder'}
              {starred && (
                <>
                  <span className="mx-1.5">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                    <Star className="h-3 w-3" style={{ fill: 'currentColor' }} />
                    Starred
                  </span>
                </>
              )}
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
        <div className="flex shrink-0 gap-1 border-b border-[var(--border)]/60 px-5 pt-2">
          {(
            [
              { id: 'overview' as const, label: 'Overview', icon: <FileText className="h-3.5 w-3.5" /> },
              { id: 'access' as const, label: 'Access', icon: <Shield className="h-3.5 w-3.5" /> },
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

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {tab === 'access' ? (
            <AccessTab
              isDoc={isDoc}
              loading={loading}
              rules={rules}
              rulesUserIds={rulesUserIds}
              rulesRoles={rulesRoles}
              rulesDepartments={rulesDepartments}
              allUsers={filteredUsers}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              departmentInput={departmentInput}
              setDepartmentInput={setDepartmentInput}
              toggleUserRule={toggleUserRule}
              toggleRoleRule={toggleRoleRule}
              addDepartmentRule={addDepartmentRule}
              removeDepartmentRule={removeDepartmentRule}
              rulesDirty={rulesDirty}
              saving={savingRules}
              onSave={handleSaveRules}
              onReset={handleResetRules}
            />
          ) : (
            <>
          {/* General */}
          <Section title="General">
            <Row label="Type" value={isDoc ? typeLabel(target.name, (target as DocTarget).mimeType) : 'Folder'} />
            <Row label="Size" value={formatBytes(target.sizeBytes)} />
            {!isDoc && (
              <>
                <Row
                  label="Files"
                  value={`${(target as FolderTarget).fileCount} file${(target as FolderTarget).fileCount === 1 ? '' : 's'}`}
                />
                <Row
                  label="Sub-folders"
                  value={`${subfolderCount} sub-folder${subfolderCount === 1 ? '' : 's'}`}
                />
              </>
            )}
            <Row
              label="Location"
              value={
                <span className="inline-flex items-center gap-1 truncate" title={['File Manager', ...path].join(' / ')}>
                  <FolderIcon className="h-3 w-3 text-[var(--muted)]" />
                  {path.length === 0 ? 'File Manager' : ['File Manager', ...path].join(' / ')}
                </span>
              }
            />
            <Row label="Created" value={formatExact(target.createdAt)} hint={formatRelative(target.createdAt)} />
            <Row label="Modified" value={formatExact(target.updatedAt || target.createdAt)} hint={formatRelative(target.updatedAt || target.createdAt)} />
          </Section>

          {isDoc && (
            <Section
              title="People"
              icon={loading ? <Loader2 className="h-3 w-3 animate-spin text-[var(--muted)]" /> : null}
            >
              <Row
                label="Uploaded by"
                value={
                  uploader ? (
                    <span className="inline-flex items-center gap-2">
                      <Avatar user={uploader} />
                      <span>{displayName(uploader)}</span>
                    </span>
                  ) : (
                    '-'
                  )
                }
              />
              <Row
                label="Last edited"
                value={
                  lastEditor?.user ? (
                    <span className="inline-flex items-center gap-2">
                      <Avatar user={lastEditor.user} />
                      <span>{displayName(lastEditor.user)}</span>
                    </span>
                  ) : audit && audit.length === 0 ? (
                    '-'
                  ) : !audit ? (
                    <span className="text-[var(--muted)]">Loading…</span>
                  ) : (
                    <span className="text-[var(--muted)]">Never edited</span>
                  )
                }
                hint={lastEditor?.at ? formatRelative(lastEditor.at) : undefined}
              />
            </Section>
          )}

          {isDoc && (
            <Section
              title={
                <span className="inline-flex items-center gap-1.5">
                  Shared with
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--brand-primary)]/15 px-1 text-[10px] font-bold text-[var(--brand-primary)]">
                    {sharedUsers.length}
                  </span>
                </span>
              }
            >
              {sharedUsers.length === 0 ? (
                <p className="px-1 text-[11.5px] text-[var(--muted)]">
                  Not shared with anyone specifically. Use the Share action to give workspace
                  members access.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sharedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--page-bg)]/50 px-2 py-1 text-[11.5px] font-medium text-[var(--text-primary)]"
                      title={u.email}
                    >
                      <Avatar user={u} />
                      {displayName(u)}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {isDoc && (
            <Section
              title={
                <span className="inline-flex items-center gap-1.5">
                  Recent activity
                  {viewers.length > 0 && (
                    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--brand-primary)]/15 px-1 text-[10px] font-bold text-[var(--brand-primary)]">
                      {viewers.length}
                    </span>
                  )}
                </span>
              }
            >
              {!audit ? (
                <p className="px-1 text-[11.5px] text-[var(--muted)]">Loading…</p>
              ) : viewers.length === 0 ? (
                <p className="px-1 text-[11.5px] text-[var(--muted)]">No views yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {viewers.slice(0, 6).map((v, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <Avatar user={v.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] text-[var(--text-primary)]">
                          <span className="font-semibold">{v.user ? displayName(v.user) : 'A teammate'}</span>{' '}
                          <span className="text-[var(--muted)]">opened</span>
                          {v.count > 1 && (
                            <span className="ml-1 rounded-md bg-[var(--brand-primary)]/10 px-1 text-[10px] font-semibold text-[var(--brand-primary)]">
                              ×{v.count}
                            </span>
                          )}
                        </p>
                        <p className="text-[10.5px] text-[var(--muted)]" title={formatExact(v.at)}>
                          {formatRelative(v.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                  {viewers.length > 6 && (
                    <li className="pt-1 text-center text-[10.5px] text-[var(--muted)]">
                      +{viewers.length - 6} more viewers
                    </li>
                  )}
                </ul>
              )}
            </Section>
          )}

          <Section title="Internal">
            <Row label="ID" value={<code className="text-[11px]">{target.id}</code>} />
            {isDoc && (target as DocTarget).folderId && (
              <Row label="Folder ID" value={<code className="text-[11px]">{(target as DocTarget).folderId}</code>} />
            )}
            {!isDoc && (target as FolderTarget).parentId && (
              <Row label="Parent ID" value={<code className="text-[11px]">{(target as FolderTarget).parentId}</code>} />
            )}
          </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border)]/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl bg-[var(--brand-primary)] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  children,
  icon,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          {title}
        </p>
        {icon}
      </div>
      <div className="rounded-xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-1 text-[12px]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="min-w-0 truncate text-[var(--text-primary)]">
        {value}
        {hint && <span className="ml-1.5 text-[var(--muted)]">· {hint}</span>}
      </span>
    </div>
  );
}

interface AccessTabProps {
  isDoc: boolean;
  loading: boolean;
  rules: AccessRule[] | null;
  rulesUserIds: Set<string>;
  rulesRoles: Set<string>;
  rulesDepartments: string[];
  allUsers: WorkspaceUser[];
  userSearch: string;
  setUserSearch: (v: string) => void;
  departmentInput: string;
  setDepartmentInput: (v: string) => void;
  toggleUserRule: (id: string) => void;
  toggleRoleRule: (role: string) => void;
  addDepartmentRule: () => void;
  removeDepartmentRule: (dept: string) => void;
  rulesDirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

function AccessTab({
  isDoc,
  loading,
  rules,
  rulesUserIds,
  rulesRoles,
  rulesDepartments,
  allUsers,
  userSearch,
  setUserSearch,
  departmentInput,
  setDepartmentInput,
  toggleUserRule,
  toggleRoleRule,
  addDepartmentRule,
  removeDepartmentRule,
  rulesDirty,
  saving,
  onSave,
  onReset,
}: AccessTabProps) {
  if (!isDoc) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Lock className="h-8 w-8 text-[var(--muted)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Folders inherit workspace access
        </p>
        <p className="max-w-xs text-xs text-[var(--muted)]">
          Folder-level access control isn't supported. Open Properties on each file inside this
          folder to manage its rules.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const ruleCount = (rules ?? []).length;

  return (
    <div className="space-y-4">
      {/* Header / state explanation */}
      <div
        className={cn(
          'flex items-start gap-2.5 rounded-xl border px-3 py-2.5',
          ruleCount === 0
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/5',
        )}
      >
        <Shield
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            ruleCount === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">
            {ruleCount === 0 ? 'Open access (workspace-wide)' : `Restricted (${ruleCount} rule${ruleCount === 1 ? '' : 's'})`}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
            {ruleCount === 0
              ? "No rules. Every member of the workspace can view this file. Add at least one rule below to restrict it."
              : 'Only matching members, roles or departments can access this file. The company Director always has access.'}
          </p>
        </div>
      </div>

      {/* People */}
      <section className="rounded-xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            People
          </p>
          <span className="rounded-full bg-[var(--brand-primary)]/10 px-1.5 text-[10px] font-bold text-[var(--brand-primary)]">
            {rulesUserIds.size}
          </span>
        </div>
        <input
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Search workspace members…"
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] outline-none transition-colors focus:border-[var(--brand-primary)]"
        />
        <div className="max-h-48 space-y-0.5 overflow-auto">
          {allUsers.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-[var(--muted)]">No matches.</p>
          ) : (
            allUsers.map((u) => {
              const checked = rulesUserIds.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUserRule(u.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                    checked ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-[var(--nav-hover)]/40',
                  )}
                >
                  <Avatar user={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">
                      {displayName(u)}
                    </p>
                    <p className="truncate text-[10.5px] text-[var(--muted)]">
                      {u.email}
                      {u.role && (
                        <>
                          <span className="mx-1.5">·</span>
                          {u.role}
                        </>
                      )}
                    </p>
                  </div>
                  {checked && <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" />}
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Roles */}
      <section className="rounded-xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Roles
          </p>
          <span className="rounded-full bg-[var(--brand-primary)]/10 px-1.5 text-[10px] font-bold text-[var(--brand-primary)]">
            {rulesRoles.size}
          </span>
        </div>
        <div className="space-y-1">
          {APP_ROLES.map((r) => {
            const checked = rulesRoles.has(r.id);
            const isDirector = r.id === 'DIRECTOR';
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => !isDirector && toggleRoleRule(r.id)}
                disabled={isDirector}
                title={isDirector ? 'Directors always have access' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                  isDirector
                    ? 'cursor-not-allowed opacity-70'
                    : 'cursor-pointer',
                  checked && !isDirector ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-[var(--nav-hover)]/40',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    checked || isDirector
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--surface)] text-[var(--muted)]',
                  )}
                >
                  <Shield className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {r.label}
                    {isDirector && (
                      <span className="ml-1 rounded-md bg-[var(--brand-primary)]/10 px-1 text-[10px] font-semibold text-[var(--brand-primary)]">
                        always
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10.5px] text-[var(--muted)]">{r.description}</p>
                </div>
                {checked && !isDirector && (
                  <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Departments */}
      <section className="rounded-xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Departments
          </p>
          <span className="rounded-full bg-[var(--brand-primary)]/10 px-1.5 text-[10px] font-bold text-[var(--brand-primary)]">
            {rulesDepartments.length}
          </span>
        </div>
        <p className="mb-2 text-[10.5px] text-[var(--muted)]">
          Grant access to everyone in a given department (e.g. <em>QA</em>, <em>Operations</em>).
        </p>
        <div className="flex gap-1.5">
          <input
            value={departmentInput}
            onChange={(e) => setDepartmentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDepartmentRule();
              }
            }}
            placeholder="Department name"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] outline-none transition-colors focus:border-[var(--brand-primary)]"
          />
          <button
            type="button"
            onClick={addDepartmentRule}
            disabled={!departmentInput.trim()}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--nav-hover)]/50 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        {rulesDepartments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rulesDepartments.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]"
              >
                {d}
                <button
                  type="button"
                  onClick={() => removeDepartmentRule(d)}
                  className="cursor-pointer rounded-full p-0.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600"
                  aria-label={`Remove ${d}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Save / reset bar */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)]/60 bg-[var(--surface)] px-3 py-2">
        <span className="text-[11px] text-[var(--muted)]">
          {rulesDirty ? (
            <span className="font-semibold text-amber-600">Unsaved changes</span>
          ) : (
            'All changes saved'
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!rulesDirty || saving}
            className="cursor-pointer rounded-xl px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!rulesDirty || saving}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[11px] font-semibold text-white transition-all',
              rulesDirty && !saving
                ? 'cursor-pointer bg-[var(--brand-primary)] hover:opacity-90'
                : 'cursor-not-allowed bg-[var(--brand-primary)]/40',
            )}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {saving ? 'Saving…' : 'Save access rules'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }: { user?: WorkspaceUser }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[9px] font-bold text-white">
      {user ? initials(user) : '?'}
    </span>
  );
}
