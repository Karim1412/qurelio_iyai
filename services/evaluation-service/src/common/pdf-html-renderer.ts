import { rgb, RGB } from 'pdf-lib';
import {
  BrandedPdfWriter,
  brandedEnsureSpace,
  brandedDrawBlock,
  wrapPdfLines,
} from './pdf-brand-layout';

const TEXT_DARK = rgb(0.1, 0.1, 0.14);
const BOX_BORDER = rgb(0.82, 0.84, 0.87);
const BOX_BG = rgb(0.98, 0.985, 0.99);

export type PdfTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  highlight?: string;
};

export type PdfContentBlock =
  | { kind: 'paragraph'; runs: PdfTextRun[] }
  | { kind: 'bullet'; runs: PdfTextRun[] }
  | { kind: 'ordered'; runs: PdfTextRun[]; index: number };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseHighlightColor(attrs: string): string | undefined {
  const style = attrs.match(/background-color:\s*([^;"']+)/i)?.[1]?.trim();
  const data = attrs.match(/data-color=["']([^"']+)["']/i)?.[1]?.trim();
  return data || style;
}

/** Parse inline HTML into styled runs (no block tags). */
export function parseInlineHtml(html: string): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  const stack: Array<{ bold?: boolean; italic?: boolean; highlight?: string }> = [{}];

  const pushText = (raw: string) => {
    const t = decodeEntities(raw).replace(/\s+/g, ' ');
    if (!t) return;
    const style = stack[stack.length - 1];
    const prev = runs[runs.length - 1];
    if (
      prev &&
      prev.bold === style.bold &&
      prev.italic === style.italic &&
      prev.highlight === style.highlight
    ) {
      prev.text += t;
    } else {
      runs.push({
        text: t,
        bold: style.bold,
        italic: style.italic,
        highlight: style.highlight,
      });
    }
  };

  const tagRe = /<\/?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[3]) {
      pushText(m[3]);
      continue;
    }
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    const attrs = m[2] || '';
    if (closing) {
      if (['b', 'strong', 'i', 'em', 'u', 'mark', 'span'].includes(tag) && stack.length > 1) {
        stack.pop();
      }
      continue;
    }
    if (tag === 'br') {
      runs.push({ text: '\n' });
      continue;
    }
    const parent = stack[stack.length - 1];
    if (tag === 'b' || tag === 'strong') stack.push({ ...parent, bold: true });
    else if (tag === 'i' || tag === 'em') stack.push({ ...parent, italic: true });
    else if (tag === 'mark') {
      const color = parseHighlightColor(attrs);
      stack.push({ ...parent, highlight: color || '#fef08a' });
    } else if (tag === 'span' && parseHighlightColor(attrs)) {
      stack.push({ ...parent, highlight: parseHighlightColor(attrs) });
    }
  }

  return runs.filter((r) => r.text.length > 0);
}

function blockFromHtml(chunk: string): PdfContentBlock[] {
  const trimmed = chunk.trim();
  if (!trimmed) return [];
  const runs = parseInlineHtml(trimmed);
  if (!runs.length) return [];
  return [{ kind: 'paragraph', runs }];
}

/** Parse TipTap-style HTML into PDF blocks (lists, paragraphs, highlights). */
export function parseHtmlToBlocks(html: string): PdfContentBlock[] {
  if (!html?.trim()) return [];

  let src = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const blocks: PdfContentBlock[] = [];

  const listRe = /<(ol|ul)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let lm: RegExpExecArray | null;
  const segments: Array<{ type: 'html' | 'list'; content: string; ordered?: boolean }> = [];

  while ((lm = listRe.exec(src)) !== null) {
    if (lm.index > lastIndex) {
      segments.push({ type: 'html', content: src.slice(lastIndex, lm.index) });
    }
    segments.push({
      type: 'list',
      ordered: lm[1].toLowerCase() === 'ol',
      content: lm[3],
    });
    lastIndex = lm.index + lm[0].length;
  }
  if (lastIndex < src.length) {
    segments.push({ type: 'html', content: src.slice(lastIndex) });
  }
  if (!segments.length) segments.push({ type: 'html', content: src });

  for (const seg of segments) {
    if (seg.type === 'list') {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let idx = 1;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(seg.content)) !== null) {
        const inner = li[1].replace(/<\/?p[^>]*>/gi, ' ').trim();
        const runs = parseInlineHtml(inner);
        if (!runs.length) continue;
        if (seg.ordered) blocks.push({ kind: 'ordered', runs, index: idx++ });
        else blocks.push({ kind: 'bullet', runs });
      }
      continue;
    }

    const parts = seg.content
      .split(/<\/?(?:p|div|h[1-3]|blockquote)[^>]*>/gi)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) {
      blocks.push(...blockFromHtml(seg.content.replace(/<[^>]+>/g, ' ')));
    } else {
      for (const part of parts) {
        blocks.push(...blockFromHtml(part));
      }
    }
  }

  return blocks;
}

