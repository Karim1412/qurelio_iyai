'use client';

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeft, Download, BarChart3, ChevronDown, ChevronUp, FileSpreadsheet, Loader2, RefreshCw } from '@/components/icons';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useRouter, useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PlaceholderRoutePage } from '@/components/ui/placeholder-route-page';
import { evaluationApi, documentApi, productApi } from '@/lib/api';
import { formatEvaluationPair } from '@/lib/evaluation-pair-label';
import { formatEvaluationRetryError } from '@/lib/evaluation-retry-error';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/utils/cn';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AgentActivityPanel } from '@/components/dashboard/AgentActivityPanel';
import {
  evalStatCardClass,
  evalStatusLabel,
  evalStatusRowClass,
  evalStatusTone,
  type EvalStatusTone,
} from '@/lib/theme-badges';

function ncDraftListTitle(d: Record<string, unknown>) {
  const raw = String(d?.title ?? '').trim();
  if (raw && !/\bundefined\b/i.test(raw)) return raw;
  const c = String(d?.clauseReference ?? d?.isoClause ?? '').trim();
  if (c) return `NC draft: Clause ${c}`;
  return 'NC draft: add clause reference and upload evidence';
}

/** Friendly, deterministic copy for existing and newly-generated evaluations. */
function clientStatusLabel(status: string, row: any = {}): string {
  const key = String(status || '').toUpperCase();
  const comparison = row.productStandardComparison ?? row.product_standard_comparison ?? {};
  const applicability = row.applicability ?? comparison.applicability ?? {};
  const method = String(comparison.method || '').toLowerCase();
  const scope = String(applicability.scope || '').toUpperCase();
  const kind = String(applicability.kind || '').toUpperCase();
  if (key === 'PASS' || key === 'CONFORMANT' || key === 'SATISFIED') return 'Conformity supported';
  if (key === 'FAIL' || key === 'NOT_SATISFIED' || key.endsWith('_NC')) return 'Requirement not met';
  if (key === 'MISSING_INFO' || key === 'PARTIALLY_SATISFIED') return 'Evidence needed';
  if (key === 'INCONCLUSIVE' || key === 'ERROR') return 'Assessment needs review';
  if (key === 'N/A' || key === 'NA' || key === 'NOT_APPLICABLE') {
    if (method === 'heading_only_clause' || ['STRUCTURAL_HEADING', 'HEADING_ONLY'].includes(kind)) return 'Heading only — not scored';
    if (scope === 'OUT_OF_SCOPE') return 'Outside product scope';
    if (method.includes('informative') || kind.includes('INFORMATIVE')) return 'Informative content';
    return 'Applicability needs confirmation';
  }
  return 'Assessment needs review';
}

function clientStatusExplanation(status: string, row: any = {}, displayLabel?: string): string {
  const label = displayLabel || clientStatusLabel(status, row);
  const comparison = row.productStandardComparison ?? row.product_standard_comparison ?? {};
  const applicability = row.applicability ?? comparison.applicability ?? {};
  if (row.override?.verdict) {
    return `A reviewer changed the result to ${label}. ${row.override.reason ? `Reviewer rationale: ${row.override.reason}` : 'No override rationale is available.'}`;
  }
  const supplied = String(row.statusExplanation ?? row.status_explanation ?? '').trim();
  if (supplied) return supplied;
  const statusText = String(status || '').toUpperCase();
  const sourceReason = String(applicability.reason || row.inconclusiveReason || row.inconclusive_reason || comparison.reason || row.justification || '').replace(/^\s*(?:PASS|FAIL|N\/?A|MISSING[_ ]INFO|INCONCLUSIVE)\s*:\s*/i, '').trim();
  if (label.startsWith('Heading only')) return 'This row is a clause heading, not a standalone auditable requirement. It is excluded from conformity scoring.';
  if (label === 'Outside product scope') return sourceReason || 'The recorded scope analysis indicates that this requirement is not a product/manufacturer conformity obligation for the current evaluation.';
  if (label === 'Applicability needs confirmation') return `The record does not contain enough scope rationale to confirm that this requirement can be excluded. ${sourceReason}`.trim();
  if (label === 'Condition not met') return sourceReason || 'The recorded applicability condition is not met for the current product profile. Confirm the condition before relying on this exclusion.';
  if (statusText === 'PASS') return `The available evidence supports the requirement. ${sourceReason}`.trim();
  if (statusText === 'FAIL') return `The available evidence indicates that one or more parts of this requirement are not met. ${sourceReason}`.trim();
  if (statusText === 'MISSING_INFO') return `The available record does not demonstrate every part of this requirement; this is an evidence gap, not by itself proof of non-conformity. ${sourceReason}`.trim();
  return `A reliable conformity decision could not be completed. ${sourceReason}`.trim();
}

function cleanClientRationale(value: unknown): string {
  return String(value ?? '')
    .replace(/^\s*(?:PASS|FAIL|N\/?A|MISSING[_ ]INFO|INCONCLUSIVE|SATISFIED|NOT[_ ]SATISFIED)\s*:\s*/i, '')
    .trim();
}

function clientRecommendedAction(status: string, row: any = {}, displayLabel?: string): string {
  if (row.override?.verdict) return 'Follow the reviewer decision and retain its rationale in the audit trail.';
  const supplied = String(row.recommendedAction ?? row.recommended_action ?? '').trim();
  if (supplied) return supplied;
  const key = String(status || '').toUpperCase();
  if (key === 'PASS') return 'Keep the cited evidence linked to the product and verify it remains current.';
  if (key === 'FAIL') return 'Verify the cited contradiction and, if confirmed, record a non-conformity and corrective action.';
  if (key === 'MISSING_INFO') return 'Upload or link evidence for the missing items, resolve conflicting records, and rerun the evaluation.';
  if (String(displayLabel || '').startsWith('Heading only')) return 'No product evidence is needed for this heading. If it should contain a requirement, correct the standard extraction and rerun.';
  if (String(displayLabel || '').toLowerCase().includes('scope') || String(displayLabel || '').includes('Condition') || String(displayLabel || '').includes('Applicability')) return 'Verify the applicability condition and product scope with the cited source before treating this requirement as excluded.';
  return 'Review the source extraction, clause mapping and evidence retrieval, then retry or complete a qualified manual review.';
}

