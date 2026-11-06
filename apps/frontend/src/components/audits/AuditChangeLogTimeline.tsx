'use client';

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import {
  buildAuditChangeEvents,
  type AuditChangeLogRow,
} from '@/lib/audit-history-utils';

interface AuditChangeLogTimelineProps {
  logs: AuditChangeLogRow[];
  nameMap: Map<string, string>;
}

export function AuditChangeLogTimeline({ logs, nameMap }: AuditChangeLogTimelineProps) {
  const events = useMemo(
    () => buildAuditChangeEvents(logs, nameMap),
    [logs, nameMap],
  );

  if (events.length === 0) {
    return <p className="p-3 text-xs text-[var(--muted)]">No events</p>;
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {events.map((event) => (
        <li key={event.id} className="px-3 py-2.5">
          <p className="text-sm font-medium text-[var(--text-primary)]">{event.label}</p>
          {event.sublabel && (
            <p className="mt-0.5 text-xs capitalize text-[var(--muted)]">{event.sublabel}</p>
          )}
          <p className="mt-1 text-xs text-[var(--muted)]">
            {format(new Date(event.createdAt), 'PPp')}
          </p>
        </li>
      ))}
    </ul>
  );
}