function hexToRgb(hex: string): RGB | undefined {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16) / 255;
    const g = parseInt(h[1] + h[1], 16) / 255;
    const b = parseInt(h[2] + h[2], 16) / 255;
    return rgb(r, g, b);
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return rgb(r, g, b);
  }
  return undefined;
}

type LayoutLine = {
  runs: Array<PdfTextRun & { x: number; width: number }>;
  width: number;
  height: number;
};

function layoutBlocks(
  w: BrandedPdfWriter,
  blocks: PdfContentBlock[],
  maxWidth: number,
  fontSize: number,
  lineGap: number,
): { lines: LayoutLine[]; totalHeight: number } {
  const lines: LayoutLine[] = [];
  const lineH = fontSize + lineGap;

  const flushLine = (runs: PdfTextRun[], prefix = '') => {
    if (!runs.length && !prefix) return;
    const allRuns: PdfTextRun[] = prefix
      ? [{ text: prefix, bold: false }, ...runs]
      : runs;
    let x = 0;
    const laid: LayoutLine['runs'] = [];
    for (const run of allRuns) {
      if (run.text === '\n') {
        lines.push({ runs: laid, width: x, height: lineH });
        laid.length = 0;
        x = 0;
        continue;
      }
      const f = run.bold ? w.fontBold : w.font;
      const parts = wrapPdfLines(run.text, f, fontSize, maxWidth - x);
      for (let i = 0; i < parts.length; i += 1) {
        if (i > 0) {
          lines.push({ runs: laid, width: x, height: lineH });
          laid.length = 0;
          x = 0;
        }
        const tw = f.widthOfTextAtSize(parts[i], fontSize);
        laid.push({ ...run, text: parts[i], x, width: tw });
        x += tw;
      }
    }
    if (laid.length) lines.push({ runs: laid, width: x, height: lineH });
  };

  for (const block of blocks) {
    let prefix = '';
    if (block.kind === 'bullet') prefix = '• ';
    if (block.kind === 'ordered') prefix = `${block.index}. `;
    flushLine(block.runs, prefix);
    lines.push({ runs: [], width: 0, height: lineH * 0.35 });
  }

  const totalHeight = lines.reduce((s, l) => s + l.height, 0);
  return { lines, totalHeight };
}

/** Draw HTML content inside a bordered rectangle. */
export function brandedDrawHtmlContentBox(
  w: BrandedPdfWriter,
  html: string,
  padding = 10,
): void {
  const blocks = parseHtmlToBlocks(html);
  if (!blocks.length) {
    brandedDrawPlainContentBox(w, '-', padding);
    return;
  }

  const fontSize = 10;
  const lineGap = 3;
  const innerW = w.maxTextW - 2 * padding;
  const { lines, totalHeight } = layoutBlocks(w, blocks, innerW, fontSize, lineGap);
  const boxH = totalHeight + 2 * padding + 4;

  brandedEnsureSpace(w, boxH + 8);
  const boxBottom = w.y - boxH;
  const boxX = w.margin;
  const boxW = w.maxTextW;

  w.page.drawRectangle({
    x: boxX,
    y: boxBottom,
    width: boxW,
    height: boxH,
    color: BOX_BG,
    borderColor: BOX_BORDER,
    borderWidth: 0.75,
  });

  let cy = w.y - padding - fontSize;
  for (const line of lines) {
    if (!line.runs.length) {
      cy -= line.height;
      continue;
    }
    for (const run of line.runs) {
      const f = run.bold ? w.fontBold : w.font;
      const x = boxX + padding + run.x;
      if (run.highlight) {
        const bg = hexToRgb(run.highlight) || rgb(1, 0.98, 0.7);
        w.page.drawRectangle({
          x: x - 1,
          y: cy - 2,
          width: run.width + 2,
          height: fontSize + 4,
          color: bg,
        });
      }
      w.page.drawText(run.text, {
        x,
        y: cy,
        size: fontSize,
        font: f,
        color: TEXT_DARK,
      });
    }
    cy -= line.height;
  }

  w.y = boxBottom - 8;
}

