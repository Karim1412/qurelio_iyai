import * as ExcelJS from 'exceljs';
import {
  Audit,
  AuditChecklist,
  AuditFinding,
  FindingType,
} from '../database/entities/audit.entity';
import { NonConformity } from '../database/entities/non-conformity.entity';
import { compareIsoClauseRefs } from './audit-checklist-from-document';

type EvidenceCheckRow = { id: string; label: string; checked: boolean; source?: string };

export type LinkedNcBrief = {
  id: string;
  title: string;
  status: string;
  classification: string;
  isoClause: string | null;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE0E0E0' },
};

const SECTION_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0F4F8' },
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-GB');
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleString('en-GB');
}

export function formatFindingAnswer(answer: FindingType | string | null | undefined): string {
  if (!answer) return '-';
  const a = String(answer);
  if (a === 'STRENGTH') return 'Strong point';
  return a.replace(/_/g, ' ');
}

function hierarchyLabel(level: number | null | undefined): string {
  if (level === 1) return 'Chapter';
  if (level === 2) return 'Section';
  if (level === 3) return 'Criterion';
  return 'Criterion';
}

function isLeafRow(c: AuditChecklist): boolean {
  const hl = c.hierarchyLevel;
  return !hl || hl === 3;
}

function sortedChecklists(audit: Audit): AuditChecklist[] {
  return [...(audit.checklists || [])].sort((a, b) => {
    const c = compareIsoClauseRefs(a.isoClause, b.isoClause);
    if (c !== 0) return c;
    return (a.hierarchyLevel ?? 99) - (b.hierarchyLevel ?? 99);
  });
}

export function buildAuditSummaryStats(audit: Audit) {
  const leaves = (audit.checklists || []).filter(isLeafRow);
  const evaluated = leaves.filter((c) => c.answer).length;
  const scored = leaves.filter((c) => c.score != null).length;
  const ncLinked = leaves.filter((c) => c.ncId).length;
  const checks = leaves.flatMap((c) =>
    (Array.isArray(c.evidenceChecks) ? c.evidenceChecks : []) as EvidenceCheckRow[],
  );
  const checkedLines = checks.filter((r) => r.checked).length;
  return {
    totalCriteria: leaves.length,
    evaluated,
    scored,
    ncLinked,
    checklistLinesTotal: checks.length,
    checklistLinesChecked: checkedLines,
    findingsCount: (audit.findings || []).length,
  };
}

function styleHeaderRow(row: ExcelJS.Row, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  }
  row.height = 22;
}

function applyDataRow(ws: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    ws.getCell(rowNum, c).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  }
}

function addKeyValueBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  pairs: [string, string][],
  mergeToCol: number,
): number {
  let r = startRow;
  for (const [label, value] of pairs) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 2).value = value;
    ws.mergeCells(r, 2, r, mergeToCol);
    ws.getCell(r, 2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    r += 1;
  }
  return r;
}

function evidenceCheckedSummary(checks: EvidenceCheckRow[] | null | undefined): string {
  if (!Array.isArray(checks) || !checks.length) return '-';
  const checked = checks.filter((x) => x.checked);
  if (!checked.length) return 'None ticked';
  return checked.map((x) => x.label).join('; ');
}

