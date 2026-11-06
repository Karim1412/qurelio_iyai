'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { Plus, Trash2 } from '@/components/icons';

export interface Cell {
  /** Display value (what the user sees). For formulas this is the cached result. */
  v: string;
  /** Excel formula without leading `=`, if any. */
  f?: string;
  /** Cell type: s=string, n=number, b=boolean, d=date. Defaults to 's'. */
  t?: 's' | 'n' | 'b' | 'd';
}

export interface Merge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export type Sheet = {
  name: string;
  cells: Cell[][];
  merges?: Merge[];
  colWidths?: number[];
};

interface Props {
  initialSheets: Sheet[];
  onChange: (sheets: Sheet[]) => void;
  fontSize: number;
}

const MIN_COLS = 4;
const MIN_ROWS = 8;
const DEFAULT_COL_WIDTH = 120;

function ensureMinimumGrid(cells: Cell[][]): Cell[][] {
  const maxLen = Math.max(MIN_COLS, ...cells.map((r) => r.length));
  const padded = cells.map((r) => {
    const out = [...r];
    while (out.length < maxLen) out.push({ v: '' });
    return out;
  });
  while (padded.length < MIN_ROWS) padded.push(new Array(maxLen).fill(null).map(() => ({ v: '' })));
  return padded;
}

function columnLetter(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function inferType(value: string): 's' | 'n' | 'b' {
  if (value === '' || value === null) return 's';
  if (value === 'true' || value === 'false' || value === 'TRUE' || value === 'FALSE') return 'b';
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'n';
  return 's';
}

/** Build the look-up of merged top-left -> [rowspan, colspan, hidden]. */
function buildMergeMap(merges: Merge[] | undefined) {
  const hidden = new Set<string>();
  const top: Record<string, { rowspan: number; colspan: number }> = {};
  if (!merges) return { hidden, top };
  for (const m of merges) {
    const rs = m.e.r - m.s.r + 1;
    const cs = m.e.c - m.s.c + 1;
    top[`${m.s.r}:${m.s.c}`] = { rowspan: rs, colspan: cs };
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        hidden.add(`${r}:${c}`);
      }
    }
  }
  return { hidden, top };
}

