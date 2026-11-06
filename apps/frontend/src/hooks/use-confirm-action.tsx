'use client';

import React, { useCallback, useState } from 'react';
import { AlertTriangle, Archive, Trash2 } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export type ConfirmActionVariant = 'default' | 'destructive' | 'amber';

export type ConfirmActionOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmActionVariant;
};

type Pending = ConfirmActionOptions & { resolve: (v: boolean) => void };

/** Top band: works in light and dark (no fixed white/slate). */
const VARIANT_HEADER: Record<ConfirmActionVariant, string> = {
  destructive: 'bg-red-500/[0.09] dark:bg-red-950/45',
  default: 'bg-[var(--brand-primary)]/[0.09] dark:bg-[var(--brand-primary)]/[0.14]',
  amber: 'bg-amber-500/[0.1] dark:bg-amber-950/40',
};

const VARIANT_ICON_BORDER: Record<ConfirmActionVariant, string> = {
  destructive: 'border-red-200/70 dark:border-red-800/45',
  default: 'border-[var(--brand-primary)]/28 dark:border-[var(--brand-primary)]/35',
  amber: 'border-amber-200/65 dark:border-amber-800/40',
};

const VARIANT_ICON_TEXT: Record<ConfirmActionVariant, string> = {
  destructive: 'text-red-600 dark:text-red-400',
  default: 'text-[var(--brand-primary)]',
  amber: 'text-amber-800 dark:text-amber-400',
};

export function useConfirmAction() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmActionOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((p) => {
      if (p) p.resolve(result);
      return null;
    });
  }, []);

  const v = pending?.variant ?? 'default';
  const Icon = v === 'destructive' ? Trash2 : v === 'amber' ? Archive : AlertTriangle;

  const dialog = pending ? (
    <Dialog open onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border border-[var(--border)] p-0 shadow-2xl sm:rounded-2xl">
        <div className={cn('px-6 pb-6 pt-12', VARIANT_HEADER[v])}>
          <div className="flex gap-4">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-[var(--surface)] shadow-sm',
                VARIANT_ICON_BORDER[v],
                VARIANT_ICON_TEXT[v],
              )}
              aria-hidden
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <DialogTitle className="text-left text-[17px] font-bold leading-snug tracking-tight text-[var(--text-primary)]">
                {pending.title}
              </DialogTitle>
              <DialogDescription className="mt-2.5 text-left text-[13px] leading-relaxed text-[var(--muted)]">
                {pending.description}
              </DialogDescription>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--text-primary)] shadow-sm hover:bg-[var(--nav-hover)]"
            onClick={() => close(false)}
          >
            {pending.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            type="button"
            variant={v === 'destructive' ? 'destructive' : 'default'}
            className={cn(
              'rounded-xl font-semibold shadow-sm',
              v === 'amber' &&
                'border border-amber-600/40 bg-gradient-to-b from-amber-500 to-amber-600 !text-amber-950 hover:from-amber-400 hover:to-amber-500 dark:from-amber-500 dark:to-amber-600 dark:!text-amber-950',
            )}
            onClick={() => close(true)}
          >
            {pending.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, dialog };
}