/** Maps RAG / evaluation-service clause rows to the UI row shape (legacy + new verdicts). */
function normalizeEvalRow(r: any) {
  const ref = (r.clauseReference ?? r.clause_reference ?? r.clause_id ?? '').toString();
  const eff = (r.override?.verdict ?? r.verdict ?? '').toString().toUpperCase();
  const rawLegacy = (r.status || '').toString().toUpperCase();
  const legacy = rawLegacy === 'NOT_APPLICABLE' || rawLegacy === 'NA' ? 'N/A'
    : rawLegacy === 'CONFORMANT' || rawLegacy === 'SATISFIED' ? 'PASS'
    : rawLegacy === 'NOT_SATISFIED' ? 'FAIL'
    : rawLegacy === 'PARTIALLY_SATISFIED' ? 'MISSING_INFO'
    : rawLegacy;
  const verdictStatus = eff === 'SATISFIED' || eff === 'CONFORMANT' || eff === 'PASS' ? 'PASS'
    : eff === 'NOT_SATISFIED' || eff === 'FAIL' || eff.endsWith('_NC') ? 'FAIL'
    : eff === 'PARTIALLY_SATISFIED' || eff === 'MISSING_INFO' ? 'MISSING_INFO'
    : eff === 'INCONCLUSIVE' ? 'INCONCLUSIVE'
    : eff === 'N/A' || eff === 'NOT_APPLICABLE' ? 'N/A'
    : '';

  // Human overrides trump the engine result. Unknown statuses default to an
  // evidence/review state, never silently to an excluded row.
  let worksheetStatus = r.override?.verdict ? verdictStatus : (['PASS', 'FAIL', 'N/A', 'MISSING_INFO', 'INCONCLUSIVE'].includes(legacy) ? legacy : '');
  if (!worksheetStatus) worksheetStatus = verdictStatus || 'MISSING_INFO';

  let statusKey = 'MISSING_INFO';
  if (worksheetStatus === 'PASS') statusKey = 'CONFORMANT';
  else if (worksheetStatus === 'FAIL') statusKey = 'FAIL';
  else if (worksheetStatus === 'MISSING_INFO') statusKey = 'MISSING_INFO';
  else if (worksheetStatus === 'INCONCLUSIVE') statusKey = 'INCONCLUSIVE';
  else if (worksheetStatus === 'N/A') statusKey = 'N/A';
  else if (['CONFORMANT', 'MINOR_NC', 'MAJOR_NC', 'CRITICAL_NC'].includes(legacy)) statusKey = legacy;

  let conf = typeof r.confidence === 'number' ? r.confidence : parseFloat(r.confidence) || 0;
  if (conf > 1) conf /= 100;

  const se = r.supportingEvidence ?? r.supporting_evidence ?? [];
  const gaps = Array.isArray(r.gaps) ? r.gaps : [];
  const suggestions = Array.isArray(r.suggestions) ? r.suggestions : [];
  const first = Array.isArray(se) && se.length ? se[0] : null;
  const evText = first ? `${first.documentId || first.document_id || ''}: ${first.excerpt || ''}`.trim() : '';
  const reasoning = r.reasoning ?? '';
  const requirementElements = Array.isArray(r.requirementElements ?? r.requirement_elements) ? (r.requirementElements ?? r.requirement_elements) : [];
  const evidenceAssessment = Array.isArray(r.evidenceAssessment ?? r.evidence_assessment) ? (r.evidenceAssessment ?? r.evidence_assessment) : [];
  const productStandardComparison = (r.productStandardComparison ?? r.product_standard_comparison ?? {}) as Record<string, any>;
  const applicability = (r.applicability ?? productStandardComparison.applicability ?? {}) as Record<string, any>;
  const scope = String(applicability.scope ?? '').toUpperCase();
  const applicable = scope === 'OUT_OF_SCOPE' ? false : scope === 'IN_SCOPE' ? true : r.applicable !== false;
  const displayStatus = (!r.override && String(r.displayStatus ?? r.display_status ?? '').trim())
    || clientStatusLabel(statusKey, { ...r, applicability, productStandardComparison });
  const statusExplanation = clientStatusExplanation(statusKey, { ...r, applicability, productStandardComparison }, displayStatus);
  const recommendedAction = clientRecommendedAction(statusKey, r, displayStatus);
  const suppliedMissing = Array.isArray(r.missingInformation ?? r.missing_information)
    ? (r.missingInformation ?? r.missing_information).filter((item: unknown) => String(item || '').trim())
    : [];
  const comparisonElements = Array.isArray(productStandardComparison.elements) ? productStandardComparison.elements : [];
  const comparisonMissing = comparisonElements
    .filter((el: any) => el && (el.conflict || el.grounded === false || ['partial', 'missing', 'unverified', 'unknown', 'uncertain', 'conflict', 'conflicting', 'contradictory'].includes(String(el.status || el.comparison || '').toLowerCase())))
    .map((el: any) => {
      const field = String(el.productField || el.field || el.feature || 'required product information');
      const observed = el.observedValue ? ` Recorded value: ${el.observedValue}.` : '';
      return el.conflict
        ? `Resolve conflicting source information for ${field}.${observed}`
        : `Provide traceable evidence for ${field}; the current record does not fully demonstrate this requirement.${observed}`;
    });
  const fallbackMissing = [...gaps.filter((g: unknown) => String(g || '').trim()), ...comparisonMissing]
    .filter((value: string, i: number, all: string[]) => all.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === i)
    .slice(0, 6);
  const missingInformation = suppliedMissing.length ? suppliedMissing : worksheetStatus === 'MISSING_INFO'
    ? (fallbackMissing.length ? fallbackMissing : ['Identify the specific product record, test result, procedure, certificate or other evidence needed to demonstrate this requirement.'])
    : [];

  return {
    ...r,
    clause_id: ref,
    clause_title: r.clauseTitle || r.clause_title || '',
    clause_summary: r.clauseSummary ?? r.clause_summary ?? '',
    clause_text_excerpt: r.clauseTextExcerpt ?? r.clause_text_excerpt ?? '',
    applicable_if: r.applicableIf ?? r.applicable_if ?? '',
    conditional_clauses: r.conditionalClauses ?? r.conditional_clauses ?? '',
    references: r.references ?? '',
    note: r.note ?? '',
    gaps,
    suggestions,
    status: statusKey,
    worksheet_status: worksheetStatus,
    display_status: displayStatus,
    status_explanation: statusExplanation,
    recommended_action: recommendedAction,
    missing_information: missingInformation,
    evidenceCoverage: r.evidenceCoverage ?? r.evidence_coverage ?? '',
    confidence: conf,
    justification: (r.justification ?? (gaps.length ? gaps.join('; ') : '')) || '-',
    evidence_found: r.evidence_found ?? evText,
    applicable,
    inconclusive_reason: r.inconclusive_reason ?? r.inconclusiveReason ?? '',
    _supportingEvidence: se,
    reasoning,
    requirementElements,
    evidenceAssessment,
    applicability,
    productStandardComparison,
  };
}

type EvaluationExportFormat = 'xlsx' | 'pdf' | 'csv';

function resultGroup(status: unknown): 'PASS' | 'FAIL' | 'MISSING_INFO' | 'INCONCLUSIVE' | 'NA' {
  const value = String(status ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  if (['PASS', 'CONFORMANT', 'SATISFIED'].includes(value)) return 'PASS';
  if (['FAIL', 'NOT_SATISFIED', 'MINOR_NC', 'MAJOR_NC', 'CRITICAL_NC'].includes(value) || value.endsWith('_NC')) return 'FAIL';
  if (['MISSING_INFO', 'PARTIALLY_SATISFIED', 'EVIDENCE_NEEDED'].includes(value)) return 'MISSING_INFO';
  if (['INCONCLUSIVE', 'ERROR', 'REVIEW_REQUIRED'].includes(value)) return 'INCONCLUSIVE';
  if (['N/A', 'NA', 'NOT_APPLICABLE', 'NOT_SCORED'].includes(value)) return 'NA';
  return 'INCONCLUSIVE';
}

function normalizeClauseRefForComparison(value: unknown): string {
  let text = String(value ?? '').trim().replace(/^clause\s+/i, '').replace(/^section\s+/i, '');
  text = text.replace(/\s*\([a-z0-9]+\)\s*$/i, '').replace(/[\s.:-]+$/g, '');
  return text.replace(/\s+/g, ' ').toUpperCase();
}

/** Only recognizes a strong clause token at the start of the extracted requirement. */
function explicitLeadingClauseRef(value: unknown): string | null {
  const text = String(value ?? '').replace(/^\s*(?:[-•*]\s+|\([a-z0-9]+\)\s+)?/, '');
  const match = text.match(/^(?:(?:Clause|Section)\s+)?((?:\d{1,2}(?:\.\d{1,3}){1,3})|(?:[A-Z]\.\d{1,3}(?:\.\d{1,3}){0,2})|(?:Annex\s+[A-Z0-9]{1,6}(?:\.\d{1,3}){0,3}))\b/i);
  if (!match) return null;
  const ref = match[1].trim();
  const remainder = text.slice(match[0].length);
  const numericParts = ref.match(/\d+/g) || [];
  const deepNumericRef = ref.includes('.') && numericParts.length >= 3;
  if (!/^\s+[A-ZÀ-Þ]/u.test(remainder) && !(deepNumericRef && /^\s+[a-zà-ÿ]/u.test(remainder))) return null;
  return ref.replace(/^annex\s+/i, 'Annex ');
}

function analyzeClauseMappingIntegrity(rows: any[]) {
  const explicitRows = rows.map((row) => ({
    row,
    leadingRef: explicitLeadingClauseRef(row.clause_summary) || explicitLeadingClauseRef(row.clause_text_excerpt),
  })).filter((item) => !!item.leadingRef);
  const mismatches = explicitRows.filter(({ row, leadingRef }) => {
    const assigned = normalizeClauseRefForComparison(row.clause_id);
    const explicit = normalizeClauseRefForComparison(leadingRef);
    return !!assigned && !!explicit && assigned !== explicit;
  });
  const mappingGateRows = rows.filter((row) => {
    const source = String(row.decisionSource || row.decision_source || row.productStandardComparison?.method || '').toUpperCase();
    return source.includes('STANDARD_MAPPING_GATE') || source.includes('UNRESOLVED_MISATTRIBUTED_SECTION');
  });
  const mismatchRatio = mismatches.length / Math.max(1, rows.length);
  const hasIssue = (mismatches.length >= 3 && explicitRows.length >= 10 && mismatchRatio >= 0.06)
    || (mappingGateRows.length >= 3 && mappingGateRows.length / Math.max(1, rows.length) >= 0.05);
  return { hasIssue, mismatches: mismatches.length, explicitRows: explicitRows.length, mismatchRatio, mappingGateRows: mappingGateRows.length };
}

function exportValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => exportValue(item)).filter(Boolean).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function exportEvidence(row: any): string {
  const items = Array.isArray(row?._supportingEvidence) ? row._supportingEvidence : [];
  return items.map((item: any, index: number) => {
    const source = item.sourceLabel || item.documentName || item.document_name || item.documentId || item.document_id || `Evidence ${index + 1}`;
    const excerpt = exportValue(item.excerpt);
    return `${source}${excerpt ? `: ${excerpt}` : ''}`;
  }).filter(Boolean).join('\n');
}

