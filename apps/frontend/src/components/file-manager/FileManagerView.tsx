'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { companyApi, documentApi, folderApi, productApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  Folder,
  FolderPlus,
  FolderSync,
  Upload,
  Trash2,
  Edit,
  ChevronRight,
  X,
  Loader2,
  Plus,
  Search,
  FileText,
  Star,
  Pin,
  PinOff,
  History,
  Users,
  LayoutGrid,
  List as ListIcon,
  Home,
  Archive,
} from '@/components/icons';
import { cn } from '@/utils/cn';
import { FileGlyph, FolderGlyph, typeLabel } from '@/components/file-manager/FileTypeIcon';
import { ShareDialog } from '@/components/file-manager/ShareDialog';
import { PropertiesDialog } from '@/components/file-manager/PropertiesDialog';
import { FolderGlobeOverlay } from '@/components/file-manager/FolderGlobeOverlay';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  sizeBytes?: number;
  createdAt: string;
  updatedAt?: string;
}

interface DocItem {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  uploadedBy?: string;
  folderId?: string | null;
  productId?: string | null;
}

interface ProductItem {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  onboardingStatus?: string;
  productStatus?: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
}

interface WorkspaceUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role?: string;
}

type Section = 'all' | 'recent' | 'starred' | 'shared';
type ViewMode = 'grid' | 'list';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Notify the global Trash FAB (and anyone else listening) that the trash list changed. */
function notifyTrashChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qurelio:trash-changed'));
  }
}

