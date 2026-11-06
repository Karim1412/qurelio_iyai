'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from '@/components/icons';

interface Props {
  bytes: Uint8Array | null;
}

/**
 * Lightweight paged PDF viewer that preserves the original document layout.
 * Editing PDFs in-browser is out of scope; use the page's `Replace file`
 * action to upload a new version.
 *
 * Loads pdfjs-dist lazily so the heavy library only ships when this editor opens.
 */
export function PdfViewer({ bytes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Dynamic import: keep pdfjs out of the main bundle.
        const pdfjs = await import('pdfjs-dist');
        // Match the worker version to the API version exactly to avoid
        // "Cannot find module" errors at runtime in Next.js/Turbopack.
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const arr = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const doc = await pdfjs.getDocument({ data: arr }).promise;
        if (cancelled) return;
        setPages(doc.numPages);

        const root = containerRef.current;
        if (!root) return;
        // Clear previous render.
        root.innerHTML = '';

        const scale = Math.min(1.4, (root.clientWidth - 32) / 612 || 1);
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });

          const wrap = document.createElement('div');
          wrap.className =
            'mx-auto mb-4 overflow-hidden rounded-lg bg-white shadow-[0_2px_12px_rgba(15,23,42,0.10)]';
          wrap.style.width = `${viewport.width}px`;
          wrap.style.height = `${viewport.height}px`;

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = 'block';
          wrap.appendChild(canvas);
          root.appendChild(wrap);

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          } as Parameters<typeof page.render>[0]).promise;
        }
      } catch (e) {
        if (!cancelled) {
          setError('Could not render this PDF.');
          console.error(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
        </div>
      )}
      {error && !loading && (
        <div className="flex items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto bg-[var(--page-bg)]/40 p-4"
      />
      {!loading && !error && pages > 0 && (
        <div className="shrink-0 border-t border-[var(--border)]/60 bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--muted)]">
          {pages} page{pages === 1 ? '' : 's'} · use <strong>Replace file</strong> to upload a new
          version
        </div>
      )}
    </div>
  );
}
