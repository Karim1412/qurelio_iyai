'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { LayoutGrid, LayoutList } from '@/components/icons';

export type ReportPaneLayout = 'split' | 'list' | 'detail';

interface ReportPaneLayoutToggleProps {
  value: ReportPaneLayout;
  onChange: (value: ReportPaneLayout) => void;
  disabledDetail?: boolean;
  className?: string;
}

function SplitIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="1" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const OPTIONS: {
  value: ReportPaneLayout;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'list',
    label: 'List only',
    shortLabel: 'List',
    icon: <LayoutList className="w-4 h-4" />,
  },
  {
    value: 'split',
    label: 'Split view',
    shortLabel: 'Split',
    icon: <SplitIcon className="w-4 h-4" />,
  },
  {
    value: 'detail',
    label: 'Detail only',
    shortLabel: 'Detail',
    icon: <LayoutGrid className="w-4 h-4" />,
  },
];

export function ReportPaneLayoutToggle({
  value,
  onChange,
  disabledDetail = false,
  className,
}: ReportPaneLayoutToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-border bg-[var(--surface)] p-0.5',
        className,
      )}
      role="group"
      aria-label="Report panel layout"
    >
      {OPTIONS.map((opt) => {
        const disabled = opt.value === 'detail' && disabledDetail;
        const active = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            title={disabled ? 'Select a report to show detail view' : opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-8 gap-1.5 px-2.5 text-xs font-medium sm:px-3',
              active && 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)] hover:text-white',
              !active && 'text-[var(--muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.shortLabel}</span>
          </Button>
        );
      })}
    </div>
  );
}