function sheetSummary(
  ws: ExcelJS.Worksheet,
  audit: Audit,
  companyName: string,
  stats: ReturnType<typeof buildAuditSummaryStats>,
) {
  const lastCol = 4;
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = 'Audit report: Summary';
  ws.getCell(1, 1).font = { bold: true, size: 16 };
  ws.getRow(1).height = 28;

  let r = 3;
  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = 'Audit information';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  ws.getCell(r, 1).fill = SECTION_FILL;
  r += 1;

  const scopeRefs = Array.isArray(audit.scopeClauseRefs) ? audit.scopeClauseRefs.join(', ') : '-';
  r = addKeyValueBlock(ws, r, [
    ['Company', companyName],
    ['Audit title', audit.title || '-'],
    ['Type', audit.type],
    ['Status', audit.status],
    ['ISO standard', audit.isoStandard || '-'],
    ['Lead auditor', audit.leadAuditor || '-'],
    ['Scheduled start', fmtDate(audit.scheduledAt)],
    ['Scheduled end', fmtDate(audit.scheduledEndAt)],
    ['Started', fmtDateTime(audit.startedAt)],
    ['Completed', fmtDateTime(audit.completedAt)],
    ['Scope', audit.scope || '-'],
    ['Scope clauses', scopeRefs],
    ['Report generated', fmtDateTime(new Date())],
  ], lastCol);
  r += 1;

  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = 'Audit summary (metrics)';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  ws.getCell(r, 1).fill = SECTION_FILL;
  r += 1;

  r = addKeyValueBlock(ws, r, [
    ['Criteria (leaf rows)', String(stats.totalCriteria)],
    ['Criteria evaluated', String(stats.evaluated)],
    ['Criteria with score', String(stats.scored)],
    ['Criteria linked to NC', String(stats.ncLinked)],
    ['Checklist lines ticked', `${stats.checklistLinesChecked} / ${stats.checklistLinesTotal}`],
    ['Findings recorded', String(stats.findingsCount)],
  ], lastCol);
  r += 1;

  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = 'Overall conclusion';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  ws.getCell(r, 1).fill = SECTION_FILL;
  r += 1;
  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = (audit.overallConclusion || '-').trim() || '-';
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 72;
}

