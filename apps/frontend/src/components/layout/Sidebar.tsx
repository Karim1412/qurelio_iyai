'use client';

import React, { useMemo, useState, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronDown,
} from '@/components/icons';
import {
  DashboardIllustration,
  FileLibraryIllustration,
  FileManagerIllustration,
  CompanyIllustration,
  KanbanIllustration,
  CalendarIllustration,
  TrainingIllustration,
  AnalyticsIllustration,
  ProductsIllustration,
  StandardsIllustration,
  ComplianceIllustration,
  AuditsIllustration,
  NonConformitiesIllustration,
  ReportsIllustration,
  CompanyManagementIllustration,
  UserManagementIllustration,
  MyTrainingIllustration,
  OrganizationTrainingIllustration,
  TrainingRulesIllustration,
} from '@/components/icons/sidebar-illustrations';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissions } from '@/hooks/usePermissions';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useSidebarPreviewStore } from '@/lib/sidebar-preview-store';

export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_COLLAPSED_WIDTH = 110;

// Apple's signature easing for sheets / sidebars, soft start, long glide.
const SIDEBAR_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SIDEBAR_DURATION = 620;
// Smaller, faster easing for content fades that should ride *inside* the width animation.
const SIDEBAR_FADE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const SIDEBAR_TRANSITION = `${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`;

// DashboardLayout (and thus this Sidebar) is mounted per-page, not in a shared
// Next.js layout: so every route change remounts the nav and would reset its
// scroll. We keep the last scroll offset at module scope (survives remounts for
// the session) and restore it synchronously before paint to avoid any jump.
let savedNavScrollTop = 0;

// Run the entrance animation only the first time the permanent sidebar shows in
// this session: route changes that remount the layout should feel instant, not
// re-trigger the slide-in every time.
let sidebarHasEnteredOnce = false;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

// Accept both our custom illustration components and the HugeIcons wrapper components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NavIconComponent = React.ComponentType<any>;

type AnimKey = 'bounce' | 'wiggle' | 'pulse' | 'spin' | 'swing' | 'rise' | 'flip' | 'tilt' | 'pop';

interface NavItem {
  label: string;
  icon: NavIconComponent;
  href: string;
  roles?: string[];
  anim?: AnimKey;
}

const NAV_MAIN: NavItem[] = [
  { label: 'My Dashboard', icon: DashboardIllustration, href: '/dashboard', anim: 'pop' },
];

const NAV_ADMIN: NavItem[] = [
  { label: 'Company Management', icon: CompanyManagementIllustration, href: '/admin/companies', roles: ['SUPER_ADMIN'], anim: 'pulse' },
  { label: 'Demo Requests', icon: CalendarIllustration, href: '/admin/demo', roles: ['SUPER_ADMIN'], anim: 'pulse' },
  { label: 'Regulatory Source Monitor', icon: AnalyticsIllustration, href: '/regulatory-monitoring/monitoring', roles: ['SUPER_ADMIN'], anim: 'rise' },
  { label: 'User Management', icon: UserManagementIllustration, href: '/company/users', roles: ['DIRECTOR'], anim: 'bounce' },
];

const ANIM_CLASS: Record<AnimKey, string> = {
  bounce: 'sb-anim-bounce',
  wiggle: 'sb-anim-wiggle',
  pulse:  'sb-anim-pulse',
  spin:   'sb-anim-spin',
  swing:  'sb-anim-swing',
  rise:   'sb-anim-rise',
  flip:   'sb-anim-flip',
  tilt:   'sb-anim-tilt',
  pop:    'sb-anim-pop',
};