function exportFilename(ev: any, pair: any, extension: string): string {
  const raw = `Qurelio_Compliance_${ev?.isoStandard || 'Standard'}_${pair?.productLine || 'Product'}_${ev?.id || ''}`;
  const slug = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
  return `${slug || 'Qurelio_Compliance_Report'}.${extension}`;
}

function buildClientExportRows(rows: any[]): Record<string, string>[] {
  return rows.map((row) => ({
    'Clause reference': exportValue(row.clause_id),
    'Clause title': exportValue(row.clause_title),
    'Requirement': exportValue(row.clause_summary || row.clause_text_excerpt),
    'Result': exportValue(row.display_status || clientStatusLabel(row.status, row)),
    'Explanation': exportValue(row.status_explanation || clientStatusExplanation(row.status, row, row.display_status)),
    'Assessment confidence': !['PASS', 'FAIL'].includes(resultGroup(row.status)) || !Number.isFinite(Number(row.confidence)) || Number(row.confidence) <= 0 ? 'Not assessed' : `${Math.round(Number(row.confidence) * 100)}%`,
    'Evidence': exportEvidence(row),
    'Evidence gaps': exportValue(row.missing_information),
    'Other gaps': exportValue(row.gaps),
    'Recommended next step': exportValue(row.recommended_action || clientRecommendedAction(row.status, row, row.display_status)),
    'Applicability condition': exportValue(row.applicable_if),
    'Related clauses': exportValue(row.conditional_clauses),
    'Cross references': exportValue(row.references),
    'Requirement elements': exportValue(row.requirementElements),
    'Evidence assessment': exportValue(row.evidenceAssessment),
    'Detailed reasoning': exportValue(row.reasoning),
    'Reviewer decision': exportValue(row.override?.verdict),
    'Reviewer rationale': exportValue(row.override?.reason),
    'Reviewer timestamp': exportValue(row.override?.at),
  }));
}

async function buildClientSideExport(format: EvaluationExportFormat, ev: any, pair: any, rows: any[]): Promise<{ blob: Blob; filename: string }> {
  const extension = format === 'xlsx' ? 'xlsx' : format;
  const filename = exportFilename(ev, pair, extension);
  const details = buildClientExportRows(rows);
  const mappingIntegrity = analyzeClauseMappingIntegrity(rows);
  const counts = rows.reduce((acc, row) => {
    acc[resultGroup(row.status)] += 1;
    return acc;
  }, { PASS: 0, FAIL: 0, MISSING_INFO: 0, INCONCLUSIVE: 0, NA: 0 });
  const completedAt = ev?.completedAt || ev?.createdAt;
  const dateText = completedAt && !Number.isNaN(new Date(completedAt).getTime()) ? new Date(completedAt).toLocaleString() : 'Not available';
  const overviewRows = [
    ['Qurelio — Compliance assessment report'],
    ['Evaluation ID', exportValue(ev?.id)],
    ['Evaluation status', exportValue(ev?.status)],
    ['Standard', exportValue(ev?.isoStandard)],
    ['Product', exportValue(pair?.productLine)],
    ['Evaluation scope', exportValue(pair?.summary)],
    ['Created / completed', dateText],
    ['Conformity score (%)', mappingIntegrity.hasIssue ? 'Withheld — clause mapping requires review' : ev?.conformityScore == null ? 'Not available' : Number(ev.conformityScore).toFixed(1)],
    ['Executive summary', exportValue(ev?.summary) || 'No executive summary was returned.'],
    ...(mappingIntegrity.hasIssue ? [['DATA QUALITY WARNING', `${mappingIntegrity.mismatches} of ${rows.length} result rows start with an explicit clause reference that differs from the assigned clause. Do not rely on the conformity score or create non-conformity records until the standard mapping is corrected and the evaluation rerun.`]] : []),
    [],
    ['Result overview', 'Count'],
    ['Conformity supported', String(counts.PASS)],
    ['Requirements not met', String(counts.FAIL)],
    ['Evidence needed', String(counts.MISSING_INFO)],
    ['Review required', String(counts.INCONCLUSIVE)],
    ['Not scored / scope review', String(counts.NA)],
    [],
    ['Interpretation note', 'Results reflect the evidence available to this evaluation. Missing evidence is not, by itself, proof of non-conformity. Review results and sources before making regulated decisions.'],
  ];

  if (format === 'xlsx' || format === 'csv') {
    const workbook = XLSX.utils.book_new();
    const overview = XLSX.utils.aoa_to_sheet(overviewRows);
    overview['!cols'] = [{ wch: 30 }, { wch: 92 }];
    XLSX.utils.book_append_sheet(workbook, overview, 'Overview');
    const headers = Object.keys(details[0] || {
      'Clause reference': '', 'Clause title': '', 'Requirement': '', 'Result': '', 'Explanation': '',
      'Confidence': '', 'Evidence': '', 'Evidence gaps': '', 'Other gaps': '', 'Recommended next step': '',
    });
    const detailSheet = XLSX.utils.aoa_to_sheet([headers, ...details.map((row) => headers.map((header) => row[header] ?? ''))]);
    detailSheet['!cols'] = headers.map((header) => ({ wch: Math.min(Math.max(header.length + 3, 18), 48) }));
    if (details.length) detailSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${details.length + 1}` };
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Clause details');
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(detailSheet, { blankrows: false });
      return { blob: new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), filename };
    }
    const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return { blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename };
  }

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 13;
  let page: any;
  let y = pageHeight - margin;
  let pageIndex = 0;
  const safePdfText = (input: unknown) => exportValue(input)
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[•·]/g, '-').replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pageIndex += 1;
    y = pageHeight - margin;
    page.drawText('Qurelio | Compliance assessment report', { x: margin, y: pageHeight - 27, size: 8, font: regular, color: rgb(0.38, 0.42, 0.48) });
    page.drawLine({ start: { x: margin, y: pageHeight - 34 }, end: { x: pageWidth - margin, y: pageHeight - 34 }, thickness: 0.6, color: rgb(0.82, 0.84, 0.87) });
  };
  const ensure = (height: number) => { if (!page || y - height < margin + 18) newPage(); };
  const wrap = (text: string, font: any, size: number, maxWidth: number): string[] => {
    const clean = safePdfText(text).replace(/\s+/g, ' ').trim();
    if (!clean) return ['-'];
    const words = clean.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
  };
  const drawText = (text: string, opts: { size?: number; bold?: boolean; color?: any; indent?: number; gapAfter?: number } = {}) => {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? bold : regular;
    const indent = opts.indent ?? 0;
    const lines = wrap(text, font, size, contentWidth - indent);
    for (const line of lines) {
      ensure(lineHeight + 2);
      page.drawText(line, { x: margin + indent, y, size, font, color: opts.color || rgb(0.16, 0.19, 0.24) });
      y -= Math.max(lineHeight, size + 3);
    }
    y -= opts.gapAfter ?? 2;
  };
  newPage();
  drawText('Compliance assessment report', { size: 19, bold: true, color: rgb(0.08, 0.22, 0.42), gapAfter: 6 });
  drawText(`Standard: ${ev?.isoStandard || 'Not specified'}`, { size: 10, bold: true });
  drawText(`Product: ${pair?.productLine || 'Not specified'}`, { size: 10 });
  drawText(`Evaluation: ${ev?.id || 'Not available'}  |  Status: ${ev?.status || 'Not available'}`, { size: 8.5, color: rgb(0.38, 0.42, 0.48) });
  drawText(`Date: ${dateText}  |  Conformity score: ${mappingIntegrity.hasIssue ? 'Withheld — clause mapping needs review' : ev?.conformityScore == null ? 'Not available' : `${Number(ev.conformityScore).toFixed(1)}%`}`, { size: 8.5, color: rgb(0.38, 0.42, 0.48), gapAfter: 8 });
  if (mappingIntegrity.hasIssue) drawText(`DATA QUALITY WARNING: ${mappingIntegrity.mismatches} of ${rows.length} result rows start with an explicit clause reference that differs from the assigned clause. Do not rely on this score or create non-conformity records until the Standard extraction is corrected and the evaluation rerun.`, { size: 9, bold: true, color: rgb(0.72, 0.16, 0.12), gapAfter: 8 });
  drawText('Overview', { size: 12, bold: true, color: rgb(0.08, 0.22, 0.42), gapAfter: 4 });
  drawText(`Conformity supported: ${counts.PASS} | Requirements not met: ${counts.FAIL} | Evidence needed: ${counts.MISSING_INFO} | Review required: ${counts.INCONCLUSIVE} | Not scored: ${counts.NA}`, { size: 9 });
  drawText(`Executive summary: ${ev?.summary || 'No executive summary was returned.'}`, { size: 9.5, gapAfter: 9 });
  drawText('Clause-by-clause results', { size: 12, bold: true, color: rgb(0.08, 0.22, 0.42), gapAfter: 5 });
  if (!rows.length) drawText('No clause results are available for this evaluation.');
  for (const row of rows) {
    const status = row.display_status || clientStatusLabel(row.status, row);
    ensure(70);
    page.drawLine({ start: { x: margin, y: y + 5 }, end: { x: pageWidth - margin, y: y + 5 }, thickness: 0.45, color: rgb(0.84, 0.86, 0.89) });
    drawText(`Clause ${row.clause_id || 'Reference unavailable'} — ${row.clause_title || 'Untitled requirement'}`, { size: 10.5, bold: true, color: rgb(0.08, 0.22, 0.42), gapAfter: 1 });
    drawText(`Result: ${status}`, { size: 9.5, bold: true });
    drawText(`Requirement: ${row.clause_summary || row.clause_text_excerpt || 'Requirement text unavailable.'}`, { size: 9 });
    drawText(`Explanation: ${row.status_explanation || clientStatusExplanation(row.status, row, status)}`, { size: 9 });
    const evidence = exportEvidence(row);
    drawText(`Evidence: ${evidence || 'No traceable evidence excerpt linked.'}`, { size: 8.7 });
    const gaps = [...(Array.isArray(row.missing_information) ? row.missing_information : []), ...(Array.isArray(row.gaps) ? row.gaps : [])];
    if (gaps.length) drawText(`Evidence gaps: ${gaps.join('; ')}`, { size: 8.7 });
    drawText(`Recommended next step: ${row.recommended_action || clientRecommendedAction(row.status, row, status)}`, { size: 8.7, gapAfter: 5 });
  }
  pdf.getPages().forEach((pdfPage: any, index: number) => {
    pdfPage.drawText(`Page ${index + 1} of ${pageIndex}`, { x: pageWidth - margin - 65, y: 20, size: 8, font: regular, color: rgb(0.42, 0.45, 0.5) });
    pdfPage.drawText('Evidence-based review aid — verify cited sources before regulated decisions.', { x: margin, y: 20, size: 7.5, font: regular, color: rgb(0.42, 0.45, 0.5) });
  });
  const bytes = await pdf.save();
  const pdfArrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfArrayBuffer).set(bytes);
  return { blob: new Blob([pdfArrayBuffer], { type: 'application/pdf' }), filename };
}

function ScoreGauge({ score }: { score: number | null | undefined }) {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const normalizedScore = hasScore ? Math.max(0, Math.min(100, score as number)) : 0;
  const color = !hasScore ? 'var(--muted)' : normalizedScore >= 90 ? '#2e7d32' : normalizedScore >= 75 ? '#ef6c00' : normalizedScore >= 60 ? '#f9a825' : '#c62828';
  const label = !hasScore ? 'Review needed' : normalizedScore >= 90 ? 'Strong support' : normalizedScore >= 75 ? 'Mostly supported' : normalizedScore >= 60 ? 'Mixed evidence' : 'Limited support';
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-2 flex h-[120px] w-[120px] items-center justify-center">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--gauge-track)" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(normalizedScore / 100) * 264} 264`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black" style={{ color }}>
            {hasScore ? `${normalizedScore.toFixed(1)}%` : '—'}
          </span>
          <span className="text-[10px] font-semibold" style={{ color }}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: EvalStatusTone }) {
  return (
    <div className={evalStatCardClass(tone)}>
      <p className="eval-stat-value">{value}</p>
      <p className="text-[11px] font-semibold text-[var(--muted)]">{label}</p>
    </div>
  );
}

