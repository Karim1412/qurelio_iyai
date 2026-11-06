'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Home, Search, Loader2 } from '@/components/icons';
import { FileGlyph, FolderGlyph, typeLabel } from '@/components/file-manager/FileTypeIcon';
import { cn } from '@/utils/cn';

// ────────────────────────────────────────────────────────────────────────────
// Types (kept loose so we don't couple to FileManagerView internals)
// ────────────────────────────────────────────────────────────────────────────

export interface GlobeFolder {
  id: string;
  name: string;
  parentId: string | null;
  fileCount?: number;
}

export interface GlobeDoc {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  folderId?: string | null;
}

type GlobeNode =
  | { kind: 'folder'; id: string; name: string; sub: GlobeFolder; base: Vec3 }
  | { kind: 'file'; id: string; name: string; doc: GlobeDoc; base: Vec3 };

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Math helpers
// ────────────────────────────────────────────────────────────────────────────

/** Evenly distribute `n` points over a unit sphere (Fibonacci / golden-spiral). */
function fibonacciSphere(n: number): Vec3[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, z: 1 }];
  const pts: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2; // 1 → -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return pts;
}

/** Rotate a vector around X then Y. */
function rotate(v: Vec3, ax: number, ay: number): Vec3 {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const y1 = v.y * cx - v.z * sx;
  const z1 = v.y * sx + v.z * cx;
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const x2 = v.x * cy + z1 * sy;
  const z2 = -v.x * sy + z1 * cy;
  return { x: x2, y: y1, z: z2 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mapRange(v: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  const t = (v - inLo) / (inHi - inLo);
  return outLo + clamp(t, 0, 1) * (outHi - outLo);
}

function formatBytes(b?: number): string {
  if (!b || b < 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function FolderGlobeOverlay({
  open,
  rootFolderId,
  folders,
  onLoadDocs,
  onOpenFile,
  onClose,
}: {
  open: boolean;
  /** Folder whose contents are shown when the overlay opens. */
  rootFolderId: string | null;
  /** Every folder in the workspace (used for sub-folders + breadcrumb). */
  folders: GlobeFolder[];
  /** Fetch the documents inside a folder. */
  onLoadDocs: (folderId: string) => Promise<GlobeDoc[]>;
  /** Open a file (editor): overlay closes afterwards. */
  onOpenFile: (id: string) => void;
  onClose: () => void;
}) {
  const folderById = useMemo(() => {
    const m = new Map<string, GlobeFolder>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);

  // Which folder is currently displayed (supports drilling into sub-folders).
  const [currentId, setCurrentId] = useState<string | null>(rootFolderId);
  const [docs, setDocs] = useState<GlobeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);

  // Reset to the freshly-clicked folder every time the overlay opens.
  useEffect(() => {
    if (open) {
      setCurrentId(rootFolderId);
      setQuery('');
      setHoveredId(null);
    }
  }, [open, rootFolderId]);

  // Respect the user's motion preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Load the documents of the current folder.
  useEffect(() => {
    if (!open || !currentId) {
      setDocs([]);
      return;
    }
    let alive = true;
    setLoading(true);
    onLoadDocs(currentId)
      .then((d) => {
        if (alive) setDocs(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (alive) setDocs([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, currentId, onLoadDocs]);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Children of the current folder = sub-folders + documents.
  const subFolders = useMemo(
    () => folders.filter((f) => f.parentId === currentId),
    [folders, currentId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const subs = q ? subFolders.filter((f) => f.name.toLowerCase().includes(q)) : subFolders;
    const fs = q ? docs.filter((d) => d.name.toLowerCase().includes(q)) : docs;
    return { subs, fs };
  }, [query, subFolders, docs]);

  // Build sphere nodes (folders first, then files) with stable base positions.
  const nodes = useMemo<GlobeNode[]>(() => {
    const items: Array<{ kind: 'folder' | 'file'; payload: GlobeFolder | GlobeDoc }> = [
      ...filtered.subs.map((f) => ({ kind: 'folder' as const, payload: f })),
      ...filtered.fs.map((d) => ({ kind: 'file' as const, payload: d })),
    ];
    const pts = fibonacciSphere(items.length);
    return items.map((it, i) => {
      if (it.kind === 'folder') {
        const f = it.payload as GlobeFolder;
        return { kind: 'folder', id: f.id, name: f.name, sub: f, base: pts[i] };
      }
      const d = it.payload as GlobeDoc;
      return { kind: 'file', id: d.id, name: d.name, doc: d, base: pts[i] };
    });
  }, [filtered]);

  // Breadcrumb from the overlay root down to the current folder.
  const breadcrumb = useMemo(() => {
    const trail: GlobeFolder[] = [];
    let id: string | null = currentId;
    while (id) {
      const f = folderById.get(id);
      if (!f) break;
      trail.unshift(f);
      if (id === rootFolderId) break;
      id = f.parentId;
    }
    return trail;
  }, [currentId, rootFolderId, folderById]);

  const hovered = hoveredId ? nodes.find((n) => n.id === hoveredId) ?? null : null;

  // ── 3-D rotation engine (imperative, runs off React render) ────────────────
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rot = useRef({ x: -0.14, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const drag = useRef({ active: false, moved: false, lastX: 0, lastY: 0, downX: 0, downY: 0 });
  const radiusRef = useRef(240);
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hoveredId;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  // Keep the sphere radius in sync with the stage size.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      radiusRef.current = clamp(Math.min(r.width, r.height) * 0.34, 150, 320);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Animation frame loop: writes transforms straight to the DOM.
  useEffect(() => {
    if (!open || nodes.length === 0) return;
    let raf = 0;
    const tick = () => {
      const d = drag.current;
      if (!d.active) {
        // inertia
        rot.current.y += vel.current.y;
        rot.current.x += vel.current.x;
        vel.current.y *= 0.94;
        vel.current.x *= 0.94;
        if (Math.abs(vel.current.y) < 0.00002) vel.current.y = 0;
        if (Math.abs(vel.current.x) < 0.00002) vel.current.x = 0;
        // gentle idle spin (paused on hover / reduced motion)
        if (!reducedRef.current && !hoveredRef.current && vel.current.y === 0) {
          rot.current.y += 0.0018;
        }
      }
      rot.current.x = clamp(rot.current.x, -1.15, 1.15);

      const R = radiusRef.current;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodeRefs.current[i];
        if (!el) continue;
        const p = rotate(nodes[i].base, rot.current.x, rot.current.y);
        const scale = mapRange(p.z, -1, 1, 0.55, 1.18);
        const opacity = mapRange(p.z, -1, 1, 0.22, 1);
        el.style.transform = `translate3d(calc(-50% + ${p.x * R}px), calc(-50% + ${
          -p.y * R
        }px), 0) scale(${scale.toFixed(3)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = String(1000 + Math.round(p.z * 1000));
        el.style.filter = p.z < -0.25 ? `blur(${(-(p.z) * 1.6).toFixed(1)}px)` : 'none';
        el.style.pointerEvents = p.z < -0.2 ? 'none' : 'auto';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, nodes]);

  // Pointer drag to rotate.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      active: true,
      moved: false,
      lastX: e.clientX,
      lastY: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
    };
    vel.current = { x: 0, y: 0 };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (Math.hypot(e.clientX - d.downX, e.clientY - d.downY) > 6) d.moved = true;
    const ry = dx * 0.006;
    const rx = -dy * 0.006;
    rot.current.y += ry;
    rot.current.x += rx;
    vel.current = { x: rx, y: ry };
  }, []);

  const endDrag = useCallback(() => {
    drag.current.active = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    rot.current.y += e.deltaY * 0.0022;
    vel.current = { x: 0, y: 0 };
  }, []);

  const activateNode = useCallback(
    (node: GlobeNode) => {
      if (drag.current.moved) return; // ignore clicks that were really drags
      if (node.kind === 'folder') {
        setQuery('');
        setHoveredId(null);
        setCurrentId(node.id);
      } else {
        onOpenFile(node.id);
        onClose();
      }
    },
    [onOpenFile, onClose],
  );

  if (typeof document === 'undefined') return null;

  const reveal = reduced ? { duration: 0 } : undefined;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="folder-globe"
          className="fixed inset-0 z-[120] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          aria-label={`Contents of ${breadcrumb[breadcrumb.length - 1]?.name ?? 'folder'}`}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={onClose} />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(55% 55% at 50% 38%, color-mix(in srgb, var(--brand-primary) 22%, transparent), transparent 70%)',
            }}
          />

          {/* Header */}
          <div className="relative flex items-center gap-3 px-5 py-4 sm:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <Home className="h-4 w-4 shrink-0 text-white/60" />
              {breadcrumb.map((f, i) => (
                <React.Fragment key={f.id}>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setCurrentId(f.id);
                    }}
                    className={cn(
                      'truncate rounded-md px-1.5 py-0.5 transition-colors',
                      i === breadcrumb.length - 1
                        ? 'font-semibold text-white'
                        : 'text-white/55 hover:text-white',
                    )}
                  >
                    {f.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Quick filter */}
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                className="w-44 rounded-lg border border-white/15 bg-white/10 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[var(--brand-primary)] focus:bg-white/15"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Globe stage */}
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onWheel={onWheel}
            className="relative flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
            style={{ perspective: '1400px' }}
          >
            {/* faint orbital ring for depth cue */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5"
              style={{ width: 520, height: 520 }}
            />

            {loading && nodes.length === 0 && (
              <div className="absolute inset-0 grid place-items-center text-white/70">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            )}

            {!loading && nodes.length === 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <p className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/70">
                  {query ? 'No items match your filter.' : 'This folder is empty.'}
                </p>
              </div>
            )}

            {/* nodes anchored to the stage centre; transforms applied imperatively
                by the rAF loop. A parent wrapper handles the scale-in entrance so it
                never fights the per-node transforms. */}
            <motion.div
              key={currentId ?? 'root'}
              className="absolute inset-0"
              initial={reduced ? false : { opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reveal ?? { duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              {nodes.map((node, i) => {
                const isHover = hoveredId === node.id;
                return (
                  <div
                    key={node.id}
                    ref={(el) => {
                      nodeRefs.current[i] = el;
                    }}
                    className="absolute left-1/2 top-1/2 will-change-transform"
                  >
                  <button
                    type="button"
                    onPointerEnter={() => setHoveredId(node.id)}
                    onPointerLeave={() => setHoveredId((cur) => (cur === node.id ? null : cur))}
                    onClick={() => activateNode(node)}
                    title={node.name}
                    className={cn(
                      'group flex w-[92px] flex-col items-center gap-1 rounded-2xl border p-2.5 backdrop-blur-sm transition-colors duration-150',
                      isHover
                        ? 'border-[var(--brand-primary)] bg-white/15'
                        : 'border-white/10 bg-white/5 hover:border-white/25',
                    )}
                    style={
                      isHover
                        ? { boxShadow: '0 0 0 4px color-mix(in srgb, var(--brand-primary) 30%, transparent), 0 12px 40px rgba(0,0,0,0.5)' }
                        : undefined
                    }
                  >
                    {node.kind === 'folder' ? (
                      <FolderGlyph size={44} open={isHover} />
                    ) : (
                      <FileGlyph name={node.name} mime={node.doc.mimeType} size={44} />
                    )}
                    <span className="line-clamp-2 w-full text-center text-[11px] font-medium leading-tight text-white">
                      {node.name}
                    </span>
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/60">
                      {node.kind === 'folder'
                        ? `${node.sub.fileCount ?? ''} ${node.sub.fileCount === 1 ? 'item' : 'items'}`.trim() ||
                          'Folder'
                        : typeLabel(node.name, node.doc.mimeType)}
                    </span>
                  </button>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* Footer / hovered detail */}
          <div className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <p className="text-xs text-white/45">
              Drag or scroll to rotate · click an item to open
              {!reduced && ' · auto-rotates when idle'}
            </p>
            <AnimatePresence mode="wait">
              {hovered && (
                <motion.div
                  key={hovered.id}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-2 backdrop-blur"
                >
                  {hovered.kind === 'folder' ? (
                    <FolderGlyph size={26} />
                  ) : (
                    <FileGlyph name={hovered.name} mime={hovered.doc.mimeType} size={26} />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{hovered.name}</p>
                    <p className="text-[11px] text-white/50">
                      {hovered.kind === 'folder'
                        ? 'Folder · click to open'
                        : [typeLabel(hovered.name, hovered.doc.mimeType), formatBytes(hovered.doc.sizeBytes)]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