function NavLink({
  item,
  active,
  onNavigate,
  className,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  className?: string;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const animCls = item.anim ? ANIM_CLASS[item.anim] : 'sb-anim-pop';

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseEnter={() => useSidebarPreviewStore.getState().setHoveredHref(item.href)}
      onMouseLeave={() => useSidebarPreviewStore.getState().setHoveredHref(null)}
      onFocus={() => useSidebarPreviewStore.getState().setHoveredHref(item.href)}
      onBlur={() => useSidebarPreviewStore.getState().setHoveredHref(null)}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      style={{
        transitionProperty: 'background-color, color, padding, box-shadow, gap',
        transitionDuration: `${SIDEBAR_DURATION}ms`,
        transitionTimingFunction: SIDEBAR_EASE,
      }}
      className={cn(
        'group/nav relative isolate flex text-sm font-medium text-[var(--nav-inactive)]',
        collapsed
          ? 'h-auto flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-0'
          : 'h-10 items-center gap-3 overflow-hidden rounded-2xl pl-2.5 pr-2.5',
        // In expanded mode the active state fills the whole row.
        // In collapsed mode the background is rendered only behind the icon (see below).
        !collapsed && active && 'bg-[var(--nav-hover)] font-semibold text-[var(--brand-primary)]',
        !collapsed && !active && 'hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]',
        collapsed && active && 'font-semibold text-[var(--brand-primary)]',
        collapsed && !active && 'hover:text-[var(--text-primary)]',
        className,
      )}
    >
      <span
        style={{
          transition: `width ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}, height ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}, background-color ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`,
        }}
        className={cn(
          'relative z-[1] flex shrink-0 items-center justify-center',
          collapsed ? 'h-10 w-10 rounded-xl' : 'h-10 w-10',
          // Collapsed: only the icon pill carries the active/hover background, no big "square" filling the cell.
          collapsed && active && 'bg-[var(--nav-hover)] ring-1 ring-inset ring-[var(--brand-primary)]/15',
          collapsed && !active && 'group-hover/nav:bg-[var(--nav-hover)]/70',
        )}
      >
        <Icon
          className={cn('sb-icon', animCls)}
          size={collapsed ? 26 : 26}
          strokeWidth={1.6}
        />
      </span>
      <span
        style={{
          // Fade out fast on collapse (before the rail shrinks fully). Fade in late on expand
          // (after the rail has opened): so labels never overlap a shrinking column.
          transition: collapsed
            ? `opacity 200ms ${SIDEBAR_FADE_EASE} 0ms, transform 320ms ${SIDEBAR_EASE} 0ms, font-size ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`
            : `opacity 280ms ${SIDEBAR_FADE_EASE} 320ms, transform 380ms ${SIDEBAR_EASE} 280ms, font-size ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`,
          transform: 'translateY(0)',
        }}
        className={cn(
          'relative z-[1]',
          collapsed
            // Fixed 2-line height for ALL labels → every tab has identical vertical footprint, no shifting.
            ? 'mt-0.5 block w-full overflow-hidden text-center text-[10px] font-medium leading-[1.15] tracking-tight opacity-100'
            : 'flex-1 truncate whitespace-nowrap opacity-100',
        )}
      >
        <span
          className={cn(
            collapsed
              ? 'block line-clamp-2 break-words'
              : '',
          )}
          style={collapsed ? { height: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' } : undefined}
        >
          {item.label}
        </span>
      </span>
    </Link>
  );
}

interface SubNavItem {
  label: string;
  icon: NavIconComponent;
  href: string;
}

/** A collapsible menu module (a parent item that expands into sub-modules). */
interface NavGroupConfig {
  label: string;
  icon: NavIconComponent;
  /** Route prefix that marks the whole group active (e.g. '/training'). */
  basePath: string;
  /** Where the collapsed-rail tile links (usually the first sub-module). */
  flyoutHref: string;
  anim?: AnimKey;
  subItems: SubNavItem[];
}

const TRAINING_GROUP: NavGroupConfig = {
  label: 'Training',
  icon: TrainingIllustration,
  basePath: '/training',
  flyoutHref: '/training/my',
  anim: 'pulse',
  subItems: [
    { label: 'My training', icon: MyTrainingIllustration, href: '/training/my' },
    { label: 'Organization training', icon: OrganizationTrainingIllustration, href: '/training/organization' },
    { label: 'Training rules', icon: TrainingRulesIllustration, href: '/training/rules' },
  ],
};

const REGULATORY_MONITORING_GROUP: NavGroupConfig = {
  label: 'Regulatory Monitoring',
  icon: ComplianceIllustration,
  basePath: '/regulatory-monitoring',
  flyoutHref: '/regulatory-monitoring/applicability',
  anim: 'rise',
  subItems: [
    { label: 'Applicability', icon: StandardsIllustration, href: '/regulatory-monitoring/applicability' },
    { label: 'Monitoring', icon: AnalyticsIllustration, href: '/regulatory-monitoring/monitoring' },
  ],
};

/**
 * Single-stroke SVG file-tree connector.
 * Renders the entire trunk + branches as one continuous drawing so lines
 * never overlap or double up. The active branch is drawn on top in accent.
 *
 * Layout assumptions (must match the surrounding <li>):
 *   - each item is 36px tall (h-9)
 *   - vertical gap between items is 4px (space-y-1)
 *   - padTop = top padding of the <ul> (e.g. 4px when ul has py-1, else 0)
 */
function TreeSvg({
  count,
  active,
  padTop = 0,
  itemH = 36,
}: {
  count: number;
  active: number;
  padTop?: number;
  itemH?: number;
}) {
  const ITEM_H = itemH;
  const GAP = 4;
  const RADIUS = 8;        // softer corner
  const TRUNK_X = 1.5;     // give the stroke breathing room
  const BRANCH_END = 18;
  const TIP_R = 1.6;       // small dot at every branch endpoint

  const centerY = (i: number) => padTop + i * (ITEM_H + GAP) + ITEM_H / 2;
  const trunkTop = padTop + 4;
  const trunkBottom = centerY(count - 1);
  const totalH = padTop * 2 + count * ITEM_H + (count - 1) * GAP;
  const gradId = `tree-trunk-${count}-${itemH}`;

  // Branches (one path per item: no active special-case here; active gets layered on top below)
  const branches: string[] = [];
  for (let i = 0; i < count; i++) {
    const cy = centerY(i);
    branches.push(`M ${TRUNK_X} ${cy - RADIUS} Q ${TRUNK_X} ${cy} ${TRUNK_X + RADIUS} ${cy} L ${BRANCH_END} ${cy}`);
  }
  const inactiveBranches = branches.filter((_, i) => i !== active).join(' ');
  const activeBranch = active >= 0 && active < count ? branches[active] : '';

  return (
    <svg
      aria-hidden
      width={BRANCH_END + 4}
      height={totalH + 4}
      viewBox={`0 0 ${BRANCH_END + 4} ${totalH + 4}`}
      className="pointer-events-none absolute left-0 top-0"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Trunk fades softly at both ends → looks atmospheric, not boxy */}
        <linearGradient id={gradId} x1="0" y1={trunkTop} x2="0" y2={trunkBottom} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="14%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="86%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Trunk: soft monochrome line, faded at top/bottom */}
      <line
        x1={TRUNK_X}
        y1={trunkTop}
        x2={TRUNK_X}
        y2={trunkBottom}
        stroke={`url(#${gradId})`}
        strokeWidth={1.25}
        strokeLinecap="round"
      />

      {/* Inactive branches: hairline, soft */}
      <path
        d={inactiveBranches}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.30}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inactive endpoint dots */}
      {Array.from({ length: count }, (_, i) => i)
        .filter((i) => i !== active)
        .map((i) => (
          <circle
            key={`tip-${i}`}
            cx={BRANCH_END}
            cy={centerY(i)}
            r={TIP_R}
            fill="currentColor"
            fillOpacity={0.25}
          />
        ))}

      {/* Active branch: brand color, slightly thicker, drawn last so it always sits on top */}
      {activeBranch && (
        <>
          <path
            d={activeBranch}
            fill="none"
            stroke="var(--brand-primary)"
            strokeOpacity={0.9}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Glow halo on the endpoint */}
          <circle
            cx={BRANCH_END}
            cy={centerY(active)}
            r={3.6}
            fill="var(--brand-primary)"
            fillOpacity={0.14}
          />
          <circle
            cx={BRANCH_END}
            cy={centerY(active)}
            r={2}
            fill="var(--brand-primary)"
          />
          <circle
            cx={BRANCH_END}
            cy={centerY(active)}
            r={0.7}
            fill="white"
            fillOpacity={0.9}
          />
        </>
      )}
    </svg>
  );
}

