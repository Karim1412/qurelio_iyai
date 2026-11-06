'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { documentApi } from '@/lib/api';
import { FileText, Maximize, Minimize, Download as DownloadIcon, X } from '@/components/icons';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface FilePreview {
  url: string;
  mime: string;
  size: number;
  textSnippet?: string;
}

interface ExtractedSection {
  title?: string | null;
  content?: string | null;
}
interface ExtractedStructured {
  title?: string | null;
  fileSummary?: string | null;
  visualDescription?: string | null;
  keyPoints?: string[];
  sections?: ExtractedSection[];
  productProfile?: {
    generalDescription?: string | null;
    applications?: string | null;
    technicalCharacteristics?: string | null;
    qualitySpecificationNarrative?: string | null;
  } | null;
}

interface Detail {
  name?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  /** AI-extracted structured content from the RAG service */
  extractedStructured?: ExtractedStructured | null;
  /** Raw OCR / extracted text */
  extractedText?: string | null;
  text?: string | null;
  content?: string | null;
  /** Storage info (when present) */
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt?: string | null;
  uploadedBy?: { firstName?: string; lastName?: string; email?: string } | string;
  [k: string]: unknown;
}

interface Preview {
  detail: Detail | null;
  file: FilePreview | null;
}

const cache = new Map<string, Preview>();

function detectMime(blob: Blob, name?: string): string {
  if (blob.type) return blob.type;
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (['txt', 'md', 'csv', 'json', 'log'].includes(ext)) return 'text/plain';
  return 'application/octet-stream';
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  documentId: string;
  documentName?: string;
  documentDescription?: string;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'top' | 'bottom';
}

