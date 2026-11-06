'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Plus,
  Search,
  Calendar,
  Edit,
  Trash2,
  X,
  CheckCircle,
} from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/lib/auth-store';
import {
  NC_KANBAN_COLUMNS,
  classificationPriority,
  fetchWorkspaceSnapshot,
  ncColumnForStatus,
  transitionNcStatus,
  type TimedEntity,
} from '@/lib/workspace-data';

type Priority = 'low' | 'medium' | 'high' | 'urgent';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  tags: string[];
  assignees: string[];
  dueDate?: string;
  image?: string;
  createdAt: number;
  /** Set when the card mirrors a non-conformity from the API */
  ncId?: string;
  ncStatus?: string;
}

type AccentKey = 'slate' | 'sky' | 'amber' | 'emerald' | 'violet' | 'rose' | 'teal' | 'fuchsia';

interface Column {
  id: string;
  label: string;
  accent: AccentKey;
}

interface BoardState {
  columns: Column[];
  tasks: Record<string, Task[]>;
}

const ACCENT_PALETTE: Record<AccentKey, { dot: string; soft: string; pillBg: string; pillText: string; ring: string; bar: string }> = {
  slate:    { dot: 'bg-slate-200',    soft: 'bg-slate-50/40 dark:bg-white/[0.015]',   pillBg: 'bg-slate-100/80 dark:bg-white/10',           pillText: 'text-slate-700 dark:text-slate-200',  ring: 'ring-slate-300/40',    bar: 'bg-slate-300' },
  sky:      { dot: 'bg-sky-500',      soft: 'bg-sky-50/40 dark:bg-sky-400/[0.03]',    pillBg: 'bg-sky-100/80 dark:bg-sky-400/15',          pillText: 'text-sky-800 dark:text-sky-200',      ring: 'ring-sky-300/40',      bar: 'bg-sky-400' },
  amber:    { dot: 'bg-amber-500',    soft: 'bg-amber-50/40 dark:bg-amber-400/[0.03]',pillBg: 'bg-amber-100/80 dark:bg-amber-400/15',      pillText: 'text-amber-800 dark:text-amber-100',  ring: 'ring-amber-300/40',    bar: 'bg-amber-400' },
  emerald:  { dot: 'bg-emerald-500',  soft: 'bg-emerald-50/40 dark:bg-emerald-400/[0.03]', pillBg: 'bg-emerald-100/80 dark:bg-emerald-400/15', pillText: 'text-emerald-800 dark:text-emerald-100', ring: 'ring-emerald-300/40', bar: 'bg-emerald-400' },
  violet:   { dot: 'bg-violet-500',   soft: 'bg-violet-50/40 dark:bg-violet-400/[0.03]',pillBg: 'bg-violet-100/80 dark:bg-violet-400/15',    pillText: 'text-violet-800 dark:text-violet-100', ring: 'ring-violet-300/40',  bar: 'bg-violet-400' },
  rose:     { dot: 'bg-rose-500',     soft: 'bg-rose-50/40 dark:bg-rose-400/[0.03]',  pillBg: 'bg-rose-100/80 dark:bg-rose-400/15',        pillText: 'text-rose-800 dark:text-rose-100',    ring: 'ring-rose-300/40',     bar: 'bg-rose-400' },
  teal:     { dot: 'bg-teal-500',     soft: 'bg-teal-50/40 dark:bg-teal-400/[0.03]',  pillBg: 'bg-teal-100/80 dark:bg-teal-400/15',        pillText: 'text-teal-800 dark:text-teal-100',    ring: 'ring-teal-300/40',     bar: 'bg-teal-400' },
  fuchsia:  { dot: 'bg-fuchsia-500',  soft: 'bg-fuchsia-50/40 dark:bg-fuchsia-400/[0.03]', pillBg: 'bg-fuchsia-100/80 dark:bg-fuchsia-400/15', pillText: 'text-fuchsia-800 dark:text-fuchsia-100', ring: 'ring-fuchsia-300/40', bar: 'bg-fuchsia-400' },
};

const ACCENT_KEYS = Object.keys(ACCENT_PALETTE) as AccentKey[];

interface PriorityMeta {
  label: string;
  dot: string;
  bar: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}

const PRIORITY_META: Record<Priority, PriorityMeta> = {
  low:    { label: 'Low',    dot: 'bg-slate-400', bar: 'bg-slate-300', pillBg: 'rgba(100,116,139,0.12)', pillText: '#334155', pillBorder: 'rgba(100,116,139,0.25)' },
  medium: { label: 'Medium', dot: 'bg-sky-500',   bar: 'bg-sky-400',   pillBg: 'rgba(14,165,233,0.12)', pillText: '#075985', pillBorder: 'rgba(14,165,233,0.30)' },
  high:   { label: 'High',   dot: 'bg-amber-500', bar: 'bg-amber-400', pillBg: 'rgba(245,158,11,0.15)', pillText: '#92400e', pillBorder: 'rgba(245,158,11,0.35)' },
  urgent: { label: 'Urgent', dot: 'bg-rose-500',  bar: 'bg-rose-400',  pillBg: 'rgba(244,63,94,0.13)',  pillText: '#9f1239', pillBorder: 'rgba(244,63,94,0.32)' },
};

const STORAGE_KEY = 'qurelio:kanban:v2';
const UNDO_MS = 3000;
const USE_NC_BOARD = true;

