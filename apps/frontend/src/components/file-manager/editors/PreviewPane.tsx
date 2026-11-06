'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon } from '@/components/icons';

interface Props {
  /** The bytes currently in memory: preview shown from the same buffer the user will save. */
  bytes: ArrayBuffer | Uint8Array | Blob | null;
  mimeType?: string;
  name: string;
  /** kind = 'image' shows an <img>, 'pdf' shows an embedded PDF viewer, otherwise a generic preview. */
  kind: 'image' | 'pdf' | 'generic';
}

export function PreviewPane({ bytes, mimeType, name, kind }: Props) {
  const blob = useMemo(() => {
    if (!bytes) return null;
    const inferred =
      mimeType ||
      (kind === 'pdf' ? 'application/pdf' : kind === 'image' ? 'image/*' : 'application/octet-stream');
    if (bytes instanceof Blob) return bytes;
    const buf =
      bytes instanceof Uint8Array
        ? new Uint8Array(bytes).buffer
        : (bytes as ArrayBuffer);
    return new Blob([buf], { type: inferred });
  }, [bytes, mimeType, kind]);

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
        Loading preview…
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--page-bg)]/40 p-4">
        <div className="flex max-h-full max-w-full items-center justify-center overflow-auto rounded-2xl border border-[var(--border)]/60 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            className="max-h-[70vh] max-w-full object-contain"
            draggable={false}
          />
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          Image preview · use <strong>Replace file</strong> to upload a new version.
        </p>
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--page-bg)]/40 p-2">
        <object
          data={url}
          type="application/pdf"
          className="min-h-0 flex-1 rounded-2xl border border-[var(--border)]/60 bg-white"
        >
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
            Your browser cannot display PDFs inline. Use <strong>Download</strong> or{' '}
            <strong>Replace file</strong>.
          </div>
        </object>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <FileText className="h-10 w-10 text-[var(--muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No inline preview</p>
      <p className="max-w-md text-xs text-[var(--muted)]">
        This file type can't be previewed in the browser. Use <strong>Download</strong> to open it
        locally, or <strong>Replace file</strong> to upload a new version.
      </p>
    </div>
  );
}

export { ImageIcon };
