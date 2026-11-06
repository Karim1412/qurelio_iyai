'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageNotFound, type PageNotFoundProps } from '@/components/ui/page-not-found';

/** Dashboard shell + “page not found / not built yet” body for sidebar links without a real page. */
export function PlaceholderRoutePage(props: PageNotFoundProps) {
  return (
    <DashboardLayout showRouteHeader={false}>
      <PageNotFound {...props} />
    </DashboardLayout>
  );
}
