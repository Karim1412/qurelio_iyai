import { formatDistanceToNow } from 'date-fns';

/** Shown in lists as “extracted” category (tag, classification, or best-effort from structured data). */
export function getExtractedCategory(doc: {
  workspaceCategory?: string | null;
  tags?: string[] | null;
  extractedStructured?: { classification?: string; title?: string } | null;
} | null): string {
  if (!doc) return '-';
  const ws = doc.workspaceCategory?.trim();
  if (ws) return ws;
  const tag = doc.tags?.[0];
  if (tag?.trim()) return tag.trim();
  const st = doc.extractedStructured;
  if (st && typeof st === 'object') {
    const c = (st as { classification?: string }).classification;
    if (c && String(c).trim()) return String(c).trim();
  }
  return '-';
}

export function getBestProductCategoryFromDocs(
  docs: { tags?: string[]; extractedStructured?: { classification?: string; title?: string } | null }[],
): string {
  for (const d of docs) {
    const c = getExtractedCategory(d);
    if (c !== '-') return c;
  }
  return '-';
}

export function formatUploadedRelative(doc: { createdAt?: string | Date }): string {
  if (!doc.createdAt) return '-';
  return formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true });
}

export function getDocReference(doc: { isoStandard?: string | null } | null): string {
  const ref = doc?.isoStandard?.trim();
  return ref || '-';
}

export function formatDocEffectiveDate(doc: {
  effectiveDate?: string | Date | null;
  createdAt?: string | Date;
} | null): string {
  if (!doc) return '-';
  const raw = doc.effectiveDate ?? doc.createdAt;
  if (!raw) return '-';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

/** Workflow status for product / shared files (DOC-004). */
export function getDocumentApprovalStatus(doc: { approvalStatus?: string | null } | null): string {
  const s = doc?.approvalStatus?.trim();
  return s || 'DRAFT';
}

export function formatApprovalStatusLabel(status?: string | null): string {
  const s = (status || 'DRAFT').replace(/_/g, ' ').toLowerCase();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** ISO norm tag from upload form → readable library category. */
export function getStandardLibraryCategory(doc: {
  tags?: string[] | null;
  extractedStructured?: { classification?: string; title?: string } | null;
} | null): string {
  if (!doc) return '-';
  const tag = doc.tags?.[0]?.trim();
  if (tag === 'EN') return 'EN standard';
  if (tag === 'ISO_NORM') return 'ISO standard';
  return getExtractedCategory(doc);
}

export function formatAddedByShort(
  doc: { uploadedBy?: string },
  currentUserId: string | undefined,
  nameMap: Map<string, string>,
): string {
  if (!doc.uploadedBy) return 'Added by -';
  if (doc.uploadedBy === currentUserId) return 'Added by you';
  const n = nameMap.get(doc.uploadedBy);
  return `Added by ${n || doc.uploadedBy.slice(0, 8) + '…'}`;
}

export function formatAddedByLine(
  doc: { uploadedBy?: string; createdAt?: string | Date },
  currentUserId: string | undefined,
  nameMap: Map<string, string>,
): string {
  const when = formatUploadedRelative(doc);
  if (!doc.uploadedBy) return `${when} · Added by -`;
  if (doc.uploadedBy === currentUserId) return `${when} · Added by you`;
  const n = nameMap.get(doc.uploadedBy);
  return `${when} · Added by ${n || doc.uploadedBy.slice(0, 8) + '…'}`;
}

export function displayUserName(
  userId: string | undefined,
  currentUserId: string | undefined,
  nameMap: Map<string, string>,
  opts?: { preferFullName?: boolean },
): string {
  if (!userId) return '-';
  if (userId === currentUserId) {
    if (opts?.preferFullName) return '-'; // caller resolves from auth profile
    return 'You';
  }
  return nameMap.get(userId) || userId.slice(0, 8) + '…';
}

/** Folder / product file list: processing if any doc still extracting. */
export function summarizeDocsExtraction(
  docs: { status?: string }[],
): 'empty' | 'processing' | 'failed' | 'active' {
  if (!docs.length) return 'empty';
  const statuses = docs.map((d) => String(d.status ?? '').toUpperCase());
  if (statuses.some((s) => s === 'FAILED')) return 'failed';
  if (statuses.some((s) => s === 'PROCESSING' || s === 'UPLOADING' || s === 'UPLOADED')) return 'processing';
  return 'active';
}

export function isDocExtractionInFlight(status?: string): boolean {
  const s = String(status ?? '').toUpperCase();
  return s === 'PROCESSING' || s === 'UPLOADING' || s === 'UPLOADED';
}

export function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(n: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, n) / pageSize));
}

/**
 * Canonical norm code for evaluations / RAG (same order as document-service `resolveIsoNormReference`).
 */
export function isoNormEvalReference(doc: {
  isoStandard?: string | null;
  name?: string | null;
  extractedStructured?: { standardMetadata?: { reference?: string | null } } | null;
} | null | undefined): string {
  if (!doc) return '';
  const c = doc.isoStandard?.trim();
  if (c) return c;
  const r = doc.extractedStructured?.standardMetadata?.reference;
  const rs = typeof r === 'string' ? r.trim() : '';
  if (rs) return rs;
  return (doc.name || '').trim();
}

/**
 * Standard reference for library dropdowns (evaluations, audits, NC).
 * If the file name differs from the norm ref, append it so two PDFs for the same norm are distinguishable.
 */
export function formatIsoNormSelectLabel(n: { isoStandard?: string | null; name?: string | null }): string {
  const ref = n.isoStandard?.trim() || n.name?.trim() || '-';
  const file = n.name?.trim() || '';
  if (file && file !== ref) return `${ref} · ${file}`;
  return ref;
}
