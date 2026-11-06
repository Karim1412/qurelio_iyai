'use client';

import React from 'react';
import { reportSeverityBadgeClass, reportStatusBadgeClass } from '@/lib/theme-badges';

/** Plain span so shadcn Badge default bg does not override semantic status colors. */
export function ReportStatusBadge({ status }: { status: string | undefined }) {
  return (
    <span className={reportStatusBadgeClass(status)}>
      {(status ?? '').replace(/_/g, ' ')}
    </span>
  );
}

export function ReportSeverityBadge({ severity }: { severity: string | undefined }) {
  if (!severity) return null;
  const label = severity.charAt(0) + severity.slice(1).toLowerCase();
  return <span className={reportSeverityBadgeClass(severity)}>{label}</span>;
}
