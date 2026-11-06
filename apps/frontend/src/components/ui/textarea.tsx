import * as React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[100px] w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-sm transition-hover',
        'placeholder:text-[var(--muted)]',
        'focus-visible:outline-none focus-visible:border-[var(--brand-primary)] focus-visible:shadow-[0_0_0_3px_rgba(0,174,239,0.13)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
