'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { documentApi } from '@/lib/api';
import {
  X,
  Loader2,
  Download,
  FileText,
  Edit,
  ChevronLeft,
  Settings,
  Check,
} from '@/components/icons';
import { cn } from '@/utils/cn';
import { FileGlyph, typeLabel } from '@/components/file-manager/FileTypeIcon';
import { detectEditorKind, getExt, type EditorKind } from '@/components/file-manager/editors/editorTypes';
import { SheetEditor, parseCSV, serializeCSV, type Sheet, type Cell, type Merge } from '@/components/file-manager/editors/SheetEditor';
import { PreviewPane } from '@/components/file-manager/editors/PreviewPane';
import { WordEditor, htmlToDocxBlob } from '@/components/file-manager/editors/WordEditor';
import { PdfViewer } from '@/components/file-manager/editors/PdfViewer';
import * as XLSX from 'xlsx';
import { Upload as UploadIcon } from '@/components/icons';

function formatBytes(b?: number): string {
  if (!b || b < 0) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[var(--nav-hover)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          'relative inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-[var(--brand-primary)]' : 'bg-[var(--border)]',
        )}
      >
        <span
          className={cn(
            'inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
          )}
        />
      </span>
    </button>
  );
}

const FONT_SIZE_STEPS = [12, 13, 14, 15, 16, 18, 20];

interface Props {
  docId: string;
}

interface EditorPrefs {
  fontSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
  theme: 'paper' | 'soft' | 'night';
  autoSave: boolean;
}

const DEFAULT_PREFS: EditorPrefs = {
  fontSize: 14,
  wordWrap: true,
  showLineNumbers: true,
  theme: 'paper',
  autoSave: false,
};

