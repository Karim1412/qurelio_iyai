'use client';

import React, { useEffect, useRef, useState } from 'react';
import { documentApi } from '@/lib/api';
import { FileText } from '@/components/icons';
import { cn } from '@/utils/cn';

/**
 * Inline visual preview of the real document file. PDFs render as a fitted
 * page (looks like an image of the document), images render directly. Shared
 * module cache so the same file isn't fetched twice across cards / hovers.
 */

type CachedFile = { url: string; mime: string } | null;
const blobCache = new Map<string, CachedFile>();

function detectMime(blob: Blob, name?: string): string {
  if (blob.type) return blob.type;
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (['txt', 'md', 'csv', 'json', 'log'].includes(ext)) return 'text/plain';
  return 'application/octet-stream';
}

export function DocumentCardPreview({
  documentId,
  name,
  className,
  fallbackText,
}: {
  documentId: string;
  name?: string;
  className?: string;
  fallbackText?: string;
}) {
  const cached = blobCache.has(documentId);
  const [status, setStatus] = useState<'loading' | 'ready' | 'none'>(
    cached ? (blobCache.get(documentId) ? 'ready' : 'none') : 'loading',
  );
  const [file, setFile] = useState<CachedFile>(blobCache.get(documentId) ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(cached);

  // Only fetch the (potentially heavy) file once the card is on screen.
  useEffect(() => {
    if (seen) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || blobCache.has(documentId)) return;
    let cancelled = false;
    documentApi
      .getDownload(documentId)
      .then((r) => {
        const blob = r.data as Blob;
        if (!(blob instanceof Blob) || blob.size === 0) throw new Error('empty');
        const mime = detectMime(blob, name);
        if (mime.includes('json')) throw new Error('no-file');
        const url = URL.createObjectURL(blob);
        const f: CachedFile = { url, mime };
        blobCache.set(documentId, f);
        if (!cancelled) {
          setFile(f);
          setStatus('ready');
        }
      })
      .catch(() => {
        blobCache.set(documentId, null);
        if (!cancelled) setStatus('none');
      });
    return () => {
      cancelled = true;
    };
  }, [seen, documentId, name]);

  const isPdf = file?.mime === 'application/pdf';
  const isImage = file?.mime.startsWith('image/');

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative overflow-hidden rounded-xl border border-[var(--border)]/60 bg-[var(--page-bg)]',
        className,
      )}
    >
      {status === 'loading' && (
        <div className="flex h-full items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
        </div>
      )}

      {status === 'ready' && isPdf && (
        <iframe
          src={`${file!.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={name || 'Document'}
          className="pointer-events-none h-full w-full border-0"
          tabIndex={-1}
        />
      )}

      {status === 'ready' && isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file!.url}
          alt={name || 'Document'}
          className="h-full w-full object-cover"
        />
      )}

      {(status === 'none' || (status === 'ready' && !isPdf && !isImage)) && (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 py-4 text-center">
          <FileText className="h-6 w-6 text-[var(--muted)]" />
          {fallbackText ? (
            <p className="line-clamp-3 text-[10.5px] leading-relaxed text-[var(--muted)]">
              {fallbackText}
            </p>
          ) : (
            <p className="text-[10.5px] text-[var(--muted)]">Preview unavailable</p>
          )}
        </div>
      )}

      {/* subtle top fade so the page top blends into the card */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[var(--surface)]/35 to-transparent"
      />
    </div>
  );
}
