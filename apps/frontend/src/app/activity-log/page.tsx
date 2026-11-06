'use client';

import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { CalendarRange } from '@/components/icons';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ACTIVITY_STATUS_COLORS, useActivityLog } from '@/hooks/useActivityLog';

type RangeKey = 'today' | '7d' | '30d' | 'year' | 'custom';

const RANGE_LABEL: Record<Exclude<RangeKey, 'custom'>, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  year: 'This year',
};

function getDateRange(
  key: RangeKey,
  custom?: { from: string; to: string }
): { start: number; end: number } {
  const endNow = Date.now();
  const d = new Date();
  if (key === 'custom' && custom?.from && custom?.to) {
    const s = new Date(custom.from + 'T00:00:00');
    const e = new Date(custom.to + 'T23:59:59.999');
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s.getTime() <= e.getTime()) {
      return { start: s.getTime(), end: e.getTime() };
    }
  }
  if (key === 'today') {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return { start: s.getTime(), end: endNow };
  }
  if (key === '7d') return { start: endNow - 7 * 86400000, end: endNow };
  if (key === '30d') return { start: endNow - 30 * 86400000, end: endNow };
  if (key === 'custom') {
    const y = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
    return { start: y.getTime(), end: endNow };
  }
  const y = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
  return { start: y.getTime(), end: endNow };
}

function periodLabel(rangeKey: RangeKey, customFrom: string, customTo: string): string {
  if (rangeKey === 'custom' && customFrom && customTo) {
    try {
      return `${format(new Date(customFrom + 'T12:00:00'), 'MMM d')} – ${format(new Date(customTo + 'T12:00:00'), 'MMM d, yyyy')}`;
    } catch {
      return 'Custom period';
    }
  }
  if (rangeKey === 'custom') return 'Custom period';
  return RANGE_LABEL[rangeKey];
}

export default function ActivityLogPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { start, end } = useMemo(
    () => getDateRange(rangeKey, rangeKey === 'custom' ? { from: customFrom, to: customTo } : undefined),
    [rangeKey, customFrom, customTo]
  );

  const { activities, loading } = useActivityLog(start, end);

  const onRangeChange = (v: string) => {
    const next = v as RangeKey;
    setRangeKey(next);
    if (next === 'custom' && !customFrom) {
      const endD = new Date();
      const startD = new Date(endD.getFullYear(), 0, 1);
      setCustomFrom(startD.toISOString().slice(0, 10));
      setCustomTo(endD.toISOString().slice(0, 10));
    }
  };

  const periodHint = periodLabel(rangeKey, customFrom, customTo);

  return (
    <DashboardLayout>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-xs text-[var(--muted)]">
            Activity for <span className="font-semibold text-[var(--text-primary)]">{periodHint}</span>
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[320px] sm:flex-row sm:items-center sm:justify-end">
            <div className="flex w-full items-center gap-2 sm:max-w-[280px] sm:ml-auto">
              <CalendarRange className="hidden h-4 w-4 shrink-0 text-[var(--brand-accent)] sm:block" aria-hidden />
              <Select value={rangeKey} onValueChange={onRangeChange}>
                <SelectTrigger className="h-9 w-full flex-1 text-xs">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="year">This year</SelectItem>
                  <SelectItem value="custom">Custom period…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rangeKey === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2">
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  From
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-8 rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
                  />
                </label>
                <span className="text-[var(--muted)]">→</span>
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  To
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-8 rounded-md border border-[var(--input-border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)]"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
          </div>
        ) : (
          <Card className="border-[var(--border)] px-4 py-4 shadow-none">
            <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">Recent activity</h2>
            {activities.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No activity in this period. Try a wider date range or add documents, audits, or NCs.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px] whitespace-nowrap">Date & time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="min-w-[140px]">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity, idx) => (
                    <TableRow key={`${activity.at}-${idx}`}>
                      <TableCell className="whitespace-nowrap text-xs text-[var(--text-primary)]">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: ACTIVITY_STATUS_COLORS[activity.status],
                              boxShadow: `0 0 0 2px color-mix(in srgb, ${ACTIVITY_STATUS_COLORS[activity.status]} 25%, transparent)`,
                            }}
                            aria-hidden
                          />
                          {activity.dateTime}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[min(100vw-12rem,520px)] text-sm text-[var(--text-primary)]">
                        <span className="line-clamp-2">{activity.event}</span>
                      </TableCell>
                      <TableCell className="text-sm text-[var(--text-primary)]">{activity.byWho}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
