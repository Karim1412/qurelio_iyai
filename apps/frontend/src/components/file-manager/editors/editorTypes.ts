/**
 * Editor kind dispatched from the file extension / mime.
 * - text: plain text / code / markdown / json / yaml / etc., textarea editor
 * - csv: CSV / TSV: editable table grid (no external dep)
 * - xlsx: Excel: editable table grid (uses `xlsx`)
 * - pdf: PDF: inline preview + text annotation overlay (uses `pdf-lib`)
 * - image: inline preview, rename + replace
 * - replace: any binary we can't render; preview if possible, replace via upload
 */
export type EditorKind = 'text' | 'csv' | 'xlsx' | 'word' | 'pdf' | 'image' | 'replace';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'mdx',
  'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'env',
  'log',
  'html', 'htm', 'xml', 'svg',
  'css', 'scss', 'sass', 'less',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sh', 'bash', 'zsh', 'ps1',
  'sql', 'graphql', 'gql',
]);

const CSV_EXTENSIONS = new Set(['csv', 'tsv']);
const XLSX_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm', 'ods']);
const WORD_EXTENSIONS = new Set(['docx', 'doc']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif']);

export function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function detectEditorKind(name: string, mime?: string): EditorKind {
  const ext = getExt(name);
  if (CSV_EXTENSIONS.has(ext) || mime === 'text/csv' || mime === 'application/csv') return 'csv';
  if (XLSX_EXTENSIONS.has(ext) || mime?.includes('spreadsheet') || mime === 'application/vnd.ms-excel')
    return 'xlsx';
  if (
    WORD_EXTENSIONS.has(ext) ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  )
    return 'word';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext) || mime?.startsWith('image/')) return 'image';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (mime?.startsWith('text/')) return 'text';
  if (mime === 'application/json' || mime === 'application/xml') return 'text';
  return 'replace';
}
