'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuthStore } from '@/lib/auth-store';
import { activeTabIndex, getDashboardTabs } from '@/lib/dashboard-tabs';

/**
 * DashboardLayout is mounted per-page (no shared App Router layout), so the
 * component remounts on every navigation. We stash the swipe direction here
 * just before navigating and read it back on the next mount to drive the
 * enter slide from the correct side.
 */
const DIR_KEY = 'swipe-tab-dir';

/** Accumulated horizontal wheel distance needed to switch tab. */
const WHEEL_THRESHOLD = 140;
/** Touch swipe distance (px) needed to switch tab. */
const TOUCH_THRESHOLD = 80;
/** Lock window after a switch so one gesture = one tab. */
const COOLDOWN_MS = 750;

/**
 * Walk up from `el` looking for an ancestor that can still scroll horizontally
 * in `dir` (-1 = content moving right / swipe-right, +1 = swipe-left). If one
 * exists we must NOT hijack the gesture: let the table/carousel scroll.
 */
function hasHorizontalScrollIntent(el: EventTarget | null, dir: number): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth + 2) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'overlay') {
        const maxScroll = node.scrollWidth - node.clientWidth;
        const atStart = node.scrollLeft <= 1;
        const atEnd = node.scrollLeft >= maxScroll - 1;
        // dir > 0 means we'd go to the next tab (content slides left → user
        // scrolls content to the right). Only block if the scroller can still
        // move that way.
        if (dir > 0 && !atEnd) return true;
        if (dir < 0 && !atStart) return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

export function SwipeTabNavigator({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const reduceMotion = useReducedMotion();

  const tabs = getDashboardTabs(role);
  const index = activeTabIndex(tabs, pathname);

  // Direction this page should slide in from, read once from the previous
  // navigation. +1 = came from an earlier tab (enter from right), -1 = later.
  const [enterDir] = useState(() => {
    try {
      const v = sessionStorage.getItem(DIR_KEY);
      sessionStorage.removeItem(DIR_KEY);
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const accumX = useRef(0);
  const cooldownUntil = useRef(0);
  const resetTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (dir: number) => {
      if (index < 0 || tabs.length < 2) return false;
      const next = index + dir;
      if (next < 0 || next >= tabs.length) return false;
      cooldownUntil.current = Date.now() + COOLDOWN_MS;
      accumX.current = 0;
      try {
        sessionStorage.setItem(DIR_KEY, String(dir));
      } catch {
        /* ignore */
      }
      router.push(tabs[next].href);
      return true;
    },
    [index, tabs, router],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || tabs.length < 2) return;

    const onWheel = (e: WheelEvent) => {
      // Only care about clearly horizontal intent (trackpad two-finger swipe
      // or shift+wheel). Vertical scrolling must stay untouched.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;
      if (Date.now() < cooldownUntil.current) {
        e.preventDefault();
        return;
      }
      const dir = e.deltaX > 0 ? 1 : -1;
      if (hasHorizontalScrollIntent(e.target, dir)) return; // let it scroll

      // We own this horizontal gesture: stop the browser's history swipe.
      e.preventDefault();
      accumX.current += e.deltaX;

      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        accumX.current = 0;
      }, 220);

      if (Math.abs(accumX.current) >= WHEEL_THRESHOLD) {
        go(accumX.current > 0 ? 1 : -1);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchStart.current = null;
        return;
      }
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || Date.now() < cooldownUntil.current) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < TOUCH_THRESHOLD || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
      const dir = dx < 0 ? 1 : -1; // swipe left → next tab
      if (hasHorizontalScrollIntent(t.target, dir)) return;
      go(dir);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    };
  }, [tabs.length, go]);

  const offset = reduceMotion ? 0 : 26;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-x-hidden [overscroll-behavior-x:contain]"
    >
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: enterDir * offset }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="h-full w-full"
        style={{ willChange: 'transform, opacity' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