function ncToTask(nc: TimedEntity, userLabels: Record<string, string>): Task {
  const capaDue = (nc.capaActions || [])
    .map((c) => c.dueDate)
    .filter(Boolean)
    .sort()[0];
  const assignee =
    nc.assignedTo && userLabels[nc.assignedTo]
      ? userLabels[nc.assignedTo]
      : nc.assignedTo
        ? nc.assignedTo.slice(0, 8)
        : undefined;
  return {
    id: String(nc.id),
    ncId: String(nc.id),
    ncStatus: String(nc.status || 'OPEN'),
    title: String(nc.title || 'Non-conformity'),
    description: nc.description ? String(nc.description).slice(0, 280) : undefined,
    priority: classificationPriority(nc.classification),
    tags: [nc.isoStandard, nc.source].filter(Boolean).map(String),
    assignees: assignee ? [assignee] : [],
    dueDate: capaDue ? String(capaDue).slice(0, 10) : undefined,
    createdAt: new Date(nc.createdAt || 0).getTime(),
  };
}

function buildNcBoard(ncs: TimedEntity[], userLabels: Record<string, string>): BoardState {
  const columns: Column[] = NC_KANBAN_COLUMNS.map((c) => ({
    id: c.id,
    label: c.label,
    accent: c.accent,
  }));
  const tasks: Record<string, Task[]> = {};
  for (const c of columns) tasks[c.id] = [];
  for (const nc of ncs) {
    const col = ncColumnForStatus(String(nc.status || 'OPEN'));
    if (!tasks[col]) tasks[col] = [];
    tasks[col].push(ncToTask(nc, userLabels));
  }
  for (const c of columns) {
    tasks[c.id].sort((a, b) => b.createdAt - a.createdAt);
  }
  return { columns, tasks };
}

function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function defaultBoard(): BoardState {
  const cols: Column[] = [
    { id: uid('col_'), label: 'To do',         accent: 'slate' },
    { id: uid('col_'), label: 'In progress',   accent: 'sky' },
    { id: uid('col_'), label: 'Ready to test', accent: 'amber' },
    { id: uid('col_'), label: 'Done',          accent: 'emerald' },
  ];
  const tasks: Record<string, Task[]> = {};
  for (const c of cols) tasks[c.id] = [];
  tasks[cols[0].id] = [
    {
      id: uid('t_'),
      title: 'Draft Q2 compliance review brief',
      description: 'Outline scope, evidence list, and stakeholders.',
      priority: 'high',
      tags: ['ISO 9001'],
      assignees: ['Amine M.', 'Lina B.'],
      createdAt: Date.now(),
    },
    {
      id: uid('t_'),
      title: 'Collect supplier audit forms',
      priority: 'medium',
      tags: ['Audit'],
      assignees: ['Lina B.'],
      createdAt: Date.now(),
    },
  ];
  tasks[cols[1].id] = [
    {
      id: uid('t_'),
      title: 'Refactor evaluation streaming retry logic',
      description: 'Group transient errors and surface a single banner.',
      priority: 'urgent',
      tags: ['Engineering', 'RAG'],
      assignees: ['Yacine K.', 'Amine M.', 'Claude L.'],
      createdAt: Date.now(),
    },
  ];
  tasks[cols[2].id] = [
    {
      id: uid('t_'),
      title: 'Sidebar collapsed labels',
      description: 'Stacked icon-over-label per the design preference.',
      priority: 'medium',
      tags: ['Frontend'],
      assignees: ['Claude L.'],
      createdAt: Date.now(),
    },
  ];
  tasks[cols[3].id] = [
    {
      id: uid('t_'),
      title: 'Initial Kanban board skeleton',
      priority: 'low',
      tags: ['Frontend'],
      assignees: ['Claude L.'],
      createdAt: Date.now(),
    },
  ];
  return { columns: cols, tasks };
}

function loadBoard(): BoardState {
  if (typeof window === 'undefined') return defaultBoard();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBoard();
    const parsed = JSON.parse(raw) as BoardState;
    if (!parsed.columns || !Array.isArray(parsed.columns) || parsed.columns.length === 0) {
      return defaultBoard();
    }
    if (!parsed.tasks || typeof parsed.tasks !== 'object') parsed.tasks = {};
    for (const c of parsed.columns) {
      if (!Array.isArray(parsed.tasks[c.id])) parsed.tasks[c.id] = [];
      parsed.tasks[c.id] = parsed.tasks[c.id].map((t) => {
        const legacy = t as Task & { assignee?: string };
        if (!Array.isArray(legacy.assignees)) {
          legacy.assignees = legacy.assignee ? [legacy.assignee] : [];
        }
        delete legacy.assignee;
        return legacy;
      });
    }
    return parsed;
  } catch {
    return defaultBoard();
  }
}

