'use client';

import { Suspense } from 'react';
import { FileManagerView } from '@/components/file-manager/FileManagerView';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function FileManagerPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex justify-center py-20 text-sm text-[var(--muted)]">
            Loading File Manager…
          </div>
        </DashboardLayout>
      }
    >
      <FileManagerView />
    </Suspense>
  );
}
