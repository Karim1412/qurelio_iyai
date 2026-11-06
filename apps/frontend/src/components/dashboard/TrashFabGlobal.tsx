'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import toast from 'react-hot-toast';
import { documentApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Trash2,
  ArchiveRestore,
  Eye,
  FileText,
} from '@/components/icons';
import { cn } from '@/utils/cn';

export const TRASH_DRAG_TYPE = 'application/x-qurelio-doc-id';
const TRASH_CHANGED_EVENT = 'qurelio:trash-changed';

/** Tell other parts of the app (e.g. FileLibraryView) to refresh their document lists. */
function dispatchTrashChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TRASH_CHANGED_EVENT));
  }
}

export function TrashFabGlobal() {
  const { user, isAuthenticated } = useAuthStore();
  const [trashedDocs, setTrashedDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bursting, setBursting] = useState(false);
  const [emptying, setEmptying] = useState(false);
  const fabControls = useAnimation();
  const count = trashedDocs.length;

  const loadTrash = useCallback(async () => {
    if (!isAuthenticated || !user?.id || user.role === 'SUPER_ADMIN') {
      setTrashedDocs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await documentApi.listTrash();
      setTrashedDocs(Array.isArray(res.data) ? res.data : []);
    } catch {
      // silent: the FAB stays usable, the list just stays empty
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  useEffect(() => {
    const handler = () => void loadTrash();
    window.addEventListener(TRASH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(TRASH_CHANGED_EVENT, handler);
  }, [loadTrash]);

  /** iOS-style "absorb then settle" spring sequence triggered on drop. */
  const playDropAnimation = useCallback(async () => {
    setBursting(true);
    window.setTimeout(() => setBursting(false), 540);
    await fabControls.start({
      scale: [1, 0.78, 1.28, 0.92, 1.06, 1],
      rotate: [0, -4, 4, -2, 1, 0],
      transition: {
        duration: 0.62,
        times: [0, 0.18, 0.4, 0.62, 0.82, 1],
        ease: [0.34, 1.56, 0.64, 1],
      },
    });
  }, [fabControls]);

  const handleDropDoc = useCallback(async (docId: string) => {
    try {
      await documentApi.delete(docId);
      toast.success('Document moved to Trash');
      dispatchTrashChanged();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Move to Trash failed');
    }
  }, []);

  const handleRestore = useCallback(async (id: string) => {
    try {
      await documentApi.restore(id);
      toast.success('Document restored');
      dispatchTrashChanged();
    } catch {
      toast.error('Restore failed');
    }
  }, []);

  const handlePurgeUnchecked = useCallback(async (id: string) => {
    try {
      await documentApi.purge(id);
      dispatchTrashChanged();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Permanent delete failed');
      throw e;
    }
  }, []);

  const handleEmptyTrash = useCallback(async () => {
    if (trashedDocs.length === 0) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Permanently delete all ${trashedDocs.length} document${trashedDocs.length === 1 ? '' : 's'} in the trash? This cannot be undone.`,
      )
    ) {
      return;
    }
    setEmptying(true);
    let okCount = 0;
    try {
      for (const doc of trashedDocs) {
        try {
          await documentApi.purge(doc.id);
          okCount++;
        } catch {
          /* keep going */
        }
      }
      if (okCount > 0) {
        toast.success(`${okCount} document${okCount === 1 ? '' : 's'} permanently deleted`);
      }
      if (okCount < trashedDocs.length) {
        const failed = trashedDocs.length - okCount;
        toast.error(`${failed} item${failed === 1 ? '' : 's'} could not be deleted`);
      }
      dispatchTrashChanged();
    } finally {
      setEmptying(false);
    }
  }, [trashedDocs]);

  const handlePurge = useCallback(async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this document permanently? This cannot be undone.')) {
      return;
    }
    try {
      await handlePurgeUnchecked(id);
      toast.success('Document permanently deleted');
    } catch {
      /* error already toasted in unchecked */
    }
  }, [handlePurgeUnchecked]);

  // Don't render the FAB on unauthenticated routes or for SUPER_ADMIN (no trash concept).
  if (!isAuthenticated || !user || user.role === 'SUPER_ADMIN') {
    return null;
  }

  return (
    <>
      <motion.button
        type="button"
        aria-label={`Trash (${count} item${count === 1 ? '' : 's'}). Drop a document here to delete it`}
        title="Drop a document here to move it to Trash · click to open"
        onClick={() => setOpen(true)}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes(TRASH_DRAG_TYPE)) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(TRASH_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(TRASH_DRAG_TYPE);
          setDragOver(false);
          if (!id) return;
          e.preventDefault();
          void playDropAnimation();
          void handleDropDoc(id);
        }}
        animate={fabControls}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        className={cn(
          'trash-fab fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-black/20 transition-colors duration-150',
          dragOver
            ? 'is-drag-over border-2 border-red-600 bg-red-600 text-white ring-4 ring-red-600/30'
            : 'border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] hover:border-red-200 hover:bg-red-100 hover:text-red-600 dark:hover:border-red-500/40 dark:hover:bg-red-500/15',
        )}
      >
        {bursting && <span className="trash-fab-burst" aria-hidden />}
        <span className={cn('trash-fab-lid', bursting && 'trash-fab-shake')} aria-hidden>
          <Trash2 className="h-6 w-6" strokeWidth={2} />
        </span>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[var(--surface-elevated)]">
            {count > 99 ? '99+' : count}
          </span>
        )}
        <AnimatePresence>
          {dragOver && (
            <motion.span
              initial={{ opacity: 0, y: -4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 480, damping: 24 }}
              className="pointer-events-none absolute -top-10 right-0 whitespace-nowrap rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg shadow-red-600/40"
            >
              Release to delete
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[80vh] max-h-[720px] w-[92vw] max-w-[1100px] flex-col overflow-hidden p-0 sm:max-w-[1100px]">
          <DialogHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4 pr-14 text-left">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Trash2 className="h-5 w-5 text-red-600" strokeWidth={2} />
                Trash
                {count > 0 && (
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-600 dark:text-red-400">
                    {count}
                  </span>
                )}
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={count === 0 || emptying}
                onClick={handleEmptyTrash}
                className="mr-3 h-8 gap-1.5 border-red-500/40 px-3 text-xs font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                {emptying ? 'Emptying…' : 'Empty trash'}
              </Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TrashListContent
              docs={trashedDocs}
              loading={loading}
              onRestore={handleRestore}
              onPurge={handlePurge}
              onPurgeNoConfirm={handlePurgeUnchecked}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TrashListContent({
  docs,
  loading,
  onRestore,
  onPurge,
  onPurgeNoConfirm,
}: {
  docs: any[];
  loading: boolean;
  onRestore: (id: string) => Promise<void>;
  onPurge: (id: string) => Promise<void>;
  onPurgeNoConfirm: (id: string) => Promise<void>;
}) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Marquee selection inside the scroll container.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const marqueeStartRef = useRef<{
    x: number;
    y: number;
    additive: boolean;
    baseline: Set<string>;
  } | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleMarqueeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-trash-item]')) return;
      if (target.closest('button, input, textarea, a, [data-no-marquee]')) return;
      const wrapper = scrollRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const startX = e.clientX - rect.left + wrapper.scrollLeft;
      const startY = e.clientY - rect.top + wrapper.scrollTop;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      marqueeStartRef.current = {
        x: startX,
        y: startY,
        additive,
        baseline: additive ? new Set(selected) : new Set(),
      };
      setMarquee({ x: startX, y: startY, w: 0, h: 0 });
      if (!additive) setSelected(new Set());
      e.preventDefault();
    },
    [selected],
  );

  const computeHits = useCallback(
    (rect: { x: number; y: number; w: number; h: number }): Set<string> => {
      const hits = new Set<string>();
      const wrapper = scrollRef.current;
      if (!wrapper) return hits;
      const wRect = wrapper.getBoundingClientRect();
      const items = wrapper.querySelectorAll<HTMLElement>('[data-trash-item]');
      items.forEach((el) => {
        const r = el.getBoundingClientRect();
        const ix = r.left - wRect.left + wrapper.scrollLeft;
        const iy = r.top - wRect.top + wrapper.scrollTop;
        const overlap =
          rect.x < ix + r.width &&
          rect.x + rect.w > ix &&
          rect.y < iy + r.height &&
          rect.y + rect.h > iy;
        if (overlap) {
          const id = el.dataset.trashId;
          if (id) hits.add(id);
        }
      });
      return hits;
    },
    [],
  );

  const marqueeActive = marquee !== null;
  useEffect(() => {
    if (!marqueeActive) return;
    const onMove = (e: MouseEvent) => {
      const start = marqueeStartRef.current;
      const wrapper = scrollRef.current;
      if (!start || !wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const curX = e.clientX - rect.left + wrapper.scrollLeft;
      const curY = e.clientY - rect.top + wrapper.scrollTop;
      const x = Math.min(start.x, curX);
      const y = Math.min(start.y, curY);
      const w = Math.abs(curX - start.x);
      const h = Math.abs(curY - start.y);
      const next = { x, y, w, h };
      setMarquee(next);
      const hits = computeHits(next);
      if (start.additive) {
        const merged = new Set(start.baseline);
        hits.forEach((k) => merged.add(k));
        setSelected(merged);
      } else {
        setSelected(hits);
      }
    };
    const onUp = () => {
      setMarquee(null);
      marqueeStartRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [marqueeActive, computeHits]);

  const docTypeLabel = (d: any) =>
    d.type === 'ISO_NORM'
      ? 'Standard'
      : d.productId
        ? `Product · ${d.product?.name ?? '-'}`
        : d.type === 'PROCEDURE'
          ? 'Procedure'
          : d.type === 'EVIDENCE'
            ? 'Evidence'
            : 'Document';

  const sorted = useMemo(() => {
    const ts = (d: any) => new Date(d.archivedAt ?? d.updatedAt ?? d.createdAt ?? 0).getTime();
    return [...docs].sort((a, b) => ts(b) - ts(a));
  }, [docs]);

  // Prune selection of any IDs that disappeared (e.g. after restore/purge).
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(sorted.map((d) => d.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [sorted]);

  const allSelected = sorted.length > 0 && sorted.every((d) => selected.has(d.id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (sorted.length > 0 && sorted.every((d) => prev.has(d.id))) return new Set();
      return new Set(sorted.map((d) => d.id));
    });
  };

  const handleBulkRestore = async () => {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const id of Array.from(selected)) {
        try {
          await onRestore(id);
        } catch {
          /* keep going */
        }
      }
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkPurge = async () => {
    if (selected.size === 0 || bulkBusy) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Permanently delete ${selected.size} document${selected.size === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    let okCount = 0;
    try {
      for (const id of Array.from(selected)) {
        try {
          await onPurgeNoConfirm(id);
          okCount++;
        } catch {
          /* keep going */
        }
      }
      setSelected(new Set());
      if (okCount > 0) {
        toast.success(`${okCount} document${okCount === 1 ? '' : 's'} permanently deleted`);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading && sorted.length === 0) {
    return (
      <div className="h-1 w-full overflow-hidden rounded bg-[var(--page-bg)]">
        <div className="h-full w-1/3 animate-pulse bg-red-400" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/60 px-6 py-16 text-center">
        <Trash2 className="mb-3 h-9 w-9 text-[var(--muted)]" strokeWidth={1.5} />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Trash is empty</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Drag a document onto the trash icon to delete it. Restorable for as long as it stays here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          data-no-marquee
          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 px-3 py-2"
        >
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-bold text-white">
              {selected.size}
            </span>
            <span className="font-semibold text-[var(--text-primary)]">selected</span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-emerald-500/40 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              disabled={bulkBusy}
              onClick={handleBulkRestore}
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restore {selected.size}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-red-500/40 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-400"
              disabled={bulkBusy}
              onClick={handleBulkPurge}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onMouseDown={handleMarqueeMouseDown}
        className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/60"
      >
        <div className="max-w-full overflow-x-auto">
          <Table className="w-full min-w-[860px]">
            <TableHeader>
              <TableRow className="border-b border-[var(--border)] bg-[var(--page-bg)]/40 hover:bg-[var(--page-bg)]/40">
                <TableHead className="w-[36px]">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
                    data-no-marquee
                  />
                </TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Name</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Original location</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Deleted</TableHead>
                <TableHead className="w-[140px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((doc) => {
                const isSel = selected.has(doc.id);
                return (
                <TableRow
                  key={doc.id}
                  data-trash-item
                  data-trash-id={doc.id}
                  className={cn(
                    'border-b border-[var(--border)]/40 transition-colors',
                    isSel
                      ? 'bg-[var(--brand-primary)]/5'
                      : 'hover:bg-[var(--page-bg)]/40',
                  )}
                >
                  <TableCell className="w-[36px]">
                    <input
                      type="checkbox"
                      aria-label={`Select ${doc.name}`}
                      checked={isSel}
                      onChange={() => toggle(doc.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
                      data-no-marquee
                    />
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="flex min-w-0 items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--text-primary)]" title={doc.name}>
                          {doc.name}
                        </p>
                        {doc.description && (
                          <p className="truncate text-[11px] text-[var(--muted)]" title={doc.description}>
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                <TableCell className="text-xs text-[var(--muted)]">{docTypeLabel(doc)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-[var(--muted)]">
                  {doc.archivedAt
                    ? new Date(doc.archivedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5" dir="ltr">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/18 dark:text-emerald-400"
                      title="Restore (undo): file goes back to its original location"
                      disabled={restoring === doc.id}
                      onClick={async () => {
                        setRestoring(doc.id);
                        try {
                          await onRestore(doc.id);
                        } finally {
                          setRestoring(null);
                        }
                      }}
                    >
                      <ArchiveRestore className="h-4 w-4" strokeWidth={2.25} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-red-500/40 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                      title="Delete permanently (cannot be undone)"
                      disabled={purging === doc.id}
                      onClick={async () => {
                        setPurging(doc.id);
                        try {
                          await onPurge(doc.id);
                        } finally {
                          setPurging(null);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {marquee && (
          <div
            className="pointer-events-none absolute rounded-md border border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Helper to attach iOS-style drag behaviour to any DOM element representing a document. */
export function attachDocDragGlobal(docId: string, docName?: string) {
  return {
    draggable: true,
    'data-doc-id': docId,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(TRASH_DRAG_TYPE, docId);
      e.dataTransfer.setData('text/plain', docName || docId);
      e.dataTransfer.effectAllowed = 'move';
      const ghost = buildIosDragGhost(docName || 'Document');
      try {
        e.dataTransfer.setDragImage(ghost, 24, 24);
      } catch {
        /* ignore */
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
        });
      });
      const target = e.currentTarget as HTMLElement;
      target.setAttribute('data-drag-source', 'true');
    },
    onDragEnd: (e: React.DragEvent) => {
      const target = e.currentTarget as HTMLElement;
      target.removeAttribute('data-drag-source');
    },
  };
}

function buildIosDragGhost(docName: string): HTMLElement {
  const ghost = document.createElement('div');
  ghost.className = 'ios-drag-ghost';
  const card = document.createElement('div');
  card.className = 'ios-drag-ghost-card';
  const icon = document.createElement('span');
  icon.className = 'ios-drag-ghost-icon';
  icon.textContent = (docName?.trim()?.charAt(0) || '?').toUpperCase();
  const name = document.createElement('span');
  name.className = 'ios-drag-ghost-name';
  name.textContent = docName || 'Document';
  card.appendChild(icon);
  card.appendChild(name);
  ghost.appendChild(card);
  document.body.appendChild(ghost);
  return ghost;
}
