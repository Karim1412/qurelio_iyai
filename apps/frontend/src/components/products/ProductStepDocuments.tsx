'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Trash2, Sparkles, CircleCheck, CircleAlert, Loader2, Check, X } from '@/components/icons';
import { Info } from '@/components/icons';
import type { PrefillSuggestion } from '@/components/products/product-prefill';
import { cn } from '@/utils/cn';

/**
 * `pending`  : chosen, not sent yet
 * `uploading`: multipart upload in flight
 * `analyzing`: stored; OCR + AI structuring running on the RAG service
 * `done`     : extraction finished, contents available for the pre-fill
 * `error`    : upload rejected or extraction failed; the wizard continues without it
 */
export type UploadedFileStatus = 'pending' | 'uploading' | 'analyzing' | 'done' | 'error';

export interface UploadedFile {
  file: File;
  name: string;
  size: string;
  status: UploadedFileStatus;
  /** Set once the document row exists in the document-service. */
  documentId?: string;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ProductDocumentsData {
  files: UploadedFile[];
}

/** Upload + read progress across every file of the current analysis run. */
export interface AnalysisProgress {
  done: number;
  total: number;
  label: string;
}

interface Props {
  data: ProductDocumentsData;
  onChange: (d: Partial<ProductDocumentsData>) => void;
  /** True while the wizard is uploading + waiting on extraction; the list is read-only then. */
  isAnalyzing?: boolean;
  /** Number of fields the last analysis pre-filled: shown as the result of this step. */
  prefilledCount?: number;
  progress?: AnalysisProgress | null;
  /** Fields the document disagrees with; the user accepts or ignores each one. */
  suggestions?: PrefillSuggestion[];
  onApplySuggestion?: (s: PrefillSuggestion) => void;
  onIgnoreSuggestion?: (s: PrefillSuggestion) => void;
  onApplyAllSuggestions?: () => void;
  /** True once an analysis has run but changed nothing, reported instead of staying silent. */
  analysisMadeNoChange?: boolean;
}

const STATUS_STYLES: Record<UploadedFileStatus, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-[var(--nav-hover)] text-[var(--muted)]' },
  uploading: { label: 'Uploading', cls: 'bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]' },
  analyzing: { label: 'Reading',   cls: 'bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]' },
  done:      { label: 'Read',      cls: 'bg-emerald-50 text-emerald-700' },
  error:     { label: 'Failed',    cls: 'bg-red-50 text-red-700' },
};