function saveBoard(state: BoardState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function initials(name?: string): string {
  if (!name) return '-';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '-';
}

interface DraftTask {
  title: string;
  description: string;
  priority: Priority;
  tags: string;
  assignees: string[];
  dueDate: string;
  image: string;
  columnId: string;
}

const EMPTY_DRAFT: DraftTask = {
  title: '',
  description: '',
  priority: 'medium',
  tags: '',
  assignees: [],
  dueDate: '',
  image: '',
  columnId: '',
};

function draftFromTask(t: Task, columnId: string): DraftTask {
  return {
    title: t.title,
    description: t.description ?? '',
    priority: t.priority,
    tags: t.tags.join(', '),
    assignees: [...t.assignees],
    dueDate: t.dueDate ?? '',
    image: t.image ?? '',
    columnId,
  };
}

function taskFromDraft(d: DraftTask, base?: Task): Task {
  return {
    id: base?.id ?? uid('t_'),
    title: d.title.trim() || 'Untitled task',
    description: d.description.trim() || undefined,
    priority: d.priority,
    tags: d.tags.split(',').map((s) => s.trim()).filter(Boolean),
    assignees: d.assignees.map((s) => s.trim()).filter(Boolean),
    dueDate: d.dueDate || undefined,
    image: d.image || undefined,
    createdAt: base?.createdAt ?? Date.now(),
  };
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

export default function KanbanPage() {
  const { user } = useAuthStore();
  const [state, setState] = useState<BoardState>(() =>
    USE_NC_BOARD
      ? buildNcBoard([], {})
      : defaultBoard(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [boardLoading, setBoardLoading] = useState(USE_NC_BOARD);

  const reloadNcBoard = useCallback(async () => {
    if (!USE_NC_BOARD || !user) return;
    setBoardLoading(true);
    try {
      const snapshot = await fetchWorkspaceSnapshot();
      setState(buildNcBoard(snapshot.ncs, snapshot.userLabels));
    } catch {
      toast.error('Could not load non-conformities');
    } finally {
      setBoardLoading(false);
    }
  }, [user]);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<{
    taskId: string;
    from: string;
    task: Task;
    accent: AccentKey;
    width: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState<{ col: string; index: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renamingColumnId, setRenamingColumnId] = useState<string | null>(null);
  const transparentDragImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = document.createElement('img');
    img.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.style.position = 'fixed';
    img.style.top = '-9999px';
    document.body.appendChild(img);
    transparentDragImgRef.current = img;
    return () => {
      if (img.parentNode) img.parentNode.removeChild(img);
    };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    let raf = 0;
    const onMove = (e: DragEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      if (x === 0 && y === 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setDragPos({ x, y }));
    };
    window.addEventListener('dragover', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('dragover', onMove);
    };
  }, [dragging]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [dialogColumn, setDialogColumn] = useState<string>('');
  const [dialogTaskId, setDialogTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTask>(EMPTY_DRAFT);

  useEffect(() => {
    if (USE_NC_BOARD) {
      reloadNcBoard().finally(() => setHydrated(true));
      return;
    }
    setState(loadBoard());
    setHydrated(true);
  }, [reloadNcBoard]);

  useEffect(() => {
    if (hydrated && !USE_NC_BOARD) saveBoard(state);
  }, [state, hydrated]);

  const totalCount = useMemo(
    () => state.columns.reduce((sum, c) => sum + (state.tasks[c.id]?.length ?? 0), 0),
    [state],
  );

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.tasks;
    const next: Record<string, Task[]> = {};
    for (const col of state.columns) {
      next[col.id] = (state.tasks[col.id] ?? []).filter((t) => {
        const hay = `${t.title} ${t.description ?? ''} ${t.tags.join(' ')} ${t.assignees.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return next;
  }, [state, query]);

  // ── Task CRUD ──────────────────────────────────────────────
  const openCreate = useCallback((colId: string) => {
    setDialogMode('create');
    setDialogColumn(colId);
    setDialogTaskId(null);
    setDraft({ ...EMPTY_DRAFT, columnId: colId });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((colId: string, task: Task) => {
    setDialogMode('edit');
    setDialogColumn(colId);
    setDialogTaskId(task.id);
    setDraft(draftFromTask(task, colId));
    setDialogOpen(true);
  }, []);

  const saveDialog = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, tasks: { ...prev.tasks } };
      const targetCol = prev.columns.find((c) => c.id === draft.columnId)?.id
        ?? dialogColumn
        ?? prev.columns[0]?.id;
      if (!targetCol) return prev;
      if (dialogMode === 'create') {
        const task = taskFromDraft(draft);
        next.tasks[targetCol] = [task, ...(next.tasks[targetCol] ?? [])];
      } else if (dialogTaskId) {
        for (const col of prev.columns) {
          const list = next.tasks[col.id] ?? [];
          const idx = list.findIndex((t) => t.id === dialogTaskId);
          if (idx < 0) continue;
          const updated = taskFromDraft(draft, list[idx]);
          if (col.id === targetCol) {
            next.tasks[col.id] = [...list];
            next.tasks[col.id][idx] = updated;
          } else {
            next.tasks[col.id] = [...list.slice(0, idx), ...list.slice(idx + 1)];
            next.tasks[targetCol] = [updated, ...(next.tasks[targetCol] ?? [])];
          }
          break;
        }
      }
      return next;
    });
    setDialogOpen(false);
  }, [dialogMode, dialogColumn, dialogTaskId, draft]);

  const renameTask = useCallback((taskId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      setRenamingTaskId(null);
      return;
    }
    setState((prev) => {
      const next = { ...prev, tasks: { ...prev.tasks } };
      for (const col of prev.columns) {
        const list = next.tasks[col.id] ?? [];
        const idx = list.findIndex((t) => t.id === taskId);
        if (idx >= 0) {
          next.tasks[col.id] = [...list];
          next.tasks[col.id][idx] = { ...list[idx], title: trimmed };
          break;
        }
      }
      return next;
    });
    setRenamingTaskId(null);
  }, []);

  const deleteTaskWithUndo = useCallback((taskId: string) => {
    type Snap = { colId: string; index: number; task: Task };
    let snapshot: Snap | null = null;
    setState((prev) => {
      const next = { ...prev, tasks: { ...prev.tasks } };
      for (const col of prev.columns) {
        const list = next.tasks[col.id] ?? [];
        const idx = list.findIndex((t) => t.id === taskId);
        if (idx >= 0) {
          snapshot = { colId: col.id, index: idx, task: list[idx] };
          next.tasks[col.id] = [...list.slice(0, idx), ...list.slice(idx + 1)];
          break;
        }
      }
      return next;
    });
    if (!snapshot) return;
    const snap: Snap = snapshot;
    toast.custom(
      (t) => (
        <UndoToast
          visible={t.visible}
          title="Task deleted"
          subtitle={snap.task.title}
          onUndo={() => {
            setState((prev) => {
              const next = { ...prev, tasks: { ...prev.tasks } };
              const list = [...(next.tasks[snap.colId] ?? [])];
              if (!prev.columns.find((c) => c.id === snap.colId)) return prev;
              const insertAt = Math.min(snap.index, list.length);
              list.splice(insertAt, 0, snap.task);
              next.tasks[snap.colId] = list;
              return next;
            });
            toast.dismiss(t.id);
          }}
          onDismiss={() => toast.dismiss(t.id)}
        />
      ),
      { duration: UNDO_MS, position: 'bottom-right' },
    );
  }, []);

  // ── Column CRUD ────────────────────────────────────────────
  const addColumn = useCallback(() => {
    const newId = uid('col_');
    setState((prev) => {
      const usedAccents = new Set(prev.columns.map((c) => c.accent));
      const accent = ACCENT_KEYS.find((k) => !usedAccents.has(k)) ?? ACCENT_KEYS[prev.columns.length % ACCENT_KEYS.length];
      const col: Column = { id: newId, label: 'New column', accent };
      return {
        columns: [...prev.columns, col],
        tasks: { ...prev.tasks, [col.id]: [] },
      };
    });
    setRenamingColumnId(newId);
  }, []);

  const renameColumn = useCallback((colId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) {
      setRenamingColumnId(null);
      return;
    }
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.id === colId ? { ...c, label: trimmed } : c)),
    }));
    setRenamingColumnId(null);
  }, []);

  const setColumnAccent = useCallback((colId: string, accent: AccentKey) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.id === colId ? { ...c, accent } : c)),
    }));
  }, []);

  const deleteColumnWithUndo = useCallback((colId: string) => {
    type ColSnap = { index: number; column: Column; tasks: Task[] };
    let snapshot: ColSnap | null = null;
    setState((prev) => {
      const idx = prev.columns.findIndex((c) => c.id === colId);
      if (idx < 0) return prev;
      snapshot = { index: idx, column: prev.columns[idx], tasks: prev.tasks[colId] ?? [] };
      const nextCols = prev.columns.filter((c) => c.id !== colId);
      const nextTasks = { ...prev.tasks };
      delete nextTasks[colId];
      return { columns: nextCols, tasks: nextTasks };
    });
    if (!snapshot) return;
    const snap: ColSnap = snapshot;
    const taskNoun = snap.tasks.length === 1 ? 'task' : 'tasks';
    toast.custom(
      (t) => (
        <UndoToast
          visible={t.visible}
          title="Column deleted"
          subtitle={`${snap.column.label} · ${snap.tasks.length} ${taskNoun}`}
          onUndo={() => {
            setState((prev) => {
              const nextCols = [...prev.columns];
              const insertAt = Math.min(snap.index, nextCols.length);
              nextCols.splice(insertAt, 0, snap.column);
              const nextTasks = { ...prev.tasks, [snap.column.id]: snap.tasks };
              return { columns: nextCols, tasks: nextTasks };
            });
            toast.dismiss(t.id);
          }}
          onDismiss={() => toast.dismiss(t.id)}
        />
      ),
      { duration: UNDO_MS, position: 'bottom-right' },
    );
  }, []);

  // ── Drag & drop ────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent<HTMLElement>, taskId: string, from: string) => {
    const task = (state.tasks[from] ?? []).find((t) => t.id === taskId);
    const fromCol = state.columns.find((c) => c.id === from);
    if (!task || !fromCol) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging({
      taskId,
      from,
      task,
      accent: fromCol.accent,
      width: rect.width,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    });
    setDragPos({ x: e.clientX, y: e.clientY });
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', taskId);
      if (transparentDragImgRef.current) {
        e.dataTransfer.setDragImage(transparentDragImgRef.current, 0, 0);
      }
    } catch {
      /* ignore */
    }
  };
  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
    setDragPos(null);
  };
  const handleDragOverCard = (e: React.DragEvent<HTMLElement>, col: string, index: number) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDragOver({ col, index: before ? index : index + 1 });
  };
  const handleDragOverColumn = (e: React.DragEvent<HTMLElement>, col: string) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver((prev) =>
      prev && prev.col === col ? prev : { col, index: state.tasks[col]?.length ?? 0 },
    );
  };
  const handleDrop = (e: React.DragEvent<HTMLElement>, col: string) => {
    if (!dragging) return;
    e.preventDefault();
    const targetIndex = dragOver?.col === col ? dragOver.index : state.tasks[col]?.length ?? 0;
    const fromCol = dragging.from;
    const draggedId = dragging.taskId;
    const movedTask = (state.tasks[fromCol] ?? []).find((t) => t.id === draggedId);
    setState((prev) => {
      const next = { ...prev, tasks: { ...prev.tasks } };
      const fromList = [...(next.tasks[fromCol] ?? [])];
      const fromIdx = fromList.findIndex((t) => t.id === draggedId);
      if (fromIdx < 0) return prev;
      const [moved] = fromList.splice(fromIdx, 1);
      next.tasks[fromCol] = fromList;
      const toList = fromCol === col ? fromList : [...(next.tasks[col] ?? [])];
      let insertAt = targetIndex;
      if (fromCol === col && fromIdx < insertAt) insertAt -= 1;
      insertAt = Math.max(0, Math.min(insertAt, toList.length));
      toList.splice(insertAt, 0, moved);
      next.tasks[col] = toList;
      return next;
    });
    setDragging(null);
    setDragOver(null);
    setDragPos(null);

    if (USE_NC_BOARD && movedTask?.ncId && fromCol !== col) {
      void (async () => {
        const result = await transitionNcStatus(movedTask.ncId!, fromCol, col);
        if (!result.ok) {
          toast.error(result.message || 'Could not update NC');
          await reloadNcBoard();
        } else {
          await reloadNcBoard();
        }
      })();
    }
  };

  return (
    <DashboardLayout showRouteHeader={false}>
      <div className="relative -mx-4 -my-6 sm:-mx-6">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                Kanban board
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
                {USE_NC_BOARD
                  ? 'Non-conformities by workflow stage. Drag between Open, RCA, CAPA, and verification when allowed.'
                  : 'Plan, track, and ship work. Drag tasks across columns to update their status.'}
                {boardLoading ? ' Loading…' : ''}
              </p>
            </div>
            <div className="shrink-0 sm:pt-1">
              <BoardHeader
                query={query}
                onQuery={setQuery}
                total={totalCount}
                onAdd={() => state.columns[0] && openCreate(state.columns[0].id)}
              />
            </div>
          </div>
        </header>

        <div className="relative mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <div className="flex gap-4 overflow-x-auto pb-4 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border)]">
            <div className="flex min-w-full items-stretch gap-5">
              {state.columns.map((col, colIdx) => {
                const accent = ACCENT_PALETTE[col.accent];
                const items = filteredTasks[col.id] ?? [];
                const allItems = state.tasks[col.id] ?? [];
                const isDropTarget = !!dragging && dragOver?.col === col.id;
                return (
                  <React.Fragment key={col.id}>
                    {colIdx > 0 && <ColumnDivider />}
                    <section
                      onDragOver={(e) => handleDragOverColumn(e, col.id)}
                      onDrop={(e) => handleDrop(e, col.id)}
                      className={cn(
                        'group/col flex min-h-[64vh] min-w-[280px] flex-1 flex-col rounded-2xl border border-slate-200',
                        'bg-slate-100',
                        'transition-shadow duration-300',
                        isDropTarget
                          ? cn('shadow-[0_0_0_2px_var(--brand-accent)] ring-1', accent.ring)
                          : 'shadow-none',
                      )}
                    >
                    <ColumnHeader
                      col={col}
                      accent={col.accent}
                      count={allItems.length}
                      shown={items.length}
                      renaming={renamingColumnId === col.id}
                      onStartRename={() => setRenamingColumnId(col.id)}
                      onRename={(v) => renameColumn(col.id, v)}
                      onAdd={() => openCreate(col.id)}
                      onSetAccent={(a) => setColumnAccent(col.id, a)}
                      onDelete={() => deleteColumnWithUndo(col.id)}
                    />

                    <div className="flex flex-1 flex-col gap-3 px-2.5 pb-2.5 pt-1">
                      <AnimatePresence initial={false}>
                        {items.map((task, idx) => {
                          const showIndicatorBefore =
                            isDropTarget && dragOver?.col === col.id && dragOver.index === idx;
                          return (
                            <React.Fragment key={task.id}>
                              {showIndicatorBefore && <DropIndicator />}
                              <motion.div
                                layout
                                initial={{ opacity: 0, y: 4 }}
                                animate={{
                                  opacity: dragging?.taskId === task.id ? 0.25 : 1,
                                  scale: dragging?.taskId === task.id ? 0.98 : 1,
                                  y: 0,
                                }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.6 }}
                                draggable={renamingTaskId !== task.id}
                                {...({
                                  onDragStart: (e: React.DragEvent<HTMLElement>) =>
                                    handleDragStart(e, task.id, col.id),
                                  onDragEnd: handleDragEnd,
                                  onDragOver: (e: React.DragEvent<HTMLElement>) =>
                                    handleDragOverCard(e, col.id, idx),
                                } as Record<string, unknown>)}
                              >
                                <TaskCard
                                  task={task}
                                  accent={col.accent}
                                  dimmed={false}
                                  renaming={renamingTaskId === task.id}
                                  onStartRename={() => setRenamingTaskId(task.id)}
                                  onRename={(v) => renameTask(task.id, v)}
                                  onCancelRename={() => setRenamingTaskId(null)}
                                  onOpen={() => {
                                    if (renamingTaskId === task.id) return;
                                    openEdit(col.id, task);
                                  }}
                                  onDelete={() => deleteTaskWithUndo(task.id)}
                                />
                              </motion.div>
                            </React.Fragment>
                          );
                        })}
                      </AnimatePresence>

                      {isDropTarget && dragOver?.col === col.id && dragOver.index >= items.length && (
                        <DropIndicator />
                      )}

                      {items.length === 0 && !dragging && (
                        <button
                          type="button"
                          onClick={() => openCreate(col.id)}
                          className={cn(
                            'mt-1 flex h-24 w-full items-center justify-center rounded-xl',
                            'border border-dashed border-slate-300 text-[12px] text-slate-500',
                            'transition-colors hover:border-slate-400 hover:text-slate-700',
                          )}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Plus size={13} strokeWidth={1.5} />
                            Add a task
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openCreate(col.id)}
                        className={cn(
                          'mt-1 inline-flex h-8 items-center gap-1.5 self-start rounded-lg px-2 text-[12px]',
                          'text-slate-500 transition-colors hover:bg-white hover:text-slate-900',
                        )}
                      >
                        <Plus size={13} strokeWidth={1.5} />
                        Add task
                      </button>
                    </div>
                    </section>
                  </React.Fragment>
                );
              })}

              {state.columns.length > 0 && <ColumnDivider />}
              <AddColumnTile onAdd={addColumn} />
            </div>
          </div>
        </div>
      </div>

      <DragGhost dragging={dragging} pos={dragPos} />

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        columns={state.columns}
        columnLabel={state.columns.find((c) => c.id === dialogColumn)?.label ?? ''}
        draft={draft}
        onDraftChange={setDraft}
        onSave={saveDialog}
        onDelete={() => {
          if (dialogTaskId) deleteTaskWithUndo(dialogTaskId);
          setDialogOpen(false);
        }}
      />
    </DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Header
// ─────────────────────────────────────────────────────────────────────────────

function BoardHeader({
  query,
  onQuery,
  total,
  onAdd,
}: {
  query: string;
  onQuery: (v: string) => void;
  total: number;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.5}
          aria-hidden
          color="#64748b"
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2"
        />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="h-9 w-[200px] rounded-full border-[var(--border)]/70 bg-[var(--card)]/80 !pl-10 pr-3 text-sm shadow-none backdrop-blur sm:w-64"
        />
      </div>
      <Button
        onClick={onAdd}
        className={cn(
          'h-9 gap-1.5 rounded-full border-0 px-4 text-sm font-semibold',
          'bg-none bg-[var(--brand-accent-cta)] text-[var(--brand-dark)]',
          'shadow-none transition hover:brightness-105',
        )}
      >
        <Plus size={16} strokeWidth={1.5} />
        New task
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Column header (label + count + menu)
// ─────────────────────────────────────────────────────────────────────────────

function ColumnHeader({
  col,
  accent,
  count,
  shown,
  renaming,
  onStartRename,
  onRename,
  onAdd,
  onSetAccent,
  onDelete,
}: {
  col: Column;
  accent: AccentKey;
  count: number;
  shown: number;
  renaming: boolean;
  onStartRename: () => void;
  onRename: (v: string) => void;
  onAdd: () => void;
  onSetAccent: (a: AccentKey) => void;
  onDelete: () => void;
}) {
  const a = ACCENT_PALETTE[accent];
  const [value, setValue] = useState(col.label);

  useEffect(() => {
    setValue(col.label);
  }, [col.label]);

  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', a.dot)} aria-hidden />
        {renaming ? (
          <input
            autoFocus
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onRename(value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.currentTarget as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') {
                setValue(col.label);
                onRename(col.label);
              }
            }}
            className={cn(
              'w-full min-w-0 max-w-[180px] bg-transparent text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-900',
              'outline-none ring-1 ring-[var(--brand-accent)]/40 rounded px-1 -mx-1',
            )}
          />
        ) : (
          <button
            type="button"
            onDoubleClick={onStartRename}
            className="truncate text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-900"
            title="Double-click to rename"
          >
            {col.label}
          </button>
        )}
        <span
          className={cn(
            'inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5',
            'text-[10.5px] font-semibold leading-none tabular-nums',
            'bg-white text-slate-700',
            'ring-1 ring-inset ring-slate-200',
          )}
        >
          {shown === count ? count : `${shown}/${count}`}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add task to ${col.label}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Column actions for ${col.label}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
            >
              <DotsIcon />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 p-1.5"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onStartRename();
              }}
              className="gap-2 text-sm"
            >
              <Edit size={13} strokeWidth={1.5} />
              Rename column
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 pb-1 pt-1.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Color
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {ACCENT_KEYS.map((k) => {
                  const selected = k === accent;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-label={`Set color ${k}`}
                      title={k}
                      onClick={() => onSetAccent(k)}
                      className={cn(
                        'group/swatch relative flex h-7 w-7 items-center justify-center rounded-full',
                        'transition-transform duration-150 ease-out',
                        'hover:scale-110',
                        selected
                          ? 'ring-2 ring-[var(--brand-accent)] ring-offset-2 ring-offset-[var(--card)]'
                          : 'ring-1 ring-inset ring-[var(--border)]/60',
                      )}
                    >
                      <span className={cn('h-4 w-4 rounded-full', ACCENT_PALETTE[k].dot)} />
                    </button>
                  );
                })}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="gap-2 text-sm text-rose-600 focus:bg-rose-50 focus:text-rose-700 dark:focus:bg-rose-400/10"
            >
              <Trash2 size={13} strokeWidth={1.5} />
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Task card
// ─────────────────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  accent,
  dimmed,
  renaming,
  onStartRename,
  onRename,
  onCancelRename,
  onOpen,
  onDelete,
}: {
  task: Task;
  accent: AccentKey;
  dimmed?: boolean;
  renaming?: boolean;
  onStartRename: () => void;
  onRename: (v: string) => void;
  onCancelRename: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const meta = PRIORITY_META[task.priority];
  const a = ACCENT_PALETTE[accent];
  const [value, setValue] = useState(task.title);

  useEffect(() => {
    setValue(task.title);
  }, [task.title]);

  return (
    <div
      onClick={(e) => {
        if (renaming) return;
        const target = e.target as HTMLElement;
        if (target.closest('[data-card-action]')) return;
        onOpen();
      }}
      className={cn(
        'group/card relative cursor-grab select-none overflow-hidden rounded-2xl border border-slate-200',
        'bg-white p-3.5 pl-4 text-slate-900',
        'shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_14px_-10px_rgba(15,23,42,0.18)]',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:-translate-y-[1px] hover:border-[var(--border)] hover:shadow-[0_1px_0_rgba(15,23,42,0.05),0_14px_30px_-14px_rgba(15,23,42,0.22)]',
        'active:cursor-grabbing',
        dimmed && 'opacity-40',
      )}
    >
      <span
        aria-hidden
        className={cn('absolute left-0 top-2.5 h-[calc(100%-20px)] w-[3px] rounded-r-full', a.bar)}
      />

      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => onRename(value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(value);
              if (e.key === 'Escape') {
                setValue(task.title);
                onCancelRename();
              }
            }}
            className={cn(
              'flex-1 bg-transparent text-[13.5px] font-semibold leading-snug text-[var(--text-primary)]',
              'outline-none ring-1 ring-[var(--brand-accent)]/40 rounded px-1 -mx-1',
            )}
          />
        ) : (
          <p
            className="flex-1 text-[13.5px] font-semibold leading-snug tracking-tight text-[var(--text-primary)]"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            {task.title}
          </p>
        )}

        {!renaming && (
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100"
            data-card-action
          >
            <button
              type="button"
              aria-label="Rename task"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
            >
              <Edit size={12} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Delete task"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-400/10"
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {task.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={task.image}
          alt=""
          className="mt-2 h-32 w-full rounded-lg object-cover ring-1 ring-inset ring-[var(--border)]/70"
          draggable={false}
        />
      )}

      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[var(--muted)]">
          {task.description}
        </p>
      )}

      {(task.tags.length > 0 || task.dueDate) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--nav-hover)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]"
            >
              {tag}
            </span>
          ))}
          {task.dueDate && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--muted)]">
              <Calendar size={11} strokeWidth={1.5} />
              {task.dueDate}
            </span>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none ring-1 ring-inset"
          style={{
            backgroundColor: meta.pillBg,
            color: meta.pillText,
            // ring-1 ring-inset uses --tw-ring-color; set it explicitly:
            // (Tailwind v4 picks up the CSS variable)
            ['--tw-ring-color' as never]: meta.pillBorder,
          }}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
          {meta.label}
        </span>
        {task.assignees.length > 0 && <AvatarStack names={task.assignees} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Drop indicator
// ─────────────────────────────────────────────────────────────────────────────

function DragGhost({
  dragging,
  pos,
}: {
  dragging: {
    task: Task;
    accent: AccentKey;
    width: number;
    offsetX: number;
    offsetY: number;
  } | null;
  pos: { x: number; y: number } | null;
}) {
  if (!dragging || !pos) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, rotate: -1 }}
      animate={{ opacity: 1, scale: 1.03, rotate: -1.5 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 600, damping: 32, mass: 0.5 }}
      style={{
        position: 'fixed',
        left: pos.x - dragging.offsetX,
        top: pos.y - dragging.offsetY,
        width: dragging.width,
        zIndex: 80,
        pointerEvents: 'none',
        transformOrigin: 'top left',
        filter: 'drop-shadow(0 18px 30px rgba(15,23,42,0.28))',
      }}
    >
      <TaskCard
        task={dragging.task}
        accent={dragging.accent}
        onStartRename={() => {}}
        onRename={() => {}}
        onCancelRename={() => {}}
        onOpen={() => {}}
        onDelete={() => {}}
      />
    </motion.div>
  );
}

function DropIndicator() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scaleX: 0.7, scaleY: 0.6 }}
      animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="my-0.5 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Add-column tile
// ─────────────────────────────────────────────────────────────────────────────

function ColumnDivider() {
  return (
    <div
      aria-hidden
      className={cn(
        'shrink-0 self-stretch',
        'w-px',
        'bg-gradient-to-b from-transparent via-[var(--border)]/70 to-transparent',
        'opacity-80',
      )}
    />
  );
}

function AddColumnTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'flex min-h-[64vh] w-[280px] flex-col items-center justify-center rounded-2xl',
        'border border-dashed border-[var(--border)] text-[var(--muted)]',
        'transition-all duration-200',
        'hover:border-[var(--brand-primary)]/40 hover:bg-white/40 hover:text-[var(--text-primary)] dark:hover:bg-white/[0.02]',
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nav-hover)]">
        <Plus size={16} strokeWidth={1.5} />
      </span>
      <span className="mt-2 text-[12px] font-medium">Add column</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Undo toast
// ─────────────────────────────────────────────────────────────────────────────

function UndoToast({
  visible,
  title,
  subtitle,
  onUndo,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-3 pr-2',
        'shadow-[0_1px_0_rgba(15,23,42,0.04),0_12px_28px_-14px_rgba(15,23,42,0.25)]',
        'transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
      role="status"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-hover)] text-[var(--text-secondary)]">
        <CheckCircle size={15} strokeWidth={1.5} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{title}</p>
        {subtitle && (
          <p className="truncate text-[11px] text-[var(--muted)]" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="ml-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          className={cn(
            'h-7 rounded-full border-0 px-3 text-[11.5px] font-semibold',
            'bg-none bg-[var(--brand-accent-cta)] text-[var(--brand-dark)] shadow-none hover:brightness-105',
          )}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Task dialog
// ─────────────────────────────────────────────────────────────────────────────

function TaskDialog({
  open,
  onOpenChange,
  mode,
  columns,
  columnLabel,
  draft,
  onDraftChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  columns: Column[];
  columnLabel: string;
  draft: DraftTask;
  onDraftChange: (d: DraftTask) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[540px]">
        <DialogHeader className="shrink-0 px-6 pb-3 pt-6">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {mode === 'create' ? 'New task' : 'Edit task'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'create' ? `Add a task to ${columnLabel}.` : `In ${columnLabel}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border)]">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Title
            </label>
            <Input
              ref={titleRef}
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Description
            </label>
            <Textarea
              value={draft.description}
              onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              placeholder="Optional context, links, acceptance criteria…"
              className="min-h-[88px]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Image
            </label>
            <ImageDropzone
              value={draft.image}
              onChange={(image) => onDraftChange({ ...draft, image })}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Status / Column
            </label>
            <Select
              value={draft.columnId}
              onValueChange={(v) => onDraftChange({ ...draft, columnId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id} textValue={c.label}>
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('h-1.5 w-1.5 rounded-full', ACCENT_PALETTE[c.accent].dot)} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Priority
              </label>
              <Select
                value={draft.priority}
                onValueChange={(v) => onDraftChange({ ...draft, priority: v as Priority })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'urgent'] as Priority[]).map((p) => (
                    <SelectItem key={p} value={p} textValue={PRIORITY_META[p].label}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_META[p].dot)} />
                        {PRIORITY_META[p].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Due date
              </label>
              <Input
                type="date"
                value={draft.dueDate}
                onChange={(e) => onDraftChange({ ...draft, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Assignees
            </label>
            <AssigneesInput
              value={draft.assignees}
              onChange={(assignees) => onDraftChange({ ...draft, assignees })}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Tags
            </label>
            <Input
              value={draft.tags}
              onChange={(e) => onDraftChange({ ...draft, tags: e.target.value })}
              placeholder="comma, separated"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-4">
          <div>
            {mode === 'edit' && (
              <Button
                variant="ghost"
                onClick={onDelete}
                className="h-9 gap-1.5 rounded-full px-3 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-400/10"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-full px-3 text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              className={cn(
                'h-9 gap-1.5 rounded-full border-0 px-4 text-xs font-semibold',
                'bg-none bg-[var(--brand-accent-cta)] text-[var(--brand-dark)] shadow-none hover:brightness-105',
              )}
            >
              {mode === 'create' ? (
                <>
                  <Plus size={14} strokeWidth={1.5} />
                  Add task
                </>
              ) : (
                <>
                  <Edit size={14} strokeWidth={1.5} />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Avatar stack (overlapping initial bubbles) for assignees on the card
// ─────────────────────────────────────────────────────────────────────────────

const AVATAR_TINTS: ReadonlyArray<[string, string, string]> = [
  ['rgba(77,146,196,0.18)',  'rgba(77,146,196,0.10)',  '#0f5c8a'],
  ['rgba(167,139,250,0.20)', 'rgba(167,139,250,0.10)', '#5b2db8'],
  ['rgba(244,114,182,0.20)', 'rgba(244,114,182,0.10)', '#a01a5a'],
  ['rgba(45,212,191,0.22)',  'rgba(45,212,191,0.10)',  '#0f766e'],
  ['rgba(251,191,36,0.22)',  'rgba(251,191,36,0.10)',  '#92500e'],
  ['rgba(248,113,113,0.20)', 'rgba(248,113,113,0.10)', '#9f1239'],
];

function tintFor(name: string): readonly [string, string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function AvatarStack({ names, max = 3, size = 24 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  return (
    <div className="flex items-center" style={{ paddingLeft: shown.length > 1 ? 6 : 0 }}>
      {shown.map((name, i) => {
        const [bg1, bg2, fg] = tintFor(name);
        return (
          <span
            key={`${name}-${i}`}
            title={name}
            className="flex items-center justify-center rounded-full ring-2 ring-[var(--card)]"
            style={{
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -6,
              background: `linear-gradient(135deg, ${bg1}, ${bg2})`,
              color: fg,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {initials(name)}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          title={names.slice(max).join(', ')}
          className="flex items-center justify-center rounded-full bg-[var(--nav-hover)] text-[var(--text-secondary)] ring-2 ring-[var(--card)]"
          style={{
            width: size,
            height: size,
            marginLeft: -6,
            fontSize: 9.5,
            fontWeight: 700,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Assignees input (chip-style multi-value)
// ─────────────────────────────────────────────────────────────────────────────

function AssigneesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commit = useCallback(
    (raw: string) => {
      const cleaned = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !value.includes(s));
      if (cleaned.length === 0) return;
      onChange([...value, ...cleaned]);
      setDraft('');
    },
    [value, onChange],
  );

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        'flex min-h-[40px] w-full flex-wrap items-center gap-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-2 py-1.5',
        'focus-within:ring-2 focus-within:ring-[var(--brand-primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--ring-offset)]',
        'cursor-text transition-shadow',
      )}
    >
      {value.map((name, i) => {
        const [bg1, bg2, fg] = tintFor(name);
        return (
          <span
            key={`${name}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-1.5 text-[12px] font-medium ring-1 ring-inset"
            style={{
              background: `linear-gradient(135deg, ${bg1}, ${bg2})`,
              color: fg,
              ['--tw-ring-color' as never]: bg1,
            }}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[9.5px] font-bold"
              style={{ backgroundColor: bg1, color: fg }}
            >
              {initials(name)}
            </span>
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-black/10"
            >
              <X size={9} strokeWidth={1.5} />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            removeAt(value.length - 1);
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? 'Type a name and press Enter…' : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--muted)]"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Image dropzone (click to pick · drag-and-drop · paste)
// ─────────────────────────────────────────────────────────────────────────────

function ImageDropzone({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are supported.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error('Image is too large (max 4 MB).');
        return;
      }
      try {
        const data = await readImageAsDataUrl(file);
        if (data) onChange(data);
      } catch {
        toast.error('Could not read the image.');
      }
    },
    [onChange],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) void handleFile(file);
  };

  if (value) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="block max-h-56 w-full object-cover" />
        <div className="absolute right-2 top-2 flex gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-7 items-center gap-1 rounded-full bg-black/55 px-2.5 text-[11px] font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <Edit size={11} strokeWidth={1.5} />
            Replace
          </button>
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => onChange('')}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={onDrop}
      onPaste={onPaste}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        'flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed',
        'text-[11.5px] text-[var(--muted)] transition-colors',
        over
          ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/[0.06] text-[var(--text-primary)]'
          : 'border-[var(--border)] hover:border-[var(--brand-primary)]/40 hover:text-[var(--text-primary)]',
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--nav-hover)] text-[var(--text-secondary)]">
        <Plus size={13} strokeWidth={1.5} />
      </span>
      <span>
        <span className="font-medium text-[var(--text-primary)]">Drop an image</span>{' '}
        <span>or click to upload · paste also works</span>
      </span>
      <span className="text-[10px] text-[var(--muted)]">PNG, JPG, GIF · up to 4 MB</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tiny three-dot icon (kebab): kept local to avoid touching the icon wrapper
// ─────────────────────────────────────────────────────────────────────────────

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="1.35" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" opacity="0.85" />
      <circle cx="18" cy="12" r="1.35" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