function CollapsedNavFlyout({
  config,
  pathname,
  onNavigate,
  groupActive,
  easing,
}: {
  config: NavGroupConfig;
  pathname: string;
  onNavigate?: () => void;
  groupActive: boolean;
  easing: string;
}) {
  const subItems = config.subItems;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ left: r.right + 8, top: r.top + r.height / 2 });
  };

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    updateCoords();
    setOpen(true);
  };

  const handleLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateCoords();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className="relative"
    >
      <NavLink
        item={{ label: config.label, icon: config.icon, href: config.flyoutHref, anim: config.anim }}
        active={groupActive}
        onNavigate={onNavigate}
        collapsed
      />

      {mounted && coords &&
        createPortal(
          <div
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            role="menu"
            aria-label={config.label}
            className={cn(
              'fixed z-[60] min-w-[280px] overflow-hidden rounded-[20px] border border-[var(--border)]/80 bg-[var(--sidebar-bg)]/95 p-2.5',
              'shadow-[0_28px_64px_-20px_rgba(15,23,42,0.28),0_6px_18px_-8px_rgba(15,23,42,0.10),inset_0_1px_0_0_rgba(255,255,255,0.6)]',
            )}
            style={{
              left: coords.left,
              top: coords.top,
              transform: open
                ? 'translateY(-50%) translateX(0) scale(1)'
                : 'translateY(-50%) translateX(-12px) scale(0.94)',
              opacity: open ? 1 : 0,
              pointerEvents: open ? 'auto' : 'none',
              transformOrigin: 'left center',
              transition: `opacity 320ms ${easing}, transform 480ms ${easing}`,
              backdropFilter: 'saturate(160%) blur(14px)',
              WebkitBackdropFilter: 'saturate(160%) blur(14px)',
            }}
          >
            {/* Soft inner top sheen */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-12 rounded-t-[20px]"
              style={{
                background:
                  'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 6%, transparent) 0%, transparent 100%)',
              }}
            />

            {/* Bridge so cursor can travel from tile to flyout without closing */}
            <span
              aria-hidden
              className="absolute right-full top-0 h-full w-4"
              style={{ pointerEvents: open ? 'auto' : 'none' }}
            />
            
            {/* Soft hairline divider with brand accent fade */}
            

            {/* Sub-items */}
            <div className="relative px-1">
              <ul className="relative space-y-1">
                {subItems.map((sub, idx) => {
                  const SubIcon = sub.icon;
                  const subActive =
                    pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                  return (
                    <li
                      key={sub.href}
                      style={{
                        opacity: open ? 1 : 0,
                        transform: open
                          ? 'translateX(0) scale(1)'
                          : 'translateX(-8px) scale(0.97)',
                        transition: `opacity 360ms ${easing} ${open ? 120 + idx * 70 : 0}ms, transform 480ms ${easing} ${open ? 120 + idx * 70 : 0}ms`,
                      }}
                    >
                      <Link
                        href={sub.href}
                        onClick={() => {
                          setOpen(false);
                          onNavigate?.();
                        }}
                        className={cn(
                          'group/subnav relative flex h-12 items-center gap-3 rounded-2xl px-2 text-[13px] font-medium',
                          'transition-[background-color,color] duration-300 ease-out',
                          subActive
                            ? 'bg-[var(--nav-hover)] font-semibold text-[var(--brand-primary)]'
                            : 'text-[var(--text-primary)]/85 hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        {/* Active rail */}
                        {subActive && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--brand-primary)]"
                          />
                        )}
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-out',
                            subActive
                              ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] ring-1 ring-inset ring-[var(--brand-primary)]/15'
                              : 'bg-[var(--surface)]/60 text-[var(--nav-inactive)] ring-1 ring-inset ring-[var(--border)]/60 group-hover/subnav:bg-[var(--surface)] group-hover/subnav:text-[var(--text-primary)]',
                          )}
                        >
                          <SubIcon size={24} strokeWidth={1.6} />
                        </span>
                        <span className="flex-1 truncate whitespace-nowrap">{sub.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function NavGroup({
  config,
  pathname,
  onNavigate,
  collapsed,
}: {
  config: NavGroupConfig;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const subItems = config.subItems;
  const GroupIcon = config.icon;

  const groupActive = pathname === config.basePath || pathname.startsWith(`${config.basePath}/`);
  const [open, setOpen] = useState<boolean>(groupActive);

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  const easing = 'cubic-bezier(0.32, 0.72, 0, 1)';

  // Collapsed rail: tile + hover-flyout (portaled to escape scroll-clipping)
  if (collapsed) {
    return (
      <CollapsedNavFlyout
        config={config}
        pathname={pathname}
        onNavigate={onNavigate}
        groupActive={groupActive}
        easing={easing}
      />
    );
  }

  return (
    <div className="select-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'group/nav relative isolate flex h-10 w-full items-center gap-3 overflow-hidden rounded-2xl pl-2.5 pr-2.5 text-sm font-medium',
          'transition-[background-color,color,box-shadow] duration-200 ease-out',
          groupActive
            ? 'bg-[var(--nav-hover)] font-semibold text-[var(--brand-primary)]'
            : 'text-[var(--nav-inactive)] hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]',
        )}
      >
        <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center">
          <GroupIcon className={cn('sb-icon', ANIM_CLASS[config.anim ?? 'pulse'])} size={26} strokeWidth={1.6} />
        </span>
        <span className="relative z-[1] flex-1 truncate whitespace-nowrap text-left">{config.label}</span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={cn(
            'shrink-0 text-[var(--muted)] transition-transform duration-[420ms]',
            open ? 'rotate-0' : '-rotate-90',
          )}
          style={{ transitionTimingFunction: easing }}
        />
      </button>

      {/* iOS-style collapse: grid-rows 0fr → 1fr for smooth auto-height */}
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: `grid-template-rows 420ms ${easing}, opacity 320ms ${easing}`,
          opacity: open ? 1 : 0,
        }}
      >
          <div className="min-h-0">
            <div
              className="relative ml-[22px] mt-1"
              style={{
                transform: open ? 'translateY(0)' : 'translateY(-4px)',
                transition: `transform 420ms ${easing}`,
              }}
            >
              <ul className="relative space-y-1 py-1">
                {/* Single SVG draws trunk + branches as one continuous stroke */}
                <TreeSvg
                  count={subItems.length}
                  padTop={4}
                  itemH={48}
                  active={subItems.findIndex(
                    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
                  )}
                />
                {subItems.map((sub, idx) => {
                  const SubIcon = sub.icon;
                  const subActive =
                    pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                  return (
                    <li
                      key={sub.href}
                      className="relative pl-5"
                      style={{
                        transform: open ? 'translateY(0)' : 'translateY(-6px)',
                        opacity: open ? 1 : 0,
                        transition: `transform 480ms ${easing} ${idx * 55}ms, opacity 360ms ${easing} ${idx * 55}ms`,
                      }}
                    >
                      <Link
                        href={sub.href}
                        onClick={onNavigate}
                        className={cn(
                          'group/subnav relative flex h-12 items-center gap-3 rounded-2xl px-2 text-[13px] font-medium',
                          'transition-[background-color,color,transform] duration-300 ease-out',
                          subActive
                            ? 'bg-[var(--nav-hover)] font-semibold text-[var(--brand-primary)]'
                            : 'text-[var(--text-primary)]/85 hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-out',
                            subActive
                              ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] ring-1 ring-inset ring-[var(--brand-primary)]/15'
                              : 'bg-[var(--surface)]/60 text-[var(--nav-inactive)] ring-1 ring-inset ring-[var(--border)]/60 group-hover/subnav:bg-[var(--surface)] group-hover/subnav:text-[var(--text-primary)]',
                          )}
                        >
                          <SubIcon size={24} strokeWidth={1.6} />
                        </span>
                        <span className="flex-1 truncate whitespace-nowrap">{sub.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  collapsed,
  className,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <p
      style={{
        transitionProperty: 'opacity, height, margin, padding, transform',
        transitionDuration: `${SIDEBAR_DURATION}ms`,
        transitionTimingFunction: SIDEBAR_EASE,
        transform: collapsed ? 'translateY(-4px)' : 'translateY(0)',
      }}
      className={cn(
        'px-1 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]',
        collapsed ? 'pointer-events-none h-0 overflow-hidden p-0 opacity-0' : 'h-auto opacity-100',
        className,
      )}
    >
      {children}
    </p>
  );
}

function SidebarNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Global keyboard navigation: ArrowUp / ArrowDown (Home / End) move through sidebar
  // tabs from anywhere on the page, as long as the user isn't typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home' && e.key !== 'End') {
        return;
      }
      // Don't hijack arrows while typing or interacting with form/scroll widgets.
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          t.isContentEditable ||
          t.getAttribute('role') === 'textbox'
        ) {
          return;
        }
      }
      // Modifiers stay reserved for their usual meaning (Ctrl+Down etc.).
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const root = navRef.current;
      if (!root) return;
      const links = Array.from(
        root.querySelectorAll<HTMLAnchorElement>(
          'a[href]:not([aria-disabled="true"]):not([tabindex="-1"])',
        ),
      );
      if (links.length === 0) return;

      // Find the current link by pathname; fall back to first.
      let idx = links.findIndex((a) => {
        const href = a.getAttribute('href') || '';
        return pathname === href || pathname.startsWith(`${href}/`);
      });
      if (idx < 0) idx = 0;

      let nextIdx = idx;
      if (e.key === 'ArrowDown') nextIdx = (idx + 1) % links.length;
      else if (e.key === 'ArrowUp') nextIdx = (idx - 1 + links.length) % links.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = links.length - 1;

      if (nextIdx === idx) return;
      e.preventDefault();
      const target = links[nextIdx];
      target.focus();
      const href = target.getAttribute('href');
      if (href) router.push(href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname, router]);
  const { user } = useAuthStore();
  const perms = usePermissions();
  const navRef = useRef<HTMLElement>(null);

  // Restore the previous scroll offset before the browser paints this remount,
  // so clicking a tab keeps the rail exactly where it was.
  useIsomorphicLayoutEffect(() => {
    const el = navRef.current;
    if (el) el.scrollTop = savedNavScrollTop;
  }, []);

  const adminItems = useMemo(
    () => NAV_ADMIN.filter((item) => !item.roles || item.roles.includes(user?.role || '')),
    [user?.role],
  );

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const showWorkspaceNav = !isSuperAdmin;
  const showFileLibrary =
    showWorkspaceNav &&
    (perms.uploadEvidenceDocuments || perms.uploadStandards);
  /** Company owner (Director): team & workspace settings at /company/users */
  const showMyCompanyNav = showWorkspaceNav && perms.inviteRemoveMembers;
  const showKanbanCalendarTraining =
    showWorkspaceNav && !perms.isReadOnly && !perms.isLimitedReports;
  const showAnalytics = showWorkspaceNav && perms.canViewDashboardReports;
  const showProductsNav = showWorkspaceNav && perms.uploadEvidenceDocuments;
  const showStandardsNav = showWorkspaceNav && perms.uploadStandards;
  const showComplianceEngine = showWorkspaceNav && perms.launchComplianceEvaluation;
  const showAuditsNav = showWorkspaceNav && perms.createManageAudits;
  const showNcNav =
    showWorkspaceNav && (perms.createNcRecords || perms.validateCapaClosure);
  const showReportsNav = showWorkspaceNav && perms.canViewDashboardReports;

  const ncActive = pathname === '/nc' || pathname.startsWith('/nc/');
  const auditsActive = pathname === '/audits' || pathname.startsWith('/audits/');
  const onReports = pathname === '/reports' || pathname.startsWith('/reports/');
  const evaluationsActive = pathname === '/evaluations' || pathname.startsWith('/evaluations/');

  const view = searchParams.get('view');
  const onFileLibrary = pathname === '/docs' || pathname.startsWith('/docs/');
  const onDocs = pathname === '/documents' || pathname.startsWith('/documents/');
  const inLibrary = onFileLibrary || onDocs;
  const cf = searchParams.get('cf');
  const productActive = inLibrary && view === 'product' && !cf;
  const standardActive = inLibrary && view === 'standard' && searchParams.get('archive') !== '1' && !cf;
  const fileLibraryRootActive = inLibrary && !view && !cf;
  // /reports server-redirects to /docs?view=reports, keep the tab lit on that marker.
  const reportsActive = onReports || (inLibrary && view === 'reports' && !cf);

  return (
    <nav
      ref={navRef}
      onScroll={(e) => {
        savedNavScrollTop = (e.currentTarget as HTMLElement).scrollTop;
      }}
      onKeyDown={(e) => {
        // Arrow-key navigation between sidebar tabs (Up/Down + Home/End).
        // Only intercept when focus is on a sidebar link, and only for these keys.
        const isArrow =
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'Home' ||
          e.key === 'End';
        if (!isArrow) return;
        const root = navRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLAnchorElement>(
            'a[href]:not([aria-disabled="true"]):not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;
        const current = document.activeElement as HTMLElement | null;
        const idx = focusables.findIndex((el) => el === current);
        let nextIdx = idx;
        if (e.key === 'ArrowDown') nextIdx = idx < 0 ? 0 : (idx + 1) % focusables.length;
        else if (e.key === 'ArrowUp')
          nextIdx = idx < 0 ? focusables.length - 1 : (idx - 1 + focusables.length) % focusables.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = focusables.length - 1;
        if (nextIdx !== idx) {
          e.preventDefault();
          const target = focusables[nextIdx];
          target?.focus();
          // Navigate to the focused tab so the dashboard reflects its content
          // immediately (e.g. ArrowDown to "My company" loads /company in the main area).
          const href = target?.getAttribute('href');
          if (href) router.push(href);
        }
      }}
      className={cn(
        'flex flex-1 flex-col pb-10 pt-1',
        'transition-[padding] duration-300 ease-out',
        'px-2',
        'overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <SectionLabel collapsed={collapsed}>Overview</SectionLabel>
      <div className="space-y-0.5">
        {NAV_MAIN.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        ))}
        
        {showWorkspaceNav && (
          <NavLink
            item={{ label: 'File Manager', icon: FileManagerIllustration, href: '/file-manager', anim: 'bounce' }}
            active={pathname === '/file-manager' || pathname.startsWith('/file-manager/')}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        )}
        {showWorkspaceNav && (
          <NavLink
            item={{ label: 'My company', icon: CompanyIllustration, href: '/company', anim: 'bounce' }}
            active={
              (pathname === '/company' || pathname.startsWith('/company/')) &&
              pathname !== '/company/users' &&
              !pathname.startsWith('/company/users/')
            }
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        )}
        {showKanbanCalendarTraining && (
          <NavLink
            item={{ label: 'Kanban', icon: KanbanIllustration, href: '/kanban', anim: 'tilt' }}
            active={pathname === '/kanban' || pathname.startsWith('/kanban/')}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        )}
        {showKanbanCalendarTraining && (
          <NavLink
            item={{ label: 'Calendar', icon: CalendarIllustration, href: '/calendar', anim: 'flip' }}
            active={pathname === '/calendar' || pathname.startsWith('/calendar/')}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        )}
        {showKanbanCalendarTraining && (
          <NavGroup config={TRAINING_GROUP} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
        )}
        {showAnalytics && (
          <NavLink
            item={{ label: 'Analytics', icon: AnalyticsIllustration, href: '/analytics', anim: 'rise' }}
            active={pathname === '/analytics' || pathname.startsWith('/analytics/')}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        )}
      </div>

      {showWorkspaceNav && (showProductsNav || showStandardsNav || showComplianceEngine || showAuditsNav || showNcNav || showReportsNav) && (
        <div className="mt-4">
          {(showProductsNav || showStandardsNav || showComplianceEngine) && (
            <>
              <SectionLabel collapsed={collapsed}>Compliance Hub</SectionLabel>
              <div className="space-y-0.5">
                {showProductsNav && (
                  <NavLink
                    item={{ label: 'Products Management', icon: ProductsIllustration, href: '/docs?view=product', anim: 'bounce' }}
                    active={productActive}
                    onNavigate={onNavigate}
                    collapsed={collapsed}
                  />
                )}
                {showStandardsNav && (
                  <NavLink
                    item={{ label: 'Standards & Regulations Portal', icon: StandardsIllustration, href: '/docs?view=standard', anim: 'flip' }}
                    active={standardActive}
                    onNavigate={onNavigate}
                    collapsed={collapsed}
                  />
                )}
                {showComplianceEngine && (
                  <NavLink
                    item={{ label: 'Compliance Engine', icon: ComplianceIllustration, href: '/evaluations', anim: 'rise' }}
                    active={evaluationsActive}
                    onNavigate={onNavigate}
                    collapsed={collapsed}
                  />
                )}
                {showComplianceEngine && (
                  <NavGroup config={REGULATORY_MONITORING_GROUP} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
                )}
              </div>
            </>
          )}

          {(showAuditsNav || showNcNav || showReportsNav) && (
            <>
              <SectionLabel collapsed={collapsed} className="mt-4">
                Audits and reports
              </SectionLabel>
              <div className="space-y-0.5">
                {showAuditsNav && (
                  <NavLink
                    item={{ label: 'Audits', icon: AuditsIllustration, href: '/audits', anim: 'pop' }}
                    active={auditsActive}
                    onNavigate={onNavigate}
                    collapsed={collapsed}
                  />
                )}
                {showNcNav && (
                  <NavLink
                    item={{ label: 'Non-Conformities', icon: NonConformitiesIllustration, href: '/nc', anim: 'wiggle' }}
                    active={ncActive}
                    onNavigate={onNavigate}
                    collapsed={collapsed}
                  />
                )}
                {showReportsNav && (
                  <NavLink
                    item={{ label: 'Reports', icon: ReportsIllustration, href: '/docs?view=reports', anim: 'rise' }}
                    active={reportsActive}
                    onNavigate={onNavigate}
                    collapsed={collapsed}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}

      {adminItems.length > 0 && (
        <div className="mt-4">
          <SectionLabel collapsed={collapsed}>Admin</SectionLabel>
          <div className="space-y-0.5">
            {adminItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                onNavigate={onNavigate}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function SidebarChrome({
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col border-r border-[var(--border)] bg-[var(--sidebar-bg)]">
      {/* ── Logo header ── */}
      <div
        style={{ transition: `padding ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}` }}
        className={cn(
          'flex shrink-0 items-center justify-center pb-2 pt-5',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        <Link
          href="/dashboard"
          className="relative flex h-16 shrink-0 items-center justify-center"
          aria-label="Qurelio home"
        >
          {/* Cross-fade between full logo and mini icon: no hard swap */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/querlio-logo.png"
            alt="Qurelio"
            style={{
              transition: `opacity 280ms ${SIDEBAR_EASE} ${collapsed ? '0ms' : '160ms'}, transform ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`,
              opacity: collapsed ? 0 : 1,
              transform: collapsed ? 'scale(0.92)' : 'scale(1)',
            }}
            className="block h-[64px] w-auto"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/querlio-mini.png"
            alt="Qurelio"
            style={{
              transition: `opacity 280ms ${SIDEBAR_EASE} ${collapsed ? '160ms' : '0ms'}, transform ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`,
              opacity: collapsed ? 1 : 0,
              transform: collapsed ? 'scale(1)' : 'scale(0.85)',
            }}
            className="absolute h-14 w-14 object-contain"
          />
        </Link>
      </div>

      {/* ── Floating toggle button: always at the right edge ── */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ transition: `all 280ms ${SIDEBAR_EASE}` }}
          className={cn(
            'absolute -right-3 top-[54px] z-20',
            'flex h-7 w-7 items-center justify-center rounded-full',
            'border border-[var(--border)] bg-[var(--sidebar-bg)] text-[var(--muted)]',
            'hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]',
            'hover:scale-110 active:scale-90',
            'hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.18)]',
          )}
        >
          <span
            aria-hidden
            style={{
              transition: `transform ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`,
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-flex',
            }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </span>
        </button>
      )}

      <Suspense fallback={<div className="px-4 py-6 text-xs text-[var(--muted)]">Loading menu…</div>}>
        <SidebarNav onNavigate={onNavigate} collapsed={collapsed} />
      </Suspense>
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
  variant = 'permanent',
  collapsed = false,
  onToggleCollapsed,
}: {
  open: boolean;
  onClose: () => void;
  variant?: 'permanent' | 'temporary';
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  if (variant === 'temporary') {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="left" className="w-[280px] border-r border-[var(--border)] p-0">
          <SheetTitle className="sr-only">Main navigation</SheetTitle>
          <SidebarChrome onNavigate={onClose} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <SidebarPermanentShell collapsed={collapsed}>
      <SidebarChrome collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
    </SidebarPermanentShell>
  );
}

/**
 * Wraps the permanent sidebar in a one-time soft entrance: fade + slide from
 * the left + tiny scale. After the first mount in the session, subsequent
 * route changes show the sidebar instantly to avoid re-animating on every nav.
 */
function SidebarPermanentShell({
  collapsed,
  children,
}: {
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  // Only animate the first mount in the session: subsequent route remounts
  // shouldn't replay the slide-in.
  const shouldAnimate = !sidebarHasEnteredOnce;
  useEffect(() => {
    if (shouldAnimate) {
      sidebarHasEnteredOnce = true;
    }
  }, [shouldAnimate]);

  return (
    <>
      <style>{`
        @keyframes qurelio-sidebar-enter {
          0% {
            opacity: 0;
            transform: translateX(-32px) scale(0.985);
            filter: blur(2px);
          }
          60% {
            opacity: 1;
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
            filter: blur(0);
          }
        }
        .qurelio-sidebar-enter {
          animation: qurelio-sidebar-enter 760ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: left center;
          will-change: transform, opacity, filter;
        }
        @media (prefers-reduced-motion: reduce) {
          .qurelio-sidebar-enter {
            animation: none !important;
          }
        }
      `}</style>
      <aside
        className={cn(
          'hidden shrink-0 lg:fixed lg:left-0 lg:top-0 lg:z-30 lg:flex lg:h-screen lg:flex-col',
          shouldAnimate && 'qurelio-sidebar-enter',
        )}
        style={{
          width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
          transition: `width ${SIDEBAR_DURATION}ms ${SIDEBAR_EASE}`,
          willChange: 'width',
        }}
      >
        {children}
      </aside>
    </>
  );
}