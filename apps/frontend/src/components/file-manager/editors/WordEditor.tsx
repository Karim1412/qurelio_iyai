'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mammoth from 'mammoth';
// html-docx-js ships only a CommonJS bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const htmlDocx: { asBlob: (html: string, opts?: unknown) => Blob } = require('html-docx-js/dist/html-docx');
import { Loader2 } from '@/components/icons';

interface Props {
  /** Original .docx bytes. */
  bytes: Uint8Array | null;
  /** Notified with current HTML on every edit. */
  onChange: (html: string) => void;
  /** Initial HTML (overrides bytes); used when user reverts. */
  initialHtml: string | null;
  fontSize: number;
}

/**
 * Renders a .docx as styled HTML using mammoth, then lets the user edit it
 * via contentEditable. The page reads the latest HTML from `onChange` and
 * serializes it back to .docx with html-docx-js at save time.
 */
export function WordEditor({ bytes, onChange, initialHtml, fontSize }: Props) {
  const [html, setHtml] = useState<string | null>(initialHtml);
  const [loading, setLoading] = useState(!initialHtml);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // Track whether the user has typed since first render, avoid clobbering the cursor on reload.
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (initialHtml !== null) {
      setHtml(initialHtml);
      setLoading(false);
      hydratedRef.current = false;
      return;
    }
    if (!bytes) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const arr = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const result = await mammoth.convertToHtml({ arrayBuffer: arr });
        if (cancelled) return;
        setHtml(result.value || '<p></p>');
        hydratedRef.current = false;
      } catch (e) {
        if (!cancelled) {
          setError('Could not render this Word document. You can still replace it with a new file.');
          console.error(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, initialHtml]);

  // Hydrate the contentEditable once when html first loads; afterwards leave it alone
  // so the cursor and user state are preserved.
  useEffect(() => {
    if (!editorRef.current || html === null) return;
    if (!hydratedRef.current) {
      editorRef.current.innerHTML = html;
      hydratedRef.current = true;
      onChange(html);
    }
  }, [html, onChange]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  }, [onChange]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
        {error}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-auto bg-[var(--page-bg)]/40 p-6">
      <div
        className="mx-auto w-full max-w-[820px] rounded-2xl bg-white shadow-[0_4px_24px_rgba(15,23,42,0.08)]"
        style={{ minHeight: '11in' }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          spellCheck
          className="qurelio-word-editor max-w-none px-[1in] py-[1in] outline-none"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.6,
            color: '#1f2937',
          }}
        />
      </div>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx global>{`
        .qurelio-word-editor h1 { font-size: 1.6em; font-weight: 700; margin: 1.2em 0 0.6em; }
        .qurelio-word-editor h2 { font-size: 1.4em; font-weight: 700; margin: 1.1em 0 0.5em; }
        .qurelio-word-editor h3 { font-size: 1.2em; font-weight: 700; margin: 1em 0 0.4em; }
        .qurelio-word-editor p { margin: 0.6em 0; }
        .qurelio-word-editor table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
        .qurelio-word-editor th, .qurelio-word-editor td { border: 1px solid #d1d5db; padding: 6px 8px; }
        .qurelio-word-editor ul, .qurelio-word-editor ol { margin: 0.6em 0; padding-left: 1.5em; }
        .qurelio-word-editor img { max-width: 100%; height: auto; }
        .qurelio-word-editor a { color: var(--brand-primary); text-decoration: underline; }
      `}</style>
    </div>
  );
}

/**
 * Serialize the editor HTML back to a .docx Blob.
 * `html-docx-js` expects a full HTML document with <html><head><body>; wrap accordingly.
 */
export function htmlToDocxBlob(htmlBody: string): Blob {
  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${htmlBody}</body></html>`;
  return htmlDocx.asBlob(full);
}
