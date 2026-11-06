'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Sun,
  Moon,
  ShieldCheck,
  Settings,
  CheckCheck,
  FileText,
  ChevronRight,
  Archive,
  ArchiveRestore,
  Trash2,
} from '@/components/icons';
import {
  ProfileIllustration,
  SubscriptionIllustration,
  SettingsIllustration,
  BellIllustration,
  LogoutIllustration,
  HomeIllustration,
  ActivityLogIllustration,
  KanbanIllustration,
  AiAssistantIllustration,
  AdminShieldIllustration,
  MenuIllustration,
} from '@/components/icons/sidebar-illustrations';
import { useAuthStore } from '@/lib/auth-store';
import { adminApi, companyApi, authApi, notificationApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow } from '@/components/ui/popover';
import { RagChatPanel } from '@/components/rag/RagChatPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/lib/theme-provider';
import { cn } from '@/utils/cn';
import { useAvatarBlobUrl } from '@/hooks/use-avatar-blob-url';
import { CompanyWorkspaceAvatar } from '@/components/avatars/CompanyWorkspaceAvatar';
import { SidebarGlobalSearch } from '@/components/layout/SidebarGlobalSearch';

interface TopbarProps {
  onMenuClick: () => void;
}

type NotifTab = 'all' | 'unread' | 'archived';

