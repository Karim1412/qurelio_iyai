'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileText, X, Check, Loader2, CircleAlert, Info } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { detectLicensedStandard, licensedStandardWarning, type LicensedStandardFinding } from '@/lib/licensed-standards';
import { documentApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import {
  FloatingUploadBrandIcon,
  LibraryUploadDropSurface,
} from '@/components/file-library/LibraryUploadDropzone';
import { cn } from '@/utils/cn';
import { QurelioSpinner } from '@/components/ui/qurelio-spinner';
import { motion } from 'framer-motion';

const WORKSPACE_CATEGORY_PRESETS = [
  'Report',
  'PV',
  'Certificate',
  'CAPA',
  'Audit record',
  'Procedure note',
  'Other',
] as const;

type UploadCategory = 'product' | 'standard' | 'other';
export type UploadDocumentPreset = 'full' | 'product' | 'standard';
type UploadPhase = 'configure' | 'uploading' | 'extracting' | 'done';

interface DocStatusItem {
  id: string;
  name: string;
  status: 'uploading' | 'extracting' | 'done' | 'review' | 'error';
  detail?: string;
}

const STEP_LABELS = ['Upload files', 'AI extraction'] as const;

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (docs: unknown[]) => void;
  preset?: UploadDocumentPreset;
  onExtractionStarted?: (ids: string[], scope: 'product' | 'standard') => void;
}

function apiMessage(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : m || fallback;
}

function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