function formatBytes(b?: number): string {
  if (!b || b < 0) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelative(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '-';
  const sameDay = (() => {
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  })();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function userDisplayName(u: WorkspaceUser | undefined): string {
  if (!u) return 'Someone';
  const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return full || u.email;
}

function userInitials(u: WorkspaceUser | undefined): string {
  if (!u) return '?';
  const f = (u.firstName ?? '').trim()[0];
  const l = (u.lastName ?? '').trim()[0];
  return ((f ?? '') + (l ?? '')).toUpperCase() || u.email[0].toUpperCase();
}

// ────────────────────────────────────────────────────────────────────────────
// Local storage helpers (starred + recent + shared flags)
// ────────────────────────────────────────────────────────────────────────────

const LS_STARRED = 'qurelio-fm-starred';
const LS_SHARED = 'qurelio-fm-shared-flags';
const LS_SHARED_USERS = 'qurelio-fm-shared-users';
const LS_RECENT = 'qurelio-fm-recent';
const LS_LAST_EDITOR = 'qurelio-fm-last-editor';
const LS_PINNED = 'qurelio-fm-pinned';

interface LastEditor {
  userId: string;
  at: string;
}

function readLastEditors(): Record<string, LastEditor> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_LAST_EDITOR);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, LastEditor>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function readStringMap(key: string): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, string[]>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writeStringMap(key: string, map: Record<string, string[]>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function readStringSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeStringSet(key: string, set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

interface RecentEvent {
  kind: 'd' | 'f';
  id: string;
  at: number;
}

function readRecent(): RecentEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_RECENT);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentEvent[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pushRecent(kind: 'd' | 'f', id: string) {
  if (typeof window === 'undefined') return;
  const all = readRecent().filter((e) => !(e.kind === kind && e.id === id));
  all.unshift({ kind, id, at: Date.now() });
  try {
    window.localStorage.setItem(LS_RECENT, JSON.stringify(all.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

/**
 * Floating shell for the right-click menu. Renders at the click coordinates,
 * then measures itself and adjusts position so it stays inside the viewport
 * (and never far from the cursor when there's plenty of room).
 */
function ContextMenuShell({
  anchorX,
  anchorY,
  children,
}: {
  anchorX: number;
  anchorY: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchorX, top: anchorY });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    let left = anchorX;
    let top = anchorY;
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    setPos({ left, top });
  }, [anchorX, anchorY]);

  if (!mounted || typeof document === 'undefined') return null;

  // Portal to <body> so the menu is positioned against the viewport regardless of
  // any transformed/filtered ancestors in the dashboard shell.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[95] w-[220px] rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.35)]"
    >
      {children}
    </div>,
    document.body,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function FileManagerView() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);

  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [allDocs, setAllDocs] = useState<DocItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<Section>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');

  // 3-D globe folder browser: id of the folder shown in the globe (null = closed).
  const [globeRootId, setGlobeRootId] = useState<string | null>(null);
  // Distinguish a single click (open globe) from a double click (drill into grid).
  const folderClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importDocs, setImportDocs] = useState<DocItem[]>([]);
  const [importQuery, setImportQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Marquee (rubber-band) selection: like Windows Explorer.
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const marqueeStartRef = useRef<{
    x: number;
    y: number;
    additive: boolean;
    baseline: Set<string>;
  } | null>(null);

  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [sharedFlags, setSharedFlags] = useState<Set<string>>(new Set());
  const [sharedUsers, setSharedUsers] = useState<Record<string, string[]>>({});
  const [lastEditors, setLastEditors] = useState<Record<string, LastEditor>>({});
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);

  // Right-click context menu + clipboard
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    kind: 'f' | 'd';
    id: string;
  } | null>(null);
  const [clipboard, setClipboard] = useState<{
    mode: 'copy' | 'cut';
    keys: string[];
  } | null>(null);
  const [propsTarget, setPropsTarget] = useState<{ kind: 'f' | 'd'; id: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── Load starred / shared flags from localStorage on mount ──────────────
  useEffect(() => {
    setStarred(readStringSet(LS_STARRED));
    setPinned(readStringSet(LS_PINNED));
    setSharedFlags(readStringSet(LS_SHARED));
    setSharedUsers(readStringMap(LS_SHARED_USERS));
    setLastEditors(readLastEditors());
    const onUpdate = () => setLastEditors(readLastEditors());
    if (typeof window !== 'undefined') {
      window.addEventListener('qurelio-fm-last-editor-updated', onUpdate);
      return () => window.removeEventListener('qurelio-fm-last-editor-updated', onUpdate);
    }
  }, []);

  // ── Persist starred / shared flags ──────────────────────────────────────
  useEffect(() => {
    writeStringSet(LS_STARRED, starred);
  }, [starred]);
  useEffect(() => {
    writeStringSet(LS_PINNED, pinned);
  }, [pinned]);
  useEffect(() => {
    writeStringSet(LS_SHARED, sharedFlags);
  }, [sharedFlags]);
  useEffect(() => {
    writeStringMap(LS_SHARED_USERS, sharedUsers);
  }, [sharedUsers]);

  // ── Workspace users (for "uploaded by" display) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await companyApi.getUsers();
        const raw = r.data as { users?: WorkspaceUser[] } | WorkspaceUser[];
        const list = Array.isArray(raw) ? raw : raw.users ?? [];
        if (!cancelled) setUsers(list);
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usersById = useMemo(() => {
    const m = new Map<string, WorkspaceUser>();
    users.forEach((u) => m.set(u.id, u));
    if (me) m.set(me.id, me as unknown as WorkspaceUser);
    return m;
  }, [users, me]);

  const foldersById = useMemo(() => {
    const m = new Map<string, FolderNode>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  const breadcrumb = useMemo(() => {
    const chain: FolderNode[] = [];
    let id = currentId;
    while (id) {
      const f = foldersById.get(id);
      if (!f) break;
      chain.unshift(f);
      id = f.parentId;
    }
    return chain;
  }, [currentId, foldersById]);

  const subfolders = useMemo(
    () =>
      folders
        .filter((f) => (f.parentId ?? null) === currentId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentId],
  );

  // ── API loaders ─────────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    const { data } = await folderApi.list();
    setFolders(Array.isArray(data) ? data : []);
  }, []);

  const loadDocs = useCallback(async (folderId: string | null) => {
    const { data } = await documentApi.list({ folderId: folderId ?? 'none' });
    setDocs(Array.isArray(data) ? data : []);
  }, []);

  const loadAllDocs = useCallback(async () => {
    try {
      const { data } = await documentApi.list({});
      setAllDocs(Array.isArray(data) ? data : []);
    } catch {
      setAllDocs([]);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const { data } = await productApi.list();
      const list = Array.isArray(data) ? data : [];
      setProducts(list.filter((p: ProductItem) => !p.archivedAt));
    } catch {
      setProducts([]);
    }
  }, []);

  const refresh = useCallback(
    async (folderId: string | null) => {
      setError(null);
      try {
        await Promise.all([loadFolders(), loadDocs(folderId), loadAllDocs(), loadProducts()]);
      } catch {
        setError('Could not load the File Manager. Please retry.');
      }
    },
    [loadFolders, loadDocs, loadAllDocs, loadProducts],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh(null);
      setLoading(false);
    })();
  }, [refresh]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const navigate = useCallback(
    async (folderId: string | null) => {
      setCurrentId(folderId);
      setCurrentProductId(null);
      setSelected(new Set());
      setLoading(true);
      await Promise.all([loadDocs(folderId), loadAllDocs()]);
      setLoading(false);
    },
    [loadDocs, loadAllDocs],
  );

  const navigateToProduct = useCallback(
    async (productId: string) => {
      setCurrentId(null);
      setCurrentProductId(productId);
      setSelected(new Set());
      setLoading(true);
      try {
        const { data } = await documentApi.list({ productId });
        setDocs(Array.isArray(data) ? data : []);
        await loadAllDocs();
      } catch {
        setDocs([]);
      }
      setLoading(false);
    },
    [loadAllDocs],
  );

  const openEditor = useCallback(
    (id: string) => {
      pushRecent('d', id);
      router.push(`/file-manager/edit/${id}`);
    },
    [router],
  );

  // Folder card/row: single click → open the 3-D globe browser; double click →
  // drill into the classic grid. A short timer disambiguates the two.
  const handleFolderClick = useCallback((folderId: string) => {
    if (folderClickTimer.current) {
      clearTimeout(folderClickTimer.current);
      folderClickTimer.current = null;
      return; // second click of a double-click: let onDoubleClick handle it
    }
    folderClickTimer.current = setTimeout(() => {
      folderClickTimer.current = null;
      setGlobeRootId(folderId);
    }, 220);
  }, []);

  const handleFolderDoubleClick = useCallback(
    (folderId: string) => {
      if (folderClickTimer.current) {
        clearTimeout(folderClickTimer.current);
        folderClickTimer.current = null;
      }
      setSection('all');
      void navigate(folderId);
    },
    [navigate],
  );

  // Fetch the documents inside a folder for the globe overlay.
  const loadFolderDocs = useCallback(async (folderId: string): Promise<DocItem[]> => {
    const { data } = await documentApi.list({ folderId: folderId ?? 'none' });
    return Array.isArray(data) ? data : [];
  }, []);

  useEffect(() => {
    const timer = folderClickTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // ── Star toggle ─────────────────────────────────────────────────────────
  const toggleStar = useCallback((key: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const togglePin = useCallback((key: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Marquee (rubber-band) selection ─────────────────────────────────────
  const handleMarqueeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only start on a primary click on the container background itself,
      // ignore clicks on items, buttons, inputs, or anything draggable.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-fm-item]')) return;
      if (target.closest('button, input, textarea, a, [data-fm-no-marquee]')) return;
      const wrapper = contentScrollRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const startX = e.clientX - rect.left + wrapper.scrollLeft;
      const startY = e.clientY - rect.top + wrapper.scrollTop;
      marqueeStartRef.current = {
        x: startX,
        y: startY,
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
        baseline: e.shiftKey || e.ctrlKey || e.metaKey ? new Set(selected) : new Set(),
      };
      setMarquee({ x: startX, y: startY, w: 0, h: 0 });
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
        setSelected(new Set());
      }
      e.preventDefault();
    },
    [selected],
  );

  // Hit-test items inside the wrapper against a rectangle (in wrapper-content coords).
  const computeHits = useCallback((rect: { x: number; y: number; w: number; h: number }): Set<string> => {
    const hits = new Set<string>();
    const wrapper = contentScrollRef.current;
    if (!wrapper) return hits;
    const wrapperRect = wrapper.getBoundingClientRect();
    const items = wrapper.querySelectorAll<HTMLElement>('[data-fm-item]');
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      // Convert item bounds to wrapper-content coords (account for scroll).
      const ix = r.left - wrapperRect.left + wrapper.scrollLeft;
      const iy = r.top - wrapperRect.top + wrapper.scrollTop;
      const iw = r.width;
      const ih = r.height;
      const overlap =
        rect.x < ix + iw && rect.x + rect.w > ix && rect.y < iy + ih && rect.y + rect.h > iy;
      if (overlap) {
        const k = el.dataset.fmKey;
        if (k) hits.add(k);
      }
    });
    return hits;
  }, []);

  const marqueeActive = marquee !== null;
  useEffect(() => {
    if (!marqueeActive) return;
    const onMove = (e: MouseEvent) => {
      const start = marqueeStartRef.current;
      const wrapper = contentScrollRef.current;
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
      // Suppress the click that follows a non-trivial drag so we don't
      // accidentally open a file the marquee just passed over.
      const m = marquee;
      if (m && (m.w > 4 || m.h > 4)) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener('click', swallow, true);
        };
        window.addEventListener('click', swallow, true);
      }
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

  // ── Selection ───────────────────────────────────────────────────────────
  const toggleSel = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Folder CRUD ─────────────────────────────────────────────────────────
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { data: created } = await folderApi.create({ name, parentId: currentId });
      setNewFolderName('');
      setCreating(false);
      await loadFolders();
      const newId = (created as { id?: string } | null)?.id;
      if (newId) {
        await navigate(newId);
      }
    } catch {
      setError('Could not create the folder (duplicate name?).');
    } finally {
      setBusy(false);
    }
  }, [newFolderName, currentId, loadFolders, navigate]);

  const handleRename = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      if (!name) return;
      setBusy(true);
      try {
        await folderApi.update(id, { name });
        setRenameId(null);
        await loadFolders();
      } catch {
        setError('Could not rename the folder.');
      } finally {
        setBusy(false);
      }
    },
    [renameValue, loadFolders],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (
        !window.confirm('Delete this folder and its sub-folders? Files inside are kept and moved out.')
      )
        return;
      setBusy(true);
      try {
        await folderApi.delete(id);
        // Folders themselves aren't archived, but any docs that were inside may now be
        // unfiled: refresh the FAB count just in case.
        notifyTrashChanged();
        if (currentId === id) setCurrentId(foldersById.get(id)?.parentId ?? null);
        await refresh(currentId === id ? foldersById.get(id)?.parentId ?? null : currentId);
      } catch {
        setError('Could not delete the folder.');
      } finally {
        setBusy(false);
      }
    },
    [currentId, foldersById, refresh],
  );

  // ── Upload & move ──────────────────────────────────────────────────────
  const uploadFolderStructure = useCallback(
    async (files: File[]) => {
      setBusy(true);
      try {
        const folderPaths = new Set<string>();
        for (const f of files) {
          const parts = f.webkitRelativePath.split('/');
          for (let i = 1; i < parts.length; i++) {
            folderPaths.add(parts.slice(0, i).join('/'));
          }
        }

        const sortedPaths = [...folderPaths].sort(
          (a, b) => a.split('/').length - b.split('/').length,
        );

        const folderIdMap = new Map<string, string>();
        let rootParentId = currentId;

        for (const path of sortedPaths) {
          const parts = path.split('/');
          const name = parts[parts.length - 1];
          const parentPath = parts.slice(0, -1).join('/');
          const parentId = parentPath ? folderIdMap.get(parentPath) ?? null : rootParentId;
          const { data } = await folderApi.create({ name, parentId });
          const newFolder = data as { id: string };
          folderIdMap.set(path, newFolder.id);
        }

        for (const f of files) {
          const parts = f.webkitRelativePath.split('/');
          const folderPath = parts.slice(0, -1).join('/');
          const folderId = folderPath ? folderIdMap.get(folderPath) ?? null : rootParentId;
          const fd = new FormData();
          fd.append('file', f);
          fd.append('type', 'EVIDENCE');
          fd.append('description', 'File Manager');
          if (folderId) fd.append('folderId', folderId);
          const r = await documentApi.upload(fd);
          const uploaded = (r.data as { id?: string } | null)?.id;
          if (uploaded) pushRecent('d', uploaded);
        }

        await refresh(currentId);
      } catch {
        setError('Some files could not be uploaded.');
      } finally {
        setBusy(false);
      }
    },
    [currentId, refresh],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      const hasFolderPath = arr.some((f) => f.webkitRelativePath);
      if (hasFolderPath) {
        await uploadFolderStructure(arr);
        return;
      }
      setBusy(true);
      try {
        for (const f of arr) {
          const fd = new FormData();
          fd.append('file', f);
          fd.append('type', 'EVIDENCE');
          fd.append('description', 'File Manager');
          if (currentId) fd.append('folderId', currentId);
          const r = await documentApi.upload(fd);
          const uploaded = (r.data as { id?: string } | null)?.id;
          if (uploaded) pushRecent('d', uploaded);
        }
        await refresh(currentId);
      } catch {
        setError('Some files could not be uploaded.');
      } finally {
        setBusy(false);
      }
    },
    [currentId, uploadFolderStructure, refresh],
  );

  const moveDoc = useCallback(
    async (docId: string, folderId: string | null) => {
      setBusy(true);
      try {
        await documentApi.moveToFolder(docId, folderId);
        await refresh(currentId);
      } catch {
        setError('Could not move the document.');
      } finally {
        setBusy(false);
      }
    },
    [currentId, refresh],
  );

  const openImport = useCallback(async () => {
    setImportOpen(true);
    try {
      const { data } = await documentApi.list({ folderId: 'none' });
      setImportDocs(Array.isArray(data) ? data : []);
    } catch {
      setImportDocs([]);
    }
  }, []);

  const deleteFile = useCallback(
    async (id: string) => {
      if (!window.confirm('Move this file to trash?')) return;
      setBusy(true);
      try {
        await documentApi.delete(id);
        notifyTrashChanged();
        await refresh(currentId);
      } catch {
        setError('Could not delete the file.');
      } finally {
        setBusy(false);
      }
    },
    [currentId, refresh],
  );

  const handleBulkDelete = useCallback(async () => {
    const folderIds = [...selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2));
    const docIds = [...selected].filter((k) => k.startsWith('d:')).map((k) => k.slice(2));
    if (!folderIds.length && !docIds.length) return;
    if (
      !window.confirm(
        `Delete ${folderIds.length} folder(s) and ${docIds.length} file(s)? Files in deleted folders are kept and moved out.`,
      )
    )
      return;
    setBusy(true);
    try {
      for (const id of docIds) await documentApi.delete(id);
      for (const id of folderIds) await folderApi.delete(id);
      if (docIds.length > 0) notifyTrashChanged();
      setSelected(new Set());
      await refresh(currentId);
    } catch {
      setError('Could not delete the selected items.');
    } finally {
      setBusy(false);
    }
  }, [selected, currentId, refresh]);

  const handleBulkMove = useCallback(
    async (destFolderId: string | null) => {
      const folderIds = [...selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2));
      const docIds = [...selected].filter((k) => k.startsWith('d:')).map((k) => k.slice(2));
      if (!folderIds.length && !docIds.length) return;
      // A folder cannot be moved into itself or one of its descendants, block obvious cases.
      if (destFolderId && folderIds.includes(destFolderId)) {
        setError("A folder can't be moved into itself.");
        return;
      }
      setBusy(true);
      try {
        for (const id of docIds) await documentApi.moveToFolder(id, destFolderId);
        for (const id of folderIds) {
          try {
            await folderApi.update(id, { parentId: destFolderId });
          } catch {
            /* ignore per-folder failure */
          }
        }
        setSelected(new Set());
        setMoveOpen(false);
        await refresh(currentId);
      } catch {
        setError('Could not move some of the selected items.');
      } finally {
        setBusy(false);
      }
    },
    [selected, currentId, refresh],
  );

  // ── Context menu (right-click) ──────────────────────────────────────────
  const openContextMenu = useCallback(
    (e: React.MouseEvent, kind: 'f' | 'd', id: string) => {
      e.preventDefault();
      e.stopPropagation();
      // If the user right-clicked an unselected item, make it the only selected item.
      const key = `${kind}:${id}`;
      if (!selected.has(key)) {
        setSelected(new Set([key]));
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, kind, id });
    },
    [selected],
  );

  // Close context menu on outside click / Esc / scroll. Attach AFTER the current
  // event loop tick so the right-click's own mousedown doesn't immediately close it.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const t = window.setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('scroll', close, true);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  // Cut / Copy: stash the current selection in the in-app clipboard.
  const handleCut = useCallback(() => {
    if (selected.size === 0) return;
    setClipboard({ mode: 'cut', keys: [...selected] });
    setCtxMenu(null);
  }, [selected]);

  const handleCopy = useCallback(() => {
    if (selected.size === 0) return;
    setClipboard({ mode: 'copy', keys: [...selected] });
    setCtxMenu(null);
  }, [selected]);

  // Paste: cut → move into current folder; copy → duplicate each file by re-uploading.
  const handlePaste = useCallback(async () => {
    if (!clipboard || clipboard.keys.length === 0) return;
    setCtxMenu(null);
    setBusy(true);
    try {
      const folderIds = clipboard.keys.filter((k) => k.startsWith('f:')).map((k) => k.slice(2));
      const docIds = clipboard.keys.filter((k) => k.startsWith('d:')).map((k) => k.slice(2));

      if (clipboard.mode === 'cut') {
        for (const id of docIds) await documentApi.moveToFolder(id, currentId);
        for (const id of folderIds) {
          try {
            await folderApi.update(id, { parentId: currentId });
          } catch {
            /* ignore */
          }
        }
      } else {
        // Copy files: re-upload the same bytes into the current folder.
        // Folder copy isn't supported: backend has no recursive duplicate endpoint.
        for (const id of docIds) {
          try {
            const meta = await documentApi.get(id);
            const m = meta.data as { name: string; mimeType?: string };
            const r = await documentApi.getDownload(id);
            const blob = r.data as Blob;
            const fd = new FormData();
            fd.append(
              'file',
              new File([blob], `Copy of ${m.name}`, { type: m.mimeType || 'application/octet-stream' }),
            );
            fd.append('type', 'EVIDENCE');
            fd.append('description', 'File Manager');
            if (currentId) fd.append('folderId', currentId);
            await documentApi.upload(fd);
          } catch {
            setError('Some files could not be copied.');
          }
        }
        if (folderIds.length > 0) {
          setError('Folders can only be cut/pasted, not copied.');
        }
      }

      setClipboard(null);
      setSelected(new Set());
      await refresh(currentId);
    } finally {
      setBusy(false);
    }
  }, [clipboard, currentId, refresh]);

  const clipboardKeys = useMemo(() => new Set(clipboard?.keys ?? []), [clipboard]);

  // Ctrl+X / Ctrl+C / Ctrl+V keyboard shortcuts (ignore when the user is typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'x') {
        if (selected.size === 0) return;
        e.preventDefault();
        handleCut();
      } else if (k === 'c') {
        if (selected.size === 0) return;
        e.preventDefault();
        handleCopy();
      } else if (k === 'v') {
        if (!clipboard) return;
        e.preventDefault();
        void handlePaste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, clipboard, handleCut, handleCopy, handlePaste]);

  const handleBulkStar = useCallback(() => {
    setStarred((prev) => {
      const next = new Set(prev);
      selected.forEach((k) => next.add(k));
      return next;
    });
  }, [selected]);

  // ── Visible items based on section + query ──────────────────────────────
  const visible = useMemo(() => {
    let visFolders: FolderNode[] = [];
    let visProducts: ProductItem[] = [];
    let visDocs: DocItem[] = [];

    switch (section) {
      case 'all': {
        if (currentProductId) {
          // Inside a product folder: show only that product's docs
          visDocs = docs;
        } else {
          visFolders = subfolders;
          // Show products at root level (when not inside a regular folder)
          if (currentId === null) {
            visProducts = products;
            visDocs = []; // Hide individual files at root, only folders + products
          } else {
            visDocs = docs;
          }
        }
        break;
      }
      case 'recent': {
        const recent = readRecent();
        const recentDocIds = recent.filter((e) => e.kind === 'd').map((e) => e.id);
        const idIndex = new Map(recentDocIds.map((id, i) => [id, i]));
        const byId = new Map(allDocs.map((d) => [d.id, d]));
        // Recent docs (from event log) + recently created docs not yet opened
        const fromEvents = recentDocIds
          .map((id) => byId.get(id))
          .filter((x): x is DocItem => Boolean(x));
        const knownIds = new Set(fromEvents.map((d) => d.id));
        const fromCreation = [...allDocs]
          .filter((d) => !knownIds.has(d.id))
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          .slice(0, 30);
        visDocs = [...fromEvents, ...fromCreation].slice(0, 50);
        // Order by event timestamp when known, otherwise by createdAt
        visDocs.sort((a, b) => {
          const ai = idIndex.get(a.id);
          const bi = idIndex.get(b.id);
          if (ai !== undefined && bi !== undefined) return ai - bi;
          if (ai !== undefined) return -1;
          if (bi !== undefined) return 1;
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        });
        break;
      }
      case 'starred': {
        visFolders = folders.filter((f) => starred.has(`f:${f.id}`));
        visDocs = allDocs.filter((d) => starred.has(`d:${d.id}`));
        break;
      }
      case 'shared': {
        // Files shared *with me* (uploaded by someone else, visible thanks to ACL)
        // plus files I shared (tracked via local sharedFlags).
        visDocs = allDocs.filter(
          (d) => (me?.id && d.uploadedBy && d.uploadedBy !== me.id) || sharedFlags.has(d.id),
        );
        break;
      }
    }

    const q = query.trim().toLowerCase();
    if (q) {
      visFolders = visFolders.filter((f) => f.name.toLowerCase().includes(q));
      visProducts = visProducts.filter((p) => p.name.toLowerCase().includes(q));
      visDocs = visDocs.filter((d) => d.name.toLowerCase().includes(q));
    }
    // Stable-sort: pinned items first within each group, original order preserved otherwise.
    visFolders = [...visFolders].sort((a, b) => {
      const ap = pinned.has(`f:${a.id}`) ? 0 : 1;
      const bp = pinned.has(`f:${b.id}`) ? 0 : 1;
      return ap - bp;
    });
    visProducts = [...visProducts].sort((a, b) => {
      const ap = pinned.has(`p:${a.id}`) ? 0 : 1;
      const bp = pinned.has(`p:${b.id}`) ? 0 : 1;
      return ap - bp;
    });
    visDocs = [...visDocs].sort((a, b) => {
      const ap = pinned.has(`d:${a.id}`) ? 0 : 1;
      const bp = pinned.has(`d:${b.id}`) ? 0 : 1;
      return ap - bp;
    });
    return { folders: visFolders, products: visProducts, docs: visDocs };
  }, [section, subfolders, docs, allDocs, folders, products, currentId, currentProductId, starred, sharedFlags, query, me?.id, pinned]);

  const allKeys = useMemo(
    () => [
      ...visible.folders.map((f) => `f:${f.id}`),
      ...visible.products.map((p) => `p:${p.id}`),
      ...visible.docs.map((d) => `d:${d.id}`),
    ],
    [visible],
  );
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (allKeys.length > 0 && allKeys.every((k) => prev.has(k))) return new Set();
      return new Set(allKeys);
    });
  }, [allKeys]);

  // ── Storage stats ───────────────────────────────────────────────────────
  const STORAGE_QUOTA = 10 * 1024 * 1024 * 1024; // 10 GB
  const storageUsed = useMemo(
    () => allDocs.reduce((sum, d) => sum + (Number(d.sizeBytes) || 0), 0),
    [allDocs],
  );
  const storagePct = Math.min(100, (storageUsed / STORAGE_QUOTA) * 100);

  // Docs flagged as shared (by me) OR shared with me (uploaded by someone else).
  const sharedDocIds = useMemo(() => {
    const s = new Set<string>(sharedFlags);
    if (me?.id) {
      for (const d of allDocs) {
        if (d.uploadedBy && d.uploadedBy !== me.id) s.add(d.id);
      }
    }
    return s;
  }, [allDocs, sharedFlags, me?.id]);

  // ── Counts for the side nav ─────────────────────────────────────────────
  const counts = useMemo(
    () => ({
      all: folders.length + products.length + allDocs.length,
      recent: Math.min(50, allDocs.length),
      starred: starred.size,
      shared: sharedDocIds.size,
    }),
    [folders.length, products.length, allDocs.length, starred.size, sharedDocIds.size],
  );

  // ── Renderers ───────────────────────────────────────────────────────────

  const renderFolderCard = (f: FolderNode) => {
    const key = `f:${f.id}`;
    const checked = selected.has(key);
    const isStarred = starred.has(key);
    const isPinned = pinned.has(key);
    const isCut = clipboard?.mode === 'cut' && clipboardKeys.has(key);
    return (
      <div
        key={f.id}
        data-fm-item
        data-fm-key={key}
        onContextMenu={(e) => openContextMenu(e, 'f', f.id)}
        onDoubleClick={() => handleFolderDoubleClick(f.id)}
        onDragOver={(e) => {
          if (draggingDocId) {
            e.preventDefault();
            setDragOverFolderId(f.id);
          }
        }}
        onDragLeave={() => setDragOverFolderId((cur) => (cur === f.id ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverFolderId(null);
          if (draggingDocId) {
            void moveDoc(draggingDocId, f.id);
            setDraggingDocId(null);
          }
        }}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border bg-[var(--surface)] p-2.5 transition-all duration-150',
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
            : dragOverFolderId === f.id
            ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20'
            : 'border-[var(--border)]/60 hover:border-[var(--brand-primary)]/40 hover:shadow-sm',
          isCut && 'opacity-50',
        )}
        onClick={() => handleFolderClick(f.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(key);
          }}
          className={cn(
            'absolute left-2 top-2 cursor-pointer rounded-md p-1 transition-colors',
            isStarred
              ? 'text-amber-500'
              : 'text-[var(--muted)] opacity-0 hover:text-amber-500 group-hover:opacity-100',
          )}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          <Star
            className="h-4 w-4"
            style={isStarred ? { fill: 'currentColor' } : undefined}
          />
        </button>
        <input
          type="checkbox"
          aria-label={`Select ${f.name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(key)}
          className={cn(
            'absolute right-2 top-2 h-4 w-4 cursor-pointer accent-[var(--brand-primary)]',
            checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
        {isPinned && (
          <span
            title="Pinned to top"
            className="absolute left-2 top-7 inline-flex items-center justify-center text-[var(--brand-primary)]"
            aria-hidden
          >
            <Pin className="h-3.5 w-3.5" />
          </span>
        )}
        <FolderGlyph size={42} className="mt-2" />
        <p className="line-clamp-1 text-center text-[13px] font-semibold text-[var(--text-primary)]">
          {f.name}
        </p>
        <p className="text-[11px] text-[var(--muted)]">{formatRelative(f.updatedAt || f.createdAt)}</p>
        {f.fileCount > 0 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-[var(--page-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            <FileText className="h-2.5 w-2.5" />
            {f.fileCount}
          </span>
        )}
      </div>
    );
  };

  const renderProductCard = (p: ProductItem) => {
    const key = `p:${p.id}`;
    const checked = selected.has(key);
    const isPinned = pinned.has(key);
    const docCount = allDocs.filter((d) => d.productId === p.id).length;
    const statusLabel =
      p.onboardingStatus === 'COMPLETED'
        ? 'Complete'
        : p.onboardingStatus === 'IN_PROGRESS'
        ? 'In progress'
        : 'Draft';
    return (
      <div
        key={p.id}
        data-fm-item
        data-fm-key={key}
        onContextMenu={(e) => openContextMenu(e, 'f', p.id)}
        onDoubleClick={() => void navigateToProduct(p.id)}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border bg-[var(--surface)] p-2.5 transition-all duration-150',
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
            : 'border-[var(--border)]/60 hover:border-[var(--brand-primary)]/40 hover:shadow-sm',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(key);
          }}
          className={cn(
            'absolute left-2 top-2 cursor-pointer rounded-md p-1 transition-colors',
            starred.has(key)
              ? 'text-amber-500'
              : 'text-[var(--muted)] opacity-0 hover:text-amber-500 group-hover:opacity-100',
          )}
          aria-label={starred.has(key) ? 'Unstar' : 'Star'}
        >
          <Star className="h-4 w-4" style={starred.has(key) ? { fill: 'currentColor' } : undefined} />
        </button>
        <input
          type="checkbox"
          aria-label={`Select product ${p.name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(key)}
          className={cn(
            'absolute right-2 top-2 h-4 w-4 cursor-pointer accent-[var(--brand-primary)]',
            checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
        {isPinned && (
          <span
            title="Pinned to top"
            className="absolute left-2 top-7 inline-flex items-center justify-center text-[var(--brand-primary)]"
            aria-hidden
          >
            <Pin className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="mt-2 flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-[var(--brand-primary)]/10">
          <FolderGlyph size={30} className="text-[var(--brand-primary)]" />
        </div>
        <p className="line-clamp-1 text-center text-[13px] font-semibold text-[var(--text-primary)]">
          {p.name}
        </p>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            p.onboardingStatus === 'COMPLETED'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : p.onboardingStatus === 'IN_PROGRESS'
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'bg-[var(--muted)]/10 text-[var(--muted)]',
          )}
        >
          {statusLabel}
        </span>
        {docCount > 0 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-[var(--page-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            <FileText className="h-2.5 w-2.5" />
            {docCount}
          </span>
        )}
      </div>
    );
  };

  const renderDocCard = (d: DocItem) => {
    const key = `d:${d.id}`;
    const checked = selected.has(key);
    const isStarred = starred.has(key);
    const isPinned = pinned.has(key);
    const isShared = sharedDocIds.has(d.id);
    const isCut = clipboard?.mode === 'cut' && clipboardKeys.has(key);
    return (
      <div
        key={d.id}
        data-fm-item
        data-fm-key={key}
        draggable
        onDragStart={() => setDraggingDocId(d.id)}
        onDragEnd={() => setDraggingDocId(null)}
        onContextMenu={(e) => openContextMenu(e, 'd', d.id)}
        onDoubleClick={() => openEditor(d.id)}
        onClick={() => openEditor(d.id)}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border bg-[var(--surface)] p-2.5 transition-all duration-150',
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
            : 'border-[var(--border)]/60 hover:border-[var(--brand-primary)]/40 hover:shadow-sm',
          isCut && 'opacity-50',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(key);
          }}
          className={cn(
            'absolute left-2 top-2 cursor-pointer rounded-md p-1 transition-colors',
            isStarred
              ? 'text-amber-500'
              : 'text-[var(--muted)] opacity-0 hover:text-amber-500 group-hover:opacity-100',
          )}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          <Star className="h-4 w-4" style={isStarred ? { fill: 'currentColor' } : undefined} />
        </button>
        <input
          type="checkbox"
          aria-label={`Select ${d.name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(key)}
          className={cn(
            'absolute right-2 top-2 h-4 w-4 cursor-pointer accent-[var(--brand-primary)]',
            checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
        {isPinned && (
          <span
            title="Pinned to top"
            className="absolute left-2 top-7 inline-flex items-center justify-center text-[var(--brand-primary)]"
            aria-hidden
          >
            <Pin className="h-3.5 w-3.5" />
          </span>
        )}
        <FileGlyph name={d.name} mime={d.mimeType} size={42} className="mt-2" />
        <p className="line-clamp-1 text-center text-[13px] font-semibold text-[var(--text-primary)]">
          {d.name}
        </p>
        <p className="text-[11px] text-[var(--muted)]">{formatBytes(d.sizeBytes)}</p>
        {(() => {
          const le = lastEditors[d.id];
          if (!le?.userId || le.userId === d.uploadedBy) return null;
          const u = usersById.get(le.userId);
          if (!u) return null;
          return (
            <span
              title={`Edited by ${userDisplayName(u)} · ${formatRelative(le.at)}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
            >
              <Edit className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">Edited by {userDisplayName(u)}</span>
            </span>
          );
        })()}
        {isShared && (() => {
          const ids = sharedUsers[d.id] ?? (d.uploadedBy ? [d.uploadedBy] : []);
          const us = ids.map((id) => usersById.get(id)).filter(Boolean) as WorkspaceUser[];
          const title =
            us.length === 0
              ? 'Shared'
              : us.map(userDisplayName).join(', ');
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShareDocId(d.id);
              }}
              className="absolute bottom-2 right-2 inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--brand-primary)]/10 px-1.5 py-0.5 transition-colors hover:bg-[var(--brand-primary)]/20"
              title={title}
            >
              <div className="flex -space-x-1.5">
                {us.slice(0, 3).map((u) => (
                  <span
                    key={u.id}
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--surface)] bg-[var(--brand-primary)] text-[8px] font-semibold text-white"
                  >
                    {userInitials(u)}
                  </span>
                ))}
                {us.length === 0 && (
                  <Users className="h-3 w-3 text-[var(--brand-primary)]" />
                )}
              </div>
              {us.length > 3 && (
                <span className="text-[9px] font-semibold text-[var(--brand-primary)]">
                  +{us.length - 3}
                </span>
              )}
            </button>
          );
        })()}
      </div>
    );
  };

  const renderFolderRow = (f: FolderNode) => {
    const key = `f:${f.id}`;
    const checked = selected.has(key);
    const isStarred = starred.has(key);
    const isCut = clipboard?.mode === 'cut' && clipboardKeys.has(key);
    return (
      <div
        key={f.id}
        data-fm-item
        data-fm-key={key}
        onContextMenu={(e) => openContextMenu(e, 'f', f.id)}
        onDoubleClick={() => handleFolderDoubleClick(f.id)}
        onDragOver={(e) => {
          if (draggingDocId) {
            e.preventDefault();
            setDragOverFolderId(f.id);
          }
        }}
        onDragLeave={() => setDragOverFolderId((cur) => (cur === f.id ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverFolderId(null);
          if (draggingDocId) {
            void moveDoc(draggingDocId, f.id);
            setDraggingDocId(null);
          }
        }}
        className={cn(
          'group grid cursor-pointer grid-cols-[28px_20px_1fr_120px_120px_84px] items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-150 sm:grid-cols-[28px_20px_1fr_140px_140px_120px_96px]',
          checked
            ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5'
            : dragOverFolderId === f.id
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
            : 'border-[var(--border)]/60 bg-[var(--surface)] hover:border-[var(--brand-primary)]/30 hover:bg-[var(--nav-hover)]/30',
          isCut && 'opacity-50',
        )}
      >
        <input
          type="checkbox"
          aria-label={`Select ${f.name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(key)}
          className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(key);
          }}
          className={cn(
            'cursor-pointer rounded-md p-0.5 transition-colors',
            isStarred ? 'text-amber-500' : 'text-[var(--muted)] hover:text-amber-500',
          )}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          <Star className="h-4 w-4" style={isStarred ? { fill: 'currentColor' } : undefined} />
        </button>
        <div
          className="flex min-w-0 items-center gap-2.5"
          onClick={() => handleFolderClick(f.id)}
        >
          <FolderGlyph size={22} className="shrink-0" />
          {pinned.has(`f:${f.id}`) && (
            <Pin
              className="h-3 w-3 shrink-0 text-[var(--brand-primary)]"
              aria-hidden
            />
          )}
          {renameId === f.id ? (
            <input
              autoFocus
              value={renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRename(f.id);
                if (e.key === 'Escape') setRenameId(null);
              }}
              onBlur={() => void handleRename(f.id)}
              className="min-w-0 rounded-md border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-[13px] outline-none focus:border-[var(--brand-primary)]"
            />
          ) : (
            <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]" title={f.name}>
              {f.name}
            </span>
          )}
        </div>
        <span className="hidden text-[12px] text-[var(--muted)] sm:block">-</span>
        <span className="text-[12px] text-[var(--muted)]">{f.fileCount} item(s)</span>
        <span className="text-[12px] text-[var(--muted)]">{formatRelative(f.updatedAt || f.createdAt)}</span>
        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setRenameId(f.id);
              setRenameValue(f.name);
            }}
            className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteFolder(f.id);
            }}
            className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderProductRow = (p: ProductItem) => {
    const key = `p:${p.id}`;
    const checked = selected.has(key);
    const isPinned = pinned.has(key);
    const docCount = allDocs.filter((d) => d.productId === p.id).length;
    const statusLabel =
      p.onboardingStatus === 'COMPLETED'
        ? 'Complete'
        : p.onboardingStatus === 'IN_PROGRESS'
        ? 'In progress'
        : 'Draft';
    return (
      <div
        key={p.id}
        data-fm-item
        data-fm-key={key}
        onContextMenu={(e) => openContextMenu(e, 'f', p.id)}
        onDoubleClick={() => void navigateToProduct(p.id)}
        className={cn(
          'group grid cursor-pointer grid-cols-[28px_20px_1fr_120px_120px_84px] items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-150 sm:grid-cols-[28px_20px_1fr_140px_140px_120px_96px]',
          checked
            ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5'
            : 'border-[var(--border)]/60 bg-[var(--surface)] hover:border-[var(--brand-primary)]/30 hover:bg-[var(--nav-hover)]/30',
        )}
      >
        <input
          type="checkbox"
          aria-label={`Select product ${p.name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(key)}
          className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(key);
          }}
          className={cn(
            'cursor-pointer rounded-md p-0.5 transition-colors',
            starred.has(key) ? 'text-amber-500' : 'text-[var(--muted)] hover:text-amber-500',
          )}
          aria-label={starred.has(key) ? 'Unstar' : 'Star'}
        >
          <Star className="h-4 w-4" style={starred.has(key) ? { fill: 'currentColor' } : undefined} />
        </button>
        <div className="flex min-w-0 items-center gap-2.5" onClick={() => void navigateToProduct(p.id)}>
          <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--brand-primary)]/10">
            <FolderGlyph size={16} className="text-[var(--brand-primary)]" />
          </div>
          {isPinned && (
            <Pin className="h-3 w-3 shrink-0 text-[var(--brand-primary)]" aria-hidden />
          )}
          <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]" title={p.name}>
            {p.name}
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              p.onboardingStatus === 'COMPLETED'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : p.onboardingStatus === 'IN_PROGRESS'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'bg-[var(--muted)]/10 text-[var(--muted)]',
            )}
          >
            {statusLabel}
          </span>
        </div>
        <span className="hidden text-[12px] text-[var(--muted)] sm:block">{me?.company?.name || '-'}</span>
        <span className="text-[12px] text-[var(--muted)]">{docCount} file{docCount === 1 ? '' : 's'}</span>
        <span className="text-[12px] text-[var(--muted)]">{formatRelative(p.updatedAt || p.createdAt)}</span>
        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            title="Open"
            onClick={(e) => {
              e.stopPropagation();
              void navigateToProduct(p.id);
            }}
            className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderDocRow = (d: DocItem) => {
    const key = `d:${d.id}`;
    const checked = selected.has(key);
    const isStarred = starred.has(key);
    const isShared = sharedDocIds.has(d.id);
    const uploader = usersById.get(d.uploadedBy ?? '');
    return (
      <div
        key={d.id}
        data-fm-item
        data-fm-key={key}
        draggable
        onDragStart={() => setDraggingDocId(d.id)}
        onDragEnd={() => setDraggingDocId(null)}
        onContextMenu={(e) => openContextMenu(e, 'd', d.id)}
        onDoubleClick={() => openEditor(d.id)}
        className={cn(
          'group grid grid-cols-[28px_20px_1fr_120px_120px_84px] items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors duration-150 sm:grid-cols-[28px_20px_1fr_140px_140px_120px_96px]',
          checked
            ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/5'
            : 'border-[var(--border)]/60 bg-[var(--surface)] hover:border-[var(--brand-primary)]/30 hover:bg-[var(--nav-hover)]/30',
          (clipboard?.mode === 'cut' && clipboardKeys.has(key)) && 'opacity-50',
        )}
      >
        <input
          type="checkbox"
          aria-label={`Select ${d.name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(key)}
          className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleStar(key);
          }}
          className={cn(
            'cursor-pointer rounded-md p-0.5 transition-colors',
            isStarred ? 'text-amber-500' : 'text-[var(--muted)] hover:text-amber-500',
          )}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          <Star className="h-4 w-4" style={isStarred ? { fill: 'currentColor' } : undefined} />
        </button>
        <div
          className="flex min-w-0 cursor-pointer items-center gap-2.5"
          onClick={() => openEditor(d.id)}
          title="Open in editor"
        >
          <FileGlyph name={d.name} mime={d.mimeType} size={22} className="shrink-0" />
          {pinned.has(`d:${d.id}`) && (
            <Pin
              className="h-3 w-3 shrink-0 text-[var(--brand-primary)]"
              aria-hidden
            />
          )}
          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]" title={d.name}>
            {d.name}
          </span>
          {isShared && (() => {
            const ids = sharedUsers[d.id] ?? (d.uploadedBy ? [d.uploadedBy] : []);
            const us = ids.map((id) => usersById.get(id)).filter(Boolean) as WorkspaceUser[];
            const label =
              us.length === 0
                ? 'Shared'
                : us.length === 1
                ? userDisplayName(us[0])
                : `${userDisplayName(us[0])} +${us.length - 1}`;
            const title = us.length ? us.map(userDisplayName).join(', ') : 'Shared';
            return (
              <button
                type="button"
                title={title}
                onClick={(e) => {
                  e.stopPropagation();
                  setShareDocId(d.id);
                }}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--brand-primary)]/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/20"
              >
                <div className="flex -space-x-1.5">
                  {us.slice(0, 3).map((u) => (
                    <span
                      key={u.id}
                      className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--surface)] bg-[var(--brand-primary)] text-[8px] font-semibold text-white"
                    >
                      {userInitials(u)}
                    </span>
                  ))}
                  {us.length === 0 && <Users className="h-3 w-3" />}
                </div>
                <span className="max-w-[140px] truncate">{label}</span>
              </button>
            );
          })()}
          {(() => {
            const le = lastEditors[d.id];
            if (!le?.userId) return null;
            if (le.userId === d.uploadedBy) return null; // editor == owner, not interesting
            const u = usersById.get(le.userId);
            if (!u) return null;
            return (
              <span
                title={`Edited by ${userDisplayName(u)} · ${formatRelative(le.at)}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-400"
              >
                <Edit className="h-3 w-3" />
                <span className="max-w-[120px] truncate">Edited by {userDisplayName(u)}</span>
              </span>
            );
          })()}
        </div>
        <span className="hidden truncate text-[12px] text-[var(--muted)] sm:block" title={userDisplayName(uploader)}>
          {uploader ? userDisplayName(uploader) : '-'}
        </span>
        <span className="text-[12px] text-[var(--muted)]">{formatBytes(d.sizeBytes)}</span>
        <span className="text-[12px] text-[var(--muted)]" title={d.updatedAt || d.createdAt}>
          {formatRelative(d.updatedAt || d.createdAt)}
        </span>
        <div className="flex justify-end gap-0.5">
          <div className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button
              type="button"
              title="Share"
              onClick={(e) => {
                e.stopPropagation();
                setShareDocId(d.id);
              }}
              className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
            >
              <Users className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Edit in app"
              onClick={(e) => {
                e.stopPropagation();
                openEditor(d.id);
              }}
              className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
            >
              <Edit className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                void deleteFile(d.id);
              }}
              className="cursor-pointer rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Empty state per section
  const sectionEmpty = () => {
    const icon =
      section === 'starred' ? (
        <Star className="h-10 w-10 text-[var(--muted)]" />
      ) : section === 'shared' ? (
        <Users className="h-10 w-10 text-[var(--muted)]" />
      ) : section === 'recent' ? (
        <History className="h-10 w-10 text-[var(--muted)]" />
      ) : (
        <FolderGlyph size={44} />
      );
    const title =
      section === 'starred'
        ? 'No starred items yet'
        : section === 'shared'
        ? 'Nothing shared yet'
        : section === 'recent'
        ? 'No recent files'
        : currentProductId
        ? 'No documents in this product yet'
        : currentId
        ? 'This folder is empty'
        : 'No files or folders yet';
    const hint =
      section === 'starred'
        ? 'Click the star on any file or folder to keep it here.'
        : section === 'shared'
        ? 'Use the Share action on a file to give workspace members access.'
        : section === 'recent'
        ? 'Recently uploaded and opened files will appear here.'
        : currentProductId
        ? 'Upload files from the library or add new documents to this product.'
        : 'Drag & drop files here, click Upload, or create a folder.';
    return (
      <div className="flex h-[360px] flex-col items-center justify-center gap-2 text-center">
        {icon}
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="max-w-sm text-xs text-[var(--muted)]">{hint}</p>
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const sectionTitle =
    section === 'all' ? 'Files' : section === 'recent' ? 'Recent' : section === 'starred' ? 'Starred' : 'Shared with workspace';

  const navItems: { id: Section; label: string; icon: React.ReactNode; count: number }[] = [
    {
      id: 'all',
      label: 'All Files',
      icon: <Folder className="h-4 w-4" />,
      count: counts.all,
    },
    {
      id: 'recent',
      label: 'Recent',
      icon: <History className="h-4 w-4" />,
      count: counts.recent,
    },
    {
      id: 'starred',
      label: 'Starred',
      icon: <Star className="h-4 w-4" />,
      count: counts.starred,
    },
    {
      id: 'shared',
      label: 'Shared',
      icon: <Users className="h-4 w-4" />,
      count: counts.shared,
    },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto flex h-[calc(100vh-12rem)] max-h-[640px] w-full max-w-7xl flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          {/* Sidebar */}
          <aside className="flex lg:w-[200px] lg:shrink-0 lg:flex-col">
            <div className="flex h-full w-full flex-col justify-between rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)] p-2">
              <nav className="flex gap-1 lg:flex-col" role="tablist" aria-label="File manager sections">
                {navItems.map((n, idx) => (
                  <button
                    key={n.id}
                    type="button"
                    role="tab"
                    aria-selected={section === n.id}
                    tabIndex={section === n.id ? 0 : -1}
                    data-fm-nav={n.id}
                    onClick={() => {
                      setSection(n.id);
                      setSelected(new Set());
                      if (n.id === 'all') {
                        setCurrentId(null);
                        setCurrentProductId(null);
                      }
                      // Keep cross-section views in sync with the server.
                      void loadAllDocs();
                    }}
                    onKeyDown={(e) => {
                      const goto = (i: number) => {
                        const wrapped = (i + navItems.length) % navItems.length;
                        const next = navItems[wrapped];
                        setSection(next.id);
                        setSelected(new Set());
                        if (next.id === 'all') {
                          setCurrentId(null);
                          setCurrentProductId(null);
                        }
                        void loadAllDocs();
                        // Move focus to the newly selected tab so screen readers and the
                        // browser stay in sync with the visual selection.
                        requestAnimationFrame(() => {
                          const target = document.querySelector<HTMLButtonElement>(
                            `[data-fm-nav="${next.id}"]`,
                          );
                          target?.focus();
                        });
                      };
                      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        goto(idx + 1);
                      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        goto(idx - 1);
                      } else if (e.key === 'Home') {
                        e.preventDefault();
                        goto(0);
                      } else if (e.key === 'End') {
                        e.preventDefault();
                        goto(navItems.length - 1);
                      }
                    }}
                    className={cn(
                      'inline-flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 lg:flex-none',
                      section === n.id
                        ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--nav-hover)]/50',
                    )}
                  >
                    {n.icon}
                    <span className="flex-1 text-left">{n.label}</span>
                    {n.count > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                          section === n.id
                            ? 'bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]'
                            : 'bg-[var(--page-bg)] text-[var(--muted)]',
                        )}
                      >
                        {n.count}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="mt-4 rounded-lg border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5 text-[var(--muted)]" />
                  <p className="text-[11.5px] font-semibold text-[var(--text-primary)]">Storage</p>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300"
                    style={{ width: `${storagePct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10.5px] text-[var(--muted)]">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatBytes(storageUsed)}
                  </span>{' '}
                  of {formatBytes(STORAGE_QUOTA)}
                </p>
              </div>
            </div>
          </aside>

          {/* Main */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Toolbar */}
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search files…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                />
              </div>
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'cursor-pointer rounded-lg p-1 transition-colors duration-150',
                    viewMode === 'grid'
                      ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                      : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
                  )}
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'cursor-pointer rounded-lg p-1 transition-colors duration-150',
                    viewMode === 'list'
                      ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                      : 'text-[var(--muted)] hover:text-[var(--text-primary)]',
                  )}
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  <ListIcon className="h-4 w-4" />
                </button>
              </div>
              {section === 'all' && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                >
                  <FolderPlus className="h-4 w-4" />
                  New Folder
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
              >
                <Upload className="h-4 w-4" />
                Upload
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
              >
                <FolderPlus className="h-4 w-4" />
                Upload Folder
              </button>
              {section === 'all' && currentId === null && (
                <button
                  type="button"
                  onClick={openImport}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                >
                  <Plus className="h-4 w-4" />
                  Import
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                /* @ts-expect-error webkitdirectory is a non-standard attribute */
                webkitdirectory=""
                hidden
                onChange={(e) => {
                  if (e.target.files) void uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Section title row */}
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              {section === 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentId(null);
                    setCurrentProductId(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:text-[var(--brand-primary)]"
                >
                  <Home className="h-4 w-4" />
                  {sectionTitle}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {section === 'recent' && <History className="h-4 w-4" />}
                  {section === 'starred' && <Star className="h-4 w-4" />}
                  {section === 'shared' && <Users className="h-4 w-4" />}
                  {sectionTitle}
                </span>
              )}
              {section === 'all' && currentProductId && (() => {
                const product = products.find((p) => p.id === currentProductId);
                return product ? (
                  <span className="flex items-center gap-1.5 font-normal">
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--muted)]" />
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--brand-primary)]/10 px-1.5 py-0.5 text-[var(--brand-primary)]">
                      <FolderGlyph size={14} />
                      {product.name}
                    </span>
                  </span>
                ) : null;
              })()}
              {section === 'all' &&
                breadcrumb.map((f) => (
                  <span key={f.id} className="flex items-center gap-1.5 font-normal">
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--muted)]" />
                    <button
                      type="button"
                      onClick={() => navigate(f.id)}
                      className={cn(
                        'cursor-pointer rounded-md px-1 py-0.5 font-semibold transition-colors',
                        currentId === f.id ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)] hover:text-[var(--brand-primary)]',
                      )}
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {creating && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <FolderPlus className="h-4 w-4 text-[var(--brand-primary)]" />
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateFolder();
                    if (e.key === 'Escape') {
                      setCreating(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder="Folder name"
                  className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--brand-primary)]"
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={busy}
                  className="cursor-pointer rounded-md bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewFolderName('');
                  }}
                  className="cursor-pointer rounded-md p-1 text-[var(--muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Selection toolbar */}
            {selected.size > 0 && (() => {
              const folderCount = [...selected].filter((k) => k.startsWith('f:')).length;
              const productCount = [...selected].filter((k) => k.startsWith('p:')).length;
              const docCount = selected.size - folderCount - productCount;
              const groupCount = folderCount + productCount;
              return (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-xs">
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-bold text-white">
                      {selected.size}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">selected</span>
                    {(groupCount > 0 || docCount > 0) && (
                      <span className="text-[var(--muted)]">
                        ({docCount} file{docCount === 1 ? '' : 's'}
                        {groupCount > 0 ? `, ${groupCount} folder${groupCount === 1 ? '' : 's'}` : ''})
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMoveOpen(true)}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50 disabled:opacity-60"
                    >
                      <FolderSync className="h-3.5 w-3.5" />
                      Move…
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkStar}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Star
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={busy}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors duration-150 hover:bg-red-500/10 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--text-primary)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Content */}
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  setDragOver(true);
                }
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                setDragOver(false);
                if (e.dataTransfer.files?.length) {
                  e.preventDefault();
                  void uploadFiles(e.dataTransfer.files);
                }
              }}
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] transition-colors duration-150',
                dragOver
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                  : 'border-[var(--border)]/60',
              )}
            >
              {loading ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" />
                </div>
              ) : visible.folders.length === 0 && visible.products.length === 0 && visible.docs.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-4">{sectionEmpty()}</div>
              ) : viewMode === 'grid' ? (
                <div
                  ref={contentScrollRef}
                  onMouseDown={handleMarqueeMouseDown}
                  className="relative flex-1 overflow-y-auto p-3"
                >
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                    {visible.folders.map(renderFolderCard)}
                    {visible.products.map(renderProductCard)}
                    {visible.docs.map(renderDocCard)}
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
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  {/* Sticky header row */}
                  <div className="sticky top-0 z-10 grid shrink-0 grid-cols-[28px_20px_1fr_120px_120px_84px] items-center gap-2 border-b border-[var(--border)]/60 bg-[var(--surface)] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)] sm:grid-cols-[28px_20px_1fr_140px_140px_120px_96px]">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
                    />
                    <span />
                    <span>Name</span>
                    <span className="hidden sm:block">Uploaded by</span>
                    <span>Size</span>
                    <span>Modified</span>
                    <span />
                  </div>
                  <div
                    ref={contentScrollRef}
                    onMouseDown={handleMarqueeMouseDown}
                    className="relative flex flex-1 flex-col gap-1 overflow-y-auto p-2"
                  >
                    {visible.folders.map(renderFolderRow)}
                    {visible.products.map(renderProductRow)}
                    {visible.docs.map(renderDocRow)}
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Import modal (unchanged) */}
      {importOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={() => setImportOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-start gap-3 border-b border-[var(--border)]/60 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                <Plus className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Import from library
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                  Add unfiled documents into{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {currentId ? foldersById.get(currentId)?.name : 'File Manager'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-[var(--border)]/60 px-5 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                <input
                  value={importQuery}
                  onChange={(e) => setImportQuery(e.target.value)}
                  placeholder="Search documents…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto px-3 py-2">
              {(() => {
                const q = importQuery.trim().toLowerCase();
                const list = q
                  ? importDocs.filter((d) => d.name.toLowerCase().includes(q))
                  : importDocs;
                if (list.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
                      <FileText className="h-8 w-8 text-[var(--muted)]" />
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {importQuery ? 'No match' : 'Nothing to import'}
                      </p>
                      <p className="max-w-xs text-xs text-[var(--muted)]">
                        {importQuery
                          ? 'No unfiled document matches your search.'
                          : 'All your documents are already organised into folders.'}
                      </p>
                    </div>
                  );
                }
                return list.map((d) => {
                  return (
                    <div
                      key={d.id}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--nav-hover)]/40"
                    >
                      <FileGlyph name={d.name} mime={d.mimeType} size={30} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-medium text-[var(--text-primary)]"
                          title={d.name}
                        >
                          {d.name}
                        </p>
                        <p className="text-[10.5px] text-[var(--muted)]">
                          {typeLabel(d.name, d.mimeType)} · {formatBytes(d.sizeBytes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          await moveDoc(d.id, currentId);
                          setImportDocs((prev) => prev.filter((x) => x.id !== d.id));
                        }}
                        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/20 disabled:opacity-60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)]/60 px-5 py-3">
              <span className="text-xs text-[var(--muted)]">
                {importDocs.length} document{importDocs.length === 1 ? '' : 's'} available
              </span>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="cursor-pointer rounded-lg bg-[var(--brand-primary)] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk move destination picker */}
      {moveOpen && (() => {
        const folderCount = [...selected].filter((k) => k.startsWith('f:')).length;
        const docCount = selected.size - folderCount;
        const selectedFolderIds = new Set(
          [...selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2)),
        );
        const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));
        return createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]"
            onClick={() => setMoveOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[78vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
            >
              <div className="flex items-start gap-3 border-b border-[var(--border)]/60 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  <FolderSync className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Move {selected.size} item{selected.size === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {docCount} file{docCount === 1 ? '' : 's'}
                    {folderCount > 0 ? `, ${folderCount} folder${folderCount === 1 ? '' : 's'}` : ''}{' '}
                    · pick a destination
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMoveOpen(false)}
                  className="cursor-pointer rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto px-2 py-2">
                <button
                  type="button"
                  onClick={() => void handleBulkMove(null)}
                  disabled={busy}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--nav-hover)]/40 disabled:opacity-50"
                >
                  <Home className="h-4 w-4 text-[var(--muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                      File Manager root
                    </p>
                    <p className="text-[11px] text-[var(--muted)]">No parent folder</p>
                  </div>
                </button>
                {sortedFolders.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">
                    No folders yet. Create one first.
                  </p>
                ) : (
                  sortedFolders.map((f) => {
                    const disabled = selectedFolderIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => !disabled && void handleBulkMove(f.id)}
                        disabled={busy || disabled}
                        title={disabled ? "Can't move a folder into itself" : undefined}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--nav-hover)]/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <FolderGlyph size={22} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                            {f.name}
                          </p>
                          <p className="text-[11px] text-[var(--muted)]">
                            {f.fileCount} file{f.fileCount === 1 ? '' : 's'}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)]/60 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setMoveOpen(false)}
                  className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Right-click context menu */}
      {ctxMenu && (() => {
        const isDoc = ctxMenu.kind === 'd';
        const targetKey = `${ctxMenu.kind}:${ctxMenu.id}`;
        const folderTarget = !isDoc ? folders.find((f) => f.id === ctxMenu.id) : undefined;
        const docTarget = isDoc ? allDocs.find((d) => d.id === ctxMenu.id) ?? docs.find((d) => d.id === ctxMenu.id) : undefined;
        const Item = ({
          icon,
          label,
          onClick,
          disabled,
          danger,
          kbd,
        }: {
          icon: React.ReactNode;
          label: string;
          onClick: () => void;
          disabled?: boolean;
          danger?: boolean;
          kbd?: string;
        }) => (
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onClick();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
              disabled
                ? 'cursor-not-allowed text-[var(--muted)]/60'
                : danger
                ? 'text-red-600 hover:bg-red-500/10'
                : 'text-[var(--text-primary)] hover:bg-[var(--nav-hover)]/50',
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center text-[var(--muted)]">
              {icon}
            </span>
            <span className="flex-1">{label}</span>
            {kbd && (
              <span className="text-[10px] text-[var(--muted)]">{kbd}</span>
            )}
          </button>
        );
        const Separator = () => <div className="my-1 h-px bg-[var(--border)]/60" />;
        return (
          <ContextMenuShell anchorX={ctxMenu.x} anchorY={ctxMenu.y}>
            {isDoc && (
              <Item
                icon={<Edit className="h-3.5 w-3.5" />}
                label="Open"
                onClick={() => {
                  setCtxMenu(null);
                  openEditor(ctxMenu.id);
                }}
              />
            )}
            {!isDoc && (
              <Item
                icon={<Folder className="h-3.5 w-3.5" />}
                label="Open"
                onClick={() => {
                  setCtxMenu(null);
                  setSection('all');
                  void navigate(ctxMenu.id);
                }}
              />
            )}
            <Separator />
            <Item
              icon={<Edit className="h-3.5 w-3.5" />}
              label="Cut"
              kbd="Ctrl+X"
              onClick={handleCut}
            />
            <Item
              icon={<Edit className="h-3.5 w-3.5" />}
              label="Copy"
              kbd="Ctrl+C"
              onClick={handleCopy}
              disabled={!isDoc && [...selected].some((k) => k.startsWith('f:'))}
            />
            <Item
              icon={<Edit className="h-3.5 w-3.5" />}
              label="Paste here"
              kbd="Ctrl+V"
              onClick={() => void handlePaste()}
              disabled={!clipboard || clipboard.keys.length === 0}
            />
            <Separator />
            {isDoc && (
              <Item
                icon={<Users className="h-3.5 w-3.5" />}
                label="Share…"
                onClick={() => {
                  setShareDocId(ctxMenu.id);
                  setCtxMenu(null);
                }}
              />
            )}
            <Item
              icon={
                pinned.has(targetKey) ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )
              }
              label={pinned.has(targetKey) ? 'Unpin' : 'Pin to top'}
              onClick={() => {
                togglePin(targetKey);
                setCtxMenu(null);
              }}
            />
            <Item
              icon={<Star className="h-3.5 w-3.5" />}
              label={starred.has(targetKey) ? 'Unstar' : 'Star'}
              onClick={() => {
                toggleStar(targetKey);
                setCtxMenu(null);
              }}
            />
            <Item
              icon={<FolderSync className="h-3.5 w-3.5" />}
              label="Move…"
              onClick={() => {
                setMoveOpen(true);
                setCtxMenu(null);
              }}
            />
            {!isDoc && (
              <Item
                icon={<Edit className="h-3.5 w-3.5" />}
                label="Rename"
                onClick={() => {
                  setCtxMenu(null);
                  if (folderTarget) {
                    setRenameId(folderTarget.id);
                    setRenameValue(folderTarget.name);
                  }
                }}
              />
            )}
            <Separator />
            <Item
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete"
              danger
              onClick={() => {
                setCtxMenu(null);
                if (isDoc) void deleteFile(ctxMenu.id);
                else void handleDeleteFolder(ctxMenu.id);
              }}
            />
            <Separator />
            <Item
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Properties"
              onClick={() => {
                if (isDoc && docTarget) setPropsTarget({ kind: 'd', id: ctxMenu.id });
                else if (!isDoc && folderTarget) setPropsTarget({ kind: 'f', id: ctxMenu.id });
                setCtxMenu(null);
              }}
            />
          </ContextMenuShell>
        );
      })()}

      {/* Properties dialog */}
      {propsTarget && (() => {
        if (propsTarget.kind === 'f') {
          const f = folders.find((x) => x.id === propsTarget.id);
          if (!f) return null;
          return (
            <PropertiesDialog
              target={{
                kind: 'folder',
                id: f.id,
                name: f.name,
                parentId: f.parentId,
                fileCount: f.fileCount,
                sizeBytes: f.sizeBytes,
                createdAt: f.createdAt,
                updatedAt: f.updatedAt,
              }}
              usersById={usersById}
              folders={folders}
              starred={starred.has(`f:${f.id}`)}
              onClose={() => setPropsTarget(null)}
            />
          );
        }
        const d = allDocs.find((x) => x.id === propsTarget.id) ?? docs.find((x) => x.id === propsTarget.id);
        if (!d) return null;
        return (
          <PropertiesDialog
            target={{
              kind: 'doc',
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes,
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
              uploadedBy: d.uploadedBy,
              folderId: d.folderId,
            }}
            usersById={usersById}
            folders={folders}
            starred={starred.has(`d:${d.id}`)}
            onClose={() => setPropsTarget(null)}
          />
        );
      })()}

      {/* Share dialog */}
      {shareDocId && (
        <ShareDialog
          docId={shareDocId}
          docName={allDocs.find((d) => d.id === shareDocId)?.name ?? 'File'}
          onClose={() => setShareDocId(null)}
          onSaved={(userIds) => {
            setSharedFlags((prev) => {
              const next = new Set(prev);
              if (userIds.length > 0) next.add(shareDocId);
              else next.delete(shareDocId);
              return next;
            });
            setSharedUsers((prev) => {
              const next = { ...prev };
              if (userIds.length > 0) next[shareDocId] = userIds;
              else delete next[shareDocId];
              return next;
            });
          }}
        />
      )}

      {/* 3-D globe folder browser */}
      <FolderGlobeOverlay
        open={globeRootId !== null}
        rootFolderId={globeRootId}
        folders={folders}
        onLoadDocs={loadFolderDocs}
        onOpenFile={(id) => {
          setGlobeRootId(null);
          openEditor(id);
        }}
        onClose={() => setGlobeRootId(null)}
      />
    </DashboardLayout>
  );
}