export function SheetEditor({ initialSheets, onChange, fontSize }: Props) {
  const [sheets, setSheets] = useState<Sheet[]>(
    initialSheets.map((s) => ({ ...s, cells: ensureMinimumGrid(s.cells) })),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [editingFormula, setEditingFormula] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    setSheets(initialSheets.map((s) => ({ ...s, cells: ensureMinimumGrid(s.cells) })));
    setActiveIdx(0);
  }, [initialSheets]);

  const pushChange = useCallback(
    (next: Sheet[]) => {
      setSheets(next);
      onChange(next);
    },
    [onChange],
  );

  const updateCell = useCallback(
    (r: number, c: number, raw: string) => {
      const next = sheets.map((s, i) => {
        if (i !== activeIdx) return s;
        const cells = s.cells.map((row, ri) => {
          if (ri !== r) return row;
          const out = [...row];
          // Formula syntax: leading `=` → store as formula; display will follow result on next save.
          if (raw.startsWith('=')) {
            out[c] = { v: raw, f: raw.slice(1), t: 's' };
          } else {
            out[c] = { v: raw, t: inferType(raw) };
          }
          return out;
        });
        return { ...s, cells };
      });
      pushChange(next);
    },
    [sheets, activeIdx, pushChange],
  );

  const addRow = useCallback(() => {
    const next = sheets.map((s, i) => {
      if (i !== activeIdx) return s;
      const cols = s.cells[0]?.length ?? MIN_COLS;
      return {
        ...s,
        cells: [...s.cells, new Array(cols).fill(null).map(() => ({ v: '' } as Cell))],
      };
    });
    pushChange(next);
  }, [sheets, activeIdx, pushChange]);

  const addColumn = useCallback(() => {
    const next = sheets.map((s, i) => {
      if (i !== activeIdx) return s;
      return { ...s, cells: s.cells.map((r) => [...r, { v: '' } as Cell]) };
    });
    pushChange(next);
  }, [sheets, activeIdx, pushChange]);

  const removeRow = useCallback(
    (r: number) => {
      const next = sheets.map((s, i) => {
        if (i !== activeIdx) return s;
        const cells = s.cells.filter((_, ri) => ri !== r);
        return { ...s, cells: ensureMinimumGrid(cells) };
      });
      pushChange(next);
    },
    [sheets, activeIdx, pushChange],
  );

  const removeColumn = useCallback(
    (c: number) => {
      const next = sheets.map((s, i) => {
        if (i !== activeIdx) return s;
        const cells = s.cells.map((row) => row.filter((_, ci) => ci !== c));
        return { ...s, cells: ensureMinimumGrid(cells) };
      });
      pushChange(next);
    },
    [sheets, activeIdx, pushChange],
  );

  const active = sheets[activeIdx];
  const cells = active?.cells ?? [];
  const colCount = cells[0]?.length ?? MIN_COLS;
  const merges = useMemo(() => buildMergeMap(active?.merges), [active?.merges]);

  const containerRef = useRef<HTMLDivElement>(null);
  const focusCell = (r: number, c: number) => {
    const el = containerRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${r}"][data-col="${c}"]`,
    );
    el?.focus();
  };

  const onCellKey = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      focusCell(r + 1 < cells.length ? r + 1 : 0, c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(r > 0 ? r - 1 : cells.length - 1, c);
    } else if (e.key === 'ArrowLeft' && (e.currentTarget.selectionStart ?? 0) === 0) {
      e.preventDefault();
      focusCell(r, c > 0 ? c - 1 : colCount - 1);
    } else if (
      e.key === 'ArrowRight' &&
      (e.currentTarget.selectionStart ?? 0) === e.currentTarget.value.length
    ) {
      e.preventDefault();
      focusCell(r, c + 1 < colCount ? c + 1 : 0);
    }
  };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      {sheets.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)]/60 bg-[var(--page-bg)]/40 px-3 py-2">
          {sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                'shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                i === activeIdx
                  ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                  : 'text-[var(--muted)] hover:bg-[var(--nav-hover)]/50 hover:text-[var(--text-primary)]',
              )}
            >
              {s.name || `Sheet ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)]/60 bg-[var(--surface)] px-3 py-2 text-[11.5px]">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--nav-hover)]/50"
        >
          <Plus className="h-3 w-3" /> Row
        </button>
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--nav-hover)]/50"
        >
          <Plus className="h-3 w-3" /> Column
        </button>
        <span className="ml-auto text-[var(--muted)]">
          {cells.length} rows · {colCount} cols
          {active?.merges?.length ? ` · ${active.merges.length} merged` : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface)]">
        <table
          className="w-max border-separate border-spacing-0"
          style={{ fontSize: `${fontSize}px` }}
        >
          <thead className="sticky top-0 z-10 bg-[var(--page-bg)]/95 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-r border-[var(--border)]/60 bg-[var(--page-bg)]/95 px-1 py-1 text-center text-[10px] font-semibold text-[var(--muted)]">
                #
              </th>
              {Array.from({ length: colCount }, (_, c) => {
                const w = active?.colWidths?.[c] ?? DEFAULT_COL_WIDTH;
                return (
                  <th
                    key={c}
                    style={{ minWidth: w }}
                    className="group relative border-b border-r border-[var(--border)]/60 px-2 py-1 text-left text-[10.5px] font-semibold text-[var(--muted)]"
                  >
                    {columnLetter(c)}
                    {colCount > MIN_COLS && (
                      <button
                        type="button"
                        onClick={() => removeColumn(c)}
                        className="absolute right-1 top-1 hidden cursor-pointer rounded p-0.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 group-hover:inline-flex"
                        aria-label={`Delete column ${columnLetter(c)}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, r) => (
              <tr key={r} className="group/row">
                <td className="sticky left-0 z-10 w-10 border-b border-r border-[var(--border)]/60 bg-[var(--page-bg)]/80 px-1 py-0 text-center text-[10px] tabular-nums text-[var(--muted)]">
                  <span className="group-hover/row:hidden">{r + 1}</span>
                  {cells.length > MIN_ROWS && (
                    <button
                      type="button"
                      onClick={() => removeRow(r)}
                      className="hidden cursor-pointer rounded p-0.5 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 group-hover/row:inline-flex"
                      aria-label={`Delete row ${r + 1}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </td>
                {row.map((cell, c) => {
                  if (merges.hidden.has(`${r}:${c}`)) return null;
                  const span = merges.top[`${r}:${c}`];
                  const isFormulaCell = Boolean(cell.f);
                  const editing =
                    editingFormula && editingFormula.r === r && editingFormula.c === c;
                  const display = editing && isFormulaCell ? `=${cell.f}` : cell.v;
                  return (
                    <td
                      key={c}
                      rowSpan={span?.rowspan}
                      colSpan={span?.colspan}
                      className={cn(
                        'border-b border-r border-[var(--border)]/60 p-0',
                        isFormulaCell && 'bg-amber-50/40',
                      )}
                      title={isFormulaCell ? `Formula: =${cell.f}` : undefined}
                    >
                      <input
                        data-row={r}
                        data-col={c}
                        value={display}
                        onChange={(e) => updateCell(r, c, e.target.value)}
                        onFocus={() => isFormulaCell && setEditingFormula({ r, c })}
                        onBlur={() => editing && setEditingFormula(null)}
                        onKeyDown={(e) => onCellKey(r, c, e)}
                        className={cn(
                          'block h-full w-full bg-transparent px-2 py-1.5 outline-none transition-colors focus:bg-[var(--brand-primary)]/5 focus:ring-1 focus:ring-inset focus:ring-[var(--brand-primary)]/40',
                          cell.t === 'n' && !isFormulaCell && 'text-right tabular-nums',
                          isFormulaCell && 'text-amber-900',
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Parsing & serialization helpers ──────────────────────────────────────

export function parseCSV(text: string, delimiter: string = ','): Sheet[] {
  const cells: Cell[][] = [];
  let cur: Cell[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) {
        cur.push({ v: field, t: inferType(field) });
        field = '';
      } else if (ch === '\r') {
        /* ignore */
      } else if (ch === '\n') {
        cur.push({ v: field, t: inferType(field) });
        cells.push(cur);
        cur = [];
        field = '';
      } else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push({ v: field, t: inferType(field) });
    cells.push(cur);
  }
  return [{ name: 'Sheet1', cells }];
}

export function serializeCSV(sheets: Sheet[], delimiter: string = ','): string {
  const rows = sheets[0]?.cells ?? [];
  const lines = rows.map((r) =>
    r
      .map((cell) => {
        const c = cell.v;
        const needsQuotes = c.includes(delimiter) || c.includes('"') || c.includes('\n');
        const esc = c.replace(/"/g, '""');
        return needsQuotes ? `"${esc}"` : esc;
      })
      .join(delimiter),
  );
  return lines.join('\n');
}
