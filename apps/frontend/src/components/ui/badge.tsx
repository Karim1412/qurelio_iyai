import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-hover',
  {
    variants: {
      variant: {
        published:
          'border-[var(--badge-published-border)] bg-[var(--badge-published-bg)] text-[var(--badge-published-text)]',
        draft: 'border-[var(--badge-draft-border)] bg-[var(--badge-draft-bg)] text-[var(--badge-draft-text)]',
        paid: 'border-transparent bg-[var(--badge-paid-bg)] text-[var(--badge-paid-text)]',
        progress: 'border-transparent bg-[var(--badge-progress-bg)] text-[var(--badge-progress-text)]',
        out: 'border-transparent bg-[var(--badge-out-bg)] text-[var(--badge-out-text)]',
        default: 'border-transparent bg-[var(--page-bg)] text-[var(--text-primary)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
