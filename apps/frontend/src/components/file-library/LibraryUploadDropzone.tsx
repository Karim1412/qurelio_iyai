'use client';

import { motion } from 'framer-motion';
import { Upload } from '@/components/icons';
import { cn } from '@/utils/cn';

/** Outer shell: dashed rounded zone + drag highlight, matches dashboard “Upload new document”. */
export function LibraryUploadDropSurface({
  isDragOver,
  disabled,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onKeyDown,
  minHeightClass = 'min-h-[180px]',
  children,
  className,
}: {
  isDragOver: boolean;
  disabled?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  minHeightClass?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !disabled && onClick()}
      role="button"
      tabIndex={0}
      aria-label="Upload area"
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex cursor-pointer select-none flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed px-6 py-7 text-center outline-none transition-colors duration-200',
        'focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
        minHeightClass,
        isDragOver
          ? 'border-[var(--brand-primary)] bg-[color:var(--brand-primary)]/8'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[color:var(--brand-primary)]/45',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
          isDragOver && 'opacity-100',
        )}
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(77,146,196,0.22) 0%, transparent 60%)',
        }}
      />
      {children}
    </div>
  );
}

/** Floating gradient tile + breathing shadow (dashboard upload). */
export function FloatingUploadBrandIcon() {
  return (
    <>
      <motion.div
        aria-hidden
        style={{ perspective: 600 }}
        animate={{
          y: [-4, 4, -4],
          rotateX: [10, -8, 10],
          rotateZ: [-2, 2, -2],
        }}
        transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-accent)] text-white shadow-[0_14px_30px_-14px_rgba(77,146,196,0.7)]"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 top-1.5 h-3 rounded-xl bg-white/30 blur-[2px]"
        />
        <Upload className="relative h-7 w-7" strokeWidth={2} />
      </motion.div>
      <motion.span
        aria-hidden
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
        className="-mt-2 h-1.5 w-10 rounded-full bg-[var(--brand-primary)] blur-[3px]"
      />
    </>
  );
}
