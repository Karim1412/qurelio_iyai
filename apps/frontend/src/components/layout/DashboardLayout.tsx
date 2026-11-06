'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Sidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useAuthStore } from '@/lib/auth-store';
import { getForbiddenRedirectPath } from '@/lib/route-access';
import { getPageMeta } from '@/lib/page-meta';
import { AuthUserSync } from '@/components/auth/auth-user-sync';
import { RouteTransitionLoader } from '@/components/loading/RouteTransitionLoader';
import { SwipeTabNavigator } from '@/components/layout/SwipeTabNavigator';
// TrashFabGlobal (drag-to-delete floating button) intentionally not rendered,
// removed from the UI. The module is kept for `attachDocDragGlobal`, which the
// dashboard and file library still import.

interface DashboardLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageTagline?: string;
  /** When false, hides the route title block under the top bar (e.g. dashboard hero has its own heading). */
  showRouteHeader?: boolean;
}

function DashboardLayoutFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)]">
      <p className="text-sm text-[var(--muted)]">Loading…</p>
    </div>
  );
}

export function DashboardLayout(props: DashboardLayoutProps) {
  return (
    <Suspense fallback={<DashboardLayoutFallback />}>
      <DashboardLayoutInner {...props} />
    </Suspense>
  );
}

function DashboardLayoutInner({ children, pageTitle, pageTagline, showRouteHeader = true }: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLg, setIsLg] = useState(false);
  const [persistReady, setPersistReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      if (localStorage.getItem('sidebar-collapsed') === '1') setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsLg(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const api = useAuthStore.persist;
    if (!api) {
      setPersistReady(true);
      return;
    }
    if (api.hasHydrated()) {
      setPersistReady(true);
      return;
    }
    return api.onFinishHydration(() => setPersistReady(true));
  }, []);

  useEffect(() => {
    if (persistReady && !isAuthenticated) router.replace('/auth/login');
  }, [persistReady, isAuthenticated, router]);

  useEffect(() => {
    if (!persistReady || !isAuthenticated || !user || !pathname) return;
    const search = searchParams?.toString();
    const redirect = getForbiddenRedirectPath(user.role, {
      pathname,
      search: search ? `?${search}` : '',
    });
    if (redirect && redirect !== pathname) {
      router.replace(redirect);
    }
  }, [persistReady, isAuthenticated, user, pathname, searchParams, router]);

  if (!persistReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)]">
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const meta = getPageMeta(pathname || '/dashboard');
  const headerTitle = pageTitle ?? meta.title;
  const headerTag = pageTagline ?? meta.tagline;

  const desktopPaddingLeft = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="flex min-h-screen bg-[var(--page-bg)]">
      <AuthUserSync />
      {!isLg && <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} variant="temporary" />}
      {isLg && (
        <Sidebar
          open={true}
          onClose={() => {}}
          variant="permanent"
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />
      )}

      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col"
        style={{
          paddingLeft: isLg ? desktopPaddingLeft : 0,
          transition: 'padding-left 620ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex min-w-0 flex-1 flex-col">
          {showRouteHeader && (
            <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-sm sm:px-6">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">{headerTitle}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">{headerTag}</p>
            </header>
          )}
          <RouteTransitionLoader className="flex-1 px-4 py-6 sm:px-6">
            <SwipeTabNavigator>{children}</SwipeTabNavigator>
          </RouteTransitionLoader>
        </main>
      </div>
    </div>
  );
}