function sheetChecklist(ws: ExcelJS.Worksheet, audit: Audit, ncById: Map<string, LinkedNcBrief>) {
  const headers = [
    'Clause',
    'Level',
    'Criterion / question',
    'Evaluation',
    'Score %',
    'Auditor notes',
    'Checklist lines ticked',
    'Linked NC',
    'NC title',
    'NC status',
    'Attachment doc id',
  ];
  const colCount = headers.length;
  headers.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws.getRow(1), colCount);

  let r = 2;
  for (const c of sortedChecklists(audit)) {
    if (!isLeafRow(c)) continue;
    const nc = c.ncId ? ncById.get(c.ncId) : undefined;
    const checks = (Array.isArray(c.evidenceChecks) ? c.evidenceChecks : []) as EvidenceCheckRow[];
    const row = ws.getRow(r);
    row.getCell(1).value = c.isoClause;
    row.getCell(2).value = hierarchyLabel(c.hierarchyLevel);
    row.getCell(3).value = c.question || '-';
    row.getCell(4).value = formatFindingAnswer(c.answer);
    row.getCell(5).value = c.score != null ? c.score : '-';
    row.getCell(6).value = (c.notes || '').trim() || '-';
    row.getCell(7).value = evidenceCheckedSummary(checks);
    row.getCell(8).value = c.ncId || '-';
    row.getCell(9).value = nc?.title || '-';
    row.getCell(10).value = nc?.status || '-';
    row.getCell(11).value = c.attachmentDocumentId || '-';
    applyDataRow(ws, r, colCount);
    r += 1;
  }

  const widths = [10, 10, 48, 16, 10, 36, 40, 38, 28, 14, 38];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function sheetChecklistLines(ws: ExcelJS.Worksheet, audit: Audit) {
  const headers = ['Clause', 'Criterion / question', 'Checklist line', 'Ticked', 'Source'];
  const colCount = headers.length;
  headers.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws.getRow(1), colCount);

  let r = 2;
  for (const c of sortedChecklists(audit)) {
    if (!isLeafRow(c)) continue;
    const checks = (Array.isArray(c.evidenceChecks) ? c.evidenceChecks : []) as EvidenceCheckRow[];
    if (!checks.length) {
      const row = ws.getRow(r);
      row.getCell(1).value = c.isoClause;
      row.getCell(2).value = c.question || '-';
      row.getCell(3).value = '-';
      row.getCell(4).value = '-';
      row.getCell(5).value = '-';
      applyDataRow(ws, r, colCount);
      r += 1;
      continue;
    }
    for (const line of checks) {
      const row = ws.getRow(r);
      row.getCell(1).value = c.isoClause;
      row.getCell(2).value = c.question || '-';
      row.getCell(3).value = line.label || '-';
      row.getCell(4).value = line.checked ? 'Yes' : 'No';
      row.getCell(5).value = line.source || '-';
      applyDataRow(ws, r, colCount);
      r += 1;
    }
  }

  [10, 44, 52, 8, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function sheetFindings(ws: ExcelJS.Worksheet, findings: AuditFinding[]) {
  const headers = ['Type', 'Clause', 'Description', 'Evidence', 'Recorded by', 'Recorded at'];
  const colCount = headers.length;
  headers.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws.getRow(1), colCount);

  let r = 2;
  for (const f of findings) {
    const row = ws.getRow(r);
    row.getCell(1).value = formatFindingAnswer(f.type);
    row.getCell(2).value = f.isoClause || '-';
    row.getCell(3).value = f.description || '-';
    row.getCell(4).value = (f.evidence || '').trim() || '-';
    row.getCell(5).value = f.recordedBy || '-';
    row.getCell(6).value = fmtDateTime(f.createdAt);
    applyDataRow(ws, r, colCount);
    r += 1;
  }

  [16, 10, 52, 36, 28, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function sheetLinkedNcs(ws: ExcelJS.Worksheet, ncById: Map<string, LinkedNcBrief>) {
  const headers = ['NC id', 'Title', 'Status', 'Classification', 'ISO clause'];
  const colCount = headers.length;
  headers.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  styleHeaderRow(ws.getRow(1), colCount);

  let r = 2;
  const sorted = [...ncById.values()].sort((a, b) => a.title.localeCompare(b.title));
  for (const nc of sorted) {
    const row = ws.getRow(r);
    row.getCell(1).value = nc.id;
    row.getCell(2).value = nc.title;
    row.getCell(3).value = nc.status;
    row.getCell(4).value = nc.classification;
    row.getCell(5).value = nc.isoClause || '-';
    applyDataRow(ws, r, colCount);
    r += 1;
  }
  if (r === 2) {
    ws.getCell(2, 1).value = 'No non-conformities linked from this audit checklist.';
  }

  [38, 36, 18, 14, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export function mapLinkedNcs(rows: NonConformity[]): Map<string, LinkedNcBrief> {
  const m = new Map<string, LinkedNcBrief>();
  for (const nc of rows) {
    m.set(nc.id, {
      id: nc.id,
      title: nc.title,
      status: nc.status,
      classification: nc.classification,
      isoClause: nc.isoClause ?? null,
    });
  }
  return m;
}

export async function exportAuditToExcel(
  audit: Audit,
  companyName: string,
  ncById: Map<string, LinkedNcBrief>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Qurelio';
  wb.created = new Date();

  const stats = buildAuditSummaryStats(audit);

  sheetSummary(wb.addWorksheet('Summary'), audit, companyName, stats);
  sheetChecklist(wb.addWorksheet('Checklist'), audit, ncById);
  sheetChecklistLines(wb.addWorksheet('Checklist lines'), audit);
  sheetFindings(wb.addWorksheet('Findings'), audit.findings || []);
  sheetLinkedNcs(wb.addWorksheet('Linked NCs'), ncById);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function auditExportSlug(audit: Audit): string {
  let slug = (audit.title || '').trim();
  slug = slug
    .replace(/[/\\?%*|"<>]/g, '-')
    .replace(/:/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^_+|_+$/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/[_-]+$/, '');
  if (!slug) slug = `audit-${audit.id.slice(0, 8)}`;
  return slug;
}