function UploadFlowStepper({ phase }: { phase: UploadPhase }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex w-full justify-center px-1 pb-1"
    >
      <div className="flex items-start justify-center">
      {([1, 2] as const).map((n, idx) => {
        const isDone = (n === 1 && phase !== 'configure') || (n === 2 && phase === 'done');
        const isActive =
          (n === 1 && phase === 'uploading') ||
          (n === 2 && phase === 'extracting') ||
          (n === 1 && phase === 'configure');
        const isStep2Future = n === 2 && phase === 'configure';
        return (
          <div key={n} className="flex items-start">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.08 }}
              className="flex w-[110px] flex-col items-center gap-1 sm:w-[130px]"
            >
              <motion.div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                  isDone &&
                    'border-[#1c3a5f] bg-[#1c3a5f] text-white dark:border-[var(--brand-primary)] dark:bg-[var(--brand-primary)]',
                  isActive &&
                    !isDone &&
                    'border-[var(--brand-accent)] bg-[var(--brand-primary)] text-white shadow-[0_0_0_2px_rgba(255,193,7,0.25)]',
                  !isDone &&
                    !isActive &&
                    'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]',
                  isStep2Future && 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]',
                )}
              >
                {isDone ? <Check className="h-4 w-4 stroke-[2.5]" /> : n}
              </motion.div>
              <span
                className={cn(
                  'text-center text-[10px] font-semibold leading-tight sm:text-[11px]',
                  isStep2Future ? 'text-[var(--muted)]' : 'text-[var(--text-primary)]',
                )}
              >
                {STEP_LABELS[n - 1]}
              </span>
            </motion.div>
            {idx < 1 && (
              <div
                className={cn(
                  'mx-1 mt-4 h-[3px] w-16 shrink-0 rounded-full sm:mx-2 sm:w-20',
                  phase !== 'configure' ? 'bg-[var(--brand-primary)]' : 'bg-[var(--border)]',
                )}
                aria-hidden
              />
            )}
          </div>
        );
      })}
      </div>
    </motion.div>
  );
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  onUploaded,
  preset = 'full',
  onExtractionStarted,
}: UploadDocumentDialogProps) {
  const { uploadStandards: canUploadStandard, uploadEvidenceDocuments: canUploadEvidence } = usePermissions();

  const [uploadCategory, setUploadCategory] = useState<UploadCategory>('product');
  const [productName, setProductName] = useState('');
  const [standardTitle, setStandardTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Copyright guardrail: the acknowledgement the server requires for licensed standards. */
  const [copyrightAccepted, setCopyrightAccepted] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('configure');
  const [docStatuses, setDocStatuses] = useState<DocStatusItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const extractionIdsRef = useRef<string[]>([]);
  const extractionScopeRef = useRef<'product' | 'standard'>('product');

  const [workspaceCatPreset, setWorkspaceCatPreset] =
    useState<(typeof WORKSPACE_CATEGORY_PRESETS)[number]>('Report');
  const [workspaceCatCustom, setWorkspaceCatCustom] = useState('');

  const isStandardFlow = preset === 'standard' || uploadCategory === 'standard';
  const standardUploadLocked = isStandardFlow && !canUploadStandard;
  const usesAiExtraction = uploadCategory === 'product' || uploadCategory === 'standard';
  const showFlowStepper = preset === 'product' || preset === 'standard' || usesAiExtraction;

  useEffect(() => {
    if (!open) return;
    if (preset === 'product') setUploadCategory('product');
    else if (preset === 'standard') setUploadCategory('standard');
  }, [open, preset]);

  const reset = useCallback(() => {
    setUploadCategory(preset === 'standard' ? 'standard' : 'product');
    setProductName('');
    setStandardTitle('');
    setCopyrightAccepted(false);
    setSelectedFiles([]);
    setDragOver(false);
    setWorkspaceCatPreset('Report');
    setWorkspaceCatCustom('');
    setPhase('configure');
    setDocStatuses([]);
    extractionIdsRef.current = [];
    setUploading(false);
  }, [preset]);

  const dialogTitle = useMemo(() => {
    if (phase === 'extracting') return 'AI extraction & structuring';
    if (phase === 'done') return 'Extraction results';
    if (preset === 'standard') return 'Upload standard file';
    if (preset === 'product') return 'Upload product files';
    return 'Upload new document';
  }, [phase, preset]);

  const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  const allowsMultiple = uploadCategory === 'product';

  const acceptFiles = (incoming: File[]) => {
    if (!incoming.length || standardUploadLocked) return;
    if (uploadCategory === 'standard') {
      const f = incoming[0];
      if (!isPdfFile(f)) {
        toast.error('Standard (ISO library) uploads must be PDF.');
        return;
      }
      setSelectedFiles([f]);
      return;
    }
    if (!allowsMultiple) {
      setSelectedFiles([incoming[0]]);
      return;
    }
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const added = incoming.filter((f) => !seen.has(`${f.name}:${f.size}:${f.lastModified}`));
      return [...prev, ...added];
    });
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = Array.from(e.dataTransfer.files ?? []);
      if (dropped.length) acceptFiles(dropped);
    },
    [uploadCategory, standardUploadLocked],
  );

  const dismissDialog = useCallback(
    (runInBackground = false) => {
      if (runInBackground && extractionIdsRef.current.length) {
        onExtractionStarted?.(extractionIdsRef.current, extractionScopeRef.current);
      }
      onOpenChange(false);
      setTimeout(reset, 220);
    },
    [onExtractionStarted, onOpenChange, reset],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (phase === 'uploading') return;
      if (phase === 'extracting') {
        dismissDialog(true);
        return;
      }
      dismissDialog(false);
      return;
    }
    onOpenChange(true);
  };

  // Poll extraction while dialog stays open on step 2
  useEffect(() => {
    if (phase !== 'extracting' || extractionIdsRef.current.length === 0) return;
    let cancelled = false;
    const ids = extractionIdsRef.current;

    const check = async () => {
      try {
        const states = await Promise.all(ids.map((id) => documentApi.get(id)));
        if (cancelled) return;

        setDocStatuses((prev) =>
          prev.map((s) => {
            const state = states.find((st) => (st.data as { id?: string }).id === s.id);
            if (!state) return s;
            const data = state.data as {
              status?: string;
              processingError?: string | null;
              extractedStructured?: {
                standardExtractionQuality?: { processingComplete?: boolean; pendingSemanticSections?: string[]; warnings?: string[] };
                standardExtractionProgress?: { phase?: string; reviewedJobs?: number; totalJobs?: number; providerRequests?: number; failedBatches?: number };
              } | null;
            };
            const status = data.status;
            if (status === 'READY') {
              const quality = data.extractedStructured?.standardExtractionQuality;
              if (quality?.processingComplete === false) {
                const count = quality.pendingSemanticSections?.length ?? 0;
                return { ...s, status: 'review' as const, detail: count ? `${count} section(s) need review or re-extraction.` : (quality.warnings?.[0] || 'Extraction needs review.') };
              }
              return { ...s, status: 'done' as const, detail: undefined };
            }
            if (status === 'FAILED') return { ...s, status: 'error' as const, detail: data.processingError || 'Extraction failed. Open the document for details.' };
            const progress = data.extractedStructured?.standardExtractionProgress;
            const detail = progress?.phase === 'reviewing'
              ? `Reviewed ${progress.reviewedJobs ?? 0}/${progress.totalJobs ?? 0} passage groups · ${progress.providerRequests ?? 0} AI review attempts`
              : progress?.phase === 'reading' ? 'Reading the document and checking scanned pages…' : undefined;
            return { ...s, status: 'extracting' as const, detail };
          }),
        );

        const allDone = states.every((s) => {
          const st = (s.data as { status?: string }).status;
          return st === 'READY' || st === 'FAILED';
        });
        if (allDone) setPhase('done');
      } catch {
        /* keep polling */
      }
    };

    void check();
    const iv = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [phase]);

  /**
   * Copyright guardrail, evaluated live so the notice appears while the user is
   * still typing the standard ID rather than only when they press Upload.
   */
  const copyrightFinding: LicensedStandardFinding | null = useMemo(() => {
    if (uploadCategory !== 'standard') return null;
    return detectLicensedStandard(standardTitle, selectedFiles[0]?.name);
  }, [uploadCategory, standardTitle, selectedFiles]);

  const onSubmit = async () => {
    if (!selectedFiles.length) return toast.error('Pick a file first');
    const primaryFile = selectedFiles[0];

    if (uploadCategory === 'product' && !productName.trim()) {
      return toast.error('Title is required for a product file');
    }
    if (uploadCategory === 'product' && !canUploadEvidence) {
      return toast.error('Your role cannot upload evidence documents');
    }
    if (uploadCategory === 'other' && !canUploadEvidence) {
      return toast.error('Your role cannot upload workspace files');
    }
    if (uploadCategory === 'standard') {
      if (!canUploadStandard) return toast.error('Only Company Admin or Quality Manager can upload standards');
      if (!standardTitle.trim()) return toast.error('Title is required for a standard document');
      if (!isPdfFile(primaryFile)) return toast.error('Standard documents must be PDF');

      // The server refuses this upload without an acknowledgement; the notice and
      // its checkbox are already visible in the form, so just point at them.
      if (copyrightFinding && !copyrightAccepted) {
        return toast.error('Confirm you have the right to use this standard before uploading');
      }
    }

    if (uploadCategory === 'other') {
      const cat = workspaceCatPreset === 'Other' ? workspaceCatCustom.trim() : workspaceCatPreset;
      if (!cat) return toast.error('Choose or enter a document category');
    }

    try {
      const allDocsRes = await documentApi.list({ includeArchived: false });
      const docs = Array.isArray(allDocsRes.data) ? allDocsRes.data : [];
      if (uploadCategory === 'standard') {
        const titleKey = norm(standardTitle);
        const duplicateStandard = docs.some(
          (d: { type?: string; name?: string; archivedAt?: string | null }) =>
            d.type === 'ISO_NORM' && !d.archivedAt && typeof d.name === 'string' && norm(d.name) === titleKey,
        );
        if (duplicateStandard) return toast.error('A standard with this title already exists');
      }
      if (uploadCategory === 'product') {
        const productsRes = await documentApi.list({ includeArchived: true, type: 'PRODUCT_DOC' });
        const productDocs = Array.isArray(productsRes.data) ? productsRes.data : [];
        const titleKey = norm(productName);
        const duplicateProduct = productDocs.some(
          (d: { product?: { name?: string } | null; archivedAt?: string | null }) =>
            !d.archivedAt && typeof d.product?.name === 'string' && norm(d.product.name) === titleKey,
        );
        if (duplicateProduct) return toast.error('A product with this title already exists');
      }
    } catch {
      return toast.error('Could not validate unique title. Please try again.');
    }

    let apiType: string;
    if (uploadCategory === 'product') apiType = 'PRODUCT_DOC';
    else if (uploadCategory === 'standard') apiType = 'ISO_NORM';
    else apiType = 'WORKSPACE_FILE';

    setPhase('uploading');
    setUploading(true);
    setDocStatuses(selectedFiles.map((f) => ({ id: f.name, name: f.name, status: 'uploading' as const })));

    try {
      const fd = new FormData();
      for (const f of selectedFiles) fd.append('files', f);
      fd.append('type', apiType);
      fd.append(
        'description',
        selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files`,
      );
      if (uploadCategory === 'product') fd.append('productName', productName.trim());
      if (uploadCategory === 'standard') {
        const title = standardTitle.trim();
        const standardCategory = /^EN\b/i.test(title) ? 'EN' : 'ISO_NORM';
        fd.append('title', title);
        fd.append('standardCategory', standardCategory);
        if (copyrightAccepted) fd.append('copyrightAck', 'true');
      }
      if (uploadCategory === 'other') {
        const cat = workspaceCatPreset === 'Other' ? workspaceCatCustom.trim() : workspaceCatPreset;
        fd.append('workspaceCategory', cat);
      }

      const res = await documentApi.upload(fd);
      const list = Array.isArray(res.data) ? res.data : [res.data];
      const ids = list
        .map((u) => (u as { id?: string }).id)
        .filter((id): id is string => Boolean(id));

      toast.success(
        uploadCategory === 'other'
          ? 'Workspace file added'
          : selectedFiles.length > 1
            ? `${selectedFiles.length} documents uploaded`
            : 'Document uploaded',
      );
      onUploaded?.(list);

      if (usesAiExtraction && ids.length) {
        extractionIdsRef.current = ids;
        extractionScopeRef.current = uploadCategory === 'standard' ? 'standard' : 'product';
        onExtractionStarted?.(ids, extractionScopeRef.current);
        setDocStatuses(
          selectedFiles.map((f, i) => ({
            id: ids[i] ?? f.name,
            name: f.name,
            status: 'extracting' as const,
          })),
        );
        setPhase('extracting');
      } else {
        dismissDialog(false);
      }
    } catch (err) {
      setPhase('configure');
      toast.error(apiMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const fileAccept = uploadCategory === 'standard' ? '.pdf,application/pdf' : undefined;
  const dropHintSubtext =
    uploadCategory === 'standard'
      ? 'PDF only, single file'
      : uploadCategory === 'other'
        ? 'Word, Excel, PDF, images, single file'
        : 'PDF, DOCX, XLSX, images, one or more files';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-[var(--border)] px-6 py-4 text-left">
          <DialogTitle className="text-lg font-bold">{dialogTitle}</DialogTitle>
          {(phase === 'extracting' || phase === 'uploading') && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              We extract text (including from images), then structure it with AI. Large files can take a few minutes.
            </p>
          )}
        </DialogHeader>

        {showFlowStepper && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex shrink-0 justify-center border-b border-[var(--border)] px-4 pt-4 pb-3 sm:px-6"
          >
            <UploadFlowStepper phase={phase} />
          </motion.div>
        )}

        <div className="min-h-[280px] flex-1 overflow-y-auto overscroll-y-contain">
          {phase === 'configure' && (
            <div className="space-y-5 px-6 py-5">
              {preset === 'full' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid gap-2"
                >
                  <Label htmlFor="upload-doc-kind">Document type</Label>
                  <Select
                    value={uploadCategory}
                    onValueChange={(v) => {
                      const next = v as UploadCategory;
                      setUploadCategory(next);
                      setSelectedFiles([]);
                      if (next !== 'product') setProductName('');
                      if (next !== 'standard') setStandardTitle('');
                      setCopyrightAccepted(false);
                      if (next !== 'other') {
                        setWorkspaceCatPreset('Report');
                        setWorkspaceCatCustom('');
                      }
                    }}
                    disabled={uploading}
                  >
                    <SelectTrigger id="upload-doc-kind" className="w-full">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Product file</SelectItem>
                      <SelectItem value="standard" disabled={!canUploadStandard}>
                        Standard
                      </SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {preset === 'standard' && !canUploadStandard && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-[var(--muted)]">
                  Only Company Admin or Quality Manager can upload standard documents.
                </p>
              )}

              {(preset === 'product' || uploadCategory === 'product') && (
                <div className="grid gap-2">
                  <Label htmlFor="upload-product-name">Product name *</Label>
                  <Input
                    id="upload-product-name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Widget A, Safety Harness Pro"
                    disabled={uploading}
                    autoComplete="off"
                  />
                  <p className="text-xs text-[var(--muted)]">Files will be grouped under this product folder</p>
                </div>
              )}

              {(preset === 'standard' || uploadCategory === 'standard') && (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="upload-standard-title">ISO Standard ID *</Label>
                    <Input
                      id="upload-standard-title"
                      value={standardTitle}
                      onChange={(e) => { setStandardTitle(e.target.value); setCopyrightAccepted(false); }}
                      placeholder="e.g. ISO 9001:2015, EN 60204-1:2018"
                      disabled={uploading || standardUploadLocked}
                      autoComplete="off"
                    />
                  </div>

                  {/* Standing policy notice: shown for every standard upload. */}
                  <div className="flex items-start gap-2.5 rounded-xl border border-[var(--callout-info-border)] bg-[var(--callout-info-bg)] p-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                    <p className="text-[12px] leading-relaxed text-[var(--callout-info-text)]">
                      Qurelio accepts only documents that are{' '}
                      <strong>free to use and published to the public</strong>, for example EU
                      Regulations and Directives, EudraLex, MDCG guidance, 21 CFR, WHO, EMA and ICH
                      texts. Standards sold under licence (ISO, IEC, EN, ASTM, DIN, BSI…) may not be
                      redistributed, and uploading a purchased or reproduced copy may infringe the
                      publisher&apos;s copyright.
                    </p>
                  </div>

                  {/* Live alert: appears as soon as the ID names a licensed body. */}
                  {copyrightFinding && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
                        <CircleAlert className="h-4 w-4 shrink-0" />
                        &ldquo;{copyrightFinding.evidence}&rdquo; looks like a licensed standard
                      </p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-amber-900">
                        {licensedStandardWarning(copyrightFinding)}
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-300 bg-white/70 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900">
                        <input
                          type="checkbox"
                          checked={copyrightAccepted}
                          onChange={(e) => setCopyrightAccepted(e.target.checked)}
                          disabled={uploading}
                          className="mt-0.5 shrink-0 accent-[var(--brand-primary)]"
                        />
                        <span>
                          I confirm this document is free to use and publicly published, or that I
                          hold a valid right to use this copy. I accept sole responsibility for its
                          use in Qurelio.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {uploadCategory === 'other' && (
                <motion.div className="grid gap-2">
                  <Label htmlFor="ws-cat">Category</Label>
                  <Select
                    value={workspaceCatPreset}
                    onValueChange={(v) => setWorkspaceCatPreset(v as (typeof WORKSPACE_CATEGORY_PRESETS)[number])}
                    disabled={uploading}
                  >
                    <SelectTrigger id="ws-cat" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_CATEGORY_PRESETS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {workspaceCatPreset === 'Other' && (
                    <Input
                      value={workspaceCatCustom}
                      onChange={(e) => setWorkspaceCatCustom(e.target.value)}
                      placeholder="Custom category name"
                      disabled={uploading}
                    />
                  )}
                </motion.div>
              )}

              <LibraryUploadDropSurface
                isDragOver={dragOver}
                disabled={uploading || standardUploadLocked}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!dragOver) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  accept={fileAccept}
                  multiple={allowsMultiple}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    if (picked.length) acceptFiles(picked);
                    e.target.value = '';
                  }}
                />
                {selectedFiles.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="relative flex flex-col items-center gap-1.5"
                  >
                    <FileText className="h-9 w-9 text-[var(--brand-primary)]" />
                    <p className="max-w-[260px] truncate text-sm font-semibold">{selectedFiles[0].name}</p>
                    {selectedFiles.length > 1 && (
                      <p className="text-xs text-[var(--muted)]">+{selectedFiles.length - 1} more</p>
                    )}
                  </motion.div>
                ) : (
                  <>
                    <FloatingUploadBrandIcon />
                    <p className="mt-1 text-sm font-semibold">Drag &amp; drop or click to browse</p>
                    <p className="text-xs text-[var(--muted)]">{dropHintSubtext}</p>
                  </>
                )}
              </LibraryUploadDropSurface>
            </div>
          )}

          {(phase === 'uploading' || phase === 'extracting') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-8 text-center"
            >
              <QurelioSpinner size={88} className="mb-5" />
              <p className="font-semibold text-[var(--text-primary)]">
                {phase === 'uploading' ? 'Uploading files…' : 'AI extraction in progress'}
              </p>
              {phase === 'extracting' && docStatuses.length > 0 && (
                <div className="mt-6 w-full max-w-sm space-y-2">
                  <p className="text-xs text-[var(--muted)]">
                    Processing {docStatuses.length} document{docStatuses.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="max-h-[120px] space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--page-bg)]/50 p-2 text-left">
                    {docStatuses.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center gap-2 rounded-md bg-[var(--surface)] px-2.5 py-1.5"
                      >
                        {doc.status === 'extracting' || doc.status === 'uploading' ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--brand-primary)]" />
                        ) : doc.status === 'done' ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        ) : doc.status === 'review' ? (
                          <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0 text-red-600" />
                        )}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="min-w-0 flex-1"
                        >
                          <p className="truncate text-xs font-medium">{doc.name}</p>
                          <p className="text-[10px] text-[var(--muted)]">
                            {doc.detail || (doc.status === 'extracting' ? 'Extracting document…' : doc.status)}
                          </p>
                        </motion.div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex min-h-[280px] flex-col items-center justify-center px-6 py-8 text-center"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--page-bg)]">
                {docStatuses.some((doc) => doc.status === 'error' || doc.status === 'review')
                  ? <CircleAlert className="h-7 w-7 text-amber-600" />
                  : <Check className="h-7 w-7 text-green-600" />}
              </div>
              <p className="font-semibold text-[var(--text-primary)]">
                {docStatuses.some((doc) => doc.status === 'error' || doc.status === 'review') ? 'Some documents need attention' : 'Documents are ready for review'}
              </p>
              <p className="mt-2 max-w-sm text-xs text-[var(--muted)]">
                Open each document to review the extracted content and source.
              </p>
              <ul className="mt-4 w-full max-w-sm space-y-2 text-left">
                {docStatuses.map((doc) => (
                  <li key={doc.id} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">
                    <p className="font-medium">{doc.name}</p>
                    <p className="mt-1 text-[var(--muted)]">{doc.detail || (doc.status === 'done' ? 'Ready for review' : doc.status)}</p>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-[var(--border)] px-6 py-4 sm:justify-end">
          {phase === 'configure' && (
            <>
              <Button type="button" variant="outline" onClick={() => dismissDialog(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={selectedFiles.length === 0 || uploading || standardUploadLocked}
                className="gap-2"
                onClick={() => void onSubmit()}
              >
                <Upload className="h-4 w-4" />
                Upload{selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}
              </Button>
            </>
          )}
          {phase === 'uploading' && (
            <p className="w-full text-center text-xs text-[var(--muted)]">Uploading files, please wait…</p>
          )}
          {phase === 'extracting' && (
            <>
              <Button type="button" className="w-full sm:w-auto" onClick={() => dismissDialog(true)}>
                Continue in background
              </Button>
            </>
          )}
          {phase === 'done' && (
            <Button type="button" className="w-full sm:ml-auto sm:w-auto" onClick={() => dismissDialog(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}
