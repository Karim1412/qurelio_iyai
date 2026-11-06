'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSidebarPreviewStore } from '@/lib/sidebar-preview-store';
import { DASHBOARD_OVERVIEW_KEY } from '@/lib/sidebar-tab-overviews';
import { cn } from '@/utils/cn';

/** href → real screenshot of the destination page (lives under /public/previews) */
const IMAGE_BY_HREF: Record<string, string> = {
  '/dashboard': '/previews/dashboard.jpg',
  '/docs': '/previews/file-library.jpg',
  '/company': '/previews/user.jpg',
  '/kanban': '/previews/kanban.jpg',
  '/calendar': '/previews/calendar.jpg',
  '/training/my': '/previews/user.jpg',
  '/training/organization': '/previews/user.jpg',
  '/training/rules': '/previews/standard.jpg',
  '/analytics': '/previews/analytics.jpg',
  '/docs?view=product': '/previews/products.jpg',
  '/docs?view=standard': '/previews/standard.jpg',
  '/evaluations': '/previews/compliance.jpg',
  '/audits': '/previews/audit.jpg',
  '/nc': '/previews/nc.jpg',
  '/reports': '/previews/analytics.jpg',
  '/admin/companies': '/previews/user.jpg',
  '/company/users': '/previews/user.jpg',
};

const FALLBACK_IMAGE = IMAGE_BY_HREF[DASHBOARD_OVERVIEW_KEY];
const EASE = [0.22, 1, 0.36, 1] as const;

export function TabPreviewBanner({ className }: { className?: string }) {
  const hovered = useSidebarPreviewStore((s) => s.hoveredHref);
  const activeHref = hovered ?? DASHBOARD_OVERVIEW_KEY;
  const imageSrc = IMAGE_BY_HREF[activeHref] ?? FALLBACK_IMAGE;

  return (
    <div
      className={cn(
        'relative h-full min-h-[220px] overflow-hidden rounded-[28px] border border-[var(--border)]/55 bg-[var(--surface)]',
        className,
      )}
    >
      <AnimatePresence mode="wait">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img
          key={imageSrc}
          src={imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.55, ease: EASE }}
          draggable={false}
        />
      </AnimatePresence>
    </div>
  );
}
