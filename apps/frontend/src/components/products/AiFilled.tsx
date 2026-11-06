'use client';

/**
 * Review affordances for AI pre-filled wizard fields.
 *
 * The Documents step runs first; anything the AI read out of the uploaded files
 * lands in the later steps already filled in. These components mark that content
 * as *unverified* so the user knows exactly what to check before activating.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Sparkles, Check } from '@/components/icons';
import { cn } from '@/utils/cn';

/** Small chip flagging one field as AI-suggested. */
export function AiChip({ className }: { className?: string }) {
  return (
    <span
      title="Filled from your uploaded documents. Check it before continuing"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-primary)]',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      AI
    </span>
  );
}

interface AiLabelProps extends React.ComponentProps<typeof Label> {
  /** Renders the red asterisk used across the wizard for required fields. */
  required?: boolean;
  /** Field key, e.g. `identity.name`: matched against `aiFields`. */
  field?: string;
  aiFields?: string[];
}

/** `<Label>` that grows an "AI" chip when its field was pre-filled from a document. */
export function AiLabel({ required, field, aiFields, children, className, ...rest }: AiLabelProps) {
  const flagged = !!field && !!aiFields?.includes(field);
  return (
    <Label className={cn('flex items-center gap-2', className)} {...rest}>
      <span>
        {children}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {flagged && <AiChip />}
    </Label>
  );
}

/** Banner shown at the top of every step that carries AI-filled content. */
export function AiReviewBanner({
  count,
  sourceCount,
  className,
}: {
  count: number;
  sourceCount: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/5 p-4',
        className,
      )}
    >
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
      <div className="text-[13px] leading-relaxed text-[var(--text-primary)]">
        <p className="font-semibold">
          {count} field{count > 1 ? 's' : ''} pre-filled from your document
          {sourceCount > 1 ? 's' : ''}
        </p>
        <p className="mt-0.5 text-[var(--muted)]">
          Fields marked <AiChip className="align-middle" /> were read by the AI and are{' '}
          <strong>not verified</strong>. Correct anything that is wrong. What you leave here is what
          gets saved.
        </p>
      </div>
    </div>
  );
}

/** Confirmation shown once the user has been through the pre-filled steps. */
export function AiVerifiedNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-[11px] text-emerald-600', className)}>
      <Check className="h-3.5 w-3.5" />
      Reviewed
    </p>
  );
}