export function FileEditorPage({ docId }: Props) {
  const router = useRouter();

  // Document metadata
  const [docName, setDocName] = useState<string>('');
  const [docMime, setDocMime] = useState<string | undefined>(undefined);
  const [docSize, setDocSize] = useState<number | undefined>(undefined);
  const [docError, setDocError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [editName, setEditName] = useState('');
  const [changeNote, setChangeNote] = useState('');

  // Preferences
  const [prefs, setPrefs] = useState<EditorPrefs>(DEFAULT_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Caret position
  const [caret, setCaret] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kind: EditorKind = useMemo(
    () => (docName ? detectEditorKind(docName, docMime) : 'text'),
    [docName, docMime],
  );
  const editable = kind !== 'replace';

  // Sheet (CSV / XLSX) + binary (PDF / image / replace) state.
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [originalSheets, setOriginalSheets] = useState<Sheet[]>([]);
  const [binaryBytes, setBinaryBytes] = useState<Uint8Array | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [wordHtml, setWordHtml] = useState<string>('');
  const [originalWordHtml, setOriginalWordHtml] = useState<string>('');
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Load prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem('qurelio-editor-prefs');
      if (raw) {
        const p = JSON.parse(raw) as Partial<EditorPrefs>;
        setPrefs({ ...DEFAULT_PREFS, ...p });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist prefs
  useEffect(() => {
    try {
      localStorage.setItem('qurelio-editor-prefs', JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  // Close settings popover on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [settingsOpen]);

  // Load document metadata + content
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setDocError(null);
      try {
        const meta = await documentApi.get(docId);
        if (cancelled) return;
        const m = meta.data as {
          name: string;
          mimeType?: string;
          sizeBytes?: number | string;
        };
        setDocName(m.name);
        setEditName(m.name);
        setDocMime(m.mimeType);
        setDocSize(typeof m.sizeBytes === 'string' ? Number(m.sizeBytes) : m.sizeBytes);

        const k = detectEditorKind(m.name, m.mimeType);
        const r = await documentApi.getDownload(docId);
        const blob = r.data as Blob;

        if (k === 'text') {
          const text = await blob.text();
          if (cancelled) return;
          setContent(text);
          setOriginalContent(text);
        } else if (k === 'csv') {
          const text = await blob.text();
          if (cancelled) return;
          const delim = getExt(m.name) === 'tsv' ? '\t' : ',';
          const parsed = parseCSV(text, delim);
          setSheets(parsed);
          setOriginalSheets(parsed);
        } else if (k === 'xlsx') {
          const buf = new Uint8Array(await blob.arrayBuffer());
          if (cancelled) return;
          try {
            const wb = XLSX.read(buf, { type: 'array', cellFormula: true, cellDates: true });
            const parsed: Sheet[] = wb.SheetNames.map((sn) => {
              const ws = wb.Sheets[sn];
              const ref = ws['!ref'];
              const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
              const cells: Cell[][] = [];
              for (let r = range.s.r; r <= range.e.r; r++) {
                const row: Cell[] = [];
                for (let c = range.s.c; c <= range.e.c; c++) {
                  const addr = XLSX.utils.encode_cell({ r, c });
                  const cell = ws[addr];
                  if (!cell) {
                    row.push({ v: '' });
                    continue;
                  }
                  let display = '';
                  if (cell.w !== undefined) display = String(cell.w);
                  else if (cell.v instanceof Date) display = cell.v.toISOString().slice(0, 10);
                  else if (cell.v !== undefined && cell.v !== null) display = String(cell.v);
                  row.push({
                    v: display,
                    f: cell.f || undefined,
                    t:
                      cell.t === 'n'
                        ? 'n'
                        : cell.t === 'b'
                        ? 'b'
                        : cell.t === 'd'
                        ? 'd'
                        : 's',
                  });
                }
                cells.push(row);
              }
              const merges: Merge[] | undefined = ws['!merges']
                ? (ws['!merges'] as Merge[]).map((m) => ({ s: { ...m.s }, e: { ...m.e } }))
                : undefined;
              const colWidths = ws['!cols']
                ? (ws['!cols'] as { wpx?: number; wch?: number }[]).map(
                    (col) => col?.wpx ?? (col?.wch ? col.wch * 7 : 120),
                  )
                : undefined;
              return { name: sn, cells, merges, colWidths };
            });
            setSheets(parsed);
            setOriginalSheets(parsed);
          } catch {
            setError('Could not parse the spreadsheet.');
          }
        } else {
          // word / pdf / image / replace: keep raw bytes
          const buf = new Uint8Array(await blob.arrayBuffer());
          if (cancelled) return;
          setBinaryBytes(buf);
        }
      } catch {
        if (!cancelled) setDocError('Could not load this document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const sheetsDirty = useMemo(
    () => JSON.stringify(sheets) !== JSON.stringify(originalSheets),
    [sheets, originalSheets],
  );
  const dirty =
    editName !== docName ||
    (kind === 'text' && content !== originalContent) ||
    ((kind === 'csv' || kind === 'xlsx') && sheetsDirty) ||
    (kind === 'word' && (wordHtml !== originalWordHtml || replaceFile !== null)) ||
    ((kind === 'pdf' || kind === 'image' || kind === 'replace') && replaceFile !== null);
  const lineCount = useMemo(() => content.split('\n').length || 1, [content]);
  const charCount = content.length;
  const wordCount = useMemo(() => {
    const t = content.trim();
    return t ? t.split(/\s+/).length : 0;
  }, [content]);

  const updateCaret = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const before = el.value.slice(0, pos);
    const lines = before.split('\n');
    setCaret({ line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 });
  }, []);

  /**
   * Save persists a new version. If `andExit` is true (default for the explicit Save button),
   * navigate back to the file manager once saving succeeds.
   */
  const saveVersion = useCallback(
    async (andExit: boolean): Promise<boolean> => {
      if (!dirty || saving || !editable) return false;
      setSaving(true);
      setError(null);
      try {
        const targetName = editName.trim() || docName;
        let blobPayload: BlobPart;
        let mime = docMime || 'application/octet-stream';

        if (kind === 'text') {
          blobPayload = content;
          mime = docMime || 'text/plain';
        } else if (kind === 'csv') {
          const delim = getExt(targetName) === 'tsv' ? '\t' : ',';
          blobPayload = serializeCSV(sheets, delim);
          mime = delim === '\t' ? 'text/tab-separated-values' : 'text/csv';
        } else if (kind === 'xlsx') {
          // Re-build a workbook preserving formulas, types, merges and col widths.
          const wb = XLSX.utils.book_new();
          for (const s of sheets) {
            const ws: Record<string, unknown> = {};
            const lastRow = s.cells.length - 1;
            const lastCol = (s.cells[0]?.length ?? 1) - 1;
            for (let r = 0; r <= lastRow; r++) {
              for (let c = 0; c <= lastCol; c++) {
                const cell = s.cells[r]?.[c];
                if (!cell || (!cell.v && !cell.f)) continue;
                const addr = XLSX.utils.encode_cell({ r, c });
                const obj: Record<string, unknown> = {};
                if (cell.f) {
                  obj.f = cell.f;
                  obj.t = 's';
                  obj.v = cell.v;
                } else if (cell.t === 'n' && cell.v !== '' && !Number.isNaN(Number(cell.v))) {
                  obj.t = 'n';
                  obj.v = Number(cell.v);
                } else if (cell.t === 'b') {
                  obj.t = 'b';
                  obj.v = cell.v === 'true' || cell.v === 'TRUE';
                } else {
                  obj.t = 's';
                  obj.v = cell.v;
                }
                ws[addr] = obj;
              }
            }
            ws['!ref'] = XLSX.utils.encode_range({
              s: { r: 0, c: 0 },
              e: { r: Math.max(0, lastRow), c: Math.max(0, lastCol) },
            });
            if (s.merges?.length) ws['!merges'] = s.merges;
            if (s.colWidths?.length) ws['!cols'] = s.colWidths.map((w) => ({ wpx: w }));
            XLSX.utils.book_append_sheet(wb, ws as XLSX.WorkSheet, s.name.slice(0, 31) || 'Sheet1');
          }
          const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
          blobPayload = new Uint8Array(buf);
          mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (kind === 'word') {
          if (replaceFile) {
            blobPayload = replaceFile;
            mime = replaceFile.type || mime;
          } else {
            const docxBlob = htmlToDocxBlob(wordHtml || '<p></p>');
            blobPayload = docxBlob;
            mime =
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          }
        } else {
          // pdf / image / replace: user must have picked a replacement file.
          if (!replaceFile) {
            setError('Pick a replacement file or change the name to save.');
            setSaving(false);
            return false;
          }
          blobPayload = replaceFile;
          mime = replaceFile.type || mime;
        }

        const file =
          blobPayload instanceof File
            ? blobPayload
            : new File([blobPayload], targetName, { type: mime });
        const fd = new FormData();
        fd.append('file', file);
        if (changeNote.trim()) fd.append('changeNote', changeNote.trim());
        await documentApi.uploadVersion(docId, fd);
        if (targetName !== docName) {
          try {
            await documentApi.update(docId, { name: targetName });
          } catch {
            /* non-fatal */
          }
        }

        // Reset dirty baselines.
        if (kind === 'text') {
          setOriginalContent(content);
        } else if (kind === 'csv' || kind === 'xlsx') {
          setOriginalSheets(sheets);
        } else if (kind === 'word') {
          if (replaceFile) {
            const buf = new Uint8Array(await replaceFile.arrayBuffer());
            setBinaryBytes(buf);
            setReplaceFile(null);
          }
          setOriginalWordHtml(wordHtml);
        } else if (replaceFile) {
          const buf = new Uint8Array(await replaceFile.arrayBuffer());
          setBinaryBytes(buf);
          setReplaceFile(null);
        }
        setChangeNote('');
        setSavedAt(new Date());
        if (andExit) {
          router.push('/file-manager');
        }
        return true;
      } catch {
        setError('Could not save. You may not have permission to edit this file.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      dirty,
      saving,
      editable,
      kind,
      editName,
      docName,
      content,
      sheets,
      wordHtml,
      replaceFile,
      docMime,
      changeNote,
      docId,
      router,
    ],
  );

  // Auto-save: debounce 1.5s after the user stops typing
  useEffect(() => {
    if (!prefs.autoSave || !dirty || !editable) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveVersion(false);
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [content, editName, sheets, wordHtml, replaceFile, prefs.autoSave, dirty, editable, saveVersion]);

  const handleDownload = useCallback(async () => {
    try {
      const r = await documentApi.getDownload(docId);
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download the file.');
    }
  }, [docId, docName]);

  const requestExit = useCallback(() => {
    if (dirty && !prefs.autoSave) {
      if (!window.confirm('Discard unsaved changes?')) return;
    }
    router.push('/file-manager');
  }, [dirty, prefs.autoSave, router]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        requestExit();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveVersion(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestExit, saveVersion, settingsOpen]);

  const handleEditorScroll = useCallback(() => {
    if (lineGutterRef.current && textareaRef.current) {
      lineGutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const setPref = <K extends keyof EditorPrefs>(k: K, v: EditorPrefs[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  // Theme palettes (calm, easy on the eyes)
  const surface =
    prefs.theme === 'paper'
      ? { bg: '#FBFAF6', fg: '#2A2A2A' }
      : prefs.theme === 'soft'
      ? { bg: 'var(--surface)', fg: 'var(--text-primary)' }
      : { bg: '#0F172A', fg: '#E2E8F0' };
  const gutter =
    prefs.theme === 'paper'
      ? { bg: '#F3F1EA', fg: '#9A958A' }
      : prefs.theme === 'soft'
      ? { bg: 'var(--page-bg)', fg: 'var(--muted)' }
      : { bg: '#0B1220', fg: '#64748B' };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (docError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[var(--page-bg)] p-8 text-center">
        <FileText className="h-10 w-10 text-[var(--muted)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">{docError}</p>
        <button
          type="button"
          onClick={() => router.push('/file-manager')}
          className="mt-2 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
        >
          Back to File Manager
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--page-bg)]">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-[var(--border)]/60 bg-[var(--surface)] px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={requestExit}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-[12.5px] font-medium text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50 hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40"
          aria-label="Back to File Manager"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="hidden h-6 w-px bg-[var(--border)] sm:block" />

        <FileGlyph name={docName || 'file'} mime={docMime} size={34} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={!editable || loading}
            placeholder="Untitled"
            className="w-full truncate bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none transition-colors focus:text-[var(--brand-primary)] disabled:cursor-default"
          />
          <p className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-[var(--muted)]">
            <span>{docName ? typeLabel(docName, docMime) : 'Loading…'}</span>
            {docSize !== undefined && (
              <>
                <span className="h-1 w-1 rounded-full bg-[var(--muted)]/50" />
                <span>{formatBytes(docSize)}</span>
              </>
            )}
            {dirty ? (
              <>
                <span className="h-1 w-1 rounded-full bg-[var(--muted)]/50" />
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {prefs.autoSave && saving ? 'Auto-saving…' : 'Unsaved'}
                </span>
              </>
            ) : savedAt ? (
              <>
                <span className="h-1 w-1 rounded-full bg-[var(--muted)]/50" />
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  Saved{' '}
                  {savedAt.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </>
            ) : null}
          </p>
        </div>

        {/* Settings popover */}
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40',
              settingsOpen && 'bg-[var(--nav-hover)]/50',
            )}
            aria-label="Editor settings"
            aria-expanded={settingsOpen}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg shadow-black/5">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Editor settings
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="cursor-pointer rounded-md p-1 text-[var(--muted)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
                  aria-label="Close settings"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Switch
                checked={prefs.autoSave}
                onChange={(v) => setPref('autoSave', v)}
                label="Auto-save"
                description="Automatically save a new version 1.5 s after you stop typing."
              />
              <Switch
                checked={prefs.wordWrap}
                onChange={(v) => setPref('wordWrap', v)}
                label="Word wrap"
                description="Wrap long lines to fit the editor width."
              />
              <Switch
                checked={prefs.showLineNumbers}
                onChange={(v) => setPref('showLineNumbers', v)}
                label="Line numbers"
                description="Show line numbers in the gutter."
              />
            </div>
          )}
        </div>

        {editable && (
          <button
            type="button"
            onClick={() => void saveVersion(true)}
            disabled={!dirty || saving}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40',
              dirty && !saving
                ? 'cursor-pointer bg-[var(--brand-primary)] hover:opacity-90'
                : 'cursor-not-allowed bg-[var(--brand-primary)]/40',
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : 'Save & exit'}
          </button>
        )}

        <button
          type="button"
          onClick={requestExit}
          className="cursor-pointer rounded-xl p-1.5 text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/5 px-6 py-2 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border)]/60 bg-[var(--surface)] md:flex">
          <div className="flex flex-col gap-3 p-5">
            {/* About */}
            <section className="rounded-2xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                About this file
              </p>
              <dl className="space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--muted)]">Type</dt>
                  <dd className="truncate font-medium text-[var(--text-primary)]">
                    {docName ? typeLabel(docName, docMime) : '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--muted)]">Size</dt>
                  <dd className="font-medium text-[var(--text-primary)]">{formatBytes(docSize)}</dd>
                </div>
                {editable && (
                  <>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--muted)]">Lines</dt>
                      <dd className="font-medium text-[var(--text-primary)]">{lineCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--muted)]">Words</dt>
                      <dd className="font-medium text-[var(--text-primary)]">{wordCount}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>

            {editable && (
              <>
                {/* Appearance */}
                <section className="rounded-2xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3.5">
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Appearance
                  </p>

                  <p className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">Theme</p>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'paper', label: 'Paper', bg: '#FBFAF6', fg: '#2A2A2A' },
                        { id: 'soft', label: 'Soft', bg: 'var(--surface)', fg: 'var(--text-primary)' },
                        { id: 'night', label: 'Night', bg: '#0F172A', fg: '#E2E8F0' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPref('theme', t.id)}
                        aria-pressed={prefs.theme === t.id}
                        className={cn(
                          'flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 transition-all duration-150',
                          prefs.theme === t.id
                            ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/20'
                            : 'border-[var(--border)]/60 hover:border-[var(--brand-primary)]/40',
                        )}
                      >
                        <span
                          className="flex h-7 w-full items-center justify-center rounded-md text-[10px] font-semibold"
                          style={{ background: t.bg, color: t.fg }}
                        >
                          Aa
                        </span>
                        <span className="text-[10.5px] font-medium text-[var(--text-primary)]">
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[var(--muted)]">Font size</span>
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
                      {prefs.fontSize}px
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const i = FONT_SIZE_STEPS.indexOf(prefs.fontSize);
                        setPref('fontSize', i > 0 ? FONT_SIZE_STEPS[i - 1] : FONT_SIZE_STEPS[0]);
                      }}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                      aria-label="Decrease font size"
                    >
                      −
                    </button>
                    <div className="flex flex-1 gap-0.5 rounded-lg bg-[var(--surface)] p-0.5">
                      {FONT_SIZE_STEPS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setPref('fontSize', s)}
                          className={cn(
                            'flex-1 cursor-pointer rounded-md py-0.5 text-[10px] font-semibold transition-colors duration-150',
                            s === prefs.fontSize
                              ? 'bg-[var(--brand-primary)] text-white'
                              : 'text-[var(--muted)] hover:bg-[var(--nav-hover)]/50',
                          )}
                          aria-label={`Font size ${s}px`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const i = FONT_SIZE_STEPS.indexOf(prefs.fontSize);
                        const next =
                          i >= 0 && i < FONT_SIZE_STEPS.length - 1
                            ? FONT_SIZE_STEPS[i + 1]
                            : FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
                        setPref('fontSize', next);
                      }}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                      aria-label="Increase font size"
                    >
                      +
                    </button>
                  </div>
                </section>

                {/* Change note */}
                <section className="rounded-2xl border border-[var(--border)]/60 bg-[var(--page-bg)]/40 p-3.5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Change note
                  </p>
                  <textarea
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="What did you change?"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] outline-none transition-colors duration-150 focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/15"
                  />
                </section>

                {/* Actions */}
                <section className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setContent(originalContent);
                      setSheets(originalSheets);
                      setWordHtml(originalWordHtml);
                      setReplaceFile(null);
                      setEditName(docName);
                      setChangeNote('');
                    }}
                    disabled={!dirty || saving}
                    className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revert changes
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </section>

                <p className="rounded-xl bg-[var(--brand-primary)]/8 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--text-primary)]/80">
                  Saving creates a new <span className="font-semibold">version</span> of this
                  document. Previous revisions are kept in the document history.
                </p>
              </>
            )}
          </div>
        </aside>

        {/* Editor */}
        <main className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" />
            </div>
          ) : kind === 'csv' || kind === 'xlsx' ? (
            <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
              <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)]">
                <SheetEditor
                  initialSheets={sheets}
                  onChange={(next) => setSheets(next)}
                  fontSize={prefs.fontSize}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>
                  {sheets.reduce((n, s) => n + s.cells.length, 0)} rows ·{' '}
                  {sheets.length} sheet{sheets.length === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                  {prefs.autoSave && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--brand-primary)]/10 px-2 py-0.5 font-medium text-[var(--brand-primary)]">
                      Auto-save on
                    </span>
                  )}
                  <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px]">
                    Ctrl
                  </kbd>
                  <span>+</span>
                  <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px]">
                    S
                  </kbd>
                  <span>to save &amp; exit</span>
                </div>
              </div>
            </div>
          ) : kind === 'word' ? (
            <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
              <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)]">
                <WordEditor
                  bytes={binaryBytes}
                  initialHtml={originalWordHtml || null}
                  fontSize={prefs.fontSize}
                  onChange={(html) => {
                    setWordHtml(html);
                    if (!originalWordHtml) setOriginalWordHtml(html);
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>Original Word formatting is preserved; saving creates a new .docx version.</span>
                <input
                  ref={replaceInputRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setReplaceFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => replaceInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  {replaceFile ? `Replacement: ${replaceFile.name}` : 'Replace file'}
                </button>
              </div>
            </div>
          ) : kind === 'pdf' ? (
            <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
              <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)]">
                <PdfViewer bytes={replaceFile ? null : binaryBytes} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>
                  {replaceFile
                    ? `Replacement ready: ${replaceFile.name} (${formatBytes(replaceFile.size)})`
                    : 'PDF editing is not supported in-app. Upload a new version to replace it.'}
                </span>
                <input
                  ref={replaceInputRef}
                  type="file"
                  hidden
                  accept="application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setReplaceFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => replaceInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  {replaceFile ? 'Pick a different file' : 'Replace file'}
                </button>
              </div>
            </div>
          ) : kind === 'image' || kind === 'replace' ? (
            <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
              <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-[var(--surface)]">
                <PreviewPane
                  bytes={replaceFile ?? binaryBytes}
                  mimeType={replaceFile?.type ?? docMime}
                  name={editName}
                  kind={kind === 'image' ? 'image' : 'generic'}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>
                  {replaceFile
                    ? `Replacement ready: ${replaceFile.name} (${formatBytes(replaceFile.size)})`
                    : 'Upload a new version to replace this file.'}
                </span>
                <input
                  ref={replaceInputRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setReplaceFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => replaceInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--nav-hover)]/50"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  {replaceFile ? 'Pick a different file' : 'Replace file'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
              <div
                className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)]/60"
                style={{ background: surface.bg }}
              >
                {prefs.showLineNumbers && (
                  <div
                    ref={lineGutterRef}
                    aria-hidden
                    className="select-none overflow-hidden px-3 py-5 text-right font-mono tabular-nums"
                    style={{
                      background: gutter.bg,
                      color: gutter.fg,
                      fontSize: `${prefs.fontSize}px`,
                      lineHeight: 1.7,
                      minWidth: `${String(lineCount).length + 1}ch`,
                    }}
                  >
                    {Array.from({ length: lineCount }, (_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onScroll={handleEditorScroll}
                  onClick={updateCaret}
                  onKeyUp={updateCaret}
                  onSelect={updateCaret}
                  spellCheck={false}
                  placeholder="Start typing…"
                  className={cn(
                    'min-h-0 flex-1 resize-none bg-transparent px-5 py-5 font-mono outline-none placeholder:opacity-40',
                    !prefs.wordWrap && 'overflow-x-auto whitespace-pre',
                  )}
                  style={{
                    color: surface.fg,
                    fontSize: `${prefs.fontSize}px`,
                    lineHeight: 1.7,
                    caretColor: 'var(--brand-primary)',
                  }}
                />
              </div>

              {/* Status bar */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                <div className="flex items-center gap-3">
                  <span>
                    Ln{' '}
                    <span className="font-semibold text-[var(--text-primary)]">{caret.line}</span>,
                    Col{' '}
                    <span className="font-semibold text-[var(--text-primary)]">{caret.col}</span>
                  </span>
                  <span className="h-1 w-1 rounded-full bg-[var(--muted)]/40" />
                  <span>{lineCount} lines</span>
                  <span className="h-1 w-1 rounded-full bg-[var(--muted)]/40" />
                  <span>{wordCount} words</span>
                  <span className="h-1 w-1 rounded-full bg-[var(--muted)]/40" />
                  <span>{charCount} chars</span>
                </div>
                <div className="flex items-center gap-2">
                  {prefs.autoSave && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--brand-primary)]/10 px-2 py-0.5 font-medium text-[var(--brand-primary)]">
                      Auto-save on
                    </span>
                  )}
                  <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px]">
                    Ctrl
                  </kbd>
                  <span>+</span>
                  <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px]">
                    S
                  </kbd>
                  <span>to save &amp; exit</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
