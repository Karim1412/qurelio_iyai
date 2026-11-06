'use client';
import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { attachDocDragGlobal as attachDocDrag } from '@/components/dashboard/TrashFabGlobal';
import { ProductExtractionOverview } from '@/components/products/ProductExtractionOverview';
import toast from 'react-hot-toast';
import {
  Upload,
  Trash2,
  Download,
  FileText,
  Image as ImageIcon,
  ArrowLeft,
  CircleCheck,
  CircleAlert,
  Package,
  BookOpen,
  Check,
  Loader2,
  Sparkles,
  Eye,
  Edit,
  Archive,
  ArchiveRestore,
  Info,
  Cog,
  FolderPlus,
  Folder,
  Factory,
  Shield,
  X,
} from '@/components/icons';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useExtractionProgress } from '@/components/providers/ExtractionProgressProvider';
import { QurelioSpinner } from '@/components/ui/qurelio-spinner';
import { getPageMeta } from '@/lib/page-meta';
import { FILE_LIBRARY_PATH } from '@/lib/file-library';
import { useCustomFileFolders } from '@/hooks/useCustomFileFolders';
import { useCompanyUserNameMap } from '@/hooks/useCompanyUserNameMap';
import {
  formatAddedByShort,
  formatDocEffectiveDate,
  formatUploadedRelative,
  getBestProductCategoryFromDocs,
  getDocReference,
  getExtractedCategory,
  getStandardLibraryCategory,
  slicePage,
} from '@/lib/file-library-helpers';
import { FileLibraryUploaderCell } from '@/components/file-library/FileLibraryUploaderCell';
import { IsoStandardTocView } from '@/components/file-library/IsoStandardTocView';
import {
  FloatingUploadBrandIcon,
  LibraryUploadDropSurface,
} from '@/components/file-library/LibraryUploadDropzone';
import { UploadDocumentDialog } from '@/components/dashboard/UploadDocumentDialog';
import { ProductWizard } from '@/components/products/ProductWizard';
import { documentApi, productApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfirmAction, type ConfirmActionOptions } from '@/hooks/use-confirm-action';
import { SectionPagination, DEFAULT_SECTION_PAGE_SIZE } from '@/components/ui/section-pagination';
import { openGoogleEditorFromWorkspaceFile } from '@/lib/workspace-google-edit';

/** Row actions: same rectangular frame (view / download / upload) */
const DOC_ROW_NEUTRAL_BTN =
  'h-8 w-8 rounded-md border border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--page-bg)]';

/** Row archive: yellow rectangle (standards, product files, product folder remove) */
const DOC_ROW_ARCHIVE_BTN =
  'h-8 w-8 rounded-md border border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] hover:bg-[var(--brand-accent)]/18';

/** Workspace row: permanent delete */
const DOC_ROW_WORKSPACE_DELETE_BTN =
  'h-8 w-8 rounded-md border border-red-500/55 bg-red-500/10 text-red-600 hover:bg-red-500/18 dark:text-red-400';

/** Top nav: “Archived standards” / “Archived product docs” (gold contour + gold label, Qurelio accent) */
const ARCHIVE_LIB_NAV_BTN =
  'gap-2 rounded-full border-2 !border-[var(--brand-accent)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold !text-[var(--brand-accent)] transition-hover hover:bg-[var(--brand-accent)]/10';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((f) => resolve([f]));
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve);
    });
    const nested = await Promise.all(entries.map(collectFilesFromEntry));
    return nested.flat();
  }
  return [];
}

/** Same rules as the main uploader, but for EVIDENCE (custom folder), no ISO extraction. */
const FOLDER_EVIDENCE_NAME_RE = /\.(pdf|doc|docx|xlsx|jpe?g|png|tiff?)$/i;
const FOLDER_EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;

function mergeFolderEvidenceQueue(prev: File[], files: File[]): { next: File[]; runToasts: () => void } {
  const valid = files.filter((f) => FOLDER_EVIDENCE_NAME_RE.test(f.name) && f.size <= FOLDER_EVIDENCE_MAX_BYTES);
  const skipped = files.length - valid.length;
  const names = new Set(prev.map((f) => f.name));
  const toAdd = valid.filter((f) => !names.has(f.name));
  const addedCount = toAdd.length;
  return {
    next: [...prev, ...toAdd],
    runToasts: () => {
      if (addedCount === 0 && skipped > 0) {
        toast.error(
          'This file type is not supported or the file is over 50 MB. Use PDF, Word, Excel, or images (JPEG, PNG, TIFF).',
        );
        return;
      }
      if (addedCount > 0 && skipped > 0) {
        toast(
          `Added ${addedCount} file(s). ${skipped} were skipped. Only PDF, Word, Excel, and images up to 50 MB are allowed.`,
        );
      } else if (addedCount > 0) {
        toast.success(`${addedCount} file(s) added to the upload queue`);
      }
    },
  };
}


function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  const message = (
    err as {
      response?: { data?: { message?: string | string[] } };
    }
  )?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function filenameFromContentDisposition(value?: string): string | null {
  if (!value) return null;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).trim() || null;
    } catch {
      return encoded.trim() || null;
    }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1]?.trim() || null;
}

function extensionForMime(mime?: string): string {
  const key = (mime ?? '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/tiff': '.tiff',
  };
  return map[key] ?? '';
}

/** Preserves `view` / `archive` when building links in the file library. */
function fileLibraryUrl(
  sp: { view: string | null; archive: string | null; cf: string | null | undefined },
  patch?: { view?: string; archive?: string; cf?: string | null },
) {
  const p = new URLSearchParams();
  const v = patch?.view !== undefined ? patch.view : sp.view;
  const a = patch?.archive !== undefined ? patch.archive : sp.archive;
  const c = patch?.cf !== undefined ? patch.cf : sp.cf;
  if (v) p.set('view', v);
  if (a) p.set('archive', a);
  if (c) p.set('cf', c);
  const s = p.toString();
  return s ? `${FILE_LIBRARY_PATH}?${s}` : FILE_LIBRARY_PATH;
}

function statusLabel(status?: string) {
  switch (status) {
    case 'UPLOADED':
      return 'Uploaded';
    case 'PROCESSING':
      return 'Processing';
    case 'READY':
      return 'Processed';
    case 'FAILED':
      return 'Failed';
    case 'UPLOADING':
      return 'Uploading';
    default:
      return status ?? '-';
  }
}

function StatusPill({ status }: { status?: string }) {
  const base =
    'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide';
  const cls =
    status === 'READY'
      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
      : status === 'PROCESSING' || status === 'UPLOADING'
        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
        : status === 'FAILED'
          ? 'bg-red-500/15 text-red-800'
          : 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
  return <span className={cn(base, cls)}>{statusLabel(status)}</span>;
}

type ExtractedSection = {
  clauseNumber?: string | null;
  heading: string;
  title?: string | null;
  content: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  requirements?: Array<Partial<FlatRequirement>>;
  bullets?: string[];
  summary?: string | null;
  importantNotes?: string[] | null;
  mandatory?: boolean;
  category?: string | null;
};

type ClauseEditRow = { clauseNumber: string; title: string; content: string; sourceIndex?: number };

function sectionToClauseRow(sec: ExtractedSection, index: number): ClauseEditRow {
  const cn = sec.clauseNumber?.trim();
  if (cn) {
    return {
      clauseNumber: cn,
      title: (sec.title || sec.heading || '').trim() || '-',
      content: sec.content ?? '',
      sourceIndex: index,
    };
  }
  const h = (sec.heading || '').trim();
  const m = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(h);
  if (m) {
    return { clauseNumber: m[1], title: m[2], content: sec.content ?? '', sourceIndex: index };
  }
  const annex = /^(Annex\s+[\w.]+)\s*[—\-–:]\s*(.+)$/i.exec(h);
  if (annex) {
    return { clauseNumber: annex[1].trim(), title: annex[2].trim(), content: sec.content ?? '', sourceIndex: index };
  }
  return { clauseNumber: '', title: h || 'Unnumbered section', content: sec.content ?? '', sourceIndex: index };
}

function clauseRowsToSections(rows: ClauseEditRow[], previous?: ExtractedSection[]): ExtractedSection[] {
  return rows.map((r, i) => {
    const prev = r.sourceIndex == null ? undefined : previous?.[r.sourceIndex];
    const num = r.clauseNumber.trim();
    const title = r.title.trim();
    const heading = [num, title].filter(Boolean).join(' ').trim();
    return {
      ...prev,
      clauseNumber: num || null,
      heading: prev?.heading || heading || title || num,
      title: title || null,
      content: r.content,
    };
  });
}

/** Numeric / annex ordering for standards TOC (ISO, EN, IEC, etc.). */
function dottedClauseParts(clauseNumber: string | null | undefined): number[] {
  const raw = (clauseNumber ?? '').trim();
  if (!raw) return [99_999];
  if (/^annex\b/i.test(raw)) {
    const tail = raw.replace(/^annex\s*/i, '').trim();
    const nums = tail.match(/\d+(?:\.\d+)*/);
    if (nums) {
      return [50_000, ...nums[0].split('.').map((n) => parseInt(n, 10) || 0)];
    }
    return [51_000, ...tail.toLowerCase().split('').slice(0, 12).map((c) => c.charCodeAt(0))];
  }
  const m = raw.match(/^(\d+(?:\.\d+)*)/);
  if (!m) return [40_000];
  return m[1].split('.').map((x) => parseInt(x, 10) || 0);
}

function compareStandardClauseOrder(a: ExtractedSection, b: ExtractedSection): number {
  const pa = dottedClauseParts(a.clauseNumber);
  const pb = dottedClauseParts(b.clauseNumber);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? -1;
    const db = pb[i] ?? -1;
    if (da !== db) return da - db;
  }
  return (a.heading || '').localeCompare(b.heading || '', undefined, { sensitivity: 'base', numeric: true });
}

function sortStandardSections(sections: ExtractedSection[]): ExtractedSection[] {
  return [...sections].sort(compareStandardClauseOrder);
}

type TraceRow = {
  category?: string | null;
  parameter?: string | null;
  value?: string | null;
  unit?: string | null;
  notes?: string | null;
};
type ProductProfile = {
  basicInformation?: {
    reference?: string | null;
    modelNumber?: string | null;
    serialNumber?: string | null;
    revision?: string | null;
    category?: string | null;
    subCategory?: string | null;
    tradeMark?: string | null;
    manufacturer?: string | null;
    countryOfOrigin?: string | null;
  } | null;
  certifications?: {
    marks?: string[] | null;
    standards?: string[] | null;
    approvalNumbers?: string[] | null;
  } | null;
  usage?: {
    environment?: string | null;
    users?: string | null;
    tempHumidity?: string | null;
    ipRating?: string | null;
    voltageFrequency?: string | null;
  } | null;
  generalDescription?: string | null;
  applications?: string | null;
  safetyWarnings?: string[] | null;
  qualitySpecificationNarrative?: string | null;
  regulatoryNotes?: string | null;
  technicalCharacteristics?: string | null;
  technicalBullets?: string[] | null;
  dimensions?: string | null;
  weight?: string | null;
  traceabilityRows?: TraceRow[] | null;
};
type FlatRequirement = {
  id: string;
  clauseRef: string;
  clauseTitle: string;
  isAnnex: boolean;
  text: string;
  type: 'mandatory' | 'recommended' | 'informative' | 'conditional';
  modalVerb?: string | null;
  appliesIf?: string | null;
  crossReferences: string[];
  grounded: boolean | null;
  groundedInSection?: boolean | null;
  clauseMappingConfidence?: number | null;
};
type RequirementsSummary = {
  totalRequirements: number;
  mandatoryCount: number;
  recommendedCount: number;
  informativeCount: number;
  conditionalCount: number;
  clausesWithRequirements: number;
  clausesFlaggedMandatoryButEmpty: string[];
  possiblyIncompleteClauses: string[];
  ungroundedRequirementCount: number;
  requirements: FlatRequirement[];
};
type ExtractedStructured = {
  title?: string | null;
  documentTypeGuess?: string | null;
  classification?: string | null;
  sections?: ExtractedSection[];
  keyPoints?: string[];
  fileSummary?: string | null;
  visualDescription?: string | null;
  productProfile?: ProductProfile | null;
  requirementsSummary?: RequirementsSummary | null;
  standardExtractionQuality?: {
    processingComplete?: boolean;
    pendingSemanticSections?: string[];
    semanticSectionsDetected?: number;
    semanticSectionsAnalyzed?: number;
    semanticBatchFailures?: Array<{ clause?: string; error?: string }>;
    warnings?: string[];
    ocrPages?: number[];
    mixedImagePages?: number[];
    unresolvedPages?: number[];
  } | null;
  standardExtractionProgress?: {
    phase?: string;
    reviewedJobs?: number;
    totalJobs?: number;
    providerRequests?: number;
    failedBatches?: number;
  } | null;
  standardMetadata?: {
    reference?: string | null;
    title?: string | null;
    categories?: string[] | null;
    effectiveDate?: string | null;
  } | null;
};

function libraryLabel(ls?: string | null) {
  switch (ls) {
    case 'ACTIVE':
      return 'Active';
    case 'PROCESSING':
      return 'Pending activation';
    case 'ARCHIVED':
      return 'Archived';
    default:
      return '-';
  }
}