/** Plain text inside a bordered rectangle. */
export function brandedDrawPlainContentBox(
  w: BrandedPdfWriter,
  text: string,
  padding = 10,
): void {
  const fontSize = 10;
  const lineGap = 3;
  const innerW = w.maxTextW - 2 * padding;
  const wrapped = wrapPdfLines(text || '-', w.font, fontSize, innerW);
  const lineH = fontSize + lineGap;
  const boxH = wrapped.length * lineH + 2 * padding + 4;

  brandedEnsureSpace(w, boxH + 8);
  const boxBottom = w.y - boxH;

  w.page.drawRectangle({
    x: w.margin,
    y: boxBottom,
    width: w.maxTextW,
    height: boxH,
    color: BOX_BG,
    borderColor: BOX_BORDER,
    borderWidth: 0.75,
  });

  let cy = w.y - padding - fontSize;
  for (const ln of wrapped) {
    w.page.drawText(ln, {
      x: w.margin + padding,
      y: cy,
      size: fontSize,
      font: w.font,
      color: TEXT_DARK,
    });
    cy -= lineH;
  }
  w.y = boxBottom - 8;
}

export function brandedDrawLabeledField(
  w: BrandedPdfWriter,
  label: string,
  value: unknown,
  field: { type?: string; options?: Array<{ value: string; label: string }> },
): void {
  const f = w.fontBold;
  brandedEnsureSpace(w, 16);
  w.page.drawText(`${label}:`, {
    x: w.margin,
    y: w.y,
    size: 10,
    font: f,
    color: TEXT_DARK,
  });
  w.y -= 14;

  const isRichText = String(field.type) === 'rich-text';
  const html = typeof value === 'string' ? value.trim() : '';

  if (isRichText && html) {
    brandedDrawHtmlContentBox(w, html);
  } else {
    brandedDrawBlock(w, formatFieldForPdf(field, value), 10, false, 2);
  }
  w.y -= 4;
}

export function formatFieldForPdf(
  field: { type?: string; options?: Array<{ value: string; label: string }> },
  value: unknown,
): string {
  if (value === null || value === undefined || value === '') return '-';

  const t = field.type || 'text';

  if (t === 'checkbox') return value === true || value === 'true' ? 'Yes' : 'No';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (
    t === 'file' ||
    (typeof value === 'object' && value !== null && ('fileName' in value || 'fileId' in value))
  ) {
    const f = value as { fileName?: string | null; fileId?: string | null; name?: string };
    const name = f.fileName || f.name;
    if (name?.trim()) return name.trim();
    if (f.fileId) return `Attachment (${String(f.fileId).slice(0, 8)}…)`;
    return 'No file attached';
  }

  if (t === 'select' || t === 'radio') {
    const str = String(value);
    const opt = field.options?.find((o) => o.value === str);
    return opt?.label || str;
  }

  if (t === 'checklist' && Array.isArray(value)) {
    return value
      .map((row) => {
        const r = row as { label?: string; checked?: boolean; fileName?: string | null };
        const mark = r.checked ? '☑' : '☐';
        const file = r.fileName ? `, ${r.fileName}` : '';
        return `${mark} ${r.label || 'Item'}${file}`;
      })
      .join('\n');
  }

  if (t === 'date' && typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'object') return '-';
  return String(value);
}
