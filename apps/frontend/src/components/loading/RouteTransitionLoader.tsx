'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/icons';
import { cn } from '@/utils/cn';

const NAV_LOADER_DURATION_MS = 500;

function PathWatcher({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    onChange();
  }, [pathname, searchParams, onChange]);

  return null;
}

export function RouteTransitionLoader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  const trigger = useCallback(() => {
    setLoading(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setLoading(false), NAV_LOADER_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div className={cn('relative', className)}>
      <Suspense fallback={null}>
        <PathWatcher onChange={trigger} />
      </Suspense>
      {children}
      <div
        aria-hidden={!loading}
        role="status"
        className={cn(
          'pointer-events-none absolute inset-0 z-40 flex items-center justify-center',
          'bg-[var(--page-bg)]/55 backdrop-blur-[2px]',
          'transition-opacity duration-200 ease-out',
          loading ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          <Loader2
            className="h-7 w-7 animate-spin text-[var(--brand-primary)]"
            strokeWidth={2.25}
          />
        </div>
      </div>
    </div>
  );
}
