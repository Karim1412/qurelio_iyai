'use client';

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { cn } from '@/utils/cn';
import {
  buildReportChangeEvents,
  type ReportModificationRow,
  type ReportVersionRow,
} from '@/lib/report-history-utils';

interface ModificationTimelineProps {
  versions: ReportVersionRow[];
  modifications: ReportModificationRow[];
  nameMap: Map<string, string>;
}

const kindStyles: Record<string, { dot: string; bg: string }> = {
  created: { dot: 'bg-gray-500', bg: 'bg-gray-50 border-gray-200' },
  edited: { dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200' },
  status: { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200' },
};

export function ModificationTimeline({
  versions,
  modifications,
  nameMap,
}: ModificationTimelineProps) {
  const events = useMemo(
    () => buildReportChangeEvents(versions, modifications, nameMap),
    [versions, modifications, nameMap],
  );

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No changes recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const style = kindStyles[event.kind] ?? kindStyles.edited;
        return (
          <div
            key={event.id}
            className={cn('border rounded-lg px-4 py-3 flex items-start gap-3', style.bg)}
          >
            <div className={cn('w-2 h-2 rounded-full mt-2 flex-shrink-0', style.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{event.label}</p>
              {event.sublabel && (
                <p className="text-xs text-gray-600 mt-0.5 capitalize">{event.sublabel}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {format(new Date(event.createdAt), 'PPp')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