function ExtractedContentModal({
  open,
  onClose,
  currentId,
  siblings,
  onSelectDocument,
  onDocumentChange,
  onDownloadOriginal,
  onBackToProduct,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  siblings: { id: string; name: string }[];
  onSelectDocument: (id: string) => void;
  onDocumentChange?: () => void;
  /** Fetch original file from storage (same as card download). */
  onDownloadOriginal?: (id: string, fileName?: string) => void;
  /** Jump back to product overview modal from a product-linked file. */
  onBackToProduct?: (productId: string) => void;
}) {
  const { user } = useAuthStore();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editingJson, setEditingJson] = useState<string | null>(null);
  const [clauseRows, setClauseRows] = useState<ClauseEditRow[] | null>(null);
  /** Structured edit for product OCR profile: forms instead of raw JSON. */
  const [productFieldEdit, setProductFieldEdit] = useState<{
    fileSummary: string;
    visualDescription: string;
    generalDescription: string;
    applications: string;
    qualitySpecificationNarrative: string;
    regulatoryNotes: string;
    technicalCharacteristics: string;
    reference: string;
    revision: string;
    category: string;
    traceRows: TraceRow[];
  } | null>(null);
  const [expandedIsoClauseIdx, setExpandedIsoClauseIdx] = useState<number | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!currentId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const res = await documentApi.get(currentId);
      setDetail(res.data);
    } catch {
      if (!silent) toast.error('Failed to load document');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentId]);

  useEffect(() => {
    if (open && currentId) load();
  }, [open, currentId, load]);

  useEffect(() => {
    if (!open) {
      setEditingJson(null);
      setClauseRows(null);
      setProductFieldEdit(null);
    }
  }, [open, currentId]);

  /** RAG structuring often takes tens of seconds: poll slowly to avoid gateway/log spam and UI flicker. */
  useEffect(() => {
    if (!open || !detail) return;
    const s = detail.status as string | undefined;
    if (s !== 'UPLOADED' && s !== 'PROCESSING' && s !== 'UPLOADING') return;
    const pollMs = s === 'PROCESSING' ? 8000 : 4000;
    const t = setInterval(() => {
      void load({ silent: true });
    }, pollMs);
    return () => clearInterval(t);
  }, [open, detail?.status, load]);

  const structured = useMemo(() => {
    const raw = (detail?.extractedStructured ?? null) as ExtractedStructured | null;
    if (!raw) return null;

    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    const first = sections[0];
    const firstHeading = (first?.heading ?? '').trim().toLowerCase();
    const firstContent = typeof first?.content === 'string' ? first.content.trim() : '';

    // Backward-compat: some extractions were stored as a JSON string inside a single
    // "Extraction" section. Parse it so users see the rich cards, not raw JSON text.
    if (
      sections.length === 1 &&
      firstHeading === 'extraction' &&
      firstContent.startsWith('{')
    ) {
      try {
        const parsed = JSON.parse(firstContent) as ExtractedStructured;
        return {
          ...raw,
          ...parsed,
          sections: Array.isArray(parsed.sections) ? parsed.sections : [],
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        };
      } catch {
        return raw;
      }
    }
    return raw;
  }, [detail?.extractedStructured]);

  const sortedIsoSections = useMemo(() => {
    if (detail?.type !== 'ISO_NORM') return [];
    const secs = structured?.sections;
    if (!Array.isArray(secs) || secs.length === 0) return [];
    return sortStandardSections(secs as ExtractedSection[]);
  }, [detail?.type, structured?.sections]);

  useEffect(() => {
    setExpandedIsoClauseIdx(null);
  }, [currentId]);

  const canEditStandardClauses =
    detail?.status === 'READY' &&
    user &&
    detail?.type === 'ISO_NORM' &&
    user.role === 'QUALITY_MANAGER';

  const canEditExtractionJson =
    detail?.status === 'READY' &&
    user &&
    detail &&
    ['PRODUCT_DOC', 'PROCEDURE', 'EVIDENCE'].includes(detail.type) &&
    (detail.uploadedBy === user.id || ['DIRECTOR', 'QUALITY_MANAGER'].includes(user.role));

  const canEditProductSummary =
    canEditExtractionJson &&
    detail &&
    (detail.type === 'PRODUCT_DOC' || detail.type === 'EVIDENCE' || !!detail.productId);

  const canEditExtraction = canEditStandardClauses || canEditExtractionJson;

  /** STD-004: activate only when extracted (Ready) and still Pending activation (Processing). */
  const canActivateStandard =
    detail?.type === 'ISO_NORM' &&
    user?.role === 'QUALITY_MANAGER' &&
    detail?.status === 'READY' &&
    detail?.libraryStatus === 'PROCESSING' &&
    structured?.standardExtractionQuality?.processingComplete !== false;

  const canRetryExtraction = detail?.type !== 'WORKSPACE_FILE' &&
    (detail?.status === 'FAILED' || (detail?.type === 'ISO_NORM' && detail?.status === 'READY' &&
      structured?.standardExtractionQuality?.processingComplete === false));

  const handleRetryExtraction = async () => {
    try {
      await documentApi.retryExtraction(currentId);
      toast.success('Re-extraction started');
      await load();
      onDocumentChange?.();
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Could not start re-extraction');
    }
  };


  const saveExtraction = async () => {
    try {
      if (productFieldEdit !== null && detail) {
        const prev = (detail.extractedStructured ?? {}) as ExtractedStructured;
        const pp = { ...(prev.productProfile ?? {}) };
        pp.generalDescription = productFieldEdit.generalDescription || undefined;
        pp.applications = productFieldEdit.applications || undefined;
        pp.qualitySpecificationNarrative = productFieldEdit.qualitySpecificationNarrative || undefined;
        pp.regulatoryNotes = productFieldEdit.regulatoryNotes || undefined;
        pp.technicalCharacteristics = productFieldEdit.technicalCharacteristics || undefined;
        const rows = productFieldEdit.traceRows.filter(
          (r) =>
            String(r.parameter ?? '').trim() ||
            String(r.value ?? '').trim() ||
            String(r.category ?? '').trim() ||
            String(r.unit ?? '').trim() ||
            String(r.notes ?? '').trim(),
        );
        pp.traceabilityRows = rows.length > 0 ? rows : undefined;
        pp.basicInformation = {
          ...(pp.basicInformation ?? {}),
          reference: productFieldEdit.reference || undefined,
          revision: productFieldEdit.revision || undefined,
          category: productFieldEdit.category || undefined,
        };
        const next: ExtractedStructured = {
          ...prev,
          fileSummary: productFieldEdit.fileSummary || undefined,
          visualDescription: productFieldEdit.visualDescription || undefined,
          productProfile: pp,
        };
        await documentApi.patchExtraction(currentId, next as unknown as Record<string, unknown>);
        toast.success('Product extraction updated');
        setProductFieldEdit(null);
        await load();
        onDocumentChange?.();
        return;
      }
      if (clauseRows !== null && detail?.type === 'ISO_NORM') {
        const prev = ((detail?.extractedStructured ?? {}) as ExtractedStructured).sections ?? [];
        const sections = clauseRowsToSections(clauseRows, prev);
        const next: ExtractedStructured = {
          ...(detail.extractedStructured as ExtractedStructured),
          sections,
        };
        await documentApi.patchExtraction(currentId, next as unknown as Record<string, unknown>);
        toast.success('Clause extraction updated');
        setClauseRows(null);
        await load();
        onDocumentChange?.();
        return;
      }
      if (editingJson === null) return;
      const parsed = JSON.parse(editingJson) as Record<string, unknown>;
      await documentApi.patchExtraction(currentId, parsed);
      toast.success('Extraction updated');
      setEditingJson(null);
      await load();
      onDocumentChange?.();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (e instanceof SyntaxError ? 'Invalid JSON' : 'Save failed');
      toast.error(typeof msg === 'string' ? msg : 'Save failed');
    }
  };

  const handleActivateStandard = async () => {
    try {
      await documentApi.activateStandard(currentId);
      toast.success('Standard activated. Clause content indexed for evaluations');
      await load();
      onDocumentChange?.();
    } catch {
      toast.error('Activation failed. Check clause content and try again');
    }
  };

  /** Temporary developer/export action: download exactly what the Standards pipeline stored.
   *  This is intentionally client-side so it does not introduce another backend API contract.
   */
  const handleDownloadExtraction = useCallback(() => {
    if (!structured || detail?.type !== 'ISO_NORM') {
      toast.error('No standard extraction is available yet');
      return;
    }

    try {
      const payload = {
        document: {
          id: currentId,
          name: detail?.name ?? null,
          type: detail?.type ?? null,
          status: detail?.status ?? null,
          libraryStatus: detail?.libraryStatus ?? null,
        },
        extractedAt: new Date().toISOString(),
        extraction: structured,
      };

      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const rawName = String(detail?.name ?? 'standard').replace(/\.[^.]+$/, '');
      const safeName = rawName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'standard';
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${safeName}-extraction.json`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('Standard extraction downloaded');
    } catch (e) {
      console.error('Failed to download standard extraction', e);
      toast.error('Failed to download standard extraction');
    }
  }, [currentId, detail?.libraryStatus, detail?.name, detail?.status, detail?.type, structured]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold">Document details</DialogTitle>
              {detail?.name && (
                <p className="mt-1 truncate text-sm text-[var(--muted)]" title={detail.name}>
                  {detail.name}
                </p>
              )}
            </div>
            {detail?.type === 'ISO_NORM' &&
              detail.status === 'READY' &&
              onDownloadOriginal &&
              user?.role !== 'QUALITY_MANAGER' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => onDownloadOriginal(currentId, detail.name)}
              >
                <Download className="h-4 w-4" />
                Original PDF
              </Button>
            )}
            {detail?.type === 'ISO_NORM' &&
              detail.status === 'READY' &&
              structured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={handleDownloadExtraction}
                title="Temporary developer export of the stored Standards extraction"
              >
                <Download className="h-4 w-4" />
                Download extraction
              </Button>
            )}
            {detail?.type === 'WORKSPACE_FILE' &&
              detail.status === 'READY' &&
              onDownloadOriginal && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => onDownloadOriginal(currentId, detail.name)}
              >
                <Download className="h-4 w-4" />
                Download file
              </Button>
            )}
            {detail?.productId && onBackToProduct && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  onBackToProduct(detail.productId as string);
                  onClose();
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to View Product
              </Button>
            )}
          </div>
          {siblings.length > 1 && (
            <div className="mt-4">
              <Label className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Document</Label>
              <Select value={currentId} onValueChange={onSelectDocument}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Select document" />
                </SelectTrigger>
                <SelectContent>
                  {siblings.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && !detail && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
            </div>
          )}

          {detail && editingJson !== null && canEditExtractionJson && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                Edit the structured JSON returned by OCR (product profile, standard metadata, sections, etc.). Invalid JSON
                cannot be saved.
              </p>
              <Textarea
                value={editingJson}
                onChange={(e) => setEditingJson(e.target.value)}
                className="min-h-[280px] font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
            </div>
          )}

          {detail && clauseRows !== null && canEditStandardClauses && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                Review and correct clause references, titles, and full clause text. Add rows if the automatic split missed a
                clause. Changes require a fresh extraction from the original document before activation; the displayed requirements may otherwise be out of date.
              </p>
              <div className="max-h-[min(60vh,520px)] overflow-auto rounded-lg border border-[var(--border)]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px] whitespace-nowrap">Clause no.</TableHead>
                      <TableHead className="min-w-[140px]">Clause title</TableHead>
                      <TableHead>Clause content (full text)</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clauseRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="align-top">
                          <Input
                            value={row.clauseNumber}
                            onChange={(e) => {
                              const next = [...clauseRows];
                              next[idx] = { ...next[idx], clauseNumber: e.target.value };
                              setClauseRows(next);
                            }}
                            className="font-mono text-xs"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Input
                            value={row.title}
                            onChange={(e) => {
                              const next = [...clauseRows];
                              next[idx] = { ...next[idx], title: e.target.value };
                              setClauseRows(next);
                            }}
                            className="text-xs"
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Textarea
                            value={row.content}
                            onChange={(e) => {
                              const next = [...clauseRows];
                              next[idx] = { ...next[idx], content: e.target.value };
                              setClauseRows(next);
                            }}
                            className="min-h-[120px] text-xs leading-relaxed"
                            spellCheck={false}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            title="Remove row"
                            onClick={() => setClauseRows(clauseRows.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setClauseRows([...clauseRows, { clauseNumber: '', title: '', content: '' }])}
              >
                Add clause row
              </Button>
            </div>
          )}

          {detail && editingJson === null && clauseRows === null && (
            <div className="space-y-4">
              {(detail.type === 'PRODUCT_DOC' ||
                detail.type === 'EVIDENCE' ||
                detail.type === 'WORKSPACE_FILE' ||
                detail.productId) && (
                <div className="rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/[0.04] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-primary)]">
                    This file
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{detail.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {detail.mimeType}
                    {detail.sizeBytes != null ? ` · ${formatBytes(Number(detail.sizeBytes))}` : ''}
                    {detail.version != null ? ` · v${detail.version}` : ''}
                  </p>
                  {detail.type === 'WORKSPACE_FILE' && (
                    <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--muted)]">
                      Workspace file: no AI extraction. Download the original, edit in Google Docs/Sheets (or locally), and
                      use <span className="font-semibold text-[var(--text-primary)]">new version</span> or{' '}
                      <span className="font-semibold text-[var(--text-primary)]">archive</span> from the library when you
                      update or remove it.
                    </p>
                  )}
                  {productFieldEdit ? (
                    <div className="mt-4 max-h-[min(70vh,560px)] space-y-3 overflow-y-auto pr-1">
                      <div>
                        <Label className="text-xs">Document summary (paragraph)</Label>
                        <Textarea
                          value={productFieldEdit.fileSummary}
                          onChange={(e) =>
                            setProductFieldEdit({ ...productFieldEdit, fileSummary: e.target.value })
                          }
                          className="mt-1 min-h-[64px] text-sm"
                          placeholder="What this file establishes for the product…"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Image / label description</Label>
                        <Textarea
                          value={productFieldEdit.visualDescription}
                          onChange={(e) =>
                            setProductFieldEdit({ ...productFieldEdit, visualDescription: e.target.value })
                          }
                          className="mt-1 min-h-[64px] text-sm"
                          placeholder="For photos: what is visible (packaging, marks, warnings)…"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <Label className="text-xs">Reference</Label>
                          <Input
                            value={productFieldEdit.reference}
                            onChange={(e) =>
                              setProductFieldEdit({ ...productFieldEdit, reference: e.target.value })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Revision</Label>
                          <Input
                            value={productFieldEdit.revision}
                            onChange={(e) =>
                              setProductFieldEdit({ ...productFieldEdit, revision: e.target.value })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Input
                            value={productFieldEdit.category}
                            onChange={(e) =>
                              setProductFieldEdit({ ...productFieldEdit, category: e.target.value })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">General description</Label>
                        <Textarea
                          value={productFieldEdit.generalDescription}
                          onChange={(e) =>
                            setProductFieldEdit({ ...productFieldEdit, generalDescription: e.target.value })
                          }
                          className="mt-1 min-h-[56px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Applications</Label>
                        <Textarea
                          value={productFieldEdit.applications}
                          onChange={(e) =>
                            setProductFieldEdit({ ...productFieldEdit, applications: e.target.value })
                          }
                          className="mt-1 min-h-[48px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Quality specification (detail for QA / inspection)</Label>
                        <Textarea
                          value={productFieldEdit.qualitySpecificationNarrative}
                          onChange={(e) =>
                            setProductFieldEdit({
                              ...productFieldEdit,
                              qualitySpecificationNarrative: e.target.value,
                            })
                          }
                          className="mt-1 min-h-[88px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Regulatory / safety notes</Label>
                        <Textarea
                          value={productFieldEdit.regulatoryNotes}
                          onChange={(e) =>
                            setProductFieldEdit({ ...productFieldEdit, regulatoryNotes: e.target.value })
                          }
                          className="mt-1 min-h-[56px] text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Additional technical notes (optional)</Label>
                        <Textarea
                          value={productFieldEdit.technicalCharacteristics}
                          onChange={(e) =>
                            setProductFieldEdit({
                              ...productFieldEdit,
                              technicalCharacteristics: e.target.value,
                            })
                          }
                          className="mt-1 min-h-[56px] text-sm"
                        />
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <Label className="text-xs">Traceability table (specs, materials, BOM)</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              setProductFieldEdit({
                                ...productFieldEdit,
                                traceRows: [
                                  ...productFieldEdit.traceRows,
                                  { category: '', parameter: '', value: '', unit: '', notes: '' },
                                ],
                              })
                            }
                          >
                            Add row
                          </Button>
                        </div>
                        <div className="max-h-[200px] overflow-auto rounded-lg border border-[var(--border)]">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[90px] text-[10px]">Category</TableHead>
                                <TableHead className="text-[10px]">Parameter</TableHead>
                                <TableHead className="text-[10px]">Value</TableHead>
                                <TableHead className="w-[56px] text-[10px]">Unit</TableHead>
                                <TableHead className="text-[10px]">Notes</TableHead>
                                <TableHead className="w-8" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {productFieldEdit.traceRows.map((row, ri) => (
                                <TableRow key={ri}>
                                  <TableCell className="p-1 align-top">
                                    <Input
                                      value={row.category ?? ''}
                                      onChange={(e) => {
                                        const next = [...productFieldEdit.traceRows];
                                        next[ri] = { ...next[ri], category: e.target.value };
                                        setProductFieldEdit({ ...productFieldEdit, traceRows: next });
                                      }}
                                      className="h-8 text-[11px]"
                                      placeholder="Spec/BOM…"
                                    />
                                  </TableCell>
                                  <TableCell className="p-1 align-top">
                                    <Input
                                      value={row.parameter ?? ''}
                                      onChange={(e) => {
                                        const next = [...productFieldEdit.traceRows];
                                        next[ri] = { ...next[ri], parameter: e.target.value };
                                        setProductFieldEdit({ ...productFieldEdit, traceRows: next });
                                      }}
                                      className="h-8 text-[11px]"
                                    />
                                  </TableCell>
                                  <TableCell className="p-1 align-top">
                                    <Input
                                      value={row.value ?? ''}
                                      onChange={(e) => {
                                        const next = [...productFieldEdit.traceRows];
                                        next[ri] = { ...next[ri], value: e.target.value };
                                        setProductFieldEdit({ ...productFieldEdit, traceRows: next });
                                      }}
                                      className="h-8 text-[11px]"
                                    />
                                  </TableCell>
                                  <TableCell className="p-1 align-top">
                                    <Input
                                      value={row.unit ?? ''}
                                      onChange={(e) => {
                                        const next = [...productFieldEdit.traceRows];
                                        next[ri] = { ...next[ri], unit: e.target.value };
                                        setProductFieldEdit({ ...productFieldEdit, traceRows: next });
                                      }}
                                      className="h-8 text-[11px]"
                                    />
                                  </TableCell>
                                  <TableCell className="p-1 align-top">
                                    <Input
                                      value={row.notes ?? ''}
                                      onChange={(e) => {
                                        const next = [...productFieldEdit.traceRows];
                                        next[ri] = { ...next[ri], notes: e.target.value };
                                        setProductFieldEdit({ ...productFieldEdit, traceRows: next });
                                      }}
                                      className="h-8 text-[11px]"
                                    />
                                  </TableCell>
                                  <TableCell className="p-1 align-top">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() =>
                                        setProductFieldEdit({
                                          ...productFieldEdit,
                                          traceRows: productFieldEdit.traceRows.filter((_, i) => i !== ri),
                                        })
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {structured?.fileSummary && (
                        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                          <p className="text-[10px] font-bold uppercase text-[var(--muted)]">Document summary</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{structured.fileSummary}</p>
                        </div>
                      )}
                      {structured?.visualDescription && (
                        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                          <p className="text-[10px] font-bold uppercase text-[var(--muted)]">Image / label understanding</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{structured.visualDescription}</p>
                        </div>
                      )}
                      {(structured?.title || structured?.documentTypeGuess || structured?.classification) && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {structured?.title && (
                            <div>
                              <p className="text-[10px] font-bold uppercase text-[var(--muted)]">Detected title</p>
                              <p className="text-sm font-medium">{structured.title}</p>
                            </div>
                          )}
                          {structured?.documentTypeGuess && (
                            <div>
                              <p className="text-[10px] font-bold uppercase text-[var(--muted)]">Document type</p>
                              <p className="text-sm">{structured.documentTypeGuess}</p>
                            </div>
                          )}
                          {structured?.classification && (
                            <div className="sm:col-span-2">
                              <p className="text-[10px] font-bold uppercase text-[var(--muted)]">Classification</p>
                              <p className="text-sm">{structured.classification}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {structured?.keyPoints && structured.keyPoints.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold uppercase text-[var(--muted)]">Highlights</p>
                          <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                            {structured.keyPoints.map((k, i) => (
                              <li key={i}>{k}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={detail.status} />
                {detail.type === 'ISO_NORM' && detail.libraryStatus && (
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      detail.libraryStatus === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        : detail.libraryStatus === 'ARCHIVED'
                          ? 'bg-[var(--muted)]/20 text-[var(--muted)]'
                          : 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
                    )}
                  >
                    {libraryLabel(detail.libraryStatus)}
                  </span>
                )}
                {detail.isoStandard && (
                  <span className="text-xs font-semibold text-[#1565c0]">{detail.isoStandard}</span>
                )}
              </div>

              {detail.processingError && detail.status === 'FAILED' && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {detail.processingError}
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    You can retry the extraction after resolving the reported error.
                  </p>
                </div>
              )}

              {detail.type === 'ISO_NORM' && structured?.standardExtractionQuality &&
                (structured.standardExtractionQuality.processingComplete === false || (structured.standardExtractionQuality.warnings?.length ?? 0) > 0) && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                  <p className="font-semibold">{structured.standardExtractionQuality.processingComplete === false ? 'Extraction needs attention before activation' : 'Review extraction notes'}</p>
                  {structured.standardExtractionQuality.processingComplete === false && (
                    <p className="mt-1">
                      {structured.standardExtractionQuality.semanticSectionsAnalyzed ?? 0} of {structured.standardExtractionQuality.semanticSectionsDetected ?? 0} sections reviewed.
                      {' '}Existing results can be inspected below.
                    </p>
                  )}
                  {structured.standardExtractionQuality.warnings?.map((warning, i) => <p key={i} className="mt-1 text-xs">{warning}</p>)}
                  {(structured.standardExtractionQuality.ocrPages?.length ?? 0) > 0 && <p className="mt-1 text-xs">OCR pages: {structured.standardExtractionQuality.ocrPages?.join(', ')}.</p>}
                  {(structured.standardExtractionQuality.mixedImagePages?.length ?? 0) > 0 && <p className="mt-1 text-xs">Pages with image-based material: {structured.standardExtractionQuality.mixedImagePages?.join(', ')}.</p>}
                  {(structured.standardExtractionQuality.unresolvedPages?.length ?? 0) > 0 && <p className="mt-1 text-xs">Unreadable pages: {structured.standardExtractionQuality.unresolvedPages?.join(', ')}.</p>}
                  {structured.standardExtractionQuality.semanticBatchFailures?.slice(0, 3).map((failure, i) => (
                    <p key={i} className="mt-1 text-xs">{failure.clause}: {failure.error}</p>
                  ))}
                </div>
              )}

              {canRetryExtraction && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleRetryExtraction()}>
                    Retry extraction
                  </Button>
                  <p className="mt-1 text-xs text-[var(--muted)]">Retry reviews the whole document again.</p>
                </div>
              )}

              {(detail.status === 'UPLOADED' || detail.status === 'PROCESSING' || detail.status === 'UPLOADING') && (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--brand-primary)]" />
                  <p className="text-sm text-[var(--text-primary)]">
                    {structured?.standardExtractionProgress?.phase === 'reviewing'
                      ? `Reviewed ${structured.standardExtractionProgress.reviewedJobs ?? 0} of ${structured.standardExtractionProgress.totalJobs ?? 0} passage groups. AI review attempts: ${structured.standardExtractionProgress.providerRequests ?? 0}.`
                      : 'Reading and extracting the document… Larger files may take longer.'}
                  </p>
                </div>
              )}

              {structured?.standardMetadata && detail.type === 'ISO_NORM' && (
                <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm sm:grid-cols-2">
                  {structured.standardMetadata.reference && (
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[var(--muted)]">Reference</p>
                      <p>{structured.standardMetadata.reference}</p>
                    </div>
                  )}
                  {structured.standardMetadata.effectiveDate && (
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[var(--muted)]">Effective date</p>
                      <p>{structured.standardMetadata.effectiveDate}</p>
                    </div>
                  )}
                  {structured.standardMetadata.categories && structured.standardMetadata.categories.length > 0 && (
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-bold uppercase text-[var(--muted)]">Categories</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {structured.standardMetadata.categories.map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-[var(--brand-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--brand-primary)]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {structured?.productProfile &&
                (detail.type === 'PRODUCT_DOC' ||
                  detail.type === 'EVIDENCE' ||
                  detail.type === 'WORKSPACE_FILE' ||
                  detail.productId) &&
                (() => {
                  const pp = structured.productProfile!;
                  const biEntries = Object.entries(pp.basicInformation ?? {}).filter(([, v]) => v != null && v !== '');
                  const certItems = [
                    ...(pp.certifications?.marks ?? []),
                    ...(pp.certifications?.standards ?? []),
                    ...(pp.certifications?.approvalNumbers ?? []),
                  ].filter((x): x is string => Boolean(x));
                  const usageEntries = Object.entries(pp.usage ?? {}).filter(([, v]) => v != null && v !== '');
                  return (
                    <div className="space-y-3">
                      {/* Product identification */}
                      {biEntries.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Product identification
                          </p>
                          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                            {biEntries.map(([k, v]) => (
                              <div key={k} className="flex flex-col">
                                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                                  {k.replace(/([A-Z])/g, ' $1').trim()}
                                </dt>
                                <dd className="mt-0.5 font-semibold text-[var(--text-primary)]">{String(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {/* Certifications */}
                      {certItems.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Certifications & standards
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {certItems.map((item, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Usage & environment */}
                      {usageEntries.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Usage & environment
                          </p>
                          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                            {usageEntries.map(([k, v]) => (
                              <div key={k} className="flex flex-col">
                                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                                  {k.replace(/([A-Z])/g, ' $1').trim()}
                                </dt>
                                <dd className="mt-0.5 text-[var(--text-primary)]">{String(v)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {/* Physical specifications */}
                      {(pp.dimensions ?? pp.weight) && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Physical specifications
                          </p>
                          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                            {pp.dimensions && (
                              <div className="flex flex-col">
                                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Dimensions</dt>
                                <dd className="mt-0.5 text-[var(--text-primary)]">{pp.dimensions}</dd>
                              </div>
                            )}
                            {pp.weight && (
                              <div className="flex flex-col">
                                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Weight</dt>
                                <dd className="mt-0.5 text-[var(--text-primary)]">{pp.weight}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}

                      {/* General description */}
                      {pp.generalDescription && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            General description
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                            {pp.generalDescription}
                          </p>
                        </div>
                      )}

                      {/* Applications */}
                      {pp.applications && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Applications
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                            {pp.applications}
                          </p>
                        </div>
                      )}

                      {/* Safety warnings */}
                      {(pp.safetyWarnings ?? []).length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            Safety warnings
                          </p>
                          <ul className="space-y-1">
                            {pp.safetyWarnings!.map((w, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                                <span className="mt-0.5 shrink-0">⚠</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Quality specification */}
                      {pp.qualitySpecificationNarrative && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Quality specification
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                            {pp.qualitySpecificationNarrative}
                          </p>
                        </div>
                      )}

                      {/* Regulatory notes */}
                      {pp.regulatoryNotes && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Regulatory notes
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                            {pp.regulatoryNotes}
                          </p>
                        </div>
                      )}

                      {/* Technical specs table */}
                      {(pp.traceabilityRows ?? []).length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Technical specifications
                          </p>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="text-[10px]">Category</TableHead>
                                  <TableHead className="text-[10px]">Parameter</TableHead>
                                  <TableHead className="text-[10px]">Value</TableHead>
                                  <TableHead className="text-[10px]">Unit</TableHead>
                                  <TableHead className="text-[10px]">Notes</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pp.traceabilityRows!.map((row, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs">{row.category ?? '-'}</TableCell>
                                    <TableCell className="text-xs font-medium">{row.parameter ?? '-'}</TableCell>
                                    <TableCell className="text-xs font-semibold text-[var(--text-primary)]">
                                      {row.value ?? '-'}
                                    </TableCell>
                                    <TableCell className="text-xs text-[var(--muted)]">{row.unit ?? '-'}</TableCell>
                                    <TableCell className="text-xs text-[var(--muted)]">{row.notes ?? '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {/* Technical characteristics / bullets fallback */}
                      {!pp.traceabilityRows?.length && pp.technicalCharacteristics && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Technical characteristics
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                            {pp.technicalCharacteristics}
                          </p>
                        </div>
                      )}
                      {!pp.traceabilityRows?.length && (pp.technicalBullets ?? []).length > 0 && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            Technical details
                          </p>
                          <ul className="space-y-1">
                            {pp.technicalBullets!.map((b, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

              {!(
                detail.type === 'PRODUCT_DOC' ||
                detail.type === 'EVIDENCE' ||
                detail.type === 'WORKSPACE_FILE' ||
                detail.type === 'ISO_NORM' ||
                detail.productId
              ) &&
                structured?.keyPoints &&
                structured.keyPoints.length > 0 && (
                  <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[rgba(0,174,239,0.06)] p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--brand-primary)]">
                      <Sparkles className="h-4 w-4" />
                      Key points
                    </div>
                    <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-primary)]">
                      {structured.keyPoints.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {!(
                detail.type === 'PRODUCT_DOC' ||
                detail.type === 'EVIDENCE' ||
                detail.type === 'WORKSPACE_FILE' ||
                detail.type === 'ISO_NORM' ||
                detail.productId
              ) &&
                (structured?.title || structured?.documentTypeGuess || structured?.classification) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {structured?.title && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Title</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{structured.title}</p>
                    </div>
                  )}
                  {structured?.documentTypeGuess && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Document type</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{structured.documentTypeGuess}</p>
                    </div>
                  )}
                  {structured?.classification && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:col-span-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        Classification
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{structured.classification}</p>
                    </div>
                  )}
                </div>
              )}

              {((structured?.sections ?? []).length > 0 || (detail.type === 'ISO_NORM' && (structured?.requirementsSummary?.requirements ?? []).length > 0)) ? (
                detail.type === 'ISO_NORM' &&
                clauseRows === null &&
                editingJson === null &&
                productFieldEdit === null ? (
                  <IsoStandardTocView
                    key={currentId}
                    sections={sortedIsoSections}
                    requirements={structured?.requirementsSummary?.requirements ?? []}
                    expandedIdx={expandedIsoClauseIdx}
                    onToggle={(idx) =>
                      setExpandedIsoClauseIdx(expandedIsoClauseIdx === idx ? null : idx)
                    }
                  />
                ) : (
                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
                    {detail.type === 'ISO_NORM' ? 'Clauses / sections' : 'Sections'}
                  </p>
                  {(structured?.sections ?? []).map((sec, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
                    >
                      <h3 className="text-base font-bold text-[var(--text-primary)]">
                        {detail.type === 'ISO_NORM' && sec.clauseNumber && (
                          <span className="mr-2 inline-block rounded-md bg-[#1565c0]/12 px-2 py-0.5 font-mono text-sm text-[#1565c0]">
                            {sec.clauseNumber}
                          </span>
                        )}
                        {sec.heading}
                      </h3>
                      {sec.content && (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                          {sec.content}
                        </p>
                      )}
                      {sec.bullets && sec.bullets.length > 0 && (
                        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--text-primary)]">
                          {sec.bullets.map((b, j) => (
                            <li key={j}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                )
              ) : detail.status === 'READY' &&
                !(structured?.sections ?? []).length &&
                detail.type !== 'WORKSPACE_FILE' ? (
                <p className="text-sm text-[var(--muted)]">No structured sections were returned for this file.</p>
              ) : null}

              {detail.type !== 'WORKSPACE_FILE' && (
                <p className="text-center text-[11px] text-[var(--muted)]">
                  AI can make mistakes. Verify content before use.
                </p>
              )}
            </div>
          )}
        </div>

        {detail && (canEditExtraction || canActivateStandard || productFieldEdit !== null) && (
          <div className="shrink-0 border-t border-[var(--border)] px-6 py-3">
            <div className="flex flex-wrap gap-2">
              {canEditStandardClauses && clauseRows === null && editingJson === null && productFieldEdit === null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const secs = ((detail.extractedStructured ?? {}) as ExtractedStructured).sections ?? [];
                    setClauseRows(secs.length ? secs.map((s, i) => sectionToClauseRow(s, i)) : [{ clauseNumber: '1', title: '', content: '' }]);
                  }}
                >
                  Edit extraction
                </Button>
              )}
              {canEditProductSummary && clauseRows === null && editingJson === null && productFieldEdit === null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const ex = (detail.extractedStructured ?? {}) as ExtractedStructured;
                    const pp = ex.productProfile ?? {};
                    const bi = pp.basicInformation ?? {};
                    const tr = (pp.traceabilityRows ?? []) as TraceRow[];
                    setProductFieldEdit({
                      fileSummary: ex.fileSummary ?? '',
                      visualDescription: ex.visualDescription ?? '',
                      generalDescription: (pp.generalDescription as string) ?? '',
                      applications: (pp.applications as string) ?? '',
                      qualitySpecificationNarrative: (pp.qualitySpecificationNarrative as string) ?? '',
                      regulatoryNotes: (pp.regulatoryNotes as string) ?? '',
                      technicalCharacteristics: (pp.technicalCharacteristics as string) ?? '',
                      reference: bi.reference != null ? String(bi.reference) : '',
                      revision: bi.revision != null ? String(bi.revision) : '',
                      category: bi.category != null ? String(bi.category) : '',
                      traceRows:
                        tr.length > 0
                          ? tr.map((r) => ({
                              category: r.category ?? '',
                              parameter: r.parameter ?? '',
                              value: r.value ?? '',
                              unit: r.unit ?? '',
                              notes: r.notes ?? '',
                            }))
                          : [{ category: '', parameter: '', value: '', unit: '', notes: '' }],
                    });
                  }}
                >
                  Edit extraction (forms)
                </Button>
              )}
              {canEditExtractionJson &&
                detail?.type === 'PROCEDURE' &&
                clauseRows === null &&
                editingJson === null &&
                productFieldEdit === null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditingJson(JSON.stringify(detail.extractedStructured ?? {}, null, 2))
                  }
                >
                  Edit as JSON
                </Button>
              )}
              {(clauseRows !== null || editingJson !== null || productFieldEdit !== null) && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingJson(null);
                      setClauseRows(null);
                      setProductFieldEdit(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={() => void saveExtraction()}>
                    Save
                  </Button>
                </>
              )}
              {canActivateStandard &&
                clauseRows === null &&
                editingJson === null &&
                productFieldEdit === null && (
                <Button type="button" variant="default" size="sm" onClick={() => void handleActivateStandard()}>
                  Activate standard
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getMimeIcon(mimeType: string) {
  if (mimeType?.includes('pdf'))
    return <FileText className="h-[26px] w-[26px] text-[#ff5630]" />;
  if (mimeType?.includes('image'))
    return <ImageIcon className="h-[26px] w-[26px] text-[var(--brand-primary)]" />;
  return <FileText className="h-[26px] w-[26px] text-[#1976d2]" />;
}

function groupDocs(docs: any[], products: any[] = []) {
  const standards: any[] = [];
  const unfiled: any[] = [];
  const folderMap = new Map<string, { product: any; docs: any[] }>();

  // Seed with the passed products so empty ones still appear as folders. The caller passes the
  // set that matches the current view (active vs archived); folder visibility is filtered by the
  // product's real archivedAt downstream, so seed every product here regardless of archived state.
  for (const p of products) {
    folderMap.set(p.id, { product: p, docs: [] });
  }

  for (const doc of docs) {
    if (doc.type === 'ISO_NORM') {
      standards.push(doc);
    } else if (doc.type === 'WORKSPACE_FILE') {
      /** QMS workspace records: always listed under “Other documents”, even when linked to a product (reference column). */
      unfiled.push(doc);
    } else if (doc.productId) {
      if (!folderMap.has(doc.productId)) {
        folderMap.set(doc.productId, {
          product: doc.product ?? { id: doc.productId, name: doc.productId },
          docs: [],
        });
      }
      folderMap.get(doc.productId)!.docs.push(doc);
    } else {
      unfiled.push(doc);
    }
  }

  return { standards, folders: Array.from(folderMap.values()), unfiled };
}

/** Product detail modal: list-style Files tab (Qleer-style). */
function ViewProductModal({
  open,
  onClose,
  folder,
  onViewFile,
  onDownloadFile,
  onArchiveFile,
  onUploaded,
  readOnly = false,
  nameMap,
  userAvatarKeyById,
}: {
  open: boolean;
  onClose: () => void;
  folder: { product: any; docs: any[] } | null;
  onViewFile: (doc: any, siblings: any[]) => void;
  onDownloadFile: (id: string, name?: string) => void;
  /** Company Admin: archive product file (soft-delete) */
  onArchiveFile?: (id: string) => void;
  /** Called after a file is uploaded so parent can refresh */
  onUploaded?: () => void;
  /** View-only: hides the product profile edit affordance (editing happens via the row wizard action). */
  readOnly?: boolean;
  nameMap: Map<string, string>;
  userAvatarKeyById: Map<string, string | null>;
}) {
  const [tab, setTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTab('overview');
      setIsEditing(false);
    }
  }, [open, folder?.product?.id]);

  if (!open || !folder) return null;
  const { product, docs } = folder;
  const showFileDelete = !readOnly && typeof onArchiveFile === 'function';

  const startEdit = () => {
    setEditData({
      name: product.name ?? '',
      sku: product.sku ?? '',
      brandName: product.brandName ?? '',
      productFamily: product.productFamily ?? '',
      description: product.description ?? '',
      productType: product.productType ?? '',
      productStatus: product.productStatus ?? '',
      intendedUse: product.intendedUse ?? '',
      targetUsers: product.targetUsers ?? [],
      keyMaterials: product.keyMaterials ?? [],
      physicalForm: product.physicalForm ?? '',
      hsTariffCode: product.hsTariffCode ?? '',
      countryOfOrigin: product.countryOfOrigin ?? '',
      targetMarkets: product.targetMarkets ?? [],
      requiredCertifications: product.requiredCertifications ?? [],
      applicableRegulations: product.applicableRegulations ?? [],
      industryLabels: product.industryLabels ?? [],
      productionSites: product.productionSites ?? [],
      productionProcesses: product.productionProcesses ?? [],
      criticalSuppliers: product.criticalSuppliers ?? [],
      productCertifications: product.productCertifications ?? [],
    });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await productApi.updateProfile(product.id, editData);
      toast.success('Product updated');
      setIsEditing(false);
      // Reload by closing and re-opening (parent should refresh)
      onClose();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const cancelEdit = () => { setIsEditing(false); setEditData({}); };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', 'PRODUCT_DOC');
        fd.append('productName', product.name);
        await documentApi.upload(fd);
      }
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      onUploaded?.();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Helper to render a label/value row
  const Field = ({ label, value, field, type = 'text' }: { label: string; value: any; field?: string; type?: string }) => {
    const display = Array.isArray(value) ? (value.length ? value.join(', ') : '-')
      : value || '-';
    if (isEditing && field) {
      return (
        <div>
          <dt className="text-[var(--muted)] text-[11px] font-medium">{label}</dt>
          <input
            type={type}
            value={editData[field] ?? ''}
            onChange={(e) => setEditData((p) => ({ ...p, [field]: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand-primary)]"
          />
        </div>
      );
    }
    return (
      <div>
        <dt className="text-[var(--muted)] text-[11px] font-medium">{label}</dt>
        <dd className="font-medium text-sm">{display}</dd>
      </div>
    );
  };

  const ChipField = ({ label, value, field }: { label: string; value: string[]; field: string }) => {
    if (isEditing) {
      return (
        <div>
          <dt className="text-[var(--muted)] text-[11px] font-medium">{label}</dt>
          <dd className="mt-1 font-medium text-sm">
            {(value ?? []).map((v: string, i: number) => (
              <span key={i} className="mr-1 inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-primary)]">
                {v}
                <button type="button" onClick={() => {
                  const arr = [...(editData[field] ?? [])];
                  arr.splice(i, 1);
                  setEditData((p) => ({ ...p, [field]: arr }));
                }} className="ml-0.5 text-[var(--brand-primary)]/60 hover:text-[var(--brand-primary)]">&times;</button>
              </span>
            ))}
            <input
              placeholder="Add + Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                  e.preventDefault();
                  const val = (e.target as HTMLInputElement).value.trim();
                  setEditData((p) => ({ ...p, [field]: [...(p[field] ?? []), val] }));
                  (e.target as HTMLInputElement).value = '';
                }
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand-primary)]"
            />
          </dd>
        </div>
      );
    }
    const items = value?.length ? value : [];
    return (
      <div>
        <dt className="text-[var(--muted)] text-[11px] font-medium">{label}</dt>
        <dd className="font-medium text-sm">
          {items.length ? items.map((v: string, i: number) => (
            <span key={i} className="mr-1 inline-flex items-center rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-primary)]">{v}</span>
          )) : '-'}
        </dd>
      </div>
    );
  };

  const ProductTypeLabel = (t: string) => {
    const map: Record<string, string> = { finished: 'Finished', semi_finished: 'Semi-finished', component: 'Component', raw_material: 'Raw material', service: 'Service' };
    return map[t] || t || '-';
  };
  const ProductStatusLabel = (s: string) => {
    const map: Record<string, string> = { active: 'Active', draft: 'Draft', discontinued: 'Discontinued' };
    return map[s] || s || '-';
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4 text-left">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold">{isEditing ? 'Edit Product' : 'View Product'}</DialogTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">{product.name}</p>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                  <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </>
              ) : readOnly ? null : (
                <Button variant="outline" size="sm" onClick={startEdit} className="gap-2">
                  <Edit className="h-3.5 w-3.5" />Edit
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-auto w-full shrink-0 justify-start gap-1 rounded-none border-b border-[var(--border)] bg-transparent px-4 py-2 sm:px-6">
            <TabsTrigger value="overview" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <Info className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="technical" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <Cog className="h-4 w-4" />
              Technical
            </TabsTrigger>
            <TabsTrigger value="markets" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <Package className="h-4 w-4" />
              Markets
            </TabsTrigger>
            <TabsTrigger value="manufacturing" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <Factory className="h-4 w-4" />
              Manufacturing
            </TabsTrigger>
            <TabsTrigger value="certs" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <Shield className="h-4 w-4" />
              Certifications
            </TabsTrigger>
            <TabsTrigger value="ai-extraction" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <Sparkles className="h-4 w-4" />
              AI Extraction
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-[var(--brand-primary)]">
              <FileText className="h-4 w-4" />
              Files ({docs.length})
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">

            {/* ── Overview ──────────────────────────────────────── */}
            <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Basic Information</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field label="Name" value={product.name} field="name" />
                  <Field label="SKU" value={product.sku} field="sku" />
                  <Field label="Brand" value={product.brandName} field="brandName" />
                  <Field label="Family" value={product.productFamily} field="productFamily" />
                  <div>
                    <dt className="text-[var(--muted)] text-[11px] font-medium">Type</dt>
                    {isEditing ? (
                      <select
                        value={editData.productType ?? ''}
                        onChange={(e) => setEditData((p) => ({ ...p, productType: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand-primary)]"
                      >
                        <option value="finished">Finished</option>
                        <option value="semi_finished">Semi-finished</option>
                        <option value="component">Component</option>
                        <option value="raw_material">Raw material</option>
                        <option value="service">Service</option>
                      </select>
                    ) : <dd className="font-medium text-sm">{ProductTypeLabel(product.productType)}</dd>}
                  </div>
                  <div>
                    <dt className="text-[var(--muted)] text-[11px] font-medium">Status</dt>
                    {isEditing ? (
                      <select
                        value={editData.productStatus ?? ''}
                        onChange={(e) => setEditData((p) => ({ ...p, productStatus: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand-primary)]"
                      >
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="discontinued">Discontinued</option>
                      </select>
                    ) : <dd className="font-medium text-sm">{ProductStatusLabel(product.productStatus)}</dd>}
                  </div>
                  <Field label="Reference" value={product.reference} />
                  <Field label="Revision" value={product.revision} />
                  <Field label="Category" value={product.categoryTags?.[0]} />
                  <Field label="Created" value={product.createdAt ? new Date(product.createdAt).toLocaleDateString() : null} />
                  <Field label="Updated" value={product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : null} />
                </dl>
              </div>
              {isEditing ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Description</p>
                  <textarea
                    value={editData.description ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--brand-primary)]"
                  />
                </div>
              ) : product.description ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="mb-2 text-[11px] font-bold uppercase text-[var(--muted)]">Description</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{product.description}</p>
                </div>
              ) : null}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Onboarding</p>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    product.onboardingStatus === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-700'
                    : product.onboardingStatus === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-700'
                    : 'bg-[var(--muted)]/10 text-[var(--muted)]'
                  }`}>
                    {product.onboardingStatus === 'COMPLETED' ? 'Completed' : product.onboardingStatus === 'IN_PROGRESS' ? 'In progress' : 'Not started'}
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">Step {(product.currentStep ?? 0) + 1} of 6</span>
                </div>
              </div>
            </TabsContent>

            {/* ── Technical ─────────────────────────────────────── */}
            <TabsContent value="technical" className="mt-0 space-y-4 focus-visible:outline-none">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Technical Details</p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field label="Intended Use" value={product.intendedUse} field={isEditing ? 'intendedUse' : undefined} />
                  <Field label="Physical Form" value={product.physicalForm} field={isEditing ? 'physicalForm' : undefined} />
                  <Field label="HS / Tariff Code" value={product.hsTariffCode} field={isEditing ? 'hsTariffCode' : undefined} />
                  <Field label="Country of Origin" value={product.countryOfOrigin} field={isEditing ? 'countryOfOrigin' : undefined} />
                </dl>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Target Users" value={product.targetUsers} field="targetUsers" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Key Materials" value={product.keyMaterials} field="keyMaterials" />
              </div>
            </TabsContent>

            {/* ── Markets ──────────────────────────────────────── */}
            <TabsContent value="markets" className="mt-0 space-y-4 focus-visible:outline-none">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Target Markets" value={product.targetMarkets} field="targetMarkets" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Required Certifications" value={product.requiredCertifications} field="requiredCertifications" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Applicable Regulations" value={product.applicableRegulations} field="applicableRegulations" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Industry Labels" value={product.industryLabels} field="industryLabels" />
              </div>
            </TabsContent>

            {/* ── Manufacturing ─────────────────────────────────── */}
            <TabsContent value="manufacturing" className="mt-0 space-y-4 focus-visible:outline-none">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Production Sites" value={product.productionSites} field="productionSites" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Production Processes" value={product.productionProcesses} field="productionProcesses" />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <ChipField label="Critical Suppliers" value={product.criticalSuppliers} field="criticalSuppliers" />
              </div>
            </TabsContent>

            {/* ── Certifications ────────────────────────────────── */}
            <TabsContent value="certs" className="mt-0 space-y-4 focus-visible:outline-none">
              {product.productCertifications?.length > 0 ? (
                product.productCertifications.map((cert: any, i: number) => (
                  <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">Certificate {i + 1}</p>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-[var(--muted)] text-[11px] font-medium">Standard</dt><dd className="font-medium">{cert.standardName || '-'}</dd></div>
                      <div><dt className="text-[var(--muted)] text-[11px] font-medium">Certifying Body</dt><dd className="font-medium">{cert.certifyingBody || '-'}</dd></div>
                      <div><dt className="text-[var(--muted)] text-[11px] font-medium">Certificate #</dt><dd className="font-medium">{cert.certificateNumber || '-'}</dd></div>
                      <div><dt className="text-[var(--muted)] text-[11px] font-medium">Market Scope</dt><dd className="font-medium">{cert.marketScope || '-'}</dd></div>
                      <div><dt className="text-[var(--muted)] text-[11px] font-medium">Issue Date</dt><dd className="font-medium">{cert.issueDate || '-'}</dd></div>
                      <div><dt className="text-[var(--muted)] text-[11px] font-medium">Expiry Date</dt><dd className="font-medium">{cert.expiryDate || '-'}</dd></div>
                    </dl>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-[var(--muted)]">No certifications recorded</p>
              )}
            </TabsContent>

            {/* ── AI Extraction ─────────────────────────────────── */}
            <TabsContent value="ai-extraction" className="mt-0 space-y-4 focus-visible:outline-none">
              <ProductExtractionOverview
                productId={product.id}
                quality={product.extractionQuality}
                fieldProvenance={product.fieldProvenance}
                fieldConflicts={product.fieldConflicts}
                requirementCoverage={product.requirementCoverage}
                readinessSummary={product.readinessSummary}
                customFields={product.customFields}
                productFacts={product.productFacts}
                mergedProfile={product.mergedProfile}
                onResolved={() => onUploaded?.()}
              />
            </TabsContent>

            {/* ── Files ─────────────────────────────────────────── */}
            <TabsContent value="files" className="mt-0 focus-visible:outline-none">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Product files</p>
                {!readOnly && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.tiff,.tif"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {uploading ? 'Uploading...' : 'Upload file'}
                    </Button>
                  </div>
                )}
              </div>
              {docs.length === 0 && !uploading ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">No files for this product</p>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc) => {
                    const tag =
                      (doc.tags && doc.tags[0]) ||
                      (doc.extractedStructured as ExtractedStructured | null)?.classification ||
                      '-';
                    return (
                      <div
                        key={doc.id}
                        {...attachDocDrag(doc.id, doc.name)}
                        className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/20 px-4 py-3 transition-colors hover:bg-[var(--nav-hover)]/40 cursor-grab active:cursor-grabbing"
                      >
                        {/* File icon + name */}
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <FileText className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]" title={doc.name}>
                            {doc.name}
                          </span>
                        </div>

                        {/* Tag */}
                        <span className="hidden shrink-0 rounded-full bg-[var(--brand-primary)]/8 px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)] sm:inline-block">
                          {tag}
                        </span>

                        {/* Status */}
                        <div className="shrink-0">
                          <StatusPill status={doc.status} />
                        </div>

                        {/* Meta: when + size */}
                        <div className="hidden shrink-0 text-right text-[11px] text-[var(--muted)] md:block">
                          <p>{formatUploadedRelative(doc)}</p>
                          <p>{formatBytes(Number(doc.sizeBytes ?? 0))}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-0.5">
                          {showFileDelete && (
                            <Button type="button" variant="ghost" size="icon"
                              className="h-8 w-8 rounded-md border border-red-500/35 bg-red-500/8 text-red-700 hover:bg-red-500/12 dark:text-red-400"
                              title="Remove from active library (archive)"
                              onClick={() => onArchiveFile?.(doc.id)}>
                              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                            </Button>
                          )}
                          <Button type="button" variant="ghost" size="icon" className={DOC_ROW_NEUTRAL_BTN}
                            title="View extracted text & details"
                            onClick={() => { onClose(); onViewFile(doc, docs); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className={DOC_ROW_NEUTRAL_BTN}
                            title="Download the original file"
                            onClick={() => onDownloadFile(doc.id, doc.name)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DocCard({
  doc,
  variant,
  onDownload,
  onDelete,
  onOpen,
  onUploadVersion,
  archivedStandard,
  archivedProduct,
  onRestore,
  onPurge,
  onRemoveFromCustomFolder,
  nameMap,
  userAvatarKeyById,
  hideExtractionPill = false,
}: {
  doc: any;
  variant: 'standard' | 'product';
  onDownload: () => void;
  onDelete: () => void;
  onOpen?: () => void;
  onUploadVersion?: (file: File) => void;
  /** Archived standards view */
  archivedStandard?: boolean;
  /** Archived product documents view */
  archivedProduct?: boolean;
  onRestore?: () => void;
  onPurge?: () => void;
  onRemoveFromCustomFolder?: () => void;
  nameMap: Map<string, string>;
  userAvatarKeyById: Map<string, string | null>;
  /** Local-only folders: hide AI processing pill */
  hideExtractionPill?: boolean;
}) {
  const { user } = useAuthStore();
  const isQm = user?.role === 'QUALITY_MANAGER';
  const isDirector = user?.role === 'DIRECTOR';
  const canArchiveStandard = isQm || isDirector;
  const versionInputRef = useRef<HTMLInputElement>(null);
  const color = doc.type === 'ISO_NORM' ? '#1565c0' : '#006064';
  const stdArchived = variant === 'standard' && archivedStandard;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        className={cn(
          'relative overflow-hidden border-[var(--border)] shadow-none transition-hover hover:-translate-y-0.5 hover:shadow-md',
          onOpen && 'cursor-pointer'
        )}
      >
        <div className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: color }} />
        <CardContent className="px-6 py-5 pt-6">
          <div className="flex gap-3">
            <div
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${color}1a` }}
            >
              {getMimeIcon(doc.mimeType)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-sm text-[var(--text-primary)]" title={doc.name}>
                  {doc.name}
                </p>
                {!hideExtractionPill && <StatusPill status={doc.status} />}
              </div>
              {variant === 'product' && getExtractedCategory(doc) !== '-' && (
                <p className="text-xs font-semibold text-[var(--brand-primary)]" title="Extracted category">
                  {getExtractedCategory(doc)}
                </p>
              )}
              {doc.isoStandard && (
                <p className="text-xs font-semibold" style={{ color }}>
                  {doc.isoStandard}
                </p>
              )}
              {doc.description && (
                <p className="truncate text-xs text-[var(--muted)]">{doc.description}</p>
              )}
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <FileLibraryUploaderCell
                    uploadedBy={doc.uploadedBy}
                    nameMap={nameMap}
                    userAvatarKeyById={userAvatarKeyById}
                  />
                </div>
                <p className="text-[10px] text-[var(--muted)]">{formatUploadedRelative(doc)}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[#919eab]">
              {formatBytes(doc.sizeBytes)} · v{doc.version}
            </span>
            {variant === 'standard' && stdArchived && canArchiveStandard ? (
              <div className="flex flex-wrap items-center justify-end gap-0.5" dir="ltr">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/18 dark:text-emerald-400"
                  title="Restore to active library"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.();
                  }}
                >
                  <ArchiveRestore className="h-4 w-4" strokeWidth={2.25} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="View details & extraction"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-red-500/40 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                  title="Delete forever"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPurge?.();
                  }}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                </Button>
              </div>
            ) : variant === 'standard' && stdArchived ? (
              <div className="flex items-center gap-0.5" dir="ltr">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="View details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="Download"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ) : variant === 'standard' && canArchiveStandard ? (
              <div className="flex items-center gap-0.5" dir="ltr">
                {isQm && (
                  <input
                    ref={versionInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadVersion?.(f);
                      e.target.value = '';
                    }}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_ARCHIVE_BTN}
                  title="Archive standard"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Archive className="h-4 w-4" strokeWidth={2.25} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="View details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {isQm && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={DOC_ROW_NEUTRAL_BTN}
                    title="Upload new version"
                    onClick={(e) => {
                      e.stopPropagation();
                      versionInputRef.current?.click();
                    }}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                )}
                {!isQm && isDirector && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={DOC_ROW_NEUTRAL_BTN}
                    title="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload();
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : variant === 'standard' ? (
              <div className="flex items-center gap-0.5" dir="ltr">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="View details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="Download"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ) : variant === 'product' && archivedProduct && (isQm || isDirector) ? (
              <div className="flex flex-wrap items-center justify-end gap-0.5" dir="ltr">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/18 dark:text-emerald-400"
                  title="Restore to active library"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.();
                  }}
                >
                  <ArchiveRestore className="h-4 w-4" strokeWidth={2.25} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="View details & extraction"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {isDirector && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md border border-red-500/40 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                    title="Delete forever"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPurge?.();
                    }}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                  </Button>
                )}
              </div>
            ) : variant === 'product' && archivedProduct ? (
              <div className="flex items-center gap-0.5" dir="ltr">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="View details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen?.();
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DOC_ROW_NEUTRAL_BTN}
                  title="Download"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ) : (() => {
              const isProductLinked = !!doc.productId;
              const isOwnUpload = !!user?.id && doc.uploadedBy === user.id;
              const canTrash =
                isDirector ||
                (isProductLinked
                  ? false
                  : isQm || (doc.type !== 'ISO_NORM' && isOwnUpload));
              return (
                <div className="flex items-center gap-0.5" dir="ltr">
                  {canTrash && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-red-500/30 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                      title="Move document to trash (restorable)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={DOC_ROW_NEUTRAL_BTN}
                    title="View details"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen?.();
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={DOC_ROW_NEUTRAL_BTN}
                    title="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload();
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              );
            })()}
          </div>
          {onRemoveFromCustomFolder && (
            <div className="border-t border-[var(--border)] px-6 pb-3 pt-2" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                variant="link"
                className="h-auto w-full justify-start p-0 text-left text-xs font-medium text-[var(--brand-primary)]"
                onClick={onRemoveFromCustomFolder}
              >
                Remove from this folder
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StandardListRowActions({
  onView,
  onDownload,
  onDelete,
  onHardDelete,
  onUploadVersion,
  archivedStandard,
  onRestore,
  onPurge,
}: {
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  /** Permanent delete on the active standard (DIRECTOR only, backend enforced). */
  onHardDelete?: () => void;
  onUploadVersion: (file: File) => void;
  archivedStandard?: boolean;
  onRestore?: () => void;
  onPurge?: () => void;
}) {
  const { user } = useAuthStore();
  const isQm = user?.role === 'QUALITY_MANAGER';
  const isDirector = user?.role === 'DIRECTOR';
  const canArchiveStandard = isQm || isDirector;
  const versionInputRef = useRef<HTMLInputElement>(null);

  if (archivedStandard && canArchiveStandard) {
    return (
      <div className="flex w-full flex-nowrap items-center justify-end gap-0.5 whitespace-nowrap" dir="ltr">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/18 dark:text-emerald-400"
          title="Restore to active library"
          onClick={(e) => {
            e.stopPropagation();
            onRestore?.();
          }}
        >
          <ArchiveRestore className="h-4 w-4" strokeWidth={2.25} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={DOC_ROW_NEUTRAL_BTN}
          title="View details & extraction"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-md border border-red-500/40 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
          title="Delete forever"
          onClick={(e) => {
            e.stopPropagation();
            onPurge?.();
          }}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
        </Button>
      </div>
    );
  }

  if (archivedStandard) {
    return (
      <div className="flex w-full items-center justify-end gap-0.5" dir="ltr">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={DOC_ROW_NEUTRAL_BTN}
          title="View details"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={DOC_ROW_NEUTRAL_BTN}
          title="Download"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (canArchiveStandard) {
    return (
      <div className="flex w-full items-center justify-end gap-0.5" dir="ltr">
        {isQm && (
          <input
            ref={versionInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadVersion(f);
              e.target.value = '';
            }}
          />
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={DOC_ROW_ARCHIVE_BTN}
          title="Archive standard (restorable from Archived standards)"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Archive className="h-4 w-4" strokeWidth={2.25} />
        </Button>
        {onHardDelete && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-md border border-red-500/30 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
            title="Move standard to Trash (restorable)"
            onClick={(e) => {
              e.stopPropagation();
              onHardDelete();
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.25} />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={DOC_ROW_NEUTRAL_BTN}
          title="View details"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
        {isQm && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={DOC_ROW_NEUTRAL_BTN}
            title="Upload new version"
            onClick={(e) => {
              e.stopPropagation();
              versionInputRef.current?.click();
            }}
          >
            <Upload className="h-4 w-4" />
          </Button>
        )}
        {!isQm && isDirector && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={DOC_ROW_NEUTRAL_BTN}
            title="Download"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-end gap-0.5" dir="ltr">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={DOC_ROW_NEUTRAL_BTN}
        title="View details"
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={DOC_ROW_NEUTRAL_BTN}
        title="Download"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Section renderer (Standards + Products list) ────────────────────────────

function DocSection({
  docs,
  onDownload,
  onDelete,
  onPurgeWorkspaceFile,
  onViewDocument,
  onUploadVersion,
  onRestoreArchived,
  onPurgeArchived,
  confirmAction,
  viewFilter = 'all',
  archiveScope = 'none',
  customFolder = null,
  nameMap,
  userAvatarKeyById,
  storageOnly = false,
  onDocsMutated,
  focusProductId = null,
  onFocusProductHandled,
  products = [],
  onEditProductInWizard,
}: {
  docs: any[];
  onDownload: (id: string, fileName?: string) => void;
  onDelete: (id: string) => void;
  /** Permanent delete for workspace (Other documents) rows */
  onPurgeWorkspaceFile?: (id: string) => void;
  onViewDocument: (doc: any, siblingDocs: any[]) => void;
  onUploadVersion?: (id: string, file: File) => void;
  onRestoreArchived?: (id: string) => void;
  onPurgeArchived?: (id: string) => void;
  confirmAction?: (opts: ConfirmActionOptions) => Promise<boolean>;
  /** From sidebar: product folders vs ISO norms */
  viewFilter?: 'all' | 'product' | 'standard';
  /** Archived standards or archived product documents view */
  archiveScope?: 'none' | 'standard' | 'product';
  customFolder?: { onRemove: (docId: string) => void } | null;
  nameMap: Map<string, string>;
  userAvatarKeyById: Map<string, string | null>;
  /** Custom folder: files are storage-only (no extraction emphasis) */
  storageOnly?: boolean;
  onDocsMutated?: () => void;
  /** When set, open the matching product overview modal. */
  focusProductId?: string | null;
  onFocusProductHandled?: () => void;
  /** All products (including empty ones) so product folders appear even without docs */
  products?: any[];
  /** Open the full 6-step wizard pre-filled with a product for editing */
  onEditProductInWizard?: (product: any) => void;
}) {
  const [productModal, setProductModal] = useState<{ product: any; docs: any[] } | null>(null);
  const [productSectionPage, setProductSectionPage] = useState(1);
  const [standardsSectionPage, setStandardsSectionPage] = useState(1);
  const [unfiledSectionPage, setUnfiledSectionPage] = useState(1);
  const [workspaceSectionPage, setWorkspaceSectionPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(DEFAULT_SECTION_PAGE_SIZE);
  const [standardsPageSize, setStandardsPageSize] = useState(DEFAULT_SECTION_PAGE_SIZE);
  const [unfiledPageSize, setUnfiledPageSize] = useState(DEFAULT_SECTION_PAGE_SIZE);
  const [workspacePageSize, setWorkspacePageSize] = useState(DEFAULT_SECTION_PAGE_SIZE);
  const { user } = useAuthStore();
  const canDeleteProduct = user?.role === 'DIRECTOR' || user?.role === 'QUALITY_MANAGER';
  const canManageWorkspace = user?.role === 'DIRECTOR' || user?.role === 'QUALITY_MANAGER';
  const { standards, folders: allFolders, unfiled } = groupDocs(docs, products);
  // Active library shows only non-archived products; the Archived view shows only archived ones.
  // Status is driven by the product's real archivedAt, so a freshly-created (active) product never
  // leaks into the Archived list, and vice versa.
  const folders = allFolders.filter((f) =>
    archiveScope === 'product' ? !!f.product?.archivedAt : !f.product?.archivedAt,
  );

  useEffect(() => {
    if (!focusProductId) return;
    const target = folders.find((f) => f.product?.id === focusProductId) ?? null;
    if (target) {
      setProductModal(target);
      onFocusProductHandled?.();
    }
  }, [focusProductId, folders, onFocusProductHandled]);

  const workspaceRecords = useMemo(() => {
    if (storageOnly) return [];
    return unfiled.filter((d: any) => d.type === 'WORKSPACE_FILE');
  }, [unfiled, storageOnly]);

  const legacyUnfiled = useMemo(() => {
    if (storageOnly) return unfiled;
    return unfiled.filter((d: any) => d.type !== 'WORKSPACE_FILE');
  }, [unfiled, storageOnly]);

  useEffect(() => {
    setProductSectionPage(1);
    setStandardsSectionPage(1);
    setUnfiledSectionPage(1);
    setWorkspaceSectionPage(1);
  }, [docs]);

  useEffect(() => {
    setProductSectionPage(1);
  }, [productPageSize]);
  useEffect(() => {
    setStandardsSectionPage(1);
  }, [standardsPageSize]);
  useEffect(() => {
    setUnfiledSectionPage(1);
  }, [unfiledPageSize]);
  useEffect(() => {
    setWorkspaceSectionPage(1);
  }, [workspacePageSize]);

  const folderPage = useMemo(
    () => slicePage(folders, productSectionPage, productPageSize),
    [folders, productSectionPage, productPageSize],
  );
  const standardsPageSlice = useMemo(
    () => slicePage(standards, standardsSectionPage, standardsPageSize),
    [standards, standardsSectionPage, standardsPageSize],
  );
  const unfiledPageSlice = useMemo(
    () => slicePage(unfiled, unfiledSectionPage, unfiledPageSize),
    [unfiled, unfiledSectionPage, unfiledPageSize],
  );
  const workspacePageSlice = useMemo(
    () => slicePage(workspaceRecords, workspaceSectionPage, workspacePageSize),
    [workspaceRecords, workspaceSectionPage, workspacePageSize],
  );
  const legacyUnfiledPageSlice = useMemo(
    () => slicePage(legacyUnfiled, unfiledSectionPage, unfiledPageSize),
    [legacyUnfiled, unfiledSectionPage, unfiledPageSize],
  );

  const patchWorkspaceActive = async (docId: string, next: boolean) => {
    try {
      await documentApi.update(docId, { workspaceActive: next });
      toast.success(next ? 'Record is now active' : 'Record set to inactive');
      onDocsMutated?.();
    } catch {
      toast.error('Could not update status. Company Admin or Quality Manager only');
    }
  };

  const handleArchiveProduct = async (productId: string) => {
    const ok =
      confirmAction != null
        ? await confirmAction({
            title: 'Archive this product?',
            description:
              'All files in this folder move to Archived product documents. You can restore the product or permanently delete it from that view.',
            confirmLabel: 'Archive',
            variant: 'amber',
          })
        : typeof window !== 'undefined' &&
          window.confirm('Archive this product? Files will appear under Archived product documents.');
    if (!ok) return;
    try {
      await productApi.archive(productId);
      toast.success('Product archived');
      setProductModal(null);
      onDelete('__reload__');
    } catch {
      toast.error('Archive failed. Company Admin or Quality Manager may be required');
    }
  };


  /**
   * Permanent delete from the Archived products view. Irreversible and it takes
   * the product's documents with it, so the confirmation is explicit and typed
   * red rather than the amber used for archiving.
   */
  const handleDeleteArchivedProduct = async (product: any) => {
    const label = String(product?.name ?? 'this product').trim() || 'this product';
    const ok =
      confirmAction != null
        ? await confirmAction({
            title: `Delete ${label} permanently?`,
            description:
              'This removes the archived product and its documents for good. ' +
              'It cannot be undone. Use Restore instead if you may still need it.',
            confirmLabel: 'Delete permanently',
            variant: 'destructive',
          })
        : typeof window !== 'undefined' &&
          window.confirm(`Delete ${label} permanently? This cannot be undone.`);
    if (!ok) return;
    try {
      await productApi.delete(product.id);
      toast.success('Product deleted permanently');
      setProductModal(null);
      onDelete('__reload__');
    } catch {
      toast.error('Delete failed. Company Admin or Quality Manager may be required');
    }
  };

  const showProduct = viewFilter !== 'standard';
  const showStandard = viewFilter !== 'product';
  const isEmpty =
    viewFilter === 'product'
      ? folders.length === 0
      : viewFilter === 'standard'
        ? standards.length === 0
        : standards.length === 0 && folders.length === 0 && unfiled.length === 0;
  if (archiveScope !== 'none' && isEmpty) {
    return null;
  }
  if (isEmpty) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-12 text-center">
        <Upload className="mx-auto mb-3 h-14 w-14 text-[#919eab]" />
        <p className="text-base font-semibold text-[var(--muted)]">No documents yet</p>
        <p className="mt-1 text-sm text-[#919eab]">Click &quot;Upload&quot; to add your first document</p>
      </div>
    );
  }

  return (
    <div>
      {showProduct && folders.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            {archiveScope === 'product' ? 'Archived product folders' : 'Product folders'}
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/60">
            <div className="max-w-full overflow-x-auto">
              <Table className="w-full min-w-[860px]">
                <TableHeader>
                  <TableRow className="border-b border-[var(--border)] bg-[var(--page-bg)]/40 hover:bg-[var(--page-bg)]/40">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Reference</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Title</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Category</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Effective date</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Status</TableHead>
                    <TableHead className="w-[120px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folderPage.map((folder) => {
                    const extracted = getBestProductCategoryFromDocs(folder.docs);
                    const showCat = extracted !== '-' ? extracted : folder.product.categoryTags?.[0] || '-';
                    const isArchived = !!folder.product.archivedAt;
                    return (
                      <TableRow
                        key={folder.product.id}
                        className="cursor-pointer border-b border-[var(--border)]/40 transition-colors hover:bg-[var(--page-bg)]/40"
                        onDoubleClick={() => setProductModal(folder)}
                      >
                        <TableCell className="font-mono text-sm text-[var(--text-primary)]">
                          {folder.product.reference || folder.product.sku || '-'}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate font-semibold text-[var(--text-primary)]" title={folder.product.name}>
                          {folder.product.name}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-[var(--muted)]" title={String(showCat)}>
                          {showCat}
                        </TableCell>
                        <TableCell className="text-sm text-[var(--muted)]">
                          {folder.product.createdAt
                            ? new Date(folder.product.createdAt).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                              isArchived
                                ? 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
                                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                            )}
                          >
                            {isArchived ? 'Archived' : 'Active'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <div className="flex w-full items-center justify-end gap-0.5" dir="ltr">
                            {archiveScope === 'none' && canDeleteProduct && onEditProductInWizard && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={DOC_ROW_NEUTRAL_BTN}
                                title="Edit product (opens the wizard)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditProductInWizard(folder.product);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {archiveScope === 'none' && canDeleteProduct && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md border border-red-500/30 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                                title="Delete product (moves it to Archived products)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleArchiveProduct(folder.product.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                              </Button>
                            )}
                            {/* Archived products can be deleted for good; the handler
                                asks for confirmation before anything is removed. */}
                            {isArchived && canDeleteProduct && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md border border-red-500/30 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                                title="Delete permanently (cannot be undone)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteArchivedProduct(folder.product);
                                }}
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={DOC_ROW_NEUTRAL_BTN}
                              title="View product (read-only)"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductModal(folder);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <SectionPagination
            className="mt-1"
            variant="amber"
            activeStyle="prime"
            page={productSectionPage}
            onPageChange={setProductSectionPage}
            totalItems={folders.length}
            pageSize={productPageSize}
            onPageSizeChange={setProductPageSize}
            rowsPerPageOptions={[5, 10, 20, 30]}
          />

          <ViewProductModal
            open={productModal !== null}
            onClose={() => setProductModal(null)}
            folder={productModal}
            onViewFile={(doc, siblings) => onViewDocument(doc, siblings)}
            onDownloadFile={onDownload}
            readOnly
            onArchiveFile={user?.role === 'DIRECTOR' ? (id) => onDelete(id) : undefined}
            onUploaded={async () => {
              if (!productModal?.product?.id) return;
              try {
                const res = await documentApi.list({ productId: productModal.product.id });
                const freshDocs = res.data ?? [];
                setProductModal((prev) => prev ? { ...prev, docs: freshDocs } : null);
              } catch { /* ignore */ }
            }}
            nameMap={nameMap}
            userAvatarKeyById={userAvatarKeyById}
          />
        </div>
      )}

      {showStandard && standards.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            {archiveScope === 'standard' ? 'Archived standard documents' : 'Standard documents'}
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/60">
            <div className="max-w-full overflow-x-auto">
              <Table className="w-full min-w-[820px]">
                <TableHeader>
                  <TableRow className="border-b border-[var(--border)] bg-[var(--page-bg)]/40 hover:bg-[var(--page-bg)]/40">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Reference</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Title</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Category</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Effective date</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Status</TableHead>
                    <TableHead className="w-[120px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standardsPageSlice.map((doc) => (
                    <TableRow
                      key={doc.id}
                      {...(archiveScope === 'none' ? attachDocDrag(doc.id, doc.name) : {})}
                      className={cn(
                        'cursor-pointer border-b border-[var(--border)]/40 transition-colors hover:bg-[var(--page-bg)]/40',
                        archiveScope === 'none' && 'cursor-grab active:cursor-grabbing',
                      )}
                      onDoubleClick={() => onViewDocument(doc, standards)}
                    >
                      <TableCell className="font-mono text-sm text-[var(--text-primary)]">{doc.isoStandard || '-'}</TableCell>
                      <TableCell className="max-w-[260px] truncate font-semibold text-[var(--text-primary)]" title={doc.name}>
                        {doc.name}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-[var(--muted)]" title={getExtractedCategory(doc)}>
                        {getExtractedCategory(doc)}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted)]">
                        {doc.effectiveDate
                          ? new Date(doc.effectiveDate).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            doc.libraryStatus === 'ARCHIVED'
                              ? 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
                              : doc.libraryStatus === 'PROCESSING'
                                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                          )}
                        >
                          {libraryLabel(doc.libraryStatus)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <StandardListRowActions
                          archivedStandard={archiveScope === 'standard'}
                          onRestore={() => onRestoreArchived?.(doc.id)}
                          onPurge={() => onPurgeArchived?.(doc.id)}
                          onView={() => onViewDocument(doc, standards)}
                          onDownload={() => onDownload(doc.id, doc.name)}
                          onDelete={() => onDelete(doc.id)}
                          onHardDelete={
                            archiveScope === 'none'
                              ? () => onDelete(doc.id)
                              : undefined
                          }
                          onUploadVersion={(file) => onUploadVersion?.(doc.id, file)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <SectionPagination
            className="mt-2"
            variant="blue"
            activeStyle="prime"
            page={standardsSectionPage}
            onPageChange={setStandardsSectionPage}
            totalItems={standards.length}
            pageSize={standardsPageSize}
            onPageSizeChange={setStandardsPageSize}
            rowsPerPageOptions={[6, 10, 20, 30]}
          />
        </div>
      )}

      {showProduct && storageOnly && unfiled.length > 0 && viewFilter === 'all' && (
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">Files in this folder</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/60">
            <div className="max-w-full overflow-x-auto">
              <Table className="w-full min-w-[820px]">
                <TableHeader>
                  <TableRow className="border-b border-[var(--border)] bg-[var(--page-bg)]/40 hover:bg-[var(--page-bg)]/40">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Reference</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Title</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Category</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Effective date</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Status</TableHead>
                    <TableHead className="w-[120px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unfiledPageSlice.map((doc) => (
                    <TableRow
                      key={doc.id}
                      {...attachDocDrag(doc.id, doc.name)}
                      className="cursor-grab border-b border-[var(--border)]/40 transition-colors hover:bg-[var(--page-bg)]/40 active:cursor-grabbing"
                      onDoubleClick={() => onViewDocument(doc, unfiled)}
                    >
                      <TableCell className="font-mono text-sm text-[var(--text-primary)]">{doc.isoStandard || '-'}</TableCell>
                      <TableCell className="max-w-[260px] truncate font-semibold text-[var(--text-primary)]" title={doc.name}>
                        {doc.name}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-[var(--muted)]" title={getExtractedCategory(doc)}>
                        {getExtractedCategory(doc)}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted)]">
                        {doc.effectiveDate
                          ? new Date(doc.effectiveDate).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            doc.libraryStatus === 'ARCHIVED'
                              ? 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
                              : doc.libraryStatus === 'PROCESSING'
                                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                          )}
                        >
                          {libraryLabel(doc.libraryStatus)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <div className="flex w-full items-center justify-end gap-0.5" dir="ltr">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_NEUTRAL_BTN}
                            title="View"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewDocument(doc, unfiled);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_NEUTRAL_BTN}
                            title="Download"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownload(doc.id, doc.name);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_ARCHIVE_BTN}
                            title="Archive document (restorable from Archived documents)"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(doc.id);
                            }}
                          >
                            <Archive className="h-4 w-4" strokeWidth={2.25} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md border border-red-500/30 bg-red-500/8 text-red-700 hover:bg-red-500/15 dark:text-red-400"
                            title="Move document to Trash (restorable)"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(doc.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <SectionPagination
            className="mt-2"
            variant="indigo"
            activeStyle="prime"
            page={unfiledSectionPage}
            onPageChange={setUnfiledSectionPage}
            totalItems={unfiled.length}
            pageSize={unfiledPageSize}
            onPageSizeChange={setUnfiledPageSize}
            rowsPerPageOptions={[6, 10, 20, 30]}
          />
        </div>
      )}

      {showProduct && !storageOnly && workspaceRecords.length > 0 && viewFilter === 'all' && (
        <div className="mb-8">
          <h2 className="mb-1 text-base font-semibold text-[var(--text-primary)]">Other documents</h2>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Download the original file; Edit opens Google Docs or Sheets with the file saved to Downloads so you can open it
            there. Company Admin or Quality Manager can activate records and permanently delete a row.
          </p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/60">
            <div className="max-w-full overflow-x-auto">
              <Table className="w-full min-w-[960px]">
                <TableHeader>
                  <TableRow className="border-b border-[var(--border)] bg-[var(--page-bg)]/40 hover:bg-[var(--page-bg)]/40">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">File</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Product</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Category</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Date added</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Status</TableHead>
                    <TableHead className="w-[200px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspacePageSlice.map((doc: any) => (
                    <TableRow
                      key={doc.id}
                      className="border-b border-[var(--border)]/40 transition-colors hover:bg-[var(--page-bg)]/40"
                      onDoubleClick={() => onDownload(doc.id, doc.name)}
                    >
                      <TableCell className="max-w-[200px] truncate text-sm font-semibold text-[var(--text-primary)]" title={doc.name}>
                        {doc.name}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-[var(--text-primary)]" title={doc.product?.name}>
                        {doc.product?.name ?? '-'}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm text-[var(--muted)]" title={doc.workspaceCategory}>
                        {doc.workspaceCategory ?? '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-[var(--muted)]">
                        {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            doc.workspaceActive
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                              : 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
                          )}
                        >
                          {doc.workspaceActive ? 'Active' : 'Not active'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-0.5" dir="ltr">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_NEUTRAL_BTN}
                            title="Download file"
                            onClick={() => onDownload(doc.id, doc.name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_NEUTRAL_BTN}
                            title="Edit in Google Docs or Sheets (downloads file, opens new Google tab)"
                            onClick={() =>
                              void openGoogleEditorFromWorkspaceFile(async () => {
                                const res = await documentApi.getDownload(doc.id);
                                return {
                                  blob: res.data as Blob,
                                  fileName: doc.name ?? 'document',
                                  mimeType: doc.mimeType || '',
                                };
                              })
                            }
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {canManageWorkspace && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={DOC_ROW_NEUTRAL_BTN}
                              title={doc.workspaceActive ? 'Set inactive' : 'Activate'}
                              onClick={() => void patchWorkspaceActive(doc.id, !doc.workspaceActive)}
                            >
                              {doc.workspaceActive ? <CircleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                            </Button>
                          )}
                          {onPurgeWorkspaceFile && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={DOC_ROW_WORKSPACE_DELETE_BTN}
                              title="Delete permanently"
                              onClick={() => onPurgeWorkspaceFile(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <SectionPagination
            className="mt-2"
            variant="indigo"
            activeStyle="prime"
            page={workspaceSectionPage}
            onPageChange={setWorkspaceSectionPage}
            totalItems={workspaceRecords.length}
            pageSize={workspacePageSize}
            onPageSizeChange={setWorkspacePageSize}
            rowsPerPageOptions={[6, 10, 20, 30]}
          />
        </div>
      )}

      {showProduct && !storageOnly && legacyUnfiled.length > 0 && viewFilter === 'all' && (
        <div className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            {workspaceRecords.length > 0 ? 'Additional library files' : 'Other documents'}
          </h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/60">
            <div className="max-w-full overflow-x-auto">
              <Table className="w-full min-w-[820px]">
                <TableHeader>
                  <TableRow className="border-b border-[var(--border)] bg-[var(--page-bg)]/40 hover:bg-[var(--page-bg)]/40">
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Reference</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Title</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Category</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Effective date</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Status</TableHead>
                    <TableHead className="w-[120px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legacyUnfiledPageSlice.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer border-b border-[var(--border)]/40 transition-colors hover:bg-[var(--page-bg)]/40"
                      onDoubleClick={() => onViewDocument(doc, legacyUnfiled)}
                    >
                      <TableCell className="font-mono text-sm text-[var(--text-primary)]">{doc.isoStandard || '-'}</TableCell>
                      <TableCell className="max-w-[260px] truncate font-semibold text-[var(--text-primary)]" title={doc.name}>
                        {doc.name}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-[var(--muted)]" title={getExtractedCategory(doc)}>
                        {getExtractedCategory(doc)}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted)]">
                        {doc.effectiveDate
                          ? new Date(doc.effectiveDate).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            doc.libraryStatus === 'ARCHIVED'
                              ? 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'
                              : doc.libraryStatus === 'PROCESSING'
                                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                          )}
                        >
                          {libraryLabel(doc.libraryStatus)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <div className="flex w-full items-center justify-end gap-0.5" dir="ltr">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_NEUTRAL_BTN}
                            title="View"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewDocument(doc, legacyUnfiled);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_NEUTRAL_BTN}
                            title="Download"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownload(doc.id, doc.name);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={DOC_ROW_ARCHIVE_BTN}
                            title="Archive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(doc.id);
                            }}
                          >
                            <Archive className="h-4 w-4" strokeWidth={2.25} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <SectionPagination
            className="mt-2"
            variant="indigo"
            activeStyle="prime"
            page={unfiledSectionPage}
            onPageChange={setUnfiledSectionPage}
            totalItems={legacyUnfiled.length}
            pageSize={unfiledPageSize}
            onPageSizeChange={setUnfiledPageSize}
            rowsPerPageOptions={[6, 10, 20, 30]}
          />
        </div>
      )}
    </div>
  );
}

// ─── Upload flow: upload → AI extraction (no evaluation step) ───────────────────

const UPLOAD_FLOW_LABELS = ['Upload files', 'AI extraction'] as const;
type UploadPhase = 'upload' | 'extracting' | 'complete';

function UploadFlowStepper({ phase }: { phase: UploadPhase }) {
  return (
    <div className="mb-3 flex w-full items-start justify-center gap-0 px-1 sm:gap-1">
      {([1, 2] as const).map((n, idx) => {
        const isDone =
          (n === 1 && phase !== 'upload') || (n === 2 && phase === 'complete');
        const isActive =
          (n === 1 && phase === 'upload') || (n === 2 && phase === 'extracting');
        return (
          <React.Fragment key={n}>
            <div className="flex max-w-[110px] flex-col items-center gap-1 sm:max-w-[130px]">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                  isDone &&
                    'border-[#1c3a5f] bg-[#1c3a5f] text-white dark:border-[var(--brand-primary)] dark:bg-[var(--brand-primary)]',
                  isActive &&
                    'border-[var(--brand-accent)] bg-[var(--brand-primary)] text-white shadow-[0_0_0_2px_rgba(255,193,7,0.25)]',
                  !isDone &&
                    !isActive &&
                    'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
                )}
              >
                {isDone ? <Check className="h-4 w-4 stroke-[2.5]" /> : n}
              </div>
              <span
                className={cn(
                  'text-center text-[10px] font-semibold leading-tight sm:text-[11px]',
                  phase === 'upload' && n === 2 ? 'text-[var(--muted)]' : 'text-[var(--text-primary)]'
                )}
              >
                {UPLOAD_FLOW_LABELS[n - 1]}
              </span>
            </div>
            {idx < 1 && (
              <div
                className={cn(
                  'mx-0.5 mt-4 h-[3px] min-w-[24px] flex-1 rounded-full sm:mx-1',
                  phase !== 'upload' ? 'bg-[var(--brand-primary)]' : 'bg-[var(--border)]'
                )}
                aria-hidden
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Upload Dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onClose,
  onDone,
  onRunInBackground,
  preset = 'full',
  resumeIds,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  /** Called when user closes dialog during extraction to continue in background; receives polling IDs */
  onRunInBackground?: (ids: string[]) => void;
  /** full = dashboard / all documents (choose type); standard / product = sidebar context, no type switch */
  preset?: 'full' | 'standard' | 'product';
  /** When provided AND non-empty, dialog opens directly in extracting phase to track these IDs. */
  resumeIds?: string[];
}) {
  const { user } = useAuthStore();
  const canUploadStandard = user?.role === 'QUALITY_MANAGER' || user?.role === 'DIRECTOR';
  const [docType, setDocType] = useState<'PRODUCT_DOC' | 'ISO_NORM'>('PRODUCT_DOC');
  const [productName, setProductName] = useState('');
  const [isoId, setIsoId] = useState('');
  const [description, setDescription] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [statuses, setStatuses] = useState<Record<string, 'uploading' | 'done' | 'error'>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>(
    resumeIds && resumeIds.length > 0 ? 'extracting' : 'upload',
  );
  const [ocrPollIds, setOcrPollIds] = useState<string[] | null>(
    resumeIds && resumeIds.length > 0 ? resumeIds : null,
  );

  // When the dialog is (re)opened with resumeIds, jump straight to extracting phase
  useEffect(() => {
    if (open && resumeIds && resumeIds.length > 0 && phase === 'upload') {
      setOcrPollIds(resumeIds);
      setPhase('extracting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumeIds]);

  const fileRef = useRef<HTMLInputElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const isUploading = Object.values(statuses).some((s) => s === 'uploading');

  useEffect(() => {
    if (!canUploadStandard && docType === 'ISO_NORM') setDocType('PRODUCT_DOC');
  }, [canUploadStandard, docType]);

  useEffect(() => {
    if (!open || preset !== 'full') return;
    setDocType('PRODUCT_DOC');
  }, [open, preset]);

  const reset = () => {
    setPhase('upload');
    setDocType('PRODUCT_DOC');
    setProductName('');
    setIsoId('');
    setDescription('');
    setQueuedFiles([]);
    setStatuses({});
    setIsDragOver(false);
    setOcrPollIds(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleRunInBackground = () => {
    if (ocrPollIds?.length && onRunInBackground) {
      onRunInBackground(ocrPollIds);
    }
    reset();
    onClose();
  };

  const addFiles = (files: File[]) => {
    const maxBytes = 50 * 1024 * 1024;

    if (uploadType === 'ISO_NORM') {
      const pdf = files.find(
        (f) => (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) && f.size <= maxBytes,
      );
      if (!pdf) {
        toast.error('Standard uploads must be a single PDF (max 50 MB).');
        return;
      }
      setQueuedFiles([pdf]);
      return;
    }

    const ALLOWED = /\.(pdf|doc|docx|xlsx|jpe?g|png|tiff?)$/i;
    const valid = files.filter((f) => ALLOWED.test(f.name) && f.size <= maxBytes);
    const skipped = files.length - valid.length;

    setQueuedFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const toAdd = valid.filter((f) => !names.has(f.name));
      const addedCount = toAdd.length;

      queueMicrotask(() => {
        if (addedCount === 0 && skipped > 0) {
          toast.error(
            'This file type is not supported or the file is over 50 MB. Use PDF, Word, Excel, or images (JPEG, PNG, TIFF).',
          );
          return;
        }
        if (addedCount > 0 && skipped > 0) {
          toast(
            `Added ${addedCount} file(s). ${skipped} file(s) were not added. Only PDF, Word, Excel, and images up to 50 MB are allowed.`,
          );
        } else if (addedCount > 0) {
          toast.success(`${addedCount} file(s) added to the queue`);
        }
      });

      return [...prev, ...toAdd];
    });
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const items = Array.from(e.dataTransfer.items);
    const entries = items.map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[];
    const all = (await Promise.all(entries.map(collectFilesFromEntry))).flat();
    if (all.length === 0) {
      toast.error('No files detected. Drop PDF, Word, Excel, or image files.');
      return;
    }
    addFiles(all);
  }, []);

  const uploadType: 'PRODUCT_DOC' | 'ISO_NORM' =
    preset === 'standard' ? 'ISO_NORM' : preset === 'product' ? 'PRODUCT_DOC' : docType;

  const handleUpload = async () => {
    if (uploadType === 'ISO_NORM' && !canUploadStandard) {
      return toast.error('Only Quality Manager or Company Admin can upload standard (ISO) documents.');
    }
    if (queuedFiles.length === 0) return toast.error('Add at least one file');
    if (uploadType === 'PRODUCT_DOC' && !productName.trim()) return toast.error('Product name is required');
    if (uploadType === 'ISO_NORM' && !isoId.trim()) return toast.error('Standard title is required');
    if (uploadType === 'ISO_NORM') {
      const nonPdf = queuedFiles.filter((f) => !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf');
      if (nonPdf.length) {
        return toast.error(
          `Standard documents must be PDF. Remove: ${nonPdf.map((f) => f.name).join(', ')}`,
        );
      }
    }

    const uploading: Record<string, 'uploading'> = {};
    queuedFiles.forEach((f) => {
      uploading[f.name] = 'uploading';
    });
    setStatuses(uploading);

    try {
      const form = new FormData();
      queuedFiles.forEach((f) => form.append('files', f));
      form.append('type', uploadType);
      form.append('description', description);
      if (uploadType === 'PRODUCT_DOC') form.append('productName', productName.trim());
      if (uploadType === 'ISO_NORM') {
        const standardTitle = isoId.trim();
        const standardCategory = /^EN\b/i.test(standardTitle) ? 'EN' : 'ISO_NORM';
        form.append('title', standardTitle);
        form.append('standardCategory', standardCategory);
      }
      const res = await documentApi.upload(form);
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : [raw];
      const done: Record<string, 'done'> = {};
      queuedFiles.forEach((f) => {
        done[f.name] = 'done';
      });
      setStatuses(done);
      toast.success(`${list.length} file(s) uploaded`);
      onDoneRef.current();
      const ids = list.map((u: { id?: string }) => u.id).filter(Boolean) as string[];
      if (ids.length) {
        // Keep dialog open in the "extracting" phase so the user can watch the
        // AI extraction progress directly. Also register IDs with the global
        // provider so the floating widget keeps tracking across navigation.
        setOcrPollIds(ids);
        setPhase('extracting');
        if (onRunInBackground) onRunInBackground(ids);
      } else {
        setPhase('complete');
      }
    } catch (err) {
      const failedStatuses: Record<string, 'error'> = {};
      queuedFiles.forEach((f) => {
        failedStatuses[f.name] = 'error';
      });
      setStatuses(failedStatuses);
      toast.error(getApiErrorMessage(err, 'Upload failed'));
    }
  };

  useEffect(() => {
    if (phase !== 'extracting' || !ocrPollIds?.length) return;
    let cancelled = false;
    const check = async () => {
      try {
        const states = await Promise.all(ocrPollIds.map((id) => documentApi.get(id)));
        if (cancelled) return;
        const terminal = states.every((s) => {
          const st = s.data?.status as string | undefined;
          return st === 'READY' || st === 'FAILED';
        });
        if (terminal) {
          setPhase('complete');
          onDoneRef.current();
          setOcrPollIds(null);
        }
      } catch {
        /* keep polling until timeout */
      }
    };
    void check();
    const iv = setInterval(check, 5000);
    const timeout = setTimeout(() => {
      clearInterval(iv);
      if (!cancelled) {
        setPhase('complete');
        onDoneRef.current();
        setOcrPollIds(null);
      }
    }, 180_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(timeout);
    };
  }, [phase, ocrPollIds]);

  const dialogTitle =
    phase === 'upload'
      ? preset === 'standard'
        ? 'Upload standard (PDF)'
        : preset === 'product'
          ? 'Upload product documents'
          : 'Upload documents'
      : phase === 'extracting'
        ? 'AI extraction & structuring'
        : 'Documents ready';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4 text-left">
          <DialogTitle className="text-lg font-bold">{dialogTitle}</DialogTitle>
          {phase === 'upload' ? (
            <DialogDescription className="text-left">
              {preset === 'standard'
                ? 'Enter the standard title, then add one PDF.'
                : preset === 'product'
                  ? 'Name the product folder, then drop files or an entire folder.'
                  : 'Choose the document type, complete the fields, then add your files.'}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="shrink-0 border-b border-[var(--border)] px-4 pt-4 sm:px-6">
          <UploadFlowStepper phase={phase} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {phase === 'upload' ? (
        <div className="space-y-5 px-6 py-5">
          {preset === 'full' && (
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Document type
              </Label>
              <div className={cn('grid gap-2', canUploadStandard ? 'grid-cols-2' : 'grid-cols-1')}>
                <button
                  type="button"
                  onClick={() => setDocType('PRODUCT_DOC')}
                  className={cn(
                    'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-hover',
                    docType === 'PRODUCT_DOC'
                      ? 'border-[var(--brand-primary)] bg-[var(--nav-hover)] text-[var(--brand-primary)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--topbar-hover)]'
                  )}
                >
                  <Package className="h-4 w-4" />
                  Product Document
                </button>
                {canUploadStandard && (
                  <button
                    type="button"
                    onClick={() => setDocType('ISO_NORM')}
                    className={cn(
                      'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-hover',
                      docType === 'ISO_NORM'
                        ? 'border-[var(--brand-primary)] bg-[var(--nav-hover)] text-[var(--brand-primary)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--topbar-hover)]'
                    )}
                  >
                    <BookOpen className="h-4 w-4" />
                    ISO Standard
                  </button>
                )}
              </div>
              {!canUploadStandard && (
                <p className="text-xs text-[var(--muted)]">
                  Only Quality Manager or Company Admin can upload standard (PDF) documents. You can still upload product files.
                </p>
              )}
            </div>
          )}

          {preset === 'standard' && !canUploadStandard ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-[var(--muted)]">
              Only Quality Manager or Company Admin can upload standard documents. Open Product documents to upload files to a product folder.
            </p>
          ) : null}

          {uploadType === 'PRODUCT_DOC' ? (
            <div>
              <Label htmlFor="productName">Product Name *</Label>
              <Input
                id="productName"
                autoFocus
                placeholder="e.g. Widget A, Safety Harness Pro"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">Files will be grouped under this product folder</p>
            </div>
          ) : (
            <div>
              <Label htmlFor="isoId">Standard title *</Label>
              <Input
                id="isoId"
                autoFocus
                placeholder="e.g. EN 60204-1:2018"
                value={isoId}
                onChange={(e) => setIsoId(e.target.value)}
              />
            </div>
          )}

          {uploadType !== 'ISO_NORM' && (
            <div>
              <Label htmlFor="desc" className="text-xs">
                Description <span className="font-normal text-[var(--muted)]">(optional)</span>
              </Label>
              <Textarea
                id="desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[52px] max-h-[72px] resize-y py-2 text-sm leading-snug"
              />
            </div>
          )}

          <LibraryUploadDropSurface
            isDragOver={isDragOver}
            disabled={isUploading}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (isUploading) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            minHeightClass={queuedFiles.length > 0 && !isDragOver ? 'min-h-[160px]' : 'min-h-[180px]'}
          >
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple={uploadType !== 'ISO_NORM'}
              accept={
                uploadType === 'ISO_NORM'
                  ? '.pdf,application/pdf'
                  : '.pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png,.tiff'
              }
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
            {isDragOver ? (
              <>
                <FloatingUploadBrandIcon />
                <div className="mt-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Drop files or folder here</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {uploadType === 'ISO_NORM' ? 'PDF only · max 50 MB each' : 'PDF, Word, XLSX, images · max 50 MB each'}
                  </p>
                </div>
              </>
            ) : queuedFiles.length > 0 ? (
              <div className="relative flex flex-col items-center gap-1.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--brand-primary)]/12 text-[var(--brand-primary)]">
                  <FileText className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {queuedFiles.length} file(s) ready
                </p>
                <p className="text-[11px] text-[var(--muted)]">Click the area to add more</p>
              </div>
            ) : (
              <>
                <FloatingUploadBrandIcon />
                <div className="mt-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {uploadType === 'ISO_NORM'
                      ? 'Drag & drop a PDF or click to browse'
                      : 'Drag & drop files or a folder, or click to browse'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {uploadType === 'ISO_NORM'
                      ? 'PDF only · max 50 MB · single file'
                      : 'PDF, Word, XLSX, JPEG, PNG, TIFF · max 50 MB per file'}
                  </p>
                </div>
              </>
            )}
          </LibraryUploadDropSurface>

          {queuedFiles.length > 0 && (
            <div className="max-h-[180px] overflow-y-auto rounded-lg border border-[var(--border)]">
              {queuedFiles.map((f, i) => {
                const st = statuses[f.name];
                return (
                  <div
                    key={f.name + i}
                    className={cn(
                      'flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 last:border-b-0',
                      i === queuedFiles.length - 1 && 'last:border-b-0'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0">{getMimeIcon(f.type)}</span>
                      <div className="min-w-0">
                        <p className="max-w-[270px] truncate text-xs text-[var(--text-primary)]">{f.name}</p>
                        <p className="text-xs text-[var(--muted)]">{formatBytes(f.size)}</p>
                      </div>
                    </div>
                    {!st && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setQueuedFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {st === 'uploading' && (
                      <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
                    )}
                    {st === 'done' && <CircleCheck className="h-4 w-4 shrink-0 text-[#118d57]" />}
                    {st === 'error' && <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        ) : phase === 'extracting' ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <QurelioSpinner size={88} className="mb-5" />
            <p className="font-semibold text-[var(--text-primary)]">AI extraction in progress</p>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-[var(--muted)] sm:text-sm">
              We extract text (including from images), then structure it with AI. Large files can take a few minutes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <CircleCheck className="mb-4 h-12 w-12 text-[#118d57]" aria-hidden />
            <p className="font-semibold text-[var(--text-primary)]">Documents are ready</p>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-[var(--muted)] sm:text-sm">
              You can close this dialog and open a document from the list to review extracted content.
            </p>
          </div>
        )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-[var(--border)] px-6 py-4">
          {phase === 'upload' ? (() => {
            const disabledReason: string | null =
              uploadType === 'ISO_NORM' && !canUploadStandard
                ? 'Only Quality Manager or Company Admin can upload standard (ISO) documents.'
                : queuedFiles.length === 0
                  ? 'Add at least one file before uploading.'
                  : uploadType === 'PRODUCT_DOC' && !productName.trim()
                    ? 'Product name is required.'
                    : uploadType === 'ISO_NORM' && !isoId.trim()
                      ? 'ISO Standard ID is required.'
                      : null;
            const blocked = !!disabledReason;
            return (
              <>
                <Button type="button" variant="outline" disabled={isUploading} onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isUploading}
                  aria-disabled={blocked}
                  onClick={() => {
                    if (blocked) {
                      toast.error(disabledReason!);
                      return;
                    }
                    void handleUpload();
                  }}
                  className={cn('gap-2', blocked && 'opacity-50 hover:opacity-60')}
                  title={disabledReason ?? 'Upload selected files'}
                >
                  {isUploading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Uploading {Object.values(statuses).filter((s) => s === 'done').length}/{queuedFiles.length}…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload{queuedFiles.length > 0 ? ` (${queuedFiles.length})` : ''}
                    </>
                  )}
                </Button>
              </>
            );
          })() : phase === 'extracting' ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto gap-2"
                onClick={handleRunInBackground}
              >
                Close
              </Button>
            </>
          ) : (
            <Button type="button" className="w-full sm:ml-auto sm:w-auto" onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ─── Main Page ─────────────────────────────────────────────────────────────────

function DocumentsPageContent({
  docView,
  archiveScope,
  customFolderId,
  searchView,
  searchArchive,
}: {
  docView: 'all' | 'product' | 'standard';
  archiveScope: 'none' | 'standard' | 'product';
  customFolderId: string | null;
  searchView: string | null;
  searchArchive: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pageMeta = getPageMeta(pathname || FILE_LIBRARY_PATH, searchView);
  const { user } = useAuthStore();
  const [tab, setTab] = useState('0');
  const [myDocs, setMyDocs] = useState<any[]>([]);
  const [sharedDocs, setSharedDocs] = useState<any[]>([]);
  const [archivedStandards, setArchivedStandards] = useState<any[]>([]);
  const [archivedProducts, setArchivedProducts] = useState<any[]>([]);
  // Archived product *entities* (not their docs): powers the view-only Archived product folders list.
  const [archivedProductList, setArchivedProductList] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  // Start false: loadDocs only runs when user?.id exists; otherwise we'd stay "loading" forever
  // (persist hydration delay or missing id on user).
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [productWizardOpen, setProductWizardOpen] = useState(false);
  // When set, the wizard opens in edit mode for this product; null = create flow.
  const [wizardEditProduct, setWizardEditProduct] = useState<any | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  // Global extraction progress (persists across navigation, rendered in DashboardLayout)
  const extraction = useExtractionProgress();
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const loadDocsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [addToFolderOpen, setAddToFolderOpen] = useState(false);
  const [viewer, setViewer] = useState<{
    currentId: string;
    siblings: { id: string; name: string }[];
  } | null>(null);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);

  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const companyId = user?.companyId || user?.company?.id;
  const {
    ready: foldersReady,
    folders: customFolders,
    assignedDocumentIds,
    createFolder,
    removeFolder,
    addDocumentToFolder,
    removeDocumentFromFolder,
    getFolder,
  } = useCustomFileFolders(companyId);
  const { nameMap: companyNameMap, userAvatarKeyById: companyUserAvatarKeyById } = useCompanyUserNameMap();
  const [simpleFolderFiles, setSimpleFolderFiles] = useState<File[]>([]);
  const [simpleFolderUploading, setSimpleFolderUploading] = useState(false);
  const [folderAddDragOver, setFolderAddDragOver] = useState(false);
  const folderAddFileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [myRes, sharedRes, archStdRes, archProdRes, productsRes, archProdListRes] = await Promise.all([
        documentApi.list({ uploadedBy: user.id }),
        documentApi.list(),
        documentApi.list({ type: 'ISO_NORM', includeArchived: true, libraryStatus: 'ARCHIVED' }),
        documentApi.list({
          includeArchived: true,
          archivedOnly: true,
          excludeType: 'ISO_NORM',
          hasProduct: true,
        }),
        productApi.list().catch(() => ({ data: [] })),
        productApi.listArchived().catch(() => ({ data: [] })),
      ]);
      setMyDocs(myRes.data);
      setSharedDocs(sharedRes.data);
      setArchivedStandards(archStdRes.data ?? []);
      setArchivedProducts(archProdRes.data ?? []);
      setAllProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      setArchivedProductList(Array.isArray(archProdListRes.data) ? archProdListRes.data : []);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // The global TrashFabGlobal lives in DashboardLayout; when something is dropped,
  // restored, or purged from there, refresh our active/archived lists so the UI stays in sync.
  useEffect(() => {
    const handler = () => void loadDocs();
    window.addEventListener('qurelio:trash-changed', handler);
    return () => window.removeEventListener('qurelio:trash-changed', handler);
  }, [loadDocs]);

  /** Full library list + id lookup: merge without duplicates (my uploads appear in both API responses). */
  const allDocsById = useMemo(() => {
    const m = new Map<string, (typeof myDocs)[number]>();
    for (const d of myDocs) m.set(d.id, d);
    for (const d of sharedDocs) m.set(d.id, d);
    return m;
  }, [myDocs, sharedDocs]);

  const allDocs = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof myDocs = [];
    for (const d of sharedDocs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
    for (const d of myDocs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
    return out;
  }, [myDocs, sharedDocs]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    void loadDocs();
  }, [user?.id, loadDocs]);

  // Keep loadDocsRef in sync so the background polling effect can call it without re-running
  useEffect(() => {
    loadDocsRef.current = loadDocs;
  }, [loadDocs]);

  // When the global extraction progress finishes, refresh the docs list
  useEffect(() => {
    if (!extraction.done) return;
    toast.success('AI extraction complete. Your documents are ready to review.');
    void loadDocsRef.current();
  }, [extraction.done]);

  // Auto-reopen the upload dialog when navigating back to products management
  // while an extraction is still running globally: keeps the main popup visible.
  useEffect(() => {
    if (
      docView === 'product' &&
      extraction.scope === 'product' &&
      extraction.ids.length > 0 &&
      !uploadOpen
    ) {
      setUploadOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docView, extraction.scope, extraction.ids.length]);

  const handleDownload = async (id: string, fileName?: string) => {
    const base = (fileName || 'document').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'document';
    const hasExt = /\.[a-z0-9]{2,8}$/i.test(base);
    try {
      const res = await documentApi.getDownload(id);
      const blob = res.data as Blob;
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error('Empty file');
      if (blob.size < 12_000) {
        const probe = (await blob.slice(0, 2).text()).trimStart();
        if (probe.startsWith('{') || probe.startsWith('[')) {
          const text = await blob.text();
          let msg = 'Server did not return a file (check access and try again).';
          try {
            const j = JSON.parse(text) as { message?: string };
            if (typeof j.message === 'string' && j.message.trim()) msg = j.message;
          } catch {
            /* keep msg */
          }
          throw new Error(msg);
        }
      }
      const objectUrl = URL.createObjectURL(blob);
      const ext =
        hasExt ? '' : blob.type === 'application/pdf' ? '.pdf' : blob.type.includes('word') ? '.docx' : '';
      const downloadName = hasExt ? base : `${base}${ext || '.pdf'}`;
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = downloadName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Download failed';
      toast.error(m);
    }
  };

  const handleWorkspacePurge = async (id: string): Promise<void> => {
    const ok = await confirm({
      title: 'Delete this file permanently?',
      description:
        'It will be removed from the library and storage. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await documentApi.purge(id);
      toast.success('File permanently deleted');
      void loadDocs();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Delete failed');
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (id === '__reload__') {
      loadDocs();
      return;
    }
    const doc = allDocsById.get(id);
    if (doc?.type === 'ISO_NORM') {
      const ok = await confirm({
        title: 'Archive this standard?',
        description:
          'It will be hidden from the active library and from evaluations until you restore it from Archived standards.',
        confirmLabel: 'Archive',
        variant: 'amber',
      });
      if (!ok) return;
    } else if (doc?.productId && user?.role === 'DIRECTOR') {
      const ok = await confirm({
        title: 'Archive this document?',
        description:
          'It is removed from the active library but stays restorable from Archived product documents (audit trail kept).',
        confirmLabel: 'Archive',
        variant: 'amber',
      });
      if (!ok) return;
    } else if (doc && doc.type !== 'ISO_NORM') {
      const ok = await confirm({
        title: 'Archive this document?',
        description: 'Restorable from Archived documents.',
        confirmLabel: 'Archive',
        variant: 'amber',
      });
      if (!ok) return;
    }
    try {
      await documentApi.delete(id);
      toast.success(doc?.type === 'ISO_NORM' ? 'Standard archived' : 'Document archived');
      loadDocs();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Archive failed');
    }
  };

  const handleUploadVersion = async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await documentApi.uploadVersion(id, fd);
      toast.success('New version uploaded. Extraction in progress');
      void loadDocs();
    } catch {
      toast.error('Version upload failed');
    }
  };

  const handleRestoreArchived = async (id: string) => {
    try {
      await documentApi.restore(id);
      toast.success(
        archiveScope === 'product'
          ? 'Document restored'
          : 'Standard restored. Review and activate if needed',
      );
      void loadDocs();
    } catch {
      toast.error('Restore failed');
    }
  };

  const handlePurgeArchived = async (id: string) => {
    const ok = await confirm({
      title: 'Delete forever?',
      description:
        archiveScope === 'product'
          ? 'This permanently removes the document and stored files. This cannot be undone.'
          : 'This permanently removes the standard and all stored files. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await documentApi.purge(id);
      toast.success(archiveScope === 'product' ? 'Document permanently deleted' : 'Standard permanently deleted');
      void loadDocs();
    } catch {
      toast.error('Delete failed. Company Admin may be required for this document');
    }
};

  const listDocs =
    archiveScope === 'standard'
      ? archivedStandards
      : archiveScope === 'product'
        ? archivedProducts
        : allDocs;

  const activeCustomFolder = useMemo(
    () => (customFolderId && foldersReady ? getFolder(customFolderId) : null),
    [customFolderId, foldersReady, getFolder, customFolders],
  );

  const listDocsForSection = useMemo(() => {
    if (archiveScope !== 'none' || !foldersReady) return listDocs;
    if (activeCustomFolder) {
      return activeCustomFolder.documentIds
        .map((id) => allDocsById.get(id))
        .filter(Boolean) as (typeof myDocs);
    }
    return listDocs.filter((d) => !assignedDocumentIds.has(d.id));
  }, [listDocs, archiveScope, foldersReady, activeCustomFolder, allDocsById, assignedDocumentIds]);

  const candidatesToAddToFolder = useMemo(() => {
    if (!activeCustomFolder) return [];
    return listDocs.filter((d) => !assignedDocumentIds.has(d.id));
  }, [listDocs, activeCustomFolder, assignedDocumentIds]);

  const openDocumentView = useCallback(
    async (
      doc: { id: string; name?: string; type?: string; mimeType?: string },
      siblings: { id: string; name?: string }[],
    ) => {
      if (activeCustomFolder) {
        try {
          const res = await documentApi.getDownload(doc.id);
          const blob = res.data as Blob;
          if (!(blob instanceof Blob) || blob.size === 0) {
            toast.error('Empty file');
            return;
          }
          const u = URL.createObjectURL(blob);
          window.open(u, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(u), 120_000);
        } catch {
          toast.error('Could not open file');
        }
        return;
      }
      if (doc.type === 'WORKSPACE_FILE') {
        void handleDownload(doc.id, doc.name);
        return;
      }
      setViewer({
        currentId: doc.id,
        siblings: siblings.map((d) => ({ id: d.id, name: d.name ?? '' })),
      });
    },
    [activeCustomFolder, handleDownload],
  );

  const runSimpleFolderUpload = useCallback(async () => {
    if (!activeCustomFolder || !user?.id || simpleFolderFiles.length === 0) return;
    setSimpleFolderUploading(true);
    try {
      for (const file of simpleFolderFiles) {
        const form = new FormData();
        form.append('files', file);
        form.append('type', 'EVIDENCE');
        form.append('description', `My folder: ${activeCustomFolder.name}`);
        const res = await documentApi.upload(form);
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : [raw];
        for (const item of list) {
          const id = (item as { id?: string }).id;
          if (id) addDocumentToFolder(activeCustomFolder.id, id);
        }
      }
      toast.success('File(s) added to this folder');
      setSimpleFolderFiles([]);
      setAddToFolderOpen(false);
      void loadDocs();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Upload failed. Check file type and permissions.'));
    } finally {
      setSimpleFolderUploading(false);
    }
  }, [activeCustomFolder, addDocumentToFolder, loadDocs, simpleFolderFiles, user?.id]);

  const handleFolderAddDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setFolderAddDragOver(false);
    const items = Array.from(e.dataTransfer.items);
    const entries = items.map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[];
    const all = (await Promise.all(entries.map(collectFilesFromEntry))).flat();
    if (all.length === 0) {
      toast.error('No files detected. Drop PDF, Word, Excel, or image files.');
      return;
    }
    setSimpleFolderFiles((prev) => {
      const { next, runToasts } = mergeFolderEvidenceQueue(prev, all);
      queueMicrotask(runToasts);
      return next;
    });
  }, []);

  const archiveEntryHref =
    docView === 'product'
      ? `${FILE_LIBRARY_PATH}?view=product&archive=1`
      : `${FILE_LIBRARY_PATH}?view=standard&archive=1`;
  const archiveEntryLabel = docView === 'product' ? 'Archived product docs' : 'Archived standards';

  if (customFolderId && archiveScope === 'none' && foldersReady && !activeCustomFolder) {
    return (
      <DashboardLayout showRouteHeader={false}>
        {confirmDialog}
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <p className="font-medium text-[var(--text-primary)]">This folder no longer exists.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">It may have been removed or the link is outdated.</p>
          <Button className="mt-4" type="button" asChild>
            <Link href={fileLibraryUrl({ view: searchView, archive: searchArchive, cf: null })}>Back to file library</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout showRouteHeader={false}>
      {confirmDialog}
      {activeCustomFolder && archiveScope === 'none' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 p-3 sm:gap-3">
          <Button type="button" variant="ghost" size="sm" className="gap-1" asChild>
            <Link href={fileLibraryUrl({ view: searchView, archive: searchArchive, cf: null })}>
              <ArrowLeft className="h-4 w-4" />
              All files
            </Link>
          </Button>
          <span className="min-w-0 truncate text-base font-bold text-[var(--text-primary)] sm:text-lg" title={activeCustomFolder.name}>
            {activeCustomFolder.name}
          </span>
          <span className="text-xs text-[var(--muted)] sm:ml-1">
            {activeCustomFolder.documentIds.length} file{activeCustomFolder.documentIds.length === 1 ? '' : 's'} ·
            <span className="ml-1" title="Folders are stored in this browser until sync is available">
              local
            </span>
          </span>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={() => {
                setSimpleFolderFiles([]);
                setAddToFolderOpen(true);
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Add to folder
            </Button>
          </div>
        </div>
      )}
      <header className="mb-6 flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          {archiveScope === 'none' && !activeCustomFolder && (
            <>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                {pageMeta.title}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">{pageMeta.tagline}</p>
            </>
          )}
          {activeCustomFolder && (
            <p className="text-sm text-[var(--muted)]">Organize a subset of your files in this list view.</p>
          )}
          {archiveScope === 'standard' && (
            <>
              <h1 className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">Archived standard documents</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Restore returns a standard to the library (pending activation). Delete removes it permanently.
              </p>
            </>
          )}
          {archiveScope === 'product' && (
            <>
              <h1 className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">Archived product documents</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Files removed from the active library. Restore brings them back; permanent delete is for Company Admin.
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {archiveScope === 'none' && !activeCustomFolder && docView === 'all' && (
            <>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setNewFolderName('');
                  setNewFolderOpen(true);
                }}
              >
                <FolderPlus className="h-4 w-4" />
                New folder
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => setNewFileOpen(true)}
              >
                <Upload className="h-4 w-4" />
                New file
              </Button>
            </>
          )}
          {archiveScope === 'none' && !activeCustomFolder && (docView === 'product' || docView === 'standard') && (
            <>
              <Button type="button" variant="outline" className={ARCHIVE_LIB_NAV_BTN} asChild>
                <Link href={archiveEntryHref}>
                  <Archive className="h-4 w-4 text-[var(--brand-accent)]" strokeWidth={2.25} />
                  {archiveEntryLabel}
                </Link>
              </Button>
              {docView === 'product' ? (
                <Button type="button" className="gap-2" onClick={() => { setWizardEditProduct(null); setProductWizardOpen(true); }}>
                  <Package className="h-4 w-4" />
                  Add Products
                </Button>
              ) : (
                <Button type="button" className="gap-2" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              )}
            </>
          )}
          {archiveScope === 'standard' && (
            <Button type="button" variant="outline" className="gap-2" asChild>
              <Link href={`${FILE_LIBRARY_PATH}?view=standard`}>
                <ArrowLeft className="h-4 w-4" />
                Back to active standards
              </Link>
            </Button>
          )}
          {archiveScope === 'product' && (
            <Button type="button" variant="outline" className="gap-2" asChild>
              <Link href={`${FILE_LIBRARY_PATH}?view=product`}>
                <ArrowLeft className="h-4 w-4" />
                Back to product documents
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Floating extraction-progress widget is rendered globally by ExtractionProgressProvider in DashboardLayout. */}

      {archiveScope === 'standard' && archivedStandards.length === 0 && !loading && (
        <p className="mb-6 rounded-xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--muted)]">
          No archived standards. Use the archive icon on an active standard to move it here.
        </p>
      )}

{archiveScope === 'product' && archivedProducts.length === 0 && archivedProductList.length === 0 && !loading && (
          <p className="mb-6 rounded-xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--muted)]">
            No archived products. Archive a product folder to see it here.
          </p>
        )}

        {archiveScope === 'none' && !activeCustomFolder && docView === 'all' && foldersReady && customFolders.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Folders</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customFolders.map((f) => (
              <div
                key={f.id}
                className="flex min-h-[72px] items-stretch gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/80"
              >
                <Link
                  href={fileLibraryUrl({ view: searchView, archive: searchArchive, cf: f.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 p-4 transition-hover hover:border-[var(--brand-primary)]/40 hover:bg-[var(--page-bg)]/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-primary)]" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {f.documentIds.length} file{f.documentIds.length === 1 ? '' : 's'}
                      {f.createdAt
                        ? ` · ${new Date(f.createdAt).toLocaleString(undefined, { dateStyle: 'medium' })}`
                        : null}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      Created by {f.createdByName || '-'}
                    </p>
                  </div>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-auto shrink-0 rounded-none border-l border-[var(--border)] text-red-600 hover:bg-red-500/10"
                  title="Delete this folder"
                  onClick={async (e) => {
                    e.preventDefault();
                    const ok = await confirm({
                      title: 'Delete this folder?',
                      description: 'Files stay in the library. Only this folder link is removed.',
                      confirmLabel: 'Delete',
                      variant: 'destructive',
                    });
                    if (!ok) return;
                    removeFolder(f.id);
                    toast.success('Folder removed');
                    if (customFolderId === f.id) {
                      router.push(fileLibraryUrl({ view: searchView, archive: searchArchive, cf: null }));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="mb-4 h-1 w-full overflow-hidden rounded bg-[var(--page-bg)]">
          <div className="h-full w-1/3 animate-pulse bg-[var(--brand-primary)]" />
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={`${tab}-${archiveScope}-${activeCustomFolder?.id ?? 'lib'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <DocSection
            docs={listDocsForSection}
            products={archiveScope === 'product' ? archivedProductList : allProducts}
            viewFilter={docView}
            archiveScope={archiveScope}
            customFolder={
              activeCustomFolder
                ? { onRemove: (id) => removeDocumentFromFolder(activeCustomFolder.id, id) }
                : null
            }
            nameMap={companyNameMap}
            userAvatarKeyById={companyUserAvatarKeyById}
            storageOnly={!!activeCustomFolder}
            confirmAction={confirm}
            focusProductId={focusProductId}
            onFocusProductHandled={() => setFocusProductId(null)}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onPurgeWorkspaceFile={
              user?.role === 'DIRECTOR' || user?.role === 'QUALITY_MANAGER' ? handleWorkspacePurge : undefined
            }
            onUploadVersion={handleUploadVersion}
            onRestoreArchived={handleRestoreArchived}
            onPurgeArchived={handlePurgeArchived}
            onViewDocument={openDocumentView}
            onDocsMutated={() => void loadDocs()}
            onEditProductInWizard={(product) => { setWizardEditProduct(product); setProductWizardOpen(true); }}
          />
        </motion.div>
      </AnimatePresence>

      <ExtractedContentModal
        open={viewer !== null}
        onClose={() => setViewer(null)}
        currentId={viewer?.currentId ?? ''}
        siblings={viewer?.siblings ?? []}
        onSelectDocument={(id) => setViewer((v) => (v ? { ...v, currentId: id } : null))}
        onDocumentChange={loadDocs}
        onDownloadOriginal={handleDownload}
        onBackToProduct={(productId) => setFocusProductId(productId)}
      />

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onDone={loadDocs}
        onRunInBackground={(ids) => {
          extraction.start(
            ids,
            docView === 'standard' ? 'standard' : 'product',
          );
        }}
        preset={
          docView === 'standard' ? 'standard' : docView === 'product' ? 'product' : 'full'
        }
        resumeIds={
          docView === 'product' && extraction.scope === 'product' ? extraction.ids : undefined
        }
      />

      <ProductWizard
        open={productWizardOpen}
        editProduct={wizardEditProduct}
        onClose={() => { setProductWizardOpen(false); setWizardEditProduct(null); }}
        onCreated={loadDocs}
        onExtractionStarted={(ids) => extraction.start(ids, 'product')}
      />

      <UploadDocumentDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        onUploaded={() => loadDocs()}
        onExtractionStarted={(ids, scope) => extraction.start(ids, scope)}
      />

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <p className="text-sm text-[var(--muted)]">
              A local way to group files.
            </p>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Q1 review pack"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!user?.id) {
                  toast.error('Sign in to create a folder');
                  return;
                }
                const name = newFolderName.trim() || 'New folder';
                const displayName =
                  [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User';
                const id = createFolder(name, { userId: user.id, displayName });
                setNewFolderOpen(false);
                setNewFolderName('');
                router.push(
                  fileLibraryUrl(
                    { view: searchView, archive: searchArchive, cf: null },
                    { cf: id },
                  ),
                );
                toast.success('Folder created');
              }}
            >
              Create and open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addToFolderOpen}
        onOpenChange={(open) => {
          setAddToFolderOpen(open);
          if (!open) {
            setSimpleFolderFiles([]);
            setFolderAddDragOver(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(85vh,800px)] max-w-lg flex-col overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4 text-left">
            <DialogTitle>{activeCustomFolder ? `Add to “${activeCustomFolder.name}”` : 'Add to folder'}</DialogTitle>
            <p className="text-sm text-[var(--muted)]">
              Drag and drop the same file types as the main uploader; files are added as general evidence (no text
              extraction). You can also add an existing file from the list below.
            </p>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div>
              <Label className="text-xs">Upload (EVIDENCE)</Label>
              <LibraryUploadDropSurface
                className="mt-1.5 py-6"
                isDragOver={folderAddDragOver}
                disabled={simpleFolderUploading}
                onDragOver={(e) => {
                  e.preventDefault();
                  setFolderAddDragOver(true);
                }}
                onDragLeave={() => setFolderAddDragOver(false)}
                onDrop={handleFolderAddDrop}
                onClick={() => folderAddFileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (simpleFolderUploading) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    folderAddFileInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={folderAddFileInputRef}
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png,.tiff"
                  onChange={(e) => {
                    if (!e.target.files?.length) return;
                    setSimpleFolderFiles((prev) => {
                      const { next, runToasts } = mergeFolderEvidenceQueue(prev, Array.from(e.target.files!));
                      queueMicrotask(runToasts);
                      return next;
                    });
                    e.target.value = '';
                  }}
                />
                {folderAddDragOver ? (
                  <>
                    <FloatingUploadBrandIcon />
                    <div className="mt-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Drop files or folder here</p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">PDF, Word, XLSX, images, max 50 MB each</p>
                    </div>
                  </>
                ) : (
                  <>
                    <FloatingUploadBrandIcon />
                    <div className="mt-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Drag &amp; drop or click to browse
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        PDF, Word, XLSX, JPEG, PNG, TIFF, max 50 MB each
                      </p>
                    </div>
                  </>
                )}
              </LibraryUploadDropSurface>
            </div>
            {simpleFolderFiles.length > 0 && (
              <div className="max-h-[120px] overflow-y-auto rounded-lg border border-[var(--border)]">
                {simpleFolderFiles.map((f, i) => (
                  <div
                    key={f.name + i}
                    className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 last:border-b-0"
                  >
                    <span className="shrink-0">{getMimeIcon(f.type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="max-w-full truncate text-xs text-[var(--text-primary)]">{f.name}</p>
                      <p className="text-[10px] text-[var(--muted)]">{formatBytes(f.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setSimpleFolderFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-[var(--border)] pt-2">
              <p className="mb-1.5 text-xs font-semibold text-[var(--text-primary)]">Or from library</p>
              <p className="mb-2 text-xs text-[var(--muted)]">
                Files not assigned to a folder. Switch between Personal and Team above to filter.
              </p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {candidatesToAddToFolder.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nothing to add here, or this list is empty. Switch tabs or free files from other folders.
                  </p>
                ) : (
                  candidatesToAddToFolder.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 truncate text-sm" title={d.name}>
                        {d.name}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          if (!activeCustomFolder) return;
                          addDocumentToFolder(activeCustomFolder.id, d.id);
                          toast.success('File added to folder');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-[var(--border)] px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddToFolderOpen(false);
              }}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={simpleFolderUploading || simpleFolderFiles.length === 0}
              onClick={() => void runSimpleFolderUpload()}
            >
              {simpleFolderUploading
                ? 'Uploading…'
                : `Upload new files${simpleFolderFiles.length ? ` (${simpleFolderFiles.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}

function DocumentsPageWithSearchParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const v = searchParams.get('view');
  const archiveQ = searchParams.get('archive');
  const archive = archiveQ === '1';
  const cf = searchParams.get('cf');
  const docView: 'all' | 'product' | 'standard' =
    v === 'product' ? 'product' : v === 'standard' ? 'standard' : 'all';
  const archiveScope: 'none' | 'standard' | 'product' =
    !archive ? 'none' : v === 'product' ? 'product' : 'standard';

  // Custom folders live in the all-library context only: strip `view=product|standard` when a folder is open
  useEffect(() => {
    if (!cf || (v !== 'product' && v !== 'standard')) return;
    const next = new URLSearchParams();
    next.set('cf', cf);
    if (archiveQ === '1') next.set('archive', '1');
    router.replace(next.toString() ? `${FILE_LIBRARY_PATH}?${next.toString()}` : FILE_LIBRARY_PATH);
  }, [cf, v, archiveQ, router]);

  return (
    <DocumentsPageContent
      docView={docView}
      archiveScope={archiveScope}
      customFolderId={cf}
      searchView={v}
      searchArchive={archive ? '1' : null}
    />
  );
}

export function FileLibraryView() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
          Loading library…
        </div>
      }
    >
      <DocumentsPageWithSearchParams />
    </Suspense>
  );
}
