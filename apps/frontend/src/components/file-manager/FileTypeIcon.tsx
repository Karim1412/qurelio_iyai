'use client';

import React from 'react';

/**
 * Realistic Windows-style file & folder glyphs (drawn as SVG, we can't ship
 * Microsoft's proprietary icons, so these are faithful look-alikes: a sheet
 * with a folded corner and a coloured type ribbon, and a yellow folder).
 */

type FileKind =
  | 'pdf' | 'word' | 'excel' | 'ppt' | 'text' | 'csv'
  | 'zip' | 'image' | 'json' | 'generic';

const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', rtf: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel',
  csv: 'csv',
  ppt: 'ppt', pptx: 'ppt',
  txt: 'text', log: 'text', md: 'text',
  json: 'json', xml: 'json',
  zip: 'zip', rar: 'zip', '7z': 'zip', gz: 'zip',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
  webp: 'image', svg: 'image', bmp: 'image', tif: 'image', tiff: 'image',
};

const KIND_META: Record<FileKind, { color: string; label: string }> = {
  pdf: { color: '#e2453c', label: 'PDF' },
  word: { color: '#2b579a', label: 'DOC' },
  excel: { color: '#217346', label: 'XLS' },
  csv: { color: '#217346', label: 'CSV' },
  ppt: { color: '#c43e1c', label: 'PPT' },
  text: { color: '#5b6471', label: 'TXT' },
  json: { color: '#0a7ea4', label: 'JSON' },
  zip: { color: '#e2a23b', label: 'ZIP' },
  image: { color: '#7c4dff', label: 'IMG' },
  generic: { color: '#7a8699', label: 'FILE' },
};

export function fileKind(name: string, mime?: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (KIND_BY_EXT[ext]) return KIND_BY_EXT[ext];
  if (mime) {
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('word')) return 'word';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'excel';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ppt';
    if (mime.startsWith('image/')) return 'image';
    if (mime.includes('zip')) return 'zip';
    if (mime.includes('json')) return 'json';
    if (mime.startsWith('text/')) return 'text';
  }
  return 'generic';
}

/** Human "Type" label, e.g. "XLSX", "PDF", "Folder". */
export function typeLabel(name: string, mime?: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext && ext !== name.toLowerCase()) return ext.toUpperCase();
  return KIND_META[fileKind(name, mime)].label;
}

/** Windows-like document icon: white sheet, folded corner, coloured ribbon. */
export function FileGlyph({
  name,
  mime,
  size = 36,
  className,
}: {
  name: string;
  mime?: string;
  size?: number;
  className?: string;
}) {
  const kind = fileKind(name, mime);
  const { color, label } = KIND_META[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* sheet */}
      <path
        d="M12 4h18l10 10v28a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        fill="#ffffff"
        stroke="#d6dbe3"
        strokeWidth="1.5"
      />
      {/* folded corner */}
      <path d="M30 4l10 10H32a2 2 0 0 1-2-2V4Z" fill="#eef1f5" stroke="#d6dbe3" strokeWidth="1.5" />
      {/* type ribbon */}
      <rect x="6" y="26" width="30" height="13" rx="2.5" fill={color} />
      <text
        x="21"
        y="35.4"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

/** Windows-like folder icon (yellow, with raised tab). */
export function FolderGlyph({
  size = 36,
  open = false,
  className,
}: {
  size?: number;
  open?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M5 13a3 3 0 0 1 3-3h11l4 4h17a3 3 0 0 1 3 3v3H5v-7Z"
        fill="#e8a93b"
      />
      <path
        d="M5 17h38a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V17Z"
        fill={open ? '#ffd576' : '#f8c558'}
      />
      <path
        d="M5 17h38a3 3 0 0 1 3 3v1H5v-4Z"
        fill="#ffffff"
        fillOpacity="0.18"
      />
    </svg>
  );
}
