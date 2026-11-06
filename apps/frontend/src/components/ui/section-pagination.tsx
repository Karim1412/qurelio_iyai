'use client';

import { ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight } from '@/components/icons';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { totalPages } from '@/lib/file-library-helpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = {
  page: number;
  onPageChange: (p: number) => void;
  totalItems: number;
  pageSize: number;
  className?: string;
  /** Style for active number pill (matches Product / Standards sections) */
  variant?: 'indigo' | 'amber' | 'blue';
  /** 'centered' = `<<` `<` 1 2 3 `>` `>>` on top, `1 - 10 of 120` below. 'split' = same stack, optional wide layouts. */
  layout?: 'split' | 'centered';
  /** When false, hide the compact `1 - 10 of 120` range line (below the page controls). */
  showRange?: boolean;
  /**
   * `prime` = light blue circular current page (PrimeReact Paginator–style);
   * `default` = section tint (amber/blue/indigo) from `variant`.
   */
  activeStyle?: 'default' | 'prime';
  /** e.g. [6, 10, 20, 30]: when set, shows a “rows per page” control (Prime–style). */
  rowsPerPageOptions?: number[];
  onPageSizeChange?: (rows: number) => void;
};

const activeRing: Record<NonNullable<Props['variant']>, string> = {
  indigo: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
  amber: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300/80',
  blue: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
};

const primeActive = 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/90';

const DEFAULT_ROW_OPTIONS = [6, 10, 20, 30];

/** `<<` `<` 1 2 3 4 5 `>` `>>` and optional rows-per-page (Prime–style). */
export function SectionPagination({
  page,
  onPageChange,
  totalItems,
  pageSize,
  className,
  variant = 'indigo',
  layout = 'centered',
  showRange = true,
  activeStyle = 'prime',
  rowsPerPageOptions = DEFAULT_ROW_OPTIONS,
  onPageSizeChange,
}: Props) {
  const last = totalPages(totalItems, pageSize);
  if (totalItems <= 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const windowSize = 5;
  let start = Math.max(1, page - 2);
  let end = Math.min(last, start + windowSize - 1);
  if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);
  const numbers: number[] = [];
  for (let n = start; n <= end; n++) numbers.push(n);

  const activeClass = activeStyle === 'prime' ? primeActive : activeRing[variant];

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-1" role="navigation" aria-label="Pagination">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-[var(--muted)]"
        disabled={page <= 1}
        onClick={() => onPageChange(1)}
        aria-label="First page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-[var(--muted)]"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPageChange(n)}
          className={cn(
            'flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
            n === page
              ? activeClass
              : 'text-[var(--muted)] hover:bg-[var(--page-bg)]',
          )}
          aria-label={`Page ${n}`}
          aria-current={n === page ? 'page' : undefined}
        >
          {n}
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-[var(--muted)]"
        disabled={page >= last}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-[var(--muted)]"
        disabled={page >= last}
        onClick={() => onPageChange(last)}
        aria-label="Last page"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const sizeInOptions = rowsPerPageOptions.includes(pageSize) ? String(pageSize) : String(rowsPerPageOptions[0] ?? 6);

  const rowsSelect =
    onPageSizeChange && rowsPerPageOptions.length > 0 ? (
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-[11px] text-[var(--muted)] sm:inline">Rows</span>
        <Select
          value={sizeInOptions}
          onValueChange={(v) => {
            onPageSizeChange(Number(v));
          }}
        >
          <SelectTrigger className="h-8 w-[4.5rem] rounded-md border border-[var(--input-border)] px-2 text-xs sm:w-[4.75rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rowsPerPageOptions.map((r) => (
              <SelectItem key={r} value={String(r)} className="text-sm">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  if (last <= 1 && !onPageSizeChange) {
    return null;
  }

  if (layout === 'centered') {
    return (
      <div
        className={cn(
          'w-full min-w-0 space-y-2 border-t border-[var(--border)]/60 bg-[var(--page-bg)]/20 pt-3',
          onPageSizeChange && 'rounded-b-lg',
          className,
        )}
      >
        <div className="flex w-full min-w-0 flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 overflow-x-auto sm:flex sm:justify-center">{controls}</div>
          {rowsSelect && <div className="flex w-full justify-center sm:w-auto sm:justify-end">{rowsSelect}</div>}
        </div>
        {showRange && (
          <p
            className="text-center text-[11px] text-[var(--muted)]"
            aria-label={`${from} through ${to} of ${totalItems} items`}
          >
            {from} - {to} of {totalItems}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-stretch gap-1.5 pt-2', className)}>
      <div className="ml-auto flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
        <div className="flex min-w-0 items-center justify-end overflow-x-auto">{controls}</div>
        {rowsSelect}
      </div>
      {showRange && (
        <p
          className="w-full text-center text-[11px] text-[var(--muted)]"
          aria-label={`${from} through ${to} of ${totalItems} items`}
        >
          {from} - {to} of {totalItems}
        </p>
      )}
    </div>
  );
}

export const DEFAULT_SECTION_PAGE_SIZE = 6;
