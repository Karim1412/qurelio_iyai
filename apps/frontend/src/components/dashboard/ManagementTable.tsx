'use client';

import React, { useState } from 'react';
import { Search, Trash2, CircleCheck, Ban, Plus, RefreshCw } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

export interface Column<T = unknown> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  width?: number | string;
}

interface ManagementTableProps<T = unknown> {
  /** When false, only toolbar actions + search show (title lives in the top bar). */
  showPageHeading?: boolean;
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  onActivate?: (row: T) => void | Promise<void>;
  onDelete?: (row: T) => void | Promise<void>;
  onAdd?: () => void;
  addLabel?: string;
  /** When true, Add stays visible but cannot be clicked (e.g. plan seat limit). */
  addDisabled?: boolean;
  addDisabledTitle?: string;
  searchKeys?: string[];
  onRefresh?: () => void;
}

export function ManagementTable<T = unknown>({
  showPageHeading = true,
  title,
  subtitle,
  columns,
  rows,
  loading,
  onActivate,
  onDelete,
  onAdd,
  addLabel = 'Add',
  addDisabled = false,
  addDisabledTitle,
  searchKeys = ['email'],
  onRefresh,
}: ManagementTableProps<T>) {
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const filtered = rows.filter((row) =>
    searchKeys.some((key) =>
      String((row as Record<string, unknown>)[key] || '')
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  );

  const handleDeleteConfirm = () => {
    if (deleteTarget != null) onDelete?.(deleteTarget);
    setDeleteTarget(null);
  };

  return (
    <>
      <div>
        <div
          className={cn(
            'mb-6 flex flex-col gap-4 sm:flex-row sm:items-center',
            showPageHeading ? 'justify-between' : 'justify-end'
          )}
        >
          {showPageHeading && (
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading} aria-label="Refresh">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            )}
            {onAdd && (
              <Button
                type="button"
                onClick={onAdd}
                className="gap-2"
                disabled={addDisabled}
                title={addDisabled ? addDisabledTitle : undefined}
              >
                <Plus className="h-4 w-4" />
                {addLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#919eab]" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              Reset
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead key={col.key} className="font-medium" style={{ width: col.width }}>
                    {col.label}
                  </TableHead>
                ))}
                {(onActivate || onDelete) && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <TableRow key={i}>
                      {columns.map((col) => (
                        <TableCell key={col.key}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                      {(onActivate || onDelete) && (
                        <TableCell>
                          <Skeleton className="ml-auto h-6 w-16" />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (onActivate || onDelete ? 1 : 0)}
                    className="py-12 text-center text-sm text-[#919eab]"
                  >
                    {search ? 'No results found' : 'No data available'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, i) => (
                  <TableRow key={(row as { id?: string }).id ?? i}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-sm text-[var(--text-primary)]">
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </TableCell>
                    ))}
                    {(onActivate || onDelete) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {onActivate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => onActivate(row)}
                              aria-label={(row as { isActive?: boolean }).isActive ? 'Deactivate' : 'Activate'}
                            >
                              {(row as { isActive?: boolean }).isActive ? (
                                <CircleCheck className="h-4 w-4 text-[#118d57]" />
                              ) : (
                                <Ban className="h-4 w-4 text-[#919eab]" />
                              )}
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-red-600"
                              onClick={() => setDeleteTarget(row)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StatusChip({ active }: { active: boolean }) {
  return (
    <Badge
      variant="default"
      className={cn(
        'border-0 font-semibold',
        active ? 'bg-[var(--badge-paid-bg)] text-[var(--badge-paid-text)]' : 'bg-[var(--badge-draft-bg)] text-[var(--badge-draft-text)]'
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function VerificationChip({ verified }: { verified: boolean }) {
  return (
    <Badge
      variant="default"
      className={cn(
        'border-0 font-semibold',
        verified ? 'bg-[var(--badge-paid-bg)] text-[var(--badge-paid-text)]' : 'bg-[var(--badge-progress-bg)] text-[var(--badge-progress-text)]'
      )}
    >
      {verified ? 'Verified' : 'Not Verified'}
    </Badge>
  );
}

export function RoleChip({ role }: { role: string }) {
  const ROLE: Record<string, string> = {
    SUPER_ADMIN: 'bg-red-100 text-red-800',
    DIRECTOR: 'bg-[var(--badge-published-bg)] text-[var(--badge-published-text)]',
    QUALITY_MANAGER: 'bg-cyan-100 text-cyan-900',
    AUDITOR: 'bg-violet-100 text-violet-900',
    OPERATOR: 'bg-[var(--badge-draft-bg)] text-[var(--badge-draft-text)]',
    C_LEVEL: 'bg-slate-100 text-slate-800',
  };
  return (
    <Badge variant="default" className={cn('border-0 font-semibold', ROLE[role] || ROLE['OPERATOR'])}>
      {role.replace('_', ' ')}
    </Badge>
  );
}
