'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileX2, Home, ChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export interface PageNotFoundProps {
  title?: string;
  description?: string;
  showBackButton?: boolean;
  backHref?: string;
  backLabel?: string;
  showSecondaryButton?: boolean;
  secondaryHref?: string;
  secondaryLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function PageNotFound({
  title = 'Page not found',
  description = "This page doesn't exist yet or has no content. Use the navigation to continue.",
  showBackButton = true,
  backHref = '/dashboard',
  backLabel,
  showSecondaryButton = true,
  secondaryHref = '/company/users',
  secondaryLabel = 'Company users',
  icon,
  className,
}: PageNotFoundProps) {
  const resolvedBackLabel =
    backLabel ?? (backHref === '/dashboard' ? 'Back to dashboard' : 'Go back');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex min-h-[min(70vh,560px)] flex-col items-center justify-center px-4 py-16 text-center',
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, duration: 0.35 }}
        className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-[var(--border)]/60 bg-white shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] dark:bg-[var(--surface)]"
      >
        {icon ?? <FileX2 className="h-9 w-9 text-[#637381]" strokeWidth={1.5} />}
      </motion.div>

      <p className="mb-2 text-sm font-bold tracking-wide text-[var(--brand-accent)]">404</p>

      <h1 className="mb-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[32px]">
        {title}
      </h1>

      <p className="mb-8 max-w-md text-sm leading-relaxed text-[var(--muted)] sm:text-base">
        {description}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {showBackButton && (
          <Button asChild className="gap-2 rounded-full px-5">
            <Link href={backHref}>
              <Home className="h-4 w-4" />
              {resolvedBackLabel}
            </Link>
          </Button>
        )}
        {showSecondaryButton && secondaryHref && (
          <Button asChild variant="outline" className="gap-2 rounded-full border-[var(--border)] px-5">
            <Link href={secondaryHref}>
              <ChevronLeft className="h-4 w-4" />
              {secondaryLabel}
            </Link>
          </Button>
        )}
      </div>
    </motion.div>
  );
}
