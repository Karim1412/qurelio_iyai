'use client';

import { Suspense } from 'react';
import { FileLibraryView } from '@/components/file-library/FileLibraryView';

function DocsLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)]">
      <p className="text-sm text-[var(--muted)]">Loading files…</p>
    </div>
  );
}

export default function DocsFileLibraryPage() {
  return (
    <Suspense fallback={<DocsLoadingFallback />}>
      <FileLibraryView />
    </Suspense>
  );
}
