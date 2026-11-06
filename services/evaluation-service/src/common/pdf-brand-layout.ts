import * as fs from 'fs';
import * as path from 'path';
import {
  PDFDocument, PDFPage, PDFFont, PDFImage, StandardFonts, rgb,
} from 'pdf-lib';

export const PDF_PAGE_W = 595.28;
export const PDF_PAGE_H = 841.89;
export const PDF_MARGIN = 48;
const HEADER_BLOCK = 68;
const FOOTER_BLOCK = 34;

export const PDF_CONTENT_TOP_Y = PDF_PAGE_H - PDF_MARGIN - HEADER_BLOCK;
export const PDF_CONTENT_BOTTOM_Y = PDF_MARGIN + FOOTER_BLOCK;

/** Matches --brand-primary (#4d92c4) from the Qurelio logo */
const BRAND_BLUE = rgb(0.302, 0.573, 0.769);
const TEXT_DARK = rgb(0.1, 0.1, 0.14);
const TEXT_MUTED = rgb(0.42, 0.44, 0.48);
const LINE_COLOR = rgb(0.88, 0.89, 0.91);
const BAR_BG = rgb(0.93, 0.94, 0.96);

function resolveLogoPath(): string {
  const candidates = [
    path.join(__dirname, '../../branding/querlio-logo.png'),
    path.join(process.cwd(), 'branding/querlio-logo.png'),
    path.join(process.cwd(), 'services/evaluation-service/branding/querlio-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export type BrandedPdfWriter = {
  pdf: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  logo: PDFImage | null;
  companyName: string;
  exportDateLabel: string;
  reportTitle: string;
  page: PDFPage;
  y: number;
  pageW: number;
  pageH: number;
  margin: number;
  maxTextW: number;
};

export function wrapPdfLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = (text || '').replace(/\r\n/g, '\n');
  const linesOut: string[] = [];
  for (const para of normalized.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        cur = candidate;
        continue;
      }
      if (cur) {
        linesOut.push(cur);
        cur = '';
      }
      let rest = w;
      while (rest.length > 0) {
        if (font.widthOfTextAtSize(rest, size) <= maxWidth) {
          cur = rest;
          break;
        }
        let lo = 1;
        let hi = rest.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (font.widthOfTextAtSize(rest.slice(0, mid), size) <= maxWidth) lo = mid;
          else hi = mid - 1;
        }
        const chunk = rest.slice(0, Math.max(1, lo));
        linesOut.push(chunk);
        rest = rest.slice(chunk.length);
      }
    }
    if (cur) linesOut.push(cur);
    if (!words.length) linesOut.push('');
  }
  return linesOut.length ? linesOut : [''];
}