interface InboxItem {
  id: string;
  title: string;
  message: string;
  metadata?: { documentId?: string };
  isRead?: boolean;
  isArchived?: boolean;
  createdAt?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tenant strip
 * ────────────────────────────────────────────────────────────────────────── */
function TenantWorkspaceStrip() {
  const { user } = useAuthStore();
  if (!user) return null;

  if (user.role === 'SUPER_ADMIN') {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ring-[var(--brand-primary)]/15"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-accent) 18%, transparent))',
            color: 'var(--brand-primary)',
          }}
        >
          <AdminShieldIllustration size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]">
            Administration
          </p>
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-[var(--text-primary)]">
            Qurelio platform
          </p>
        </div>
      </div>
    );
  }

  const companyName = user.company?.name?.trim() || 'Your workspace';
  const cKey = user.company?.avatarKey;
  const isDirector = user.role === 'DIRECTOR';

  if (isDirector) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <CompanyWorkspaceAvatar avatarKey={cKey} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]">
            Company account
          </p>
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-[var(--text-primary)]">
            {companyName}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <CompanyWorkspaceAvatar avatarKey={cKey} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]">
          Organization
        </p>
        <p className="truncate text-[13.5px] font-semibold tracking-tight text-[var(--text-primary)]">
          {companyName}
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ────────────────────────────────────────────────────────────────────────── */
function timeAgo(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function notifColorFromId(id: string): string {
  const palette = [
    'bg-rose-100 text-rose-600',
    'bg-amber-100 text-amber-700',
    'bg-emerald-100 text-emerald-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-fuchsia-100 text-fuchsia-700',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Topbar
 * ────────────────────────────────────────────────────────────────────────── */
export function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const hasCustomAvatar = Boolean(user?.hasCustomAvatar ?? user?.avatarUrl);
  const avatarBlobUrl = useAvatarBlobUrl(hasCustomAvatar, user?.avatarKey);
  const { theme, setTheme } = useTheme();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [ragChatOpen, setRagChatOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<NotifTab>('all');
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [inboxActiveTotal, setInboxActiveTotal] = useState(0);
  const [inboxArchivedTotal, setInboxArchivedTotal] = useState(0);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [archivedItems, setArchivedItems] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingDetail, setPendingDetail] = useState<{
    companiesAwaitingApproval?: number;
    companiesAwaitingEmail?: number;
    usersAwaitingActivation?: number;
    usersAwaitingEmail?: number;
  } | null>(null);

  /* ── Data loaders ── */
  const loadPending = useCallback(async () => {
    if (!user) return;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'DIRECTOR') {
      setPendingTotal(0);
      setPendingDetail(null);
      return;
    }
    setPendingLoading(true);
    try {
      if (user.role === 'SUPER_ADMIN') {
        const { data } = await adminApi.getPendingSummary();
        const approval = data?.companiesAwaitingApproval ?? 0;
        setPendingTotal(approval);
        setPendingDetail({ companiesAwaitingApproval: approval });
      } else {
        const { data } = await companyApi.getPendingSummary();
        const activation = data?.usersAwaitingActivation ?? 0;
        setPendingTotal(activation);
        setPendingDetail({ usersAwaitingActivation: activation });
      }
    } catch {
      setPendingTotal(0);
      setPendingDetail(null);
    } finally {
      setPendingLoading(false);
    }
  }, [user]);

  const mapInboxRow = (n: {
    id: string;
    title: string;
    message: string;
    metadata?: unknown;
    isRead?: boolean;
    isArchived?: boolean;
    createdAt?: string;
  }): InboxItem => ({
    id: n.id,
    title: n.title,
    message: n.message,
    metadata: n.metadata as { documentId?: string } | undefined,
    isRead: n.isRead,
    isArchived: n.isArchived,
    createdAt: n.createdAt,
  });

  const loadInbox = useCallback(async () => {
    if (!user) {
      setInboxUnread(0);
      setInboxActiveTotal(0);
      setInboxArchivedTotal(0);
      setInboxItems([]);
      setArchivedItems([]);
      return;
    }
    if (user.role === 'SUPER_ADMIN') {
      setInboxUnread(0);
      setInboxActiveTotal(0);
      setInboxArchivedTotal(0);
      setInboxItems([]);
      setArchivedItems([]);
      return;
    }
    setInboxLoading(true);
    try {
      const { data: countRes } = await notificationApi.unreadCount();
      const unread =
        typeof countRes?.unread === 'number'
          ? countRes.unread
          : typeof countRes?.count === 'number'
            ? countRes.count
            : 0;
      setInboxUnread(unread);
      setInboxArchivedTotal(typeof countRes?.archived === 'number' ? countRes.archived : 0);

      const { data: listRes } = await notificationApi.list();
      const list = Array.isArray(listRes) ? listRes : [];
      setInboxActiveTotal(
        typeof countRes?.activeTotal === 'number'
          ? countRes.activeTotal
          : Math.max(list.length, unread),
      );
      setInboxItems(list.map(mapInboxRow));
    } catch {
      setInboxUnread(0);
      setInboxActiveTotal(0);
      setInboxArchivedTotal(0);
      setInboxItems([]);
    } finally {
      setInboxLoading(false);
    }
  }, [user]);

  const loadArchived = useCallback(async () => {
    if (!user || user.role === 'SUPER_ADMIN') {
      setArchivedItems([]);
      return;
    }
    setArchivedLoading(true);
    try {
      const { data: listRes } = await notificationApi.list({ archived: true });
      const list = Array.isArray(listRes) ? listRes : [];
      setArchivedItems(list.map(mapInboxRow));
    } catch {
      setArchivedItems([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPending();
    const t = setInterval(loadPending, 60_000);
    return () => clearInterval(t);
  }, [loadPending]);

  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 60_000);
    return () => clearInterval(t);
  }, [loadInbox]);

  useEffect(() => {
    if (!notifOpen || notifTab !== 'archived') return;
    if (!user || user.role === 'SUPER_ADMIN') return;
    void loadArchived();
  }, [loadArchived, notifOpen, notifTab, user]);

  /* ── Derived ── */
  const showPendingSection = user?.role === 'SUPER_ADMIN' || user?.role === 'DIRECTOR';
  const showInboxSection = !!user && user.role !== 'SUPER_ADMIN';
  const showBell = !!user;
  const showAiAssistant = !!user && user.role !== 'SUPER_ADMIN';
  const showTenantProfileNav = !!user && user.role !== 'SUPER_ADMIN';

  const profileNavGroups = useMemo(
    () =>
      [
        {
          heading: 'Workspace',
          items: [{ label: 'Home', href: '/dashboard', Icon: HomeIllustration }],
        },
        ...(showTenantProfileNav
          ? [
              {
                heading: 'Logs',
                items: [{ label: 'Activity log', href: '/activity-log', Icon: ActivityLogIllustration }],
              },
            ]
          : []),
        {
          heading: 'Account',
          items: [
            { label: 'Profile', href: '/profile', Icon: ProfileIllustration },
            { label: 'Subscription', href: '/subscription', Icon: SubscriptionIllustration },
          ],
        },
      ] as const,
    [showTenantProfileNav],
  );
  const bellHasDot =
    inboxUnread > 0 || (!pendingLoading && showPendingSection && pendingTotal > 0);

  const allCount = inboxActiveTotal;
  const unreadCount = inboxUnread;
  const archivedCount = inboxArchivedTotal;

  const filteredNotifs = useMemo(() => {
    if (notifTab === 'archived') return archivedItems;
    if (notifTab === 'unread') return inboxItems.filter((n) => !n.isRead);
    return inboxItems;
  }, [archivedItems, inboxItems, notifTab]);

  const listLoading =
    (notifTab === 'archived' && archivedLoading) ||
    (notifTab !== 'archived' && inboxLoading);

  /* ── Actions ── */
  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      await authApi.logout();
    } catch {
      /* still clear client session */
    }
    logout();
    toast.success('Signed out');
    router.push('/');
  };

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    if (inboxUnread === 0) return;
    setMarkingAll(true);
    try {
      await notificationApi.markAllRead();
      setInboxItems((items) => items.map((n) => ({ ...n, isRead: true })));
      setInboxUnread(0);
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Could not mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent, n: InboxItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await notificationApi.archive(n.id);
      setInboxItems((items) => items.filter((i) => i.id !== n.id));
      const { data: countRes } = await notificationApi.unreadCount();
      const unread =
        typeof countRes?.unread === 'number'
          ? countRes.unread
          : typeof countRes?.count === 'number'
            ? countRes.count
            : 0;
      setInboxUnread(unread);
      setInboxActiveTotal((prev) =>
        typeof countRes?.activeTotal === 'number' ? countRes.activeTotal : Math.max(0, prev - 1),
      );
      setInboxArchivedTotal((prev) =>
        typeof countRes?.archived === 'number' ? countRes.archived : prev + 1,
      );
      toast.success('Archived');
    } catch {
      toast.error('Could not archive');
    }
  };

  const handleUnarchive = async (e: React.MouseEvent, n: InboxItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await notificationApi.unarchive(n.id);
      setArchivedItems((items) => items.filter((i) => i.id !== n.id));
      await Promise.all([loadInbox(), loadArchived()]);
      toast.success('Restored to inbox');
    } catch {
      toast.error('Could not restore');
    }
  };

  const handleDeleteNotif = async (e: React.MouseEvent, n: InboxItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await notificationApi.remove(n.id);
      setInboxItems((items) => items.filter((i) => i.id !== n.id));
      setArchivedItems((items) => items.filter((i) => i.id !== n.id));
      const { data: countRes } = await notificationApi.unreadCount();
      const unread =
        typeof countRes?.unread === 'number'
          ? countRes.unread
          : typeof countRes?.count === 'number'
            ? countRes.count
            : 0;
      setInboxUnread(unread);
      setInboxActiveTotal((prev) =>
        typeof countRes?.activeTotal === 'number'
          ? countRes.activeTotal
          : Math.max(0, prev - (n.isArchived ? 0 : 1)),
      );
      setInboxArchivedTotal((prev) =>
        typeof countRes?.archived === 'number'
          ? countRes.archived
          : Math.max(0, prev - (n.isArchived ? 1 : 0)),
      );
      toast.success('Notification deleted');
    } catch {
      toast.error('Could not delete notification');
    }
  };

  const handleNotifClick = async (n: InboxItem) => {
    try {
      if (!n.isRead) {
        await notificationApi.markRead(n.id);
        const mark = (it: InboxItem) => (it.id === n.id ? { ...it, isRead: true } : it);
        setInboxItems((items) => items.map(mark));
        setArchivedItems((items) => items.map(mark));
        if (!n.isArchived) setInboxUnread((c) => Math.max(0, c - 1));
      }
    } catch {
      /* ignore */
    }
    setNotifOpen(false);
    if (n.metadata?.documentId) router.push('/docs');
  };

  const goPending = () => {
    setNotifOpen(false);
    if (user?.role === 'SUPER_ADMIN') router.push('/admin/companies');
    else if (user?.role === 'DIRECTOR') router.push('/company/users');
  };

  const iconBtn =
    'group/btn relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition-all duration-300 hover:bg-[var(--nav-hover)]/60 hover:text-[var(--brand-primary)]';

  /* ──────────────────────────────────────────────────────────────────── */
  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)]/55 bg-[var(--sidebar-bg)]/90 px-3 backdrop-blur-md lg:px-4">
        {/* Soft brand hairline along the bottom edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/20 to-transparent"
        />

        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-[var(--muted)] transition-all duration-300 hover:bg-[var(--nav-hover)]/60 hover:text-[var(--brand-primary)] lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <MenuIllustration size={20} />
        </Button>

        <div className="flex min-w-0 flex-1 items-center">
          <TenantWorkspaceStrip />
        </div>

        <div className="flex items-center gap-2">
          {/* ── Quick actions cluster ── */}
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--border)]/55 bg-[var(--surface)]/55 px-1 py-1 backdrop-blur-sm">
            {showAiAssistant && (
              <Popover open={ragChatOpen} onOpenChange={setRagChatOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label="AI Assistant"
                    title="AI Assistant"
                  >
                    <AiAssistantIllustration size={20} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  sideOffset={10}
                  className="flex h-[min(560px,80vh)] w-[min(560px,95vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)]/55 bg-[var(--surface-elevated)] p-0"
                >
                  <PopoverArrow />
                  <div className="relative flex items-center gap-3 border-b border-[var(--border)]/55 p-4">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-16 -top-12 h-32 w-32 rounded-full"
                      style={{
                        background:
                          'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 16%, transparent), transparent 70%)',
                        filter: 'blur(18px)',
                      }}
                    />
                    <span
                      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ring-[var(--brand-primary)]/15"
                      style={{
                        background:
                          'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-accent) 18%, transparent))',
                        color: 'var(--brand-primary)',
                      }}
                    >
                      <AiAssistantIllustration size={20} />
                    </span>
                    <div className="relative min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]">
                        Assistant
                      </p>
                      <p className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
                        AI Assistant
                      </p>
                      <p className="text-[11.5px] text-[var(--muted)]">
                        Ask anything about your quality workspace
                      </p>
                    </div>
                  </div>
                  <RagChatPanel variant="modal" className="flex-1" />
                </PopoverContent>
              </Popover>
            )}

            <div className="hidden sm:block">
              <SidebarGlobalSearch variant="topbar" />
            </div>

            {showBell && (
              <button
                type="button"
                className={cn(iconBtn, 'relative')}
                aria-label="Notifications"
                onClick={() => {
                  setNotifOpen(true);
                  if (showInboxSection) void loadInbox();
                }}
              >
                {pendingLoading || inboxLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <BellIllustration size={20} />
                )}
                {inboxUnread > 0 ? (
                  <span
                    aria-label={`${inboxUnread} unread notification${inboxUnread === 1 ? '' : 's'}`}
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--sidebar-bg)]"
                  >
                    {inboxUnread > 99 ? '99+' : inboxUnread}
                  </span>
                ) : (
                  bellHasDot && (
                    <span className="absolute right-2 top-2 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-[var(--sidebar-bg)]" />
                    </span>
                  )
                )}
              </button>
            )}
          </div>

          {/* ── Avatar / profile drawer trigger ── */}
          <button
            type="button"
            className="group/avatar relative flex h-11 w-11 items-center justify-center rounded-full p-0 transition-transform duration-300 hover:scale-[1.04]"
            aria-label="Account menu"
            onClick={() => setProfileOpen(true)}
          >
            {/* Brand gradient ring */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full p-[1.5px]"
              style={{
                background:
                  'conic-gradient(from 180deg, var(--brand-primary), var(--brand-accent), var(--brand-primary))',
              }}
            />
            <Avatar className="relative h-[38px] w-[38px] ring-[2px] ring-[var(--sidebar-bg)]">
              {avatarBlobUrl ? (
                <AvatarImage src={avatarBlobUrl} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="text-[12px] font-semibold text-[var(--brand-primary)]">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            {/* Presence dot */}
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--sidebar-bg)]"
            />
          </button>

          {/* ────────────────────────────────────────────────────────────────
           *  PROFILE DRAWER
           * ──────────────────────────────────────────────────────────────── */}
          <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
            <SheetContent
              side="right"
              className={cn(
                'qurelio-profile-sheet',
                'flex w-[min(380px,92vw)] flex-col gap-0 border-l border-[var(--border)]/55 bg-[var(--surface)] p-0 sm:max-w-[380px]',
              )}
            >
              <style>{`
                @keyframes qurelio-profile-in {
                  0%   { opacity: 0; transform: translateX(28px) scale(0.985); filter: blur(2px); }
                  60%  { opacity: 1; filter: blur(0); }
                  100% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
                }
                @keyframes qurelio-profile-out {
                  0%   { opacity: 1; transform: translateX(0); }
                  100% { opacity: 0; transform: translateX(28px); }
                }
                .qurelio-profile-sheet[data-state="open"] {
                  animation: qurelio-profile-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
                  transform-origin: right center;
                  will-change: transform, opacity, filter;
                }
                .qurelio-profile-sheet[data-state="closed"] {
                  animation: qurelio-profile-out 320ms cubic-bezier(0.4, 0, 1, 1) both;
                }
                @keyframes qurelio-profile-section-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
                .qurelio-profile-sheet[data-state="open"] > * {
                  animation: qurelio-profile-section-in 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
                  animation-delay: 200ms;
                }
                .qurelio-profile-sheet[data-state="open"] > *:nth-child(2) { animation-delay: 260ms; }
                .qurelio-profile-sheet[data-state="open"] > *:nth-child(3) { animation-delay: 320ms; }
                .qurelio-profile-sheet[data-state="open"] > *:nth-child(4) { animation-delay: 380ms; }
                .qurelio-profile-sheet[data-state="open"] > *:nth-child(5) { animation-delay: 440ms; }
                @media (prefers-reduced-motion: reduce) {
                  .qurelio-profile-sheet[data-state="open"],
                  .qurelio-profile-sheet[data-state="closed"],
                  .qurelio-profile-sheet[data-state="open"] > * {
                    animation: none !important;
                  }
                }
              `}</style>
              <SheetTitle className="sr-only">Account menu</SheetTitle>

              {/* ─── Hero (soft, animated halos, no shadow) ─── */}
              <div className="relative overflow-hidden">
                {/* Top hairline */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/30 to-transparent"
                />
                {/* Atmospheric brand halos */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full"
                  style={{
                    background:
                      'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 18%, transparent), transparent 70%)',
                    filter: 'blur(22px)',
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -left-24 -bottom-12 h-48 w-48 rounded-full"
                  style={{
                    background:
                      'radial-gradient(closest-side, color-mix(in srgb, var(--brand-accent) 14%, transparent), transparent 70%)',
                    filter: 'blur(20px)',
                  }}
                />
                {/* Soft dot grid */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.035]"
                  style={{
                    backgroundImage:
                      'radial-gradient(currentColor 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                    color: 'var(--text-primary)',
                    maskImage:
                      'radial-gradient(ellipse 60% 50% at 50% 40%, black 30%, transparent 80%)',
                    WebkitMaskImage:
                      'radial-gradient(ellipse 60% 50% at 50% 40%, black 30%, transparent 80%)',
                  }}
                />

                <div className="relative flex flex-col items-center gap-3 px-6 pb-6 pt-10">
                  {/* Avatar with rotating conic ring */}
                  <div className="relative">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-2.5 rounded-full opacity-50"
                      style={{
                        background:
                          'conic-gradient(from 0deg, color-mix(in srgb, var(--brand-primary) 35%, transparent), color-mix(in srgb, var(--brand-accent) 45%, transparent), color-mix(in srgb, var(--brand-primary) 35%, transparent))',
                        filter: 'blur(10px)',
                        animation: 'qspin 18s linear infinite',
                      }}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-[3px] rounded-full"
                      style={{
                        background:
                          'conic-gradient(from 180deg, var(--brand-primary), var(--brand-accent), var(--brand-primary))',
                      }}
                    />
                    <Avatar className="relative h-[88px] w-[88px] ring-[3px] ring-[var(--surface)]">
                      {avatarBlobUrl ? (
                        <AvatarImage src={avatarBlobUrl} alt="" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="text-[22px] font-semibold text-[var(--brand-primary)]">
                        {user?.firstName?.[0]}
                        {user?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="text-center">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                      <span className="relative inline-flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/55" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      Online
                    </div>
                    <p className="mt-2 truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="truncate text-[11.5px] text-[var(--muted)]">{user?.email}</p>
                  </div>
                </div>
                {/* Bottom hairline of hero */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent"
                />
              </div>

              {/* ─── Theme toggle (segmented control) ─── */}
              <div className="px-4 pt-4">
                <div className="relative grid grid-cols-2 gap-0.5 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/60 p-1 backdrop-blur-sm">
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-[var(--brand-primary)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      transform: theme === 'dark' ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={cn(
                      'relative z-[1] inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-300',
                      theme === 'light'
                        ? 'text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={cn(
                      'relative z-[1] inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-300',
                      theme === 'dark'
                        ? 'text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </button>
                </div>
              </div>

              {/* ─── Nav grouped sections ─── */}
              <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
                {profileNavGroups.map((group) => (
                  <div key={group.heading}>
                    <p className="px-2.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {group.heading}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {group.items.map(({ label, href, Icon }) => (
                        <Link
                          key={`${href}-${label}`}
                          href={href}
                          onClick={() => setProfileOpen(false)}
                          className="group/row flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-300 hover:bg-[var(--nav-hover)]/60"
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)]/55 bg-[var(--surface)]/70 text-[var(--nav-inactive)] transition-all duration-300 group-hover/row:border-transparent group-hover/row:bg-[var(--brand-primary)]/10 group-hover/row:text-[var(--brand-primary)]"
                          >
                            <Icon size={20} strokeWidth={1.6} />
                          </span>
                          <span className="flex-1 truncate">{label}</span>
                          <ChevronRight className="h-3.5 w-3.5 -translate-x-1 text-[var(--muted)] opacity-0 transition-all duration-300 group-hover/row:translate-x-0 group-hover/row:text-[var(--brand-primary)] group-hover/row:opacity-100" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              {/* ─── Logout pill ─── */}
              <div className="border-t border-[var(--border)]/55 p-3">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="group/logout relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-red-200/70 bg-red-50/70 px-4 py-2.5 text-[13px] font-semibold text-red-700 transition-colors duration-300 hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-red-300/30 to-transparent transition-transform duration-700 group-hover/logout:translate-x-[200%]"
                  />
                  <span className="relative inline-flex items-center gap-2">
                    <LogoutIllustration size={16} />
                    Sign out
                  </span>
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* ────────────────────────────────────────────────────────────────
           *  NOTIFICATIONS DRAWER
           * ──────────────────────────────────────────────────────────────── */}
          {showBell && (
            <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
              <SheetContent
                side="right"
                className={cn(
                  'qurelio-notif-sheet',
                  'flex w-[min(440px,92vw)] flex-col gap-0 border-l border-[var(--border)]/55 bg-[var(--surface)] p-0 sm:max-w-[440px]',
                )}
              >
                <style>{`
                  @keyframes qurelio-notif-in {
                    0%   { opacity: 0; transform: translateX(28px); }
                    60%  { opacity: 1; }
                    100% { opacity: 1; transform: translateX(0); }
                  }
                  @keyframes qurelio-notif-out {
                    0%   { opacity: 1; transform: translateX(0); }
                    100% { opacity: 0; transform: translateX(28px); }
                  }
                  .qurelio-notif-sheet[data-state="open"] {
                    animation: qurelio-notif-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
                  }
                  .qurelio-notif-sheet[data-state="closed"] {
                    animation: qurelio-notif-out 320ms cubic-bezier(0.4, 0, 1, 1) both;
                  }
                  /* Stagger the inner sections so they fade in *after* the panel lands. */
                  @keyframes qurelio-notif-section-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                  .qurelio-notif-sheet[data-state="open"] > * {
                    animation: qurelio-notif-section-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
                    animation-delay: 180ms;
                  }
                  .qurelio-notif-sheet[data-state="open"] > *:nth-child(2) { animation-delay: 240ms; }
                  .qurelio-notif-sheet[data-state="open"] > *:nth-child(3) { animation-delay: 300ms; }
                  .qurelio-notif-sheet[data-state="open"] > *:nth-child(4) { animation-delay: 360ms; }
                  @media (prefers-reduced-motion: reduce) {
                    .qurelio-notif-sheet[data-state="open"],
                    .qurelio-notif-sheet[data-state="closed"],
                    .qurelio-notif-sheet[data-state="open"] > * {
                      animation: none !important;
                    }
                  }
                `}</style>
                <SheetTitle className="sr-only">Notifications</SheetTitle>

                {/* ─── Header (atmospheric, no shadow) ─── */}
                <div className="relative overflow-hidden border-b border-[var(--border)]/55 px-5 pb-4 pt-5">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/30 to-transparent"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-20 -top-16 h-44 w-44 rounded-full"
                    style={{
                      background:
                        'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 16%, transparent), transparent 70%)',
                      filter: 'blur(20px)',
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -left-16 -bottom-8 h-32 w-32 rounded-full"
                    style={{
                      background:
                        'radial-gradient(closest-side, color-mix(in srgb, var(--brand-accent) 14%, transparent), transparent 70%)',
                      filter: 'blur(18px)',
                    }}
                  />

                  <div className="relative flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-inset ring-[var(--brand-primary)]/15"
                        style={{
                          background:
                            'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-accent) 18%, transparent))',
                          color: 'var(--brand-primary)',
                        }}
                      >
                        <BellIllustration size={22} />
                      </span>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
                          Inbox
                        </p>
                        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
                          Notifications
                        </h2>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pr-8">
                      <button
                        type="button"
                        aria-label="Mark all as read"
                        title="Mark all as read"
                        onClick={handleMarkAllRead}
                        disabled={markingAll || unreadCount === 0}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 transition-all duration-300 backdrop-blur-sm',
                          'hover:border-emerald-500/30 hover:bg-emerald-500/10 disabled:opacity-40 disabled:hover:border-[var(--border)]/60 disabled:hover:bg-[var(--surface)]/70',
                        )}
                      >
                        {markingAll ? (
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                        ) : (
                          <CheckCheck className="h-4 w-4 text-emerald-600" />
                        )}
                      </button>
                      <Link
                        href="/profile"
                        onClick={() => setNotifOpen(false)}
                        aria-label="Notification settings"
                        title="Settings"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 text-[var(--muted)] transition-all duration-300 backdrop-blur-sm hover:border-[var(--brand-primary)]/30 hover:text-[var(--brand-primary)]"
                      >
                        <SettingsIllustration size={16} />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* ─── Tab segmented control ─── */}
                <div className="flex items-center gap-1 border-b border-[var(--border)]/55 px-3 py-2.5">
                  <div className="flex w-full items-center gap-0.5 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/60 p-0.5 backdrop-blur-sm">
                  {(
                    [
                      {
                        key: 'all',
                        label: 'All',
                        count: allCount,
                        badgeClass: 'bg-[#fad18e] text-[#e0900d]',
                      },
                      {
                        key: 'unread',
                        label: 'Unread',
                        count: unreadCount,
                        badgeClass: 'bg-sky-100 text-sky-700',
                      },
                      {
                        key: 'archived',
                        label: 'Archived',
                        count: archivedCount,
                        badgeClass: 'bg-emerald-100 text-emerald-700',
                      },
                    ] as const
                  ).map((t) => {
                    const active = notifTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setNotifTab(t.key)}
                        className={cn(
                          'relative z-[1] flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-300',
                          active
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <span>{t.label}</span>
                        <span
                          className={cn(
                            'inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                            active ? 'bg-white/20 text-white' : 'bg-[var(--nav-hover)] text-[var(--muted)]',
                          )}
                        >
                          {t.count}
                        </span>
                      </button>
                    );
                  })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {notifTab === 'all' && showPendingSection && pendingTotal > 0 && (
                    <button
                      type="button"
                      onClick={goPending}
                      className="group relative flex w-full items-start gap-3 border-b border-[var(--border)] px-5 py-4 text-left transition-colors hover:bg-[var(--topbar-hover)]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]">
                        <AdminShieldIllustration size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--text-primary)]">
                          <span className="font-semibold">Attention needed</span>
                          <span className="text-[var(--muted)]">
                            {' '}
                            ·{' '}
                            {user?.role === 'SUPER_ADMIN'
                              ? `${pendingDetail?.companiesAwaitingApproval ?? 0} company account(s) awaiting approval`
                              : `${pendingDetail?.usersAwaitingActivation ?? 0} team member(s) awaiting activation`}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          now ·{' '}
                          {user?.role === 'SUPER_ADMIN' ? 'Administration' : 'Team management'}
                        </p>
                      </div>
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    </button>
                  )}

                  {showInboxSection &&
                    filteredNotifs.length > 0 &&
                    filteredNotifs.map((n) => {
                      const colorClass = notifColorFromId(n.id);
                      const initial = (n.title || '?').trim().charAt(0).toUpperCase();
                      const hasDoc = !!n.metadata?.documentId;
                      return (
                        <div
                          key={n.id}
                          className={cn(
                            'group relative flex w-full items-stretch border-b border-[var(--border)] transition-colors hover:bg-[var(--topbar-hover)]',
                            !n.isRead && 'bg-[var(--brand-primary)]/[0.04]',
                          )}
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <button
                              type="button"
                              onClick={() => void handleNotifClick(n)}
                              className="flex w-full items-start gap-3 px-5 pb-2 pt-4 text-left"
                            >
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                              colorClass,
                            )}
                          >
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--text-primary)]">
                              <span className="font-semibold">{n.title}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {timeAgo(n.createdAt) || 'recently'}
                              {hasDoc ? ' · Document' : ''}
                            </p>
                            {n.message && (
                              <div className="mt-2 line-clamp-3 rounded-lg bg-[var(--surface)]/70 px-3 py-2 text-xs leading-relaxed text-[var(--text-primary)]/85">
                                {n.message}
                              </div>
                            )}
                          </div>
                            </button>
                            {hasDoc && (
                              <div className="mx-5 mb-4 mt-1 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-2.5 py-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                                    Linked document
                                  </p>
                                  <p className="text-[11px] text-[var(--muted)]">Open in library</p>
                                </div>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--topbar-hover)]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleNotifClick(n);
                                  }}
                                >
                                  Open
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-center gap-1.5 px-2 py-3">
                            {notifTab !== 'archived' ? (
                              <button
                                type="button"
                                title="Archive"
                                aria-label="Archive notification"
                                onClick={(e) => void handleArchive(e, n)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Restore to inbox"
                                aria-label="Restore notification to inbox"
                                onClick={(e) => void handleUnarchive(e, n)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
                              >
                                <ArchiveRestore className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Delete notification"
                              aria-label="Delete notification"
                              onClick={(e) => void handleDeleteNotif(e, n)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/15"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {!n.isRead && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {!listLoading &&
                    filteredNotifs.length === 0 &&
                    (notifTab !== 'all' || !showPendingSection || pendingTotal === 0) && (
                      <div className="relative flex flex-col items-center justify-center px-6 py-16 text-center">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-12 h-28 w-28 rounded-full"
                          style={{
                            background:
                              'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 12%, transparent), transparent 70%)',
                            filter: 'blur(18px)',
                          }}
                        />
                        <span
                          className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset ring-[var(--brand-primary)]/15"
                          style={{
                            background:
                              'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-accent) 16%, transparent))',
                            color: 'var(--brand-primary)',
                          }}
                        >
                          <BellIllustration size={28} />
                        </span>
                        <p className="relative text-[14px] font-semibold text-[var(--text-primary)]">
                          {notifTab === 'archived'
                            ? 'No archived notifications'
                            : notifTab === 'unread'
                              ? "You're all caught up"
                              : 'No notifications yet'}
                        </p>
                        <p className="relative mt-1 text-[12px] text-[var(--muted)]">
                          {notifTab === 'unread'
                            ? 'New activity will show up here.'
                            : notifTab === 'archived'
                              ? 'Archive items from your inbox to keep it tidy.'
                              : 'We will let you know when something happens.'}
                        </p>
                      </div>
                    )}

                  {listLoading && filteredNotifs.length === 0 && (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--border)] p-3">
                  <Link
                    href="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="flex w-full items-center justify-center gap-1 rounded-xl px-3 py-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--topbar-hover)]"
                  >
                    View all
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>

    </>
  );
}