export function DocumentHoverPreview({
  documentId,
  documentName,
  documentDescription,
  children,
  side = 'right',
}: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [preview, setPreview] = useState<Preview | null>(cache.get(documentId) ?? null);

  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async () => {
    if (cache.has(documentId)) {
      setPreview(cache.get(documentId)!);
      setStatus('ready');
      return;
    }
    setStatus('loading');

    // 1) Detail (metadata + extracted content): always JSON, always available
    const detailPromise = documentApi
      .get(documentId)
      .then((r) => r.data as Detail)
      .catch(() => null);

    // 2) Real binary file: may fail or return JSON if no file is attached
    const filePromise = documentApi
      .getDownload(documentId)
      .then(async (r) => {
        const blob = r.data as Blob;
        if (!(blob instanceof Blob) || blob.size === 0) return null;
        const mime = detectMime(blob, documentName);
        // JSON envelope masquerading as a blob = no real file
        if (mime.includes('json')) return null;
        const url = URL.createObjectURL(blob);
        const fp: FilePreview = { url, mime, size: blob.size };
        if (mime.startsWith('text/') && blob.size < 200_000) {
          try {
            fp.textSnippet = (await blob.slice(0, 4000).text()).trim();
          } catch {
            /* ignore */
          }
        }
        return fp;
      })
      .catch(() => null);

    const [detail, file] = await Promise.all([detailPromise, filePromise]);

    if (!detail && !file) {
      setStatus('error');
      return;
    }

    const data: Preview = { detail, file };
    cache.set(documentId, data);
    setPreview(data);
    setStatus('ready');
  }, [documentId, documentName]);

  const handleEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => {
      setOpen(true);
      if (status === 'idle') void fetchPreview();
    }, 280);
  }, [status, fetchPreview]);

  const handleLeave = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }, []);

  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const headline = preview?.detail?.name || preview?.detail?.title || documentName || 'Document';
  const desc = preview?.detail?.description || documentDescription;
  const status_ = preview?.detail?.status;
  const structured = preview?.detail?.extractedStructured ?? null;
  const file = preview?.file ?? null;

  const handleExpand = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
    setOpen(false);
    setExpanded(true);
    if (status === 'idle') void fetchPreview();
  }, [fetchPreview, status]);

  const renderBody = (opts: { large: boolean }) => {
    const mediaHeight = opts.large
      ? 'h-[calc(85vh-80px)] min-h-[500px]'
      : 'h-[320px]';
    const textMaxHeight = opts.large ? 'max-h-[calc(85vh-80px)]' : 'max-h-[320px]';
    const fallbackMaxHeight = opts.large ? 'max-h-[calc(85vh-80px)]' : 'max-h-[420px]';

    return (
      <div className="relative flex-1 overflow-hidden bg-[var(--page-bg)]">
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-16 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">Preview unavailable</p>
            <p className="text-xs text-[var(--muted)]">Could not load this document.</p>
          </div>
        )}

        {status === 'ready' && (
          <>
            {file && file.mime === 'application/pdf' && (
              <iframe
                src={file.url + (opts.large ? '' : '#toolbar=0&navpanes=0')}
                title={headline}
                className={`w-full border-0 ${mediaHeight}`}
              />
            )}
            {file && file.mime.startsWith('image/') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.url}
                alt={headline}
                className={`w-full object-contain ${mediaHeight}`}
              />
            )}
            {file && file.mime.startsWith('text/') && (
              <pre className={`m-0 overflow-auto whitespace-pre-wrap break-words p-4 text-[11px] leading-relaxed text-[var(--text-primary)] ${textMaxHeight}`}>
                {file.textSnippet || '(empty)'}
              </pre>
            )}

            {(!file ||
              (!file.mime.startsWith('image/') &&
                !file.mime.startsWith('text/') &&
                file.mime !== 'application/pdf')) && (() => {
              const detail = preview?.detail;
              const rawText =
                (detail?.extractedText && String(detail.extractedText).trim()) ||
                (detail?.text && String(detail.text).trim()) ||
                (detail?.content && String(detail.content).trim()) ||
                '';
              const hasStructured =
                !!structured &&
                !!(
                  structured.fileSummary ||
                  structured.visualDescription ||
                  (structured.keyPoints && structured.keyPoints.length) ||
                  (structured.sections && structured.sections.length) ||
                  structured.productProfile?.generalDescription ||
                  structured.productProfile?.applications ||
                  structured.productProfile?.technicalCharacteristics ||
                  structured.productProfile?.qualitySpecificationNarrative
                );
              const isProcessing =
                status_ === 'PROCESSING' || status_ === 'UPLOADED' || status_ === 'UPLOADING';
              const sectionLimit = opts.large ? 24 : 3;
              const keyPointLimit = opts.large ? 40 : 6;
              const rawTextLimit = opts.large ? 12000 : 1500;
              return (
                <div className={`space-y-3 overflow-auto px-4 py-3 text-xs leading-relaxed text-[var(--text-primary)] ${fallbackMaxHeight}`}>
                  {hasStructured && (
                    <>
                      {structured?.fileSummary && (
                        <Section title="Summary" body={structured.fileSummary} large={opts.large} />
                      )}
                      {structured?.visualDescription && (
                        <Section title="Visual" body={structured.visualDescription} large={opts.large} />
                      )}
                      {structured?.productProfile?.generalDescription && (
                        <Section title="General" body={structured.productProfile.generalDescription} large={opts.large} />
                      )}
                      {structured?.productProfile?.applications && (
                        <Section title="Applications" body={structured.productProfile.applications} large={opts.large} />
                      )}
                      {structured?.productProfile?.technicalCharacteristics && (
                        <Section title="Technical" body={structured.productProfile.technicalCharacteristics} large={opts.large} />
                      )}
                      {structured?.keyPoints && structured.keyPoints.length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                            Key points
                          </p>
                          <ul className="ml-4 list-disc space-y-1 text-xs">
                            {structured.keyPoints.slice(0, keyPointLimit).map((kp, i) => (
                              <li key={i}>{kp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {structured?.sections && structured.sections.length > 0 && (
                        <div className="space-y-2">
                          {structured.sections.slice(0, sectionLimit).map((s, i) => (
                            <Section
                              key={i}
                              title={s.title || `Section ${i + 1}`}
                              body={s.content || ''}
                              large={opts.large}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {!hasStructured && rawText && (
                    <Section title="Extracted text" body={rawText.slice(0, rawTextLimit)} large={opts.large} />
                  )}

                  {!hasStructured && !rawText && desc && (
                    <Section title="Description" body={desc} large={opts.large} />
                  )}

                  {!hasStructured && !rawText && !desc && (
                    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
                      <FileText className="h-7 w-7 text-[var(--muted)]" />
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {isProcessing ? 'Document is being processed' : 'No preview available'}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {isProcessing
                          ? 'Extracted content will appear once processing completes.'
                          : 'No file content or extracted text was returned by the server.'}
                      </p>
                    </div>
                  )}

                  {!file && (hasStructured || rawText) && (
                    <p className="border-t border-[var(--border)]/50 pt-2 text-[10px] italic text-[var(--muted)]">
                      The original file is not available. Showing extracted content only.
                    </p>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    );
  };

  const headerSubtitle = [
    preview?.detail?.type?.replace(/_/g, ' '),
    status_,
    file ? `${file.mime.split('/')[1] || file.mime} · ${formatBytes(file.size)}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Document';

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <div
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onFocus={handleEnter}
          onBlur={handleLeave}
          className="flex min-w-0 flex-1 items-center gap-3 cursor-default"
        >
          {children}
        </div>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align="start"
          sideOffset={12}
          onMouseEnter={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
          }}
          onMouseLeave={handleLeave}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[60] flex w-[460px] max-h-[520px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl shadow-black/20 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)]/60 px-4 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={headline}>
                {headline}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {headerSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
              aria-label="Expand preview"
              title="Expand preview"
              className="rounded-md p-1.5 text-[var(--muted)] transition-hover hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </div>

          {renderBody({ large: false })}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>

      <DialogPrimitive.Root open={expanded} onOpenChange={setExpanded}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="fixed left-1/2 top-1/2 z-[71] flex h-[85vh] w-[92vw] max-w-[1400px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl shadow-black/40 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <div className="flex items-center gap-3 border-b border-[var(--border)]/60 px-5 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-base font-semibold text-[var(--text-primary)]" title={headline}>
                  {headline}
                </DialogPrimitive.Title>
                <p className="truncate text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  {headerSubtitle}
                </p>
              </div>
              {file && (
                <a
                  href={file.url}
                  download={headline}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-hover hover:bg-[var(--nav-hover)]"
                  title="Download original file"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  Download
                </a>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Shrink preview"
                title="Shrink preview"
                className="rounded-md p-1.5 text-[var(--muted)] transition-hover hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
              >
                <Minimize className="h-4 w-4" />
              </button>
              <DialogPrimitive.Close
                aria-label="Close"
                className="rounded-md p-1.5 text-[var(--muted)] transition-hover hover:bg-[var(--nav-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            {renderBody({ large: true })}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PopoverPrimitive.Root>
  );
}

function Section({ title, body, large }: { title: string; body: string; large?: boolean }) {
  if (!body) return null;
  const max = large ? 8000 : 320;
  const trimmed = body.length > max ? body.slice(0, max).trim() + '…' : body;
  return (
    <div>
      <p className={`mb-1 font-semibold uppercase tracking-wider text-[var(--muted)] ${large ? 'text-[11px]' : 'text-[10px]'}`}>
        {title}
      </p>
      <p className={`whitespace-pre-wrap leading-relaxed text-[var(--text-primary)] ${large ? 'text-sm' : 'text-xs'}`}>{trimmed}</p>
    </div>
  );
}