export function stripHtmlForPdf(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function drawPageHeader(w: BrandedPdfWriter, page: PDFPage): void {
  const { margin, pageW, pageH, font, fontBold, logo, companyName, exportDateLabel, reportTitle } = w;
  const headerTop = pageH - margin;
  const lineY = pageH - margin - HEADER_BLOCK + 6;

  page.drawLine({
    start: { x: margin, y: lineY },
    end: { x: pageW - margin, y: lineY },
    thickness: 0.5,
    color: LINE_COLOR,
  });

  const logoH = 28;
  const logoW = logo ? (logo.width / logo.height) * logoH : 0;

  if (logo) {
    page.drawImage(logo, {
      x: margin,
      y: headerTop - logoH - 4,
      width: logoW,
      height: logoH,
    });
  }

  const titleSize = 14;
  const titleMaxW = pageW - 2 * margin - 160;
  const titleLines = wrapPdfLines(reportTitle, fontBold, titleSize, titleMaxW).slice(0, 2);
  const titleLineH = titleSize + 3;
  const titleBlockH = titleLines.length * titleLineH;
  let titleY = headerTop - 14 - (titleBlockH - titleLineH) / 2;
  for (const ln of titleLines) {
    const tw = fontBold.widthOfTextAtSize(ln, titleSize);
    page.drawText(ln, {
      x: (pageW - tw) / 2,
      y: titleY,
      size: titleSize,
      font: fontBold,
      color: BRAND_BLUE,
    });
    titleY -= titleLineH;
  }

  const companyLines = wrapPdfLines(companyName, fontBold, 10, 140);
  let cy = headerTop - 16;
  for (const ln of companyLines.slice(0, 2)) {
    page.drawText(ln, {
      x: pageW - margin - fontBold.widthOfTextAtSize(ln, 10),
      y: cy,
      size: 10,
      font: fontBold,
      color: TEXT_DARK,
    });
    cy -= 12;
  }

  page.drawText(`Exported ${exportDateLabel}`, {
    x: pageW - margin - font.widthOfTextAtSize(`Exported ${exportDateLabel}`, 8),
    y: headerTop - 32,
    size: 8,
    font,
    color: TEXT_MUTED,
  });
}

function drawPageFooter(page: PDFPage, pageIndex: number, totalPages: number, w: BrandedPdfWriter): void {
  const { margin, pageW, font } = w;
  const footerY = PDF_MARGIN - 8;

  page.drawLine({
    start: { x: margin, y: footerY + 18 },
    end: { x: pageW - margin, y: footerY + 18 },
    thickness: 0.5,
    color: LINE_COLOR,
  });

  const left = 'Qurelio · Confidential';
  page.drawText(left, { x: margin, y: footerY, size: 7.5, font, color: TEXT_MUTED });

  const center = 'Generated by Qurelio compliance platform';
  const centerW = font.widthOfTextAtSize(center, 7.5);
  page.drawText(center, {
    x: (pageW - centerW) / 2,
    y: footerY,
    size: 7.5,
    font,
    color: TEXT_MUTED,
  });

  const right = `Page ${pageIndex} of ${totalPages}`;
  page.drawText(right, {
    x: pageW - margin - font.widthOfTextAtSize(right, 7.5),
    y: footerY,
    size: 7.5,
    font,
    color: TEXT_MUTED,
  });
}

export async function createBrandedPdfWriter(opts: {
  companyName: string;
  reportTitle: string;
}): Promise<BrandedPdfWriter> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    const logoPath = resolveLogoPath();
    if (fs.existsSync(logoPath)) {
      const bytes = fs.readFileSync(logoPath);
      logo = await pdf.embedPng(bytes);
    }
  } catch {
    logo = null;
  }

  const exportDateLabel = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const w: BrandedPdfWriter = {
    pdf,
    font,
    fontBold,
    logo,
    companyName: opts.companyName || 'Company',
    exportDateLabel,
    reportTitle: opts.reportTitle || 'Report',
    page: pdf.addPage([PDF_PAGE_W, PDF_PAGE_H]),
    y: PDF_CONTENT_TOP_Y,
    pageW: PDF_PAGE_W,
    pageH: PDF_PAGE_H,
    margin: PDF_MARGIN,
    maxTextW: PDF_PAGE_W - 2 * PDF_MARGIN,
  };

  drawPageHeader(w, w.page);
  return w;
}

export function brandedNewPage(w: BrandedPdfWriter): void {
  w.page = w.pdf.addPage([w.pageW, w.pageH]);
  w.y = PDF_CONTENT_TOP_Y;
  drawPageHeader(w, w.page);
}

export function brandedEnsureSpace(w: BrandedPdfWriter, needed: number): void {
  if (w.y - needed < PDF_CONTENT_BOTTOM_Y) brandedNewPage(w);
}

export function brandedDrawBlock(
  w: BrandedPdfWriter,
  text: string,
  size: number,
  bold: boolean,
  lineGap = 3,
): void {
  const f = bold ? w.fontBold : w.font;
  for (const ln of wrapPdfLines(text, f, size, w.maxTextW)) {
    brandedEnsureSpace(w, size + lineGap + 6);
    w.page.drawText(ln, { x: w.margin, y: w.y, size, font: f, color: TEXT_DARK });
    w.y -= size + lineGap;
  }
}

export function brandedSectionBar(w: BrandedPdfWriter, label: string): void {
  w.y -= 6;
  brandedEnsureSpace(w, 24);
  w.page.drawRectangle({
    x: w.margin,
    y: w.y - 4,
    width: w.pageW - 2 * w.margin,
    height: 18,
    color: BAR_BG,
  });
  w.page.drawText(label, {
    x: w.margin + 6,
    y: w.y - 1,
    size: 11,
    font: w.fontBold,
    color: rgb(0.15, 0.18, 0.22),
  });
  w.y -= 26;
}

export async function finalizeBrandedPdf(w: BrandedPdfWriter): Promise<Buffer> {
  const pages = w.pdf.getPages();
  const total = pages.length;
  pages.forEach((page, i) => drawPageFooter(page, i + 1, total, w));
  return Buffer.from(await w.pdf.save());
}