function ClauseRow({
  row,
  idx,
  evaluationId,
  canOverride,
  completed,
  onUpdated,
}: {
  row: any;
  idx: number;
  evaluationId: string;
  canOverride: boolean;
  completed: boolean;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState(() => (row.override?.verdict ?? row.verdict ?? 'NOT_SATISFIED').toString().toUpperCase());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const statusKey = row.status || row.verdict || 'N/A';

  React.useEffect(() => {
    setVerdict((row.override?.verdict ?? row.verdict ?? 'NOT_SATISFIED').toString().toUpperCase());
  }, [row.override?.verdict, row.verdict]);

  const submitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!reason.trim()) {
      toast.error('A reason is required (audit trail).');
      return;
    }
    setSaving(true);
    try {
      await evaluationApi.patchClause(evaluationId, row.resultId || row.result_id || row.clause_id, {
        verdict: verdict.toUpperCase(),
        reason: reason.trim(),
      });
      toast.success('Clause verdict updated');
      setReason('');
      onUpdated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TableRow
        className={cn('cursor-pointer transition-hover', evalStatusRowClass(statusKey, { open, striped: idx % 2 === 0 }))}
        onClick={() => setOpen(!open)}
      >
        <TableCell className="min-w-[210px] align-middle">
          <p className="font-mono text-xs font-bold text-[var(--brand-primary)]">{row.clause_id || 'Reference unavailable'}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{row.clause_title || 'Requirement title unavailable'}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--muted)]">{row.clause_summary || row.clause_text_excerpt || 'Open details to inspect the extracted requirement.'}</p>
        </TableCell>
        <TableCell className="min-w-[155px] align-middle">
          <span className="eval-status-chip">{row.display_status || clientStatusLabel(statusKey, row)}</span>
          {row.override?.verdict && <p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">Reviewer decision</p>}
          {resultGroup(statusKey) === 'MISSING_INFO' && <p className="mt-1 text-[11px] text-amber-700">Evidence gap</p>}
          {resultGroup(statusKey) === 'INCONCLUSIVE' && <p className="mt-1 text-[11px] text-[var(--muted)]">Needs review</p>}
        </TableCell>
        <TableCell className="min-w-[220px] max-w-[340px] align-middle">
          <p className="line-clamp-2 text-xs leading-5 text-[var(--text-primary)]">{row.recommended_action || clientRecommendedAction(statusKey, row, row.display_status)}</p>
          {Array.isArray(row.missing_information) && row.missing_information.length > 0 && (
            <p className="mt-1 text-[11px] font-medium text-amber-700">{row.missing_information.length} evidence item(s) needed</p>
          )}
        </TableCell>
        <TableCell className="min-w-[110px] align-middle">
          {Array.isArray(row._supportingEvidence) && row._supportingEvidence.length > 0 ? (
            <div className="text-xs">
              <p className="font-semibold text-[var(--text-primary)]">{row._supportingEvidence.length} excerpt(s)</p>
              <p className="mt-1 text-[var(--muted)]">{row._supportingEvidence.some((e: any) => e.sourceLabel || e.documentId || e.document_id) ? 'Source recorded' : 'Source needs review'}</p>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">No linked excerpt</p>
          )}
        </TableCell>
        <TableCell className="w-12 text-center align-middle">
          <button type="button" aria-label={open ? 'Collapse clause details' : 'Open clause details'} className="rounded p-1" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5} className="border-0 p-0">
            <div
              className={cn('eval-status-detail p-6', `eval-status-row--${evalStatusTone(statusKey)}`)}
              onClick={(e) => e.stopPropagation()}
            >
              <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">What this result means</p>
                    <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{row.display_status || clientStatusLabel(statusKey, row)}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{row.status_explanation || clientStatusExplanation(statusKey, row, row.display_status)}</p>
                  </div>
                </div>
                {Array.isArray(row.missing_information) && row.missing_information.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50/70 p-3">
                    <p className="text-xs font-bold text-amber-900">Information needed to complete this assessment</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
                      {row.missing_information.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-4 rounded-lg bg-[var(--nav-hover)] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Recommended next step</p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">{row.recommended_action || clientRecommendedAction(statusKey, row, row.display_status)}</p>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">A result is based on the available evidence and extracted requirement text. Missing evidence is not, by itself, proof of non-conformity.</p>
              </section>
              <div className="mb-5 grid gap-3 md:grid-cols-2">
                <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Standard requirement</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{row.clause_text_excerpt || row.clause_summary || 'Requirement text unavailable; review the original standard.'}</p>
                  {row.productStandardComparison?.standardContext?.qualityFlags?.sourcePageStart && <p className="mt-2 text-xs text-[var(--muted)]">Section starts on page {String(row.productStandardComparison.standardContext.qualityFlags.sourcePageStart)}{row.productStandardComparison.standardContext.qualityFlags.sourcePageEnd && row.productStandardComparison.standardContext.qualityFlags.sourcePageEnd !== row.productStandardComparison.standardContext.qualityFlags.sourcePageStart ? ` and ends on page ${String(row.productStandardComparison.standardContext.qualityFlags.sourcePageEnd)}` : ''}.</p>}
                </section>
                <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Product evidence</p>
                  {row._supportingEvidence?.length ? <>
                    <p className="mt-2 text-xs font-semibold text-[var(--brand-primary)]">{row._supportingEvidence[0].sourceLabel || row._supportingEvidence[0].source_label || 'Product document'}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{row._supportingEvidence[0].excerpt || 'Open the detailed comparison to review the source.'}</p>
                    {row._supportingEvidence.length > 1 && <p className="mt-2 text-xs text-[var(--muted)]">{row._supportingEvidence.length - 1} more excerpt(s) in the detailed comparison.</p>}
                  </> : <p className="mt-2 text-sm leading-6 text-[var(--muted)]">No source excerpt was selected. Review the requested information and source documents.</p>}
                </section>
              </div>
              {(row.applicable_if || row.conditional_clauses || row.references || row.note) && (
                <section className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Scope and clause context</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {row.applicable_if && <div><p className="text-[11px] font-semibold text-[var(--muted)]">Applicability condition</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.applicable_if}</p></div>}
                    {row.conditional_clauses && <div><p className="text-[11px] font-semibold text-[var(--muted)]">Related conditions</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.conditional_clauses}</p></div>}
                    {row.references && <div><p className="text-[11px] font-semibold text-[var(--muted)]">Cross-references</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.references}</p></div>}
                    {row.note && <div><p className="text-[11px] font-semibold text-[var(--muted)]">Additional note</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.note}</p></div>}
                  </div>
                </section>
              )}
              <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">Detailed comparison and reviewer controls</summary>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Assessment outcome</p>
                  <p className="text-sm font-semibold">{row.display_status || clientStatusLabel(statusKey, row)}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Internal engine classification is kept for scoring and audit compatibility.</p>
                </div>
                {row.override?.verdict && (
                  <div className="alert-surface-override">
                    <p className="text-[11px] font-bold uppercase">Manual override</p>
                    <p>
                      Set to <strong>{clientStatusLabel(String(row.override.verdict), row)}</strong>
                      {row.override.reason ? `: ${row.override.reason}` : ''}
                    </p>
                    {row.override.at && (
                      <p className="mt-1 text-[10px] opacity-80">Recorded at {format(new Date(row.override.at), 'PPp')}</p>
                    )}
                  </div>
                )}
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Justification</p>
                  <p className="whitespace-pre-wrap text-sm">{cleanClientRationale(row.justification) || row.status_explanation || 'No additional engine rationale was returned.'}</p>
                </div>
                {row.evidence_found && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                      Evidence found in document
                    </p>
                    <p className="border-l-3 border-[var(--brand-primary)] pl-3 text-sm italic text-[var(--muted)]">
                      &ldquo;{row.evidence_found}&rdquo;
                    </p>
                  </div>
                )}
                {Array.isArray(row._supportingEvidence) && row._supportingEvidence.length > 0 && (
                  <div className="md:col-span-2">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                      Evidence chunks used for this verdict (explainability)
                    </p>
                    <ul className="space-y-2 text-sm">
                      {row._supportingEvidence.slice(0, 8).map((ex: any, i: number) => (
                        <li key={i} className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                          <span className="text-[10px] font-mono text-[var(--muted)]">
                            {(ex.documentId || ex.document_id) || '-'}
                            {(ex.sourceLabel || ex.source_label) ? ` · ${ex.sourceLabel || ex.source_label}` : ''}
                          </span>
                          <p className="mt-1 text-[var(--text-primary)]">{ex.excerpt || ''}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {row.gaps?.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-red-700">Gaps identified</p>
                    <ul className="list-disc pl-5 text-sm text-red-700">
                      {row.gaps.map((g: string, i: number) => (
                        <li key={i}>{cleanClientRationale(g) || g}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {row.suggestions?.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-blue-800">Recommendations</p>
                    <ul className="list-disc pl-5 text-sm text-blue-900">
                      {row.suggestions.map((t: string, i: number) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {row.reasoning && (
                  <div className="md:col-span-2">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">AI Reasoning</p>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                      {row.reasoning}
                    </div>
                  </div>
                )}
                {row.productStandardComparison && (row.productStandardComparison.standardRequirement || (row.productStandardComparison.elements || []).length > 0) && (
                  <div className="md:col-span-2">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Product ↔ Standard / Regulation Comparison</p>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="grid gap-2 sm:grid-cols-4 text-xs">
                        <div><span className="font-semibold">Method:</span> {String(row.productStandardComparison.method || '-')}</div>
                        <div><span className="font-semibold">Evidence coverage:</span> {String(row.productStandardComparison.coverage || 'No evidence located').replace(/_/g, ' ').replace(/^NONE$/i, 'No evidence located').replace(/^NOT APPLICABLE$/i, 'Not applicable to this row').replace(/^NOT_APPLICABLE$/i, 'Not applicable to this row')}</div>
                        <div><span className="font-semibold">Comparison signal:</span> {clientStatusLabel(String(row.productStandardComparison.decision || statusKey), row)}</div>
                        <div><span className="font-semibold">Numeric:</span> {Number(row.productStandardComparison.numericConstraintsCovered || 0)}/{Number(row.productStandardComparison.numericConstraintCount || 0)}</div>
                      </div>
                      {row.productStandardComparison.standardContext?.qualityFlags?.sourceContextNeedsReview && (
                        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">The extraction did not provide reliable clause-local context. This comparison uses the extracted requirement text only; verify it against the original Standard before relying on the result.</p>
                      )}
                      {row.productStandardComparison.standardRequirement && (
                        <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Exact requirement from Standards &amp; Regulations Portal</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)] whitespace-pre-wrap">{String(row.productStandardComparison.standardRequirement)}</p>
                        </div>
                      )}
                      {row.productStandardComparison.standardContext?.clauseTextExcerpt && (
                        <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
                          <summary className="cursor-pointer text-xs font-semibold">Portal clause context</summary>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted)] whitespace-pre-wrap">{String(row.productStandardComparison.standardContext.clauseTextExcerpt)}</p>
                        </details>
                      )}
                      {row.productStandardComparison.reason && (
                        <p className="mt-2 text-xs text-[var(--muted)]">{row.productStandardComparison.reason}</p>
                      )}
                      {Array.isArray(row.productStandardComparison.elements) && row.productStandardComparison.elements.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[var(--border)]">
                                <th className="p-2 text-left font-semibold">Product field</th>
                                <th className="p-2 text-left font-semibold">Observed</th>
                                <th className="p-2 text-left font-semibold">Requirement check</th>
                                <th className="p-2 text-left font-semibold">Comparison</th>
                                <th className="p-2 text-left font-semibold">Source</th>
                                <th className="p-2 text-left font-semibold">Evidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.productStandardComparison.elements.map((el: any, i: number) => (
                                <tr key={i} className="border-b border-[var(--border)] last:border-0">
                                  <td className="p-2 font-medium text-[var(--text-primary)]">{el.productField || '-'}</td>
                                  <td className="p-2 text-[var(--text-primary)]">{el.observedValue || '-'}{el.unit ? ` ${el.unit}` : ''}</td>
                                  <td className="p-2 text-[var(--muted)]">{el.standardConstraint ? JSON.stringify(el.standardConstraint) : (el.requiredValue || el.feature || '-')}</td>
                                  <td className="p-2 font-semibold">{el.comparison || '-'}{el.conflict ? ' · conflict' : ''}</td>
                                  <td className="p-2 text-[var(--muted)]">{el.source || '-'}{el.page ? `, p. ${el.page}` : ''}</td>
                                  <td className="p-2 text-[var(--muted)]">{el.evidence || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {Array.isArray(row.requirementElements) && row.requirementElements.length > 0 && (
                  <div className="md:col-span-2">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Requirement Elements Analysis</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="p-2 text-left font-semibold">Requirement Element</th>
                            <th className="p-2 text-left font-semibold">Status</th>
                            <th className="p-2 text-left font-semibold">Evidence Refs</th>
                            <th className="p-2 text-left font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.requirementElements.map((el: any, i: number) => (
                            <tr key={i} className="border-b border-[var(--border)] last:border-0">
                              <td className="p-2 text-[var(--text-primary)]">{el.element || '-'}</td>
                              <td className="p-2">
                                <span className={`font-semibold ${
                                  el.status === 'covered' ? 'text-green-700' :
                                  el.status === 'partial' ? 'text-amber-700' : 'text-red-700'
                                }`}>
                                  {String(el.status || 'Not assessed').replace(/_/g, ' ').replace(/^covered$/i, 'Evidence found').replace(/^partial$/i, 'Partially evidenced').replace(/^missing$/i, 'Evidence needed').replace(/^unknown$/i, 'Needs review')}
                                </span>
                              </td>
                              <td className="p-2 text-[var(--muted)]">
                                {Array.isArray(el.evidence_refs) ? el.evidence_refs.join(', ') : '-'}
                              </td>
                              <td className="p-2 text-[var(--text-primary)]">{el.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {canOverride && completed && row.clause_id && (
                  <form className="md:col-span-2 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4" onSubmit={submitOverride}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Override verdict (QM / Auditor)</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">New verdict</Label>
                        <select
                          className="mt-1 flex h-10 w-full rounded-lg border border-[var(--input-border)] px-2 text-sm"
                          value={verdict}
                          onChange={(e) => setVerdict(e.target.value)}
                        >
                          <option value="SATISFIED">Satisfied</option>
                          <option value="PARTIALLY_SATISFIED">Partially satisfied</option>
                          <option value="NOT_SATISFIED">Not satisfied</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Reason (logged with your user id)</Label>
                        <Textarea
                          className="mt-1 min-h-[72px] text-sm"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Explain why the AI verdict is being changed…"
                          required
                        />
                      </div>
                    </div>
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save override'}
                    </Button>
                  </form>
                )}
              </div>
              </details>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function EvaluationReportPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [ev, setEv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ncDialogOpen, setNcDialogOpen] = useState(false);
  const [ncBusy, setNcBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<EvaluationExportFormat | null>(null);
  const [resultFilter, setResultFilter] = useState<'ALL' | 'PASS' | 'FAIL' | 'MISSING_INFO' | 'INCONCLUSIVE' | 'N/A'>('ALL');
  const [resultSearch, setResultSearch] = useState('');
  const [isoNorms, setIsoNorms] = useState<{ id: string; name?: string; isoStandard?: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name?: string; documents?: { id: string }[] }[]>([]);
  const [tenantDocs, setTenantDocs] = useState<
    { id: string; productId?: string | null; productName?: string | null }[]
  >([]);

  const perms = usePermissions();
  const canOverride = perms.approveRejectDocuments;
  const canConfirmNc = perms.launchComplianceEvaluation;

  const refresh = React.useCallback(() => {
    return evaluationApi.get(id).then((r) => setEv(r.data));
  }, [id]);

  useEffect(() => {
    setLoading(true);
    evaluationApi
      .get(id)
      .then((r) => setEv(r.data))
      .catch(() => toast.error('Failed to load evaluation'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    Promise.all([documentApi.getIsoNorms(), productApi.list(), documentApi.list()])
      .then(([n, p, d]) => {
        setIsoNorms(n.data ?? []);
        setProducts(p.data ?? []);
        const raw = Array.isArray(d.data) ? d.data : [];
        setTenantDocs(
          raw.map((x: { id: string; productId?: string | null; product?: { name?: string } | null }) => ({
            id: x.id,
            productId: x.productId ?? null,
            productName: x.product?.name ?? null,
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ev || ev.status === 'COMPLETED' || ev.status === 'FAILED') return;
    const t = setInterval(() => {
      evaluationApi.get(id).then((r) => setEv(r.data)).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [ev?.status, id]);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  function parseFilenameFromContentDisposition(cd: string | undefined): string | null {
    if (!cd) return null;
    const star = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star) {
      try {
        return decodeURIComponent(star[1].trim());
      } catch {
        return star[1].trim();
      }
    }
    const q = cd.match(/filename="([^"]+)"/i);
    if (q) return q[1].trim();
    const u = cd.match(/filename=([^;\s]+)/i);
    return u ? u[1].trim().replace(/^["']|["']$/g, '') : null;
  }

  const handleExport = async (format: EvaluationExportFormat) => {
    if (!ev || ev.status !== 'COMPLETED' || exportingFormat) return;
    setExportingFormat(format);
    const labels: Record<EvaluationExportFormat, string> = { pdf: 'PDF', csv: 'CSV', xlsx: 'Excel' };
    try {
      // Prefer the server's branded export. If the endpoint fails or returns an
      // error page/JSON blob, generate a complete report from the loaded results.
      const mappingIntegrity = analyzeClauseMappingIntegrity(results);
      let downloaded = false;
      try {
        if (mappingIntegrity.hasIssue) throw new Error('Server export skipped: clause mapping quality warning must be included.');
        const res = await evaluationApi.export(id, format);
        const cd = res.headers['content-disposition'] as string | undefined;
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        const isErrorPayload = contentType.includes('application/json') || contentType.includes('text/html') || contentType.includes('text/plain');
        const expectedType = format === 'pdf'
          ? contentType.includes('application/pdf') || contentType.includes('application/octet-stream')
          : format === 'xlsx'
            ? contentType.includes('spreadsheetml') || contentType.includes('application/octet-stream')
            : contentType.includes('text/csv') || contentType.includes('application/octet-stream');
        const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
        let validFileSignature = false;
        if (blob.size > 0) {
          if (format === 'pdf') validFileSignature = (await blob.slice(0, 5).text()).startsWith('%PDF-');
          else if (format === 'xlsx') validFileSignature = (await blob.slice(0, 2).text()) === 'PK';
          else {
            const prefix = (await blob.slice(0, 120).text()).replace(/^\uFEFF/, '').trimStart().toLowerCase();
            validFileSignature = !!prefix && !prefix.startsWith('<!doctype html') && !prefix.startsWith('<html') && !prefix.startsWith('{"') && !prefix.startsWith('error:');
          }
        }
        if (!isErrorPayload && expectedType && validFileSignature) {
          const ext = format === 'xlsx' ? 'xlsx' : format;
          const name = parseFilenameFromContentDisposition(cd) ?? exportFilename(ev, pair, ext);
          downloadBlob(blob, name);
          downloaded = true;
        }
      } catch (serverError) {
        console.warn(`Server ${format.toUpperCase()} export unavailable; preparing a client-side report.`, serverError);
      }
      if (!downloaded) {
        const local = await buildClientSideExport(format, ev, pair, results);
        downloadBlob(local.blob, local.filename);
      }
      toast.success(`${labels[format]} report downloaded`);
    } catch (error) {
      console.error('Evaluation report export failed', error);
      toast.error(`Could not generate the ${labels[format]} report. Please try again.`);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleRetry = async () => {
    if (!ev) return;
    const pair = formatEvaluationPair(ev, isoNorms, products, tenantDocs);
    setRetryBusy(true);
    try {
      await evaluationApi.retry(id);
      toast.success(`Re-queued: ${pair.summary}`);
      await refresh();
    } catch (err: unknown) {
      toast.error(formatEvaluationRetryError(err));
    } finally {
      setRetryBusy(false);
    }
  };

  const handleConfirmNc = async () => {
    if (analyzeClauseMappingIntegrity((Array.isArray(ev?.results) ? ev.results : []).map(normalizeEvalRow)).hasIssue) {
      toast.error('Cannot create non-conformities until the Standard clause mapping is corrected and the evaluation is rerun.');
      return;
    }
    setNcBusy(true);
    try {
      await evaluationApi.confirmNcDrafts(id);
      toast.success('Non-conformity records created.');
      setNcDialogOpen(false);
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Could not create NCs');
    } finally {
      setNcBusy(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout pageTitle="Loading report…" pageTagline="Fetching evaluation details.">
        <div className="h-1 w-full animate-pulse rounded bg-[var(--brand-primary)]/30" />
      </DashboardLayout>
    );
  }

  if (!ev) {
    return (
      <PlaceholderRoutePage
        title="Report not found"
        description="This evaluation may have been removed or the link is outdated. Check the reports list to find other evaluations."
        backHref="/evaluations"
        backLabel="Back to evaluations"
        secondaryHref="/dashboard"
        secondaryLabel="Dashboard"
      />
    );
  }

  const rawResults: any[] = Array.isArray(ev.results) ? ev.results : [];
  const results = rawResults.map(normalizeEvalRow);
  const mappingIntegrity = analyzeClauseMappingIntegrity(results);
  const conformant = results.filter((r) => resultGroup(r.status) === 'PASS').length;
  const failedResults = results.filter((r) => resultGroup(r.status) === 'FAIL').length;
  const missingInfo = results.filter((r) => resultGroup(r.status) === 'MISSING_INFO').length;
  const inconclusive = results.filter((r) => resultGroup(r.status) === 'INCONCLUSIVE').length;
  const na = results.filter((r) => resultGroup(r.status) === 'NA').length;
  const assessable = conformant + failedResults + missingInfo + inconclusive;
  const decided = conformant + failedResults;
  const decisionCoverage = assessable ? Math.round((decided / assessable) * 100) : 0;
  const sourceManifest = ev.requestSnapshot?.evidenceManifest;
  const evidenceWarnings = Array.isArray(sourceManifest?.warnings) ? sourceManifest.warnings : [];
  const conformityOverviewText = mappingIntegrity.hasIssue
    ? 'This report has a clause-mapping problem. Review the Standard extraction before relying on the result.'
    : failedResults > 0
      ? `Start with ${failedResults} requirement${failedResults === 1 ? '' : 's'} marked not met. ${missingInfo} additional requirement${missingInfo === 1 ? '' : 's'} need evidence; an evidence gap is not automatically a non-conformity.`
      : missingInfo > 0
        ? `Evidence is not yet sufficient for ${missingInfo} requirement${missingInfo === 1 ? '' : 's'}. Add the missing documents or test records before deciding conformity.`
        : inconclusive > 0
          ? `${inconclusive} requirement${inconclusive === 1 ? '' : 's'} need a human review before you rely on the assessment.`
          : `The available evidence supports ${conformant} requirement${conformant === 1 ? '' : 's'}. Check excluded items and keep the supporting evidence current.`;
  const filteredResults = results.filter((r) => {
    const matchesStatus = resultFilter === 'ALL' || resultGroup(r.status) === (resultFilter === 'N/A' ? 'NA' : resultFilter);
    const query = resultSearch.trim().toLowerCase();
    const matchesSearch = !query || [r.clause_id, r.clause_title, r.clause_summary, r.display_status, r.status_explanation, r.recommended_action, ...(Array.isArray(r.missing_information) ? r.missing_information : []), r.applicable_if]
      .some((value) => String(value || '').toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  const pair = formatEvaluationPair(ev, isoNorms, products, tenantDocs);

  const completed = ev.status === 'COMPLETED';
  const failed = ev.status === 'FAILED';
  const running = ev.status === 'QUEUED' || ev.status === 'PROCESSING';
  const ncDrafts: any[] = Array.isArray(ev.ncDrafts) ? ev.ncDrafts : [];
  const overrideLog: any[] = Array.isArray(ev.overrideAudit) ? ev.overrideAudit : [];

  return (
    <DashboardLayout
      pageTitle={`Report · ${ev.isoStandard}`}
      pageTagline={
        failed
          ? `The AI service reported an error; your inputs are kept for retry. · ${pair.summary}`
          : running
            ? `Evaluation is running. This page refreshes automatically. · ${pair.summary}`
            : `Review clause-level results, overrides, and exports when you are ready. · ${pair.summary}`
      }
    >
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/evaluations')} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm text-[var(--muted)]">
              {ev.isoStandard} · {format(new Date(ev.createdAt), 'MMMM d, yyyy HH:mm')}
            </p>
            <p className="mt-1 max-w-xl text-xs leading-snug text-[var(--muted)]" title={pair.summary}>
              <span className="font-semibold text-[var(--text-primary)]">ISO</span> {pair.isoLine}
              <span className="mx-1.5 text-[var(--border)]">|</span>
              <span className="font-semibold text-[var(--text-primary)]">Product</span> {pair.productLine}
            </p>
            <Badge variant="default" className="mt-1 h-6 text-[10px]">
              {running && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
              {ev.status}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {failed && (
            <Button variant="default" className="gap-2" title={pair.summary} onClick={handleRetry} disabled={retryBusy}>
              <RefreshCw className={cn('h-4 w-4', retryBusy && 'animate-spin')} />
              Retry evaluation
            </Button>
          )}
          {completed && (
            <>
              <Button variant="outline" className="gap-2" disabled={!!exportingFormat} onClick={() => handleExport('csv')}>
                {exportingFormat === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {exportingFormat === 'csv' ? 'Preparing CSV…' : 'CSV'}
              </Button>
              <Button variant="outline" className="gap-2" disabled={!!exportingFormat} onClick={() => handleExport('xlsx')}>
                {exportingFormat === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {exportingFormat === 'xlsx' ? 'Preparing Excel…' : 'Excel'}
              </Button>
              <Button variant="outline" className="gap-2" disabled={!!exportingFormat} onClick={() => handleExport('pdf')}>
                {exportingFormat === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {exportingFormat === 'pdf' ? 'Preparing PDF…' : 'PDF'}
              </Button>
            </>
          )}
        </div>
      </div>

      {failed && (
        <Card className="alert-surface-danger mb-6 shadow-none">
          <p className="font-bold">Evaluation failed</p>
          <p className="mt-1 whitespace-pre-wrap">{ev.errorMessage || 'The compliance engine returned an error.'}</p>
          <p className="mt-2 text-xs opacity-90">
            Submitted standard and evidence references are stored with this job; use Retry to run again without re-uploading.
          </p>
        </Card>
      )}

      {running && (
        <div className="mb-6">
          <AgentActivityPanel
            evaluationId={id}
            enabled={running}
            onDone={() => {
              refresh().catch(() => {});
            }}
          />
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            You may leave this page; the agent keeps working and the report list also updates.
          </p>
        </div>
      )}

      {completed && mappingIntegrity.hasIssue && (
        <Card className="alert-surface-warning mb-6 border-amber-300 shadow-none">
          <p className="font-bold">Standard clause mapping needs correction</p>
          <p className="mt-1 text-sm leading-5">{mappingIntegrity.mismatches} of {results.length} result rows begin with a clause reference that differs from the clause assigned by the extraction. This can make explanations and evidence appear under the wrong requirement. The conformity score is hidden and non-conformity creation is disabled until the Standard extraction is corrected and this evaluation is rerun.</p>
          <p className="mt-2 text-xs">Detected {mappingIntegrity.explicitRows} rows with an explicit leading clause reference. Please reprocess or manually verify the selected standard in Standards &amp; Regulations Portal.</p>
        </Card>
      )}

      {completed && ncDrafts.length > 0 && (
        <Card className="alert-surface-warning mb-6 shadow-none">
          <p className="font-bold">NC drafts from &ldquo;Not satisfied&rdquo; clauses</p>
          <p className="mt-1 text-sm">
            {ncDrafts.length} draft record(s) are ready. Nothing is saved until you confirm.
          </p>
          <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-xs opacity-90">
            {ncDrafts.map((d: any, i: number) => (
              <li key={i}>
                {ncDraftListTitle(d)}: {String(d.description || '').slice(0, 120)}
                {String(d.description || '').length > 120 ? '…' : ''}
              </li>
            ))}
          </ul>
          {canConfirmNc && !mappingIntegrity.hasIssue && (
            <Button className="mt-3" size="sm" onClick={() => setNcDialogOpen(true)}>
              Review and confirm NC creation
            </Button>
          )}
          {canConfirmNc && mappingIntegrity.hasIssue && (
            <p className="mt-3 text-xs font-medium text-amber-900">NC creation is paused because some requirements appear to be assigned to the wrong clause.</p>
          )}
        </Card>
      )}

      {completed && overrideLog.length > 0 && (
        <Card className="mb-6 border-[var(--border)] p-4 text-sm shadow-none">
          <p className="font-bold text-[var(--text-primary)]">Override audit log</p>
          <ul className="mt-2 space-y-2 text-xs text-[var(--muted)]">
            {overrideLog.map((e: any, i: number) => (
              <li key={i}>
                <span className="font-mono text-[var(--text-primary)]">{e.clauseReference}</span>
                {' → '}
                {String(e.verdict || '').replace(/_/g, ' ')} by {e.userId?.slice?.(0, 8) ?? e.userId}: {e.reason}
                {e.at ? ` (${format(new Date(e.at), 'PPp')})` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={ncDialogOpen} onOpenChange={setNcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create non-conformities from drafts?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--muted)]">
            This will create {ncDrafts.length} open NC record(s) linked to this evaluation. You can edit them later under
            Non-conformities.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" type="button" onClick={() => setNcDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmNc} disabled={ncBusy}>
              {ncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm and save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!failed && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="mb-6 border-[var(--border)] p-6 shadow-none">
            <div className="grid gap-6 md:grid-cols-12 md:items-center">
              <div className="text-center md:col-span-3">
                <ScoreGauge score={completed && !mappingIntegrity.hasIssue ? ev.conformityScore : undefined} />
                <p className="mt-2 text-xs text-[var(--muted)]">Assessment score</p>
                {!completed && <p className="mt-1 text-[10px] text-[var(--muted)]">Available when complete</p>}
                {completed && mappingIntegrity.hasIssue && <p className="mx-auto mt-2 max-w-xs text-[10px] leading-4 font-semibold text-amber-800">Score withheld until clause mapping is corrected.</p>}
                {completed && !mappingIntegrity.hasIssue && <p className="mx-auto mt-2 max-w-xs text-[10px] leading-4 text-[var(--muted)]">{typeof ev.conformityScore === 'number' ? 'A review aid based on the assessed requirements and selected evidence.' : 'Score withheld until evidence is approved and assessable requirements have a decision.'}</p>}
              </div>
              <div className="md:col-span-9">
                {completed && (
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Assessment at a glance</h2>
                    <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{conformityOverviewText}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[var(--text-primary)]">Decision coverage</span><span className="text-[var(--muted)]">{assessable ? `${decided} of ${assessable} assessable requirements` : 'No assessable requirements'}</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--nav-hover)]" aria-label={`Decision coverage ${decisionCoverage}%`}><div className="h-full rounded-full bg-[var(--brand-primary)]" style={{ width: `${decisionCoverage}%` }} /></div>
                  </div>
                )}
                {ev.summary && completed && (
                  <details className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">Read executive summary</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{ev.summary}</p>
                  </details>
                )}
                {completed && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <StatCard label="Conformity supported" value={conformant} tone="pass" />
                    <StatCard label="Potential issues" value={failedResults} tone="major" />
                    <StatCard label="Evidence needed" value={missingInfo} tone="missing" />
                    <StatCard label="Review required" value={inconclusive} tone="inconclusive" />
                    <StatCard label="Not scored / scope review" value={na} tone="na" />
                  </div>
                )}
              </div>
            </div>
          </Card>
          {completed && evidenceWarnings.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">Preliminary assessment: evidence needs approval</p><p className="mt-1 leading-5">One or more product documents were not approved when this assessment ran. Review and approve them, then start the assessment again. The overall score is withheld meanwhile.</p></div>}
          {completed && !sourceManifest && <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">This older assessment does not record the document versions used. Start it again to verify the evidence and calculate a score.</div>}
          {completed && sourceManifest && <details className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"><summary className="cursor-pointer font-semibold text-[var(--text-primary)]">Documents used for this assessment ({Array.isArray(sourceManifest.evidence) ? sourceManifest.evidence.length : 0} product documents)</summary><div className="mt-3 space-y-2 text-[var(--muted)]"><p><span className="font-semibold text-[var(--text-primary)]">Standard:</span> {sourceManifest.standard?.name || ev.isoStandard} {sourceManifest.standard?.version ? `· version ${sourceManifest.standard.version}` : ''}</p>{Array.isArray(sourceManifest.evidence) && sourceManifest.evidence.map((doc: any) => <p key={doc.id}><span className="font-semibold text-[var(--text-primary)]">{doc.name || 'Product document'}</span> {doc.version ? `· version ${doc.version}` : ''} · {String(doc.approvalStatus || 'approval not recorded').replace(/_/g, ' ').toLowerCase()}</p>)}</div></details>}
        </motion.div>
      )}

      {completed && (failedResults > 0 || missingInfo > 0 || inconclusive > 0) && (
        <Card className="mb-6 border-[var(--border)] p-4 shadow-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Recommended focus</p>
              <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                {failedResults > 0
                  ? `Start with ${failedResults} requirement${failedResults === 1 ? '' : 's'} marked not met, then resolve ${missingInfo} evidence gap${missingInfo === 1 ? '' : 's'}.`
                  : missingInfo > 0
                    ? `Start by collecting evidence for ${missingInfo} requirement${missingInfo === 1 ? '' : 's'}; an evidence gap is not automatically a confirmed non-conformity.`
                    : `Review ${inconclusive} requirement${inconclusive === 1 ? '' : 's'} where the engine could not reach a reliable conclusion.`}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { setResultFilter(failedResults > 0 ? 'FAIL' : missingInfo > 0 ? 'MISSING_INFO' : 'INCONCLUSIVE'); document.getElementById('clause-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              Review highest priority
            </Button>
          </div>
        </Card>
      )}

      {!failed && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card id="clause-results" className="overflow-hidden border-[var(--border)] shadow-none">
            <div className="space-y-3 border-b border-[var(--border)] px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[var(--brand-primary)]" />
                  <div>
                    <h2 className="font-bold text-[var(--text-primary)]">Requirements to review</h2>
                    <p className="text-xs text-[var(--muted)]">Showing {filteredResults.length} of {results.length}. Open any row for evidence, rationale and next steps.</p>
                  </div>
                </div>
                <input
                  type="search"
                  value={resultSearch}
                  onChange={(e) => setResultSearch(e.target.value)}
                  placeholder="Search clause, requirement, or explanation…"
                  aria-label="Search evaluation results"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] sm:max-w-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ['ALL', `All results (${results.length})`],
                  ['PASS', `Supported (${conformant})`],
                  ['FAIL', `Potential issues (${failedResults})`],
                  ['MISSING_INFO', `Evidence needed (${missingInfo})`],
                  ['INCONCLUSIVE', `Review required (${inconclusive})`],
                  ['N/A', `Not scored / scope review (${na})`],
                ] as const).map(([value, label]) => (
                  <Button key={value} type="button" size="sm" variant={resultFilter === value ? 'default' : 'outline'} onClick={() => setResultFilter(value)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {['Clause', 'Outcome', 'Recommended next step', 'Evidence', ''].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-[var(--muted)]">
                      {running ? 'Results will appear here when the job completes.' : results.length > 0 && (resultSearch || resultFilter !== 'ALL') ? 'No results match these filters. Clear the search or choose All results.' : 'No clause results available'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResults.map((row: any, idx: number) => (
                    <ClauseRow
                      key={row.resultId || row.result_id || `${row.clause_id}-${idx}`}
                      row={row}
                      idx={idx}
                      evaluationId={id}
                      canOverride={canOverride}
                      completed={completed}
                      onUpdated={() => refresh().catch(() => toast.error('Refresh failed'))}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </motion.div>
      )}
    </DashboardLayout>
  );
}
