'use client';

import React, { useEffect, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';
import { CreateReportDialog } from './CreateReportDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { ReportSeverityBadge, ReportStatusBadge } from './ReportBadges';
import { Plus, Search } from '@/components/icons';

const REPORT_TYPES = [
  { value: 'AUDIT', label: 'Audit' },
  { value: 'NON_CONFORMITY', label: 'Non-Conformity' },
  { value: 'CAPA', label: 'CAPA' },
  { value: 'INCIDENT', label: 'Incident' },
  { value: 'COMPLAINT', label: 'Complaint' },
];

const ALL_FILTER = '__all__';

const STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export type ReportListFilters = {
  type: string;
  status: string;
  search: string;
  skip: number;
  take: number;
};

interface ReportsListProps {
  reports: any[];
  selectedReport: any | null;
  loading: boolean;
  total: number;
  filters: ReportListFilters;
  onFilterChange: (next: Partial<ReportListFilters>) => void;
  onSelectReport: (report: any) => void;
  initialTemplateId?: string | null;
}

export function ReportsList({
  reports,
  selectedReport,
  loading,
  total,
  filters,
  onFilterChange,
  onSelectReport,
  initialTemplateId,
}: ReportsListProps) {
  const { canCreateOrEditReports } = usePermissions();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    if (initialTemplateId) {
      setShowCreateDialog(true);
    }
  }, [initialTemplateId]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Reports</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {total} report{total !== 1 ? 's' : ''} total
          </p>
        </div>
        {canCreateOrEditReports && (
          <Button type="button" onClick={() => setShowCreateDialog(true)} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            New Report
          </Button>
        )}
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <Input
              placeholder="Search reports..."
              value={filters.search}
              onChange={(e) => onFilterChange({ search: e.target.value })}
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Type</label>
          <Select
            value={filters.type || ALL_FILTER}
            onValueChange={(val) => onFilterChange({ type: val === ALL_FILTER ? '' : val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All types</SelectItem>
              {REPORT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-[var(--muted)] block mb-2">Status</label>
          <Select
            value={filters.status || ALL_FILTER}
            onValueChange={(val) => onFilterChange({ status: val === ALL_FILTER ? '' : val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 border border-border rounded-lg overflow-hidden flex flex-col bg-[var(--surface)]">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="sticky top-0 z-[1]">
              <TableRow className="border-b border-border">
                <TableHead className="w-32">Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-24">Severity</TableHead>
                <TableHead className="w-28">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-[var(--muted)]">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-4 text-center">
                      <p className="text-sm text-[var(--muted)]">No reports yet. Create one to get started.</p>
                      {canCreateOrEditReports && (
                        <Button type="button" onClick={() => setShowCreateDialog(true)} className="gap-2">
                          <Plus className="h-4 w-4" />
                          Create report
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => (
                  <TableRow
                    key={report.id}
                    onClick={() => onSelectReport(report)}
                    className={cn(
                      'cursor-pointer',
                      selectedReport?.id === report.id && 'bg-[var(--table-row-selected)]',
                    )}
                  >
                    <TableCell className="text-sm font-medium text-[var(--text-primary)]">
                      {report.type === 'NON_CONFORMITY'
                        ? 'NC'
                        : report.type
                          ? report.type.charAt(0) + report.type.slice(1).toLowerCase()
                          : '-'}
                    </TableCell>
                    <TableCell className="text-sm truncate text-[var(--text-primary)]">{report.title}</TableCell>
                    <TableCell>
                      <ReportStatusBadge status={report.status} />
                    </TableCell>
                    <TableCell>
                      {report.severity ? (
                        <ReportSeverityBadge severity={report.severity} />
                      ) : (
                        <span className="text-xs text-[var(--muted)]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">
                      {format(new Date(report.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {total > filters.take && (
          <div className="px-4 py-3 border-t border-border text-xs text-[var(--muted)] surface-muted-panel">
            Showing {Math.min(filters.skip + 1, total)} to {Math.min(filters.skip + filters.take, total)} of {total}
          </div>
        )}
      </div>

      <CreateReportDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        initialTemplateId={initialTemplateId}
        onReportCreated={(report) => {
          setShowCreateDialog(false);
          onFilterChange(filters);
          if (report) onSelectReport(report);
        }}
      />
    </div>
  );
}