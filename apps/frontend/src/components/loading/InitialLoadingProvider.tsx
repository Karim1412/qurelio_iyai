'use client';

/**
 * Initial loading splash: disabled.
 * The provider is kept as a pass-through so existing imports keep working.
 */
export function InitialLoadingProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}