function StatusPill({ status }: { status: UploadedFileStatus }) {
  const { label, cls } = STATUS_STYLES[status];
  const spinning = status === 'uploading' || status === 'analyzing';
  return (
    <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', cls)}>
      {spinning && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'done' && <CircleCheck className="h-3 w-3" />}
      {status === 'error' && <CircleAlert className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function ProductStepDocuments({
  data,
  onChange,
  isAnalyzing = false,
  prefilledCount = 0,
  progress = null,
  suggestions = [],
  onApplySuggestion,
  onIgnoreSuggestion,
  onApplyAllSuggestions,
  analysisMadeNoChange = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const existing = new Set(data.files.map((f) => `${f.name}:${f.file.size}`));
    const newFiles: UploadedFile[] = Array.from(fileList)
      .filter((f) => !existing.has(`${f.name}:${f.size}`))
      .map((f) => ({
        file: f,
        name: f.name,
        size: formatSize(f.size),
        status: 'pending' as const,
      }));
    if (newFiles.length === 0) return;
    onChange({ files: [...data.files, ...newFiles] });
  }, [data.files, onChange]);

  const removeFile = (i: number) => {
    onChange({ files: data.files.filter((_, idx) => idx !== i) });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isAnalyzing) return;
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const analyzed = data.files.filter((f) => f.status === 'done').length;
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Documents</h2>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Start here. Anything you upload is read by the AI and used to fill the rest of this form for you.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/5 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
        <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
          Upload the technical file, specifications, certificates or test reports and press{' '}
          <strong>Analyse &amp; continue</strong>. Qurelio extracts the product identity, technical
          data, markets and certifications, then walks you through every field so you can{' '}
          <strong>verify or correct</strong> it. Prefer to type everything yourself? Continue with no
          file, and the next steps stay empty.
        </p>
      </div>

      <div className="callout-info flex items-start gap-3 rounded-xl border border-[var(--callout-info-border)] bg-[var(--callout-info-bg)] p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
        <p className="text-[13px] leading-relaxed text-[var(--callout-info-text)]">
          These documents also build this product&apos;s <strong>private Compliance Memory</strong>: the AI reads them to evaluate compliance. Upload the technical file, test reports, safety data sheets, SOPs, and any other evidence relevant to this product. <strong>All files pass the Legal Guardrail before ingestion.</strong>
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!isAnalyzing) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => { if (!isAnalyzing) inputRef.current?.click(); }}
        className={cn(
          'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200',
          isAnalyzing
            ? 'cursor-not-allowed border-[var(--input-border)] bg-[var(--surface-muted)] opacity-60'
            : isDragOver
              ? 'cursor-pointer border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
              : 'cursor-pointer border-[var(--input-border)] bg-[var(--surface-muted)] hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-primary)]/3'
        )}
      >
        <Upload className="mb-3 h-10 w-10 text-[var(--muted)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Drop files here or click to browse</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">PDF, DOCX, XLSX, JPG, PNG, TIFF · Max 50 MB per file</p>
        <Button type="button" variant="outline" size="sm" className="mt-4 gap-2" disabled={isAnalyzing}>
          <Upload className="h-4 w-4" />Browse files
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.tiff,.tif"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />

      {/* File list */}
      {data.files.length > 0 && (
        <div className="space-y-2">
          {data.files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-4 py-3">
              <FileText className="h-8 w-8 shrink-0 text-[var(--brand-primary)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{f.name}</p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {f.error ? f.error : f.size}
                </p>
              </div>
              <StatusPill status={f.status} />
              <button
                type="button"
                onClick={() => removeFile(i)}
                disabled={isAnalyzing}
                className="shrink-0 text-[var(--muted)] transition-hover hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isAnalyzing && (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" />
            {progress?.label || 'Reading your documents…'}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--page-bg)]">
            <div
              className="h-full bg-[var(--brand-primary)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span>Large technical files take about a minute each. Keep this dialog open.</span>
            {progress && progress.total > 0 && (
              <span className="shrink-0 font-medium">{pct}%</span>
            )}
          </div>
        </div>
      )}

      {!isAnalyzing && prefilledCount > 0 && (
        <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-600">
          <CircleCheck className="h-4 w-4" />
          {analyzed} document{analyzed > 1 ? 's' : ''} read · {prefilledCount} field
          {prefilledCount > 1 ? 's' : ''} pre-filled for review in the next steps
        </p>
      )}

      {/* Editing an existing product: the document disagrees with values already saved. */}
      {!isAnalyzing && suggestions.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-4 w-4 text-[var(--brand-primary)]" />
              This document suggests {suggestions.length} different value
              {suggestions.length > 1 ? 's' : ''}
            </p>
            {onApplyAllSuggestions && suggestions.length > 1 && (
              <Button type="button" size="sm" variant="outline" onClick={onApplyAllSuggestions}>
                Apply all
              </Button>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            Your saved values are kept unless you accept a suggestion. Nothing is written until you
            save.
          </p>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.key}
                className="rounded-xl border border-[var(--input-border)] bg-[var(--surface)] p-3"
              >
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">{s.label}</p>
                <div className="mt-1.5 space-y-1 text-[11px]">
                  <p className="text-[var(--muted)]">
                    <span className="font-medium">Current:</span>{' '}
                    <span className="line-clamp-2">{s.current}</span>
                  </p>
                  <p className="text-[var(--text-primary)]">
                    <span className="font-medium text-[var(--brand-primary)]">Suggested:</span>{' '}
                    <span className="line-clamp-3">{s.suggested}</span>
                  </p>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-[11px]"
                    onClick={() => onApplySuggestion?.(s)}
                  >
                    <Check className="h-3 w-3" />
                    Use this
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2.5 text-[11px]"
                    onClick={() => onIgnoreSuggestion?.(s)}
                  >
                    <X className="h-3 w-3" />
                    Keep mine
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Read successfully but nothing to change: say so rather than looking like a failure. */}
      {!isAnalyzing && analysisMadeNoChange && suggestions.length === 0 && prefilledCount === 0 && (
        <p className="flex items-start gap-2 text-[13px] text-[var(--muted)]">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          Document read and added to this product&apos;s Compliance Memory. It agreed with what you
          already have, so no field was changed.
        </p>
      )}
    </div>
  );
}
