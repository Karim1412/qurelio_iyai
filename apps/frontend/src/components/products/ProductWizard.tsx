'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, Check, Trash2, FileText, History, Loader2, Sparkles, Info } from '@/components/icons';
import { Stepper, type Step } from '@/components/company/Stepper';
import { ProductStepIdentity, type ProductIdentityData } from '@/components/products/ProductStepIdentity';
import { ProductStepTechnical, type ProductTechnicalData } from '@/components/products/ProductStepTechnical';
import { ProductStepMarkets, type ProductMarketsData } from '@/components/products/ProductStepMarkets';
import { ProductStepManufacturing, type ProductManufacturingData } from '@/components/products/ProductStepManufacturing';
import { ProductStepCertifications, type ProductCertificationsData } from '@/components/products/ProductStepCertifications';
import {
  ProductStepDocuments,
  type ProductDocumentsData,
  type UploadedFile,
  type AnalysisProgress,
} from '@/components/products/ProductStepDocuments';
import { AiReviewBanner } from '@/components/products/AiFilled';
import {
  applyPrefill, buildPrefill, diffPrefill,
  type ExtractedStructure, type PrefillSuggestion,
} from '@/components/products/product-prefill';
import { productApi, documentApi } from '@/lib/api';
import toast from 'react-hot-toast';

/**
 * Documents come first: the files the user uploads are read by the AI and used to
 * pre-fill every later step, which the user then verifies or corrects.
 */
const STEPS: Step[] = [
  { label: 'Documents', subtitle: 'Upload files, AI fills the form' },
  { label: 'Identity', subtitle: 'Product name & type' },
  { label: 'Technical', subtitle: 'Use, materials, HS code' },
  { label: 'Markets', subtitle: 'Target regions & regulations' },
  { label: 'Manufacturing', subtitle: 'Sites & suppliers' },
  { label: 'Certifications', subtitle: 'Product-level certs' },
];

const STEP_DOCUMENTS = 0;
const STEP_IDENTITY = 1;
const STEP_TECHNICAL = 2;
const STEP_MARKETS = 3;
const STEP_MANUFACTURING = 4;
const STEP_CERTIFICATIONS = 5;

/** Poll budget for OCR + LLM structuring of the uploaded files. */
const EXTRACTION_POLL_MS = 3_000;
const EXTRACTION_TIMEOUT_MS = 4 * 60_000;

const DRAFTS_LS_KEY = 'qurelio-product-drafts';
const AUTOSAVE_LS_KEY = 'qurelio-product-wizard-autosave';

/** Bumped when the step order changed: older drafts store the pre-Documents-first indices. */
const DRAFT_SCHEMA_VERSION = 2;

/** Mirrors PRODUCT_DRAFT_STATUS in document-service: hidden until activated. */
const PRODUCT_DRAFT_STATUS = 'DRAFT';

interface DraftEntry {
  /** Absent on drafts written before Documents became step 1. */
  v?: number;
  id: string;
  name: string;
  step: number;
  completedSteps: number[];
  productId: string | null;
  identity: ProductIdentityData;
  technical: ProductTechnicalData;
  markets: ProductMarketsData;
  manufacturing: ProductManufacturingData;
  certifications: ProductCertificationsData;
  /** Fields pre-filled by the AI and not yet re-typed by the user. */
  aiFields?: string[];
  savedAt: number;
}

/** Map a v1 step index (Identity…Documents) onto the current order (Documents first). */
function migrateStepIndex(index: number): number {
  return index >= 5 ? STEP_DOCUMENTS : index + 1;
}

function migrateDraft(draft: DraftEntry): DraftEntry {
  if (draft.v === DRAFT_SCHEMA_VERSION) return draft;
  return {
    ...draft,
    v: DRAFT_SCHEMA_VERSION,
    step: migrateStepIndex(draft.step ?? 0),
    completedSteps: (draft.completedSteps ?? []).map(migrateStepIndex),
  };
}

function loadDrafts(): DraftEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DRAFTS_LS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as DraftEntry[]).map(migrateDraft);
  } catch { return []; }
}

function saveDrafts(drafts: DraftEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DRAFTS_LS_KEY, JSON.stringify(drafts));
  } catch { /* ignore */ }
}

function loadAutosave(): DraftEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_LS_KEY);
    if (!raw) return null;
    return migrateDraft(JSON.parse(raw) as DraftEntry);
  } catch { return null; }
}

function saveAutosave(state: DraftEntry) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTOSAVE_LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function clearAutosave() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(AUTOSAVE_LS_KEY); } catch { /* ignore */ }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onExtractionStarted?: (ids: string[]) => void;
  companySites?: string[];
  companyProcesses?: string[];
  /** When set, the wizard opens in edit mode pre-filled with this product's saved profile. */
  editProduct?: any | null;
}

const IDENTITY_EMPTY: ProductIdentityData = {
  name: '', sku: '', brandName: '', productFamily: '', category: '',
  productType: 'finished', description: '', productStatus: 'active',
};
const TECHNICAL_EMPTY: ProductTechnicalData = {
  intendedUse: '', targetUsers: [], keyMaterials: [],
  physicalForm: '', hsTariffCode: '', countryOfOrigin: '',
};
const MARKETS_EMPTY: ProductMarketsData = {
  targetMarkets: [], requiredCertifications: [], applicableRegulations: [], industryLabels: [],
};
const MANUFACTURING_EMPTY: ProductManufacturingData = {
  productionSites: [], productionProcesses: [], criticalSuppliers: [],
};
const CERTIFICATIONS_EMPTY: ProductCertificationsData = {
  productCertifications: [],
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function makeEmptyDraft(): DraftEntry {
  return {
    v: DRAFT_SCHEMA_VERSION,
    id: generateId(),
    name: '',
    step: 0,
    completedSteps: [],
    productId: null,
    identity: { ...IDENTITY_EMPTY },
    technical: { ...TECHNICAL_EMPTY },
    markets: { ...MARKETS_EMPTY },
    manufacturing: { ...MANUFACTURING_EMPTY },
    certifications: { ...CERTIFICATIONS_EMPTY },
    savedAt: Date.now(),
  };
}

export function ProductWizard({ open, onClose, onCreated, onExtractionStarted, companySites, companyProcesses, editProduct }: Props) {
  const isEditMode = !!editProduct;
  const [view, setView] = useState<'wizard' | 'drafts'>('wizard');

  // Try to load autosave on open (create flow only, edit mode hydrates from the product instead)
  const autosave = open && view === 'wizard' && !isEditMode ? loadAutosave() : null;

  const [step, setStep] = useState(autosave?.step ?? 0);
  const [completedSteps, setCompletedSteps] = useState<number[]>(autosave?.completedSteps ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [productId, setProductId] = useState<string | null>(autosave?.productId ?? null);
  const [draftName, setDraftName] = useState(autosave?.name ?? '');

  const [identity, setIdentity] = useState<ProductIdentityData>(autosave?.identity ?? IDENTITY_EMPTY);
  const [technical, setTechnical] = useState<ProductTechnicalData>(autosave?.technical ?? TECHNICAL_EMPTY);
  const [markets, setMarkets] = useState<ProductMarketsData>(autosave?.markets ?? MARKETS_EMPTY);
  const [manufacturing, setManufacturing] = useState<ProductManufacturingData>(autosave?.manufacturing ?? MANUFACTURING_EMPTY);
  const [certifications, setCertifications] = useState<ProductCertificationsData>(autosave?.certifications ?? CERTIFICATIONS_EMPTY);
  const [documents, setDocuments] = useState<ProductDocumentsData>({ files: [] });

  /** Field keys the AI pre-filled from the uploaded documents, flagged for the user to verify. */
  const [aiFields, setAiFields] = useState<string[]>(autosave?.aiFields ?? []);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /** Folder name as the server currently holds it: uploads reference the product by it. */
  const [serverProductName, setServerProductName] = useState('');
  /** Set once "Save & activate" succeeded, so closing no longer offers to discard. */
  const [isActivated, setIsActivated] = useState(false);
  /** Draft folder created for uploads but never activated, offered for discard on close. */
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  /** Upload + read progress for the running analysis. */
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  /** Values the document disagrees with: offered rather than applied (mainly edit mode). */
  const [suggestions, setSuggestions] = useState<PrefillSuggestion[]>([]);
  const [analysisMadeNoChange, setAnalysisMadeNoChange] = useState(false);
  /** Same count as `suggestions`, readable synchronously right after an analysis run. */
  const suggestionsPendingRef = useRef(0);

  /**
   * Each step is a full page of fields, so arriving mid-scroll hides the heading and
   * the AI-review banner. Reset the scroll position whenever the step changes.
   */
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [step, view]);

  // Persist autosave whenever state changes (create flow only, never pollute the create draft with an edit)
  useEffect(() => {
    if (!open || view !== 'wizard' || isEditMode) return;
    saveAutosave({
      v: DRAFT_SCHEMA_VERSION,
      id: autosave?.id ?? generateId(),
      name: draftName,
      step, completedSteps, productId,
      identity, technical, markets, manufacturing, certifications,
      aiFields,
      savedAt: Date.now(),
    });
  }, [open, view, isEditMode, step, completedSteps, productId, identity, technical, markets, manufacturing, certifications, aiFields, draftName]);

  // Edit mode: hydrate every step from the existing product when the dialog opens.
  useEffect(() => {
    if (!open || !editProduct) return;
    setView('wizard');
    setProductId(editProduct.id);
    setDraftName(editProduct.name ?? '');
    setServerProductName(editProduct.name ?? '');
    setStep(STEP_IDENTITY);
    setCompletedSteps([0, 1, 2, 3, 4, 5]);
    setAiFields([]);
    setIdentity({
      name: editProduct.name ?? '',
      sku: editProduct.sku ?? '',
      brandName: editProduct.brandName ?? '',
      productFamily: editProduct.productFamily ?? '',
      category: editProduct.categoryTags?.[0] ?? '',
      productType: editProduct.productType ?? 'finished',
      description: editProduct.description ?? '',
      productStatus: editProduct.productStatus ?? 'active',
    });
    setTechnical({
      intendedUse: editProduct.intendedUse ?? '',
      targetUsers: editProduct.targetUsers ?? [],
      keyMaterials: editProduct.keyMaterials ?? [],
      physicalForm: editProduct.physicalForm ?? '',
      hsTariffCode: editProduct.hsTariffCode ?? '',
      countryOfOrigin: editProduct.countryOfOrigin ?? '',
    });
    setMarkets({
      targetMarkets: editProduct.targetMarkets ?? [],
      requiredCertifications: editProduct.requiredCertifications ?? [],
      applicableRegulations: editProduct.applicableRegulations ?? [],
      industryLabels: editProduct.industryLabels ?? [],
    });
    setManufacturing({
      productionSites: editProduct.productionSites ?? [],
      productionProcesses: editProduct.productionProcesses ?? [],
      criticalSuppliers: editProduct.criticalSuppliers ?? [],
    });
    setCertifications({
      productCertifications: editProduct.productCertifications ?? [],
    });
    // Only newly added files are ever processed: the folder's existing, already
    // extracted documents are never re-read.
    setDocuments({ files: [] });
    setSuggestions([]);
    suggestionsPendingRef.current = 0;
    setAnalysisMadeNoChange(false);
    setProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProduct?.id]);

  const validateStep = useCallback((s: number): boolean => {
    switch (s) {
      case STEP_DOCUMENTS:
        // Documents are optional: continuing with none simply means filling the form by hand.
        return true;
      case STEP_IDENTITY:
        if (!identity.name.trim()) { toast.error('Product name is required'); return false; }
        if (!identity.productType) { toast.error('Product type is required'); return false; }
        if (!identity.productStatus) { toast.error('Product status is required'); return false; }
        return true;
      case STEP_TECHNICAL:
        if (!technical.intendedUse.trim()) { toast.error('Intended use is required'); return false; }
        if (technical.targetUsers.length === 0) { toast.error('Select at least one target user'); return false; }
        return true;
      case STEP_MARKETS:
        if (markets.targetMarkets.length === 0) { toast.error('Select at least one target market'); return false; }
        return true;
      default:
        return true;
    }
  }, [identity, technical, markets]);

  /**
   * Documents are uploaded before the product is named, so the folder may need a
   * provisional title. It is renamed from the Identity step as soon as the user
   * confirms the real name.
   */
  const provisionalProductName = (): string => {
    const typed = identity.name.trim();
    if (typed) return typed;
    const firstFile = documents.files[0]?.name;
    const base = firstFile ? firstFile.replace(/\.[^.]+$/, '').trim() : '';
    if (base) return base;
    return `New product ${new Date().toLocaleString()}`;
  };

  /** Resolves the product folder, creating it on first use. Returns the name the server holds. */
  const ensureProduct = async (): Promise<{ id: string; name: string }> => {
    if (productId) {
      return { id: productId, name: serverProductName || identity.name.trim() || draftName };
    }
    const baseName = provisionalProductName();
    // A provisional name can collide with an existing folder; suffix until it lands.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const name = attempt === 0 ? baseName : `${baseName} (${attempt + 1})`;
      try {
        const res = await productApi.create({
          name,
          description: identity.description || undefined,
          sku: identity.sku || undefined,
          // Hidden from the library until the user activates it.
          draft: true,
        });
        const id = res.data.id;
        setProductId(id);
        setServerProductName(res.data.name ?? name);
        return { id, name: res.data.name ?? name };
      } catch (e: any) {
        if (e?.response?.status !== 409 || attempt === 2) throw e;
      }
    }
    throw new Error('Could not create the product folder');
  };

  const patchFile = (index: number, patch: Partial<UploadedFile>) => {
    setDocuments((prev) => ({
      files: prev.files.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  /**
   * Upload every not-yet-sent file into the product folder.
   *
   * Both `productId` and `productName` are sent: the document-service prefers the
   * id, and older builds that only resolve the folder by name still attach the
   * file to the product we just created instead of rejecting the request.
   */
  const uploadPendingFiles = async (
    id: string,
    productName: string,
  ): Promise<{ uploaded: string[]; failures: string[] }> => {
    const uploaded: string[] = [];
    const failures: string[] = [];
    const queue = documents.files.filter((f) => !f.documentId);
    let sent = 0;

    for (let i = 0; i < documents.files.length; i += 1) {
      const entry = documents.files[i];
      // Only already-stored files are skipped, so pressing the button again retries failures.
      if (entry.documentId) continue;
      setProgress({
        done: sent,
        total: queue.length * 2,
        label: `Uploading ${entry.name} (${sent + 1}/${queue.length})`,
      });
      patchFile(i, { status: 'uploading', error: undefined });
      const fd = new FormData();
      fd.append('file', entry.file);
      fd.append('type', 'PRODUCT_DOC');
      fd.append('productId', id);
      fd.append('productName', productName);
      try {
        const res = await documentApi.upload(fd);
        const docId = res.data?.id as string | undefined;
        if (docId) {
          uploaded.push(docId);
          patchFile(i, { status: 'analyzing', documentId: docId });
        } else {
          patchFile(i, { status: 'error', error: 'Upload rejected' });
          failures.push(`${entry.name}: upload rejected`);
        }
      } catch (e: any) {
        const raw = e?.response?.data?.message ?? e?.message ?? 'Upload failed';
        const message = Array.isArray(raw) ? raw.join(', ') : String(raw);
        patchFile(i, { status: 'error', error: message });
        failures.push(`${entry.name}: ${message}`);
      }
      sent += 1;
      setProgress({
        done: sent,
        total: queue.length * 2,
        label: `Uploaded ${sent}/${queue.length}`,
      });
    }
    return { uploaded, failures };
  };

  /**
   * Poll the document rows until OCR + AI structuring finishes (or the budget runs out).
   * Returns what was extracted plus the ids still running, which are handed to the
   * global extraction tracker so the user can leave the wizard.
   */
  const waitForExtractions = async (ids: string[]): Promise<{ structures: ExtractedStructure[]; stillRunning: string[] }> => {
    const structures = new Map<string, ExtractedStructure | null>();
    const pending = new Set(ids);
    const deadline = Date.now() + EXTRACTION_TIMEOUT_MS;
    // Uploads already consumed the first half of the bar; reading fills the second.
    const total = ids.length * 2;
    const reportRead = () => {
      const read = ids.length - pending.size;
      setProgress({
        done: ids.length + read,
        total,
        label: `Reading with AI: ${read}/${ids.length} done`,
      });
    };
    reportRead();

    while (pending.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, EXTRACTION_POLL_MS));
      for (const docId of [...pending]) {
        try {
          const res = await documentApi.get(docId);
          const status = res.data?.status as string | undefined;
          if (status === 'READY') {
            structures.set(docId, (res.data?.extractedStructured ?? null) as ExtractedStructure | null);
            pending.delete(docId);
            setDocuments((prev) => ({
              files: prev.files.map((f) => (f.documentId === docId ? { ...f, status: 'done' } : f)),
            }));
          } else if (status === 'FAILED') {
            pending.delete(docId);
            setDocuments((prev) => ({
              files: prev.files.map((f) =>
                f.documentId === docId
                  ? { ...f, status: 'error', error: res.data?.processingError ?? 'AI could not read this file' }
                  : f,
              ),
            }));
          }
        } catch { /* transient: retry on the next tick */ }
      }
      reportRead();
    }

    // Outrunning the budget is not a failure: the file is stored and still being read.
    // It stays "analyzing" and is handed to the global extraction tracker by the caller.
    for (const docId of pending) {
      setDocuments((prev) => ({
        files: prev.files.map((f) =>
          f.documentId === docId
            ? { ...f, status: 'analyzing', error: 'Still being read. It will finish in the background' }
            : f,
        ),
      }));
    }

    return {
      structures: [...structures.values()].filter((s): s is ExtractedStructure => !!s),
      stillRunning: [...pending],
    };
  };

  /**
   * Documents step → upload, wait for extraction, and pre-fill the remaining steps.
   * In edit mode only empty fields are filled, so a new file never overwrites a saved profile.
   */
  const analyzeDocuments = async (id: string, productName: string): Promise<number | null> => {
    const { uploaded: ids, failures } = await uploadPendingFiles(id, productName);

    if (failures.length > 0) {
      toast.error(failures[0], { duration: 8000 });
    }
    if (ids.length === 0) {
      // Nothing reached the server: stay on this step so the user can retry or skip.
      return null;
    }

    const { structures, stillRunning } = await waitForExtractions(ids);
    // Anything that outran the wait keeps going in the global extraction tracker.
    if (stillRunning.length > 0) onExtractionStarted?.(stillRunning);

    if (structures.length === 0) {
      toast.error('No usable content was extracted. Fill the form manually');
      return 0;
    }

    const prefill = buildPrefill(structures);
    const applied: string[] = [];
    /** Values a previous analysis wrote may be refreshed; anything the user touched may not. */
    const replaceable = (group: string) =>
      aiFields.filter((f) => f.startsWith(`${group}.`)).map((f) => f.slice(group.length + 1));

    const identityMerge = applyPrefill(identity, prefill.identity, replaceable('identity'));
    setIdentity(identityMerge.next);
    applied.push(...identityMerge.applied.map((k) => `identity.${k}`));

    const technicalMerge = applyPrefill(technical, prefill.technical, replaceable('technical'));
    setTechnical(technicalMerge.next);
    applied.push(...technicalMerge.applied.map((k) => `technical.${k}`));

    const marketsMerge = applyPrefill(markets, prefill.markets, replaceable('markets'));
    setMarkets(marketsMerge.next);
    applied.push(...marketsMerge.applied.map((k) => `markets.${k}`));

    const manufacturingMerge = applyPrefill(manufacturing, prefill.manufacturing, replaceable('manufacturing'));
    setManufacturing(manufacturingMerge.next);
    applied.push(...manufacturingMerge.applied.map((k) => `manufacturing.${k}`));

    const certificationsMerge = applyPrefill(certifications, prefill.certifications, replaceable('certifications'));
    setCertifications(certificationsMerge.next);
    applied.push(...certificationsMerge.applied.map((k) => `certifications.${k}`));

    // Keep the per-row certification keys only for rows that were actually written.
    const rowKeys = certificationsMerge.applied.includes('productCertifications')
      ? prefill.filled.filter((k) => k.startsWith('certifications.productCertifications.'))
      : [];

    const nextFields = [...new Set([...applied, ...rowKeys])];
    setAiFields((prev) => [...new Set([...prev, ...nextFields])]);

    /**
     * Anything the document found that contradicts a value already in the form,
     * the normal case when editing a saved product, where `applyPrefill` writes
     * nothing at all. Offered for review instead of being dropped on the floor.
     */
    const nextSuggestions = [
      ...diffPrefill('identity', identity, prefill.identity, identityMerge.applied),
      ...diffPrefill('technical', technical, prefill.technical, technicalMerge.applied),
      ...diffPrefill('markets', markets, prefill.markets, marketsMerge.applied),
      ...diffPrefill('manufacturing', manufacturing, prefill.manufacturing, manufacturingMerge.applied),
      ...diffPrefill('certifications', certifications, prefill.certifications, certificationsMerge.applied),
    ];
    setSuggestions(nextSuggestions);
    suggestionsPendingRef.current = nextSuggestions.length;

    if (!identity.name.trim() && identityMerge.next.name?.trim()) {
      setDraftName(identityMerge.next.name.trim());
    }

    const filledCount = nextFields.filter((k) => !k.includes('productCertifications.')).length;
    setAnalysisMadeNoChange(filledCount === 0 && nextSuggestions.length === 0);
    return filledCount;
  };

  /**
   * Moving between steps never touches the server.
   *
   * Only "Save & activate" (or an explicit "Save as draft") commits, so abandoning
   * the wizard leaves nothing behind: no half-filled product in the library, no
   * archive entry. The single exception is the Documents step, which must create a
   * hidden DRAFT folder for the files to land in so the AI can read them; that
   * draft is discarded on cancel.
   */
  const handleNext = async () => {
    if (!validateStep(step)) return;

    if (step === STEP_DOCUMENTS && documents.files.some((f) => !f.documentId)) {
      setIsSaving(true);
      setIsAnalyzing(true);
      setSuggestions([]);
      suggestionsPendingRef.current = 0;
      setAnalysisMadeNoChange(false);
      let count: number | null = 0;
      try {
        const { id, name } = await ensureProduct();
        count = await analyzeDocuments(id, name);
      } catch {
        toast.error('Could not read the documents');
        return;
      } finally {
        setIsAnalyzing(false);
        setIsSaving(false);
        setProgress(null);
      }
      // Upload failed outright: hold on this step rather than advancing to an empty form.
      if (count === null) return;
      if (count > 0) {
        toast.success(`${count} field${count > 1 ? 's' : ''} pre-filled. Please verify them`);
      }
      // Disagreements need a decision here; advancing would bury them.
      if (suggestionsPendingRef.current > 0) {
        toast(`${suggestionsPendingRef.current} suggested change${suggestionsPendingRef.current > 1 ? 's' : ''} to review below`);
        return;
      }
      if (count === 0) {
        toast.success('Document read and added to this product');
      }
    }

    setCompletedSteps((prev) => [...new Set([...prev, step])]);
    setStep((p) => Math.min(p + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStep((p) => Math.max(p - 1, 0));
  };

  /** Every field of every step, written in one request. */
  const buildProfilePayload = (status: string): Record<string, any> => ({
    currentStep: step,
    onboardingStatus: status,
    name: identity.name,
    sku: identity.sku || undefined,
    brandName: identity.brandName || undefined,
    productFamily: identity.productFamily || undefined,
    description: identity.description || undefined,
    productType: identity.productType,
    productStatus: identity.productStatus,
    intendedUse: technical.intendedUse,
    targetUsers: technical.targetUsers,
    keyMaterials: technical.keyMaterials,
    physicalForm: technical.physicalForm || undefined,
    hsTariffCode: technical.hsTariffCode || undefined,
    countryOfOrigin: technical.countryOfOrigin || undefined,
    targetMarkets: markets.targetMarkets,
    requiredCertifications: markets.requiredCertifications,
    applicableRegulations: markets.applicableRegulations,
    industryLabels: markets.industryLabels,
    productionSites: manufacturing.productionSites,
    productionProcesses: manufacturing.productionProcesses,
    criticalSuppliers: manufacturing.criticalSuppliers,
    productCertifications: certifications.productCertifications,
  });

  const persistProfile = async (id: string, status: string) => {
    const payload = buildProfilePayload(status);
    await productApi.updateProfile(id, payload);
    // Identity may rename the folder: keep the name uploads reference in sync.
    if (payload.name) setServerProductName(payload.name);
  };

  const handleSaveAndDraft = async () => {
    const name = draftName.trim() || identity.name.trim() || `Draft ${new Date().toLocaleDateString()}`;
    setIsSaving(true);
    try {
      const { id } = await ensureProduct();
      // Stays a DRAFT: saved so it can be resumed, still invisible in the library.
      await persistProfile(id, isEditMode ? 'IN_PROGRESS' : PRODUCT_DRAFT_STATUS);

      const entry: DraftEntry = {
        v: DRAFT_SCHEMA_VERSION,
        id: autosave?.id ?? generateId(),
        name,
        step,
        completedSteps,
        productId: id,
        identity,
        technical,
        markets,
        manufacturing,
        certifications,
        aiFields,
        savedAt: Date.now(),
      };

      const drafts = loadDrafts();
      const existing = drafts.findIndex((d) => d.id === entry.id);
      if (existing >= 0) {
        drafts[existing] = entry;
      } else {
        drafts.unshift(entry);
      }
      saveDrafts(drafts);
      clearAutosave();
      toast.success('Draft saved');
      resetAndClose();
    } catch { toast.error('Failed to save'); }
    finally { setIsSaving(false); }
  };

  const handleResumeDraft = (draft: DraftEntry) => {
    setStep(draft.step);
    setCompletedSteps(draft.completedSteps);
    setProductId(draft.productId);
    setDraftName(draft.name);
    setServerProductName(draft.identity.name?.trim() || draft.name);
    setIdentity(draft.identity);
    setTechnical(draft.technical);
    setMarkets(draft.markets);
    setManufacturing(draft.manufacturing);
    setCertifications(draft.certifications);
    setDocuments({ files: [] });
    setAiFields(draft.aiFields ?? []);
    setSuggestions([]);
    suggestionsPendingRef.current = 0;
    setAnalysisMadeNoChange(false);
    setView('wizard');
  };

  const handleDeleteDraft = (draftId: string) => {
    const drafts = loadDrafts().filter((d) => d.id !== draftId);
    saveDrafts(drafts);
    toast.success('Draft deleted');
  };

  const handleComplete = async () => {
    if (!validateStep(step)) return;
    setIsSaving(true);
    try {
      const { id, name } = await ensureProduct();

      // Files added after the Documents step still need sending; extraction runs in the
      // background here (the profile is already filled, so there is nothing to wait for).
      const { uploaded: uploadedIds, failures } = await uploadPendingFiles(
        id,
        identity.name.trim() || name,
      );
      if (failures.length > 0) toast.error(failures[0], { duration: 8000 });

      // The one commit point: every step's data, then activation.
      await persistProfile(id, 'IN_PROGRESS');
      await productApi.completeProduct(id);
      setIsActivated(true);

      if (uploadedIds.length > 0) {
        onExtractionStarted?.(uploadedIds);
      }

      // Remove draft if it existed
      if (autosave) {
        const drafts = loadDrafts().filter((d) => d.id !== autosave.id);
        saveDrafts(drafts);
        clearAutosave();
      }

      toast.success(uploadedIds.length > 0
        ? `Product ${isEditMode ? 'updated' : 'activated'}, ${uploadedIds.length} file${uploadedIds.length > 1 ? 's' : ''} sent for AI extraction`
        : isEditMode ? 'Product updated successfully!' : 'Product activated successfully!');
      // Activated: close directly, there is no draft left to discard.
      resetAndClose();
      onCreated?.();
    } catch { toast.error('Failed to complete'); }
    finally { setIsSaving(false); }
  };

  const resetAndClose = () => {
    setStep(0);
    setCompletedSteps([]);
    setProductId(null);
    setDraftName('');
    setServerProductName('');
    setIdentity(IDENTITY_EMPTY);
    setTechnical(TECHNICAL_EMPTY);
    setMarkets(MARKETS_EMPTY);
    setManufacturing(MANUFACTURING_EMPTY);
    setCertifications(CERTIFICATIONS_EMPTY);
    setDocuments({ files: [] });
    setAiFields([]);
    setIsAnalyzing(false);
    setIsActivated(false);
    setPendingDiscard(null);
    setProgress(null);
    setSuggestions([]);
    suggestionsPendingRef.current = 0;
    setAnalysisMadeNoChange(false);
    setView('wizard');
    onClose();
  };

  /**
   * Closing without activating must leave nothing behind. If the Documents step
   * created a hidden draft folder (the only server write before activation), ask
   * whether to throw it away or keep it as a resumable draft.
   */
  const handleClose = () => {
    const hasUnactivatedDraft = !isEditMode && !isActivated && !!productId;
    if (hasUnactivatedDraft) {
      setPendingDiscard(productId);
      return;
    }
    resetAndClose();
  };

  /** Discard: delete the draft folder and every file uploaded into it. */
  const confirmDiscard = async () => {
    if (!pendingDiscard) return;
    setIsDiscarding(true);
    try {
      await productApi.delete(pendingDiscard);
      clearAutosave();
    } catch {
      toast.error('Could not discard the draft. It stays hidden until you activate it');
    } finally {
      setIsDiscarding(false);
      setPendingDiscard(null);
      resetAndClose();
      onCreated?.();
    }
  };

  /** Keep: leave the hidden draft in place and remember it locally so it can be resumed. */
  const keepAsDraft = async () => {
    setPendingDiscard(null);
    await handleSaveAndDraft();
  };

  const isLast = step === STEPS.length - 1;

  const STEP_GROUPS = ['documents', 'identity', 'technical', 'markets', 'manufacturing', 'certifications'];
  const currentGroup = STEP_GROUPS[step];
  const currentStepAiCount = aiFields.filter(
    (f) => f.startsWith(`${currentGroup}.`) && !f.includes('productCertifications.'),
  ).length;
  const analyzedDocCount = documents.files.filter((f) => f.status === 'done').length;
  const hasFilesToAnalyze = documents.files.some((f) => !f.documentId);
  const uploadedDocCount = documents.files.filter((f) => !!f.documentId).length;

  /**
   * Editing a field clears its AI flag: the value is the user's now, so it no
   * longer needs verifying.
   */
  const clearAiFlags = (group: string, patch: Record<string, unknown>) => {
    const keys = Object.keys(patch).map((k) => `${group}.${k}`);
    setAiFields((prev) => prev.filter((f) => !keys.includes(f)));
  };

  /** Certification cards are flagged per row, so only the edited row loses its chip. */
  const handleCertificationsChange = (patch: Partial<ProductCertificationsData>) => {
    const next = patch.productCertifications;
    if (next) {
      const touched = new Set<string>();
      certifications.productCertifications.forEach((row, i) => {
        const after = next[i];
        if (!after || JSON.stringify(after) !== JSON.stringify(row)) {
          touched.add(`certifications.productCertifications.${i}`);
        }
      });
      setAiFields((prev) => prev.filter((f) => !touched.has(f)));
    }
    setCertifications((p) => ({ ...p, ...patch }));
  };

  const stepAiFields = (group: string) => aiFields.filter((f) => f.startsWith(`${group}.`));

  const SETTERS: Record<string, React.Dispatch<React.SetStateAction<any>>> = {
    identity: setIdentity,
    technical: setTechnical,
    markets: setMarkets,
    manufacturing: setManufacturing,
    certifications: setCertifications,
  };

  /** Accept one suggested value: write it and flag it as AI-sourced so it still gets verified. */
  const applySuggestion = (s: PrefillSuggestion) => {
    const setter = SETTERS[s.group];
    if (!setter) return;
    setter((prev: Record<string, unknown>) => ({ ...prev, [s.field]: s.value }));
    setAiFields((prev) => [...new Set([...prev, s.key])]);
    setSuggestions((prev) => prev.filter((x) => x.key !== s.key));
  };

  const ignoreSuggestion = (s: PrefillSuggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.key !== s.key));
  };

  const applyAllSuggestions = () => {
    suggestions.forEach(applySuggestion);
    toast.success(`${suggestions.length} value${suggestions.length > 1 ? 's' : ''} applied. Verify them before saving`);
  };

  const renderStep = () => {
    switch (step) {
      case STEP_DOCUMENTS:
        return (
          <ProductStepDocuments
            data={documents}
            onChange={(d) => setDocuments((p) => ({ ...p, ...d }))}
            isAnalyzing={isAnalyzing}
            prefilledCount={aiFields.filter((f) => !f.includes('productCertifications.')).length}
            progress={progress}
            suggestions={suggestions}
            onApplySuggestion={applySuggestion}
            onIgnoreSuggestion={ignoreSuggestion}
            onApplyAllSuggestions={applyAllSuggestions}
            analysisMadeNoChange={analysisMadeNoChange}
          />
        );
      case STEP_IDENTITY:
        return (
          <ProductStepIdentity
            data={identity}
            aiFields={stepAiFields('identity')}
            onChange={(d) => { clearAiFlags('identity', d); setIdentity((p) => ({ ...p, ...d })); }}
          />
        );
      case STEP_TECHNICAL:
        return (
          <ProductStepTechnical
            data={technical}
            aiFields={stepAiFields('technical')}
            onChange={(d) => { clearAiFlags('technical', d); setTechnical((p) => ({ ...p, ...d })); }}
          />
        );
      case STEP_MARKETS:
        return (
          <ProductStepMarkets
            data={markets}
            aiFields={stepAiFields('markets')}
            onChange={(d) => { clearAiFlags('markets', d); setMarkets((p) => ({ ...p, ...d })); }}
          />
        );
      case STEP_MANUFACTURING:
        return (
          <ProductStepManufacturing
            data={manufacturing}
            companySites={companySites}
            companyProcesses={companyProcesses}
            aiFields={stepAiFields('manufacturing')}
            onChange={(d) => { clearAiFlags('manufacturing', d); setManufacturing((p) => ({ ...p, ...d })); }}
          />
        );
      case STEP_CERTIFICATIONS:
        return (
          <ProductStepCertifications
            data={certifications}
            aiFields={stepAiFields('certifications')}
            onChange={handleCertificationsChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
    <Dialog open={open && !pendingDiscard} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <DialogHeader className="flex-1">
            <DialogTitle className="text-lg font-bold">
              {view === 'drafts' ? 'Product Drafts' : isEditMode ? 'Edit Product' : productId ? 'Edit Product' : 'Add Product'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {view === 'drafts'
                ? 'Resume a saved draft or start fresh'
                : 'Upload your documents first. The AI fills the form, you verify it'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            {view === 'wizard' && (
              <>
                {!isEditMode && (
                  <Button variant="ghost" size="sm" onClick={() => setView('drafts')} className="gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Drafts
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleClose} disabled={isSaving}>Cancel</Button>
                {!isEditMode && (
                  <Button variant="outline" size="sm" onClick={handleSaveAndDraft} disabled={isSaving}>Save as draft</Button>
                )}
              </>
            )}
            {view === 'drafts' && (
              <Button variant="outline" size="sm" onClick={() => setView('wizard')}>Back to wizard</Button>
            )}
          </div>
        </div>

        {view === 'wizard' ? (
          <>
            {/* Stepper */}
            <div className="border-b border-[var(--border)] px-6 py-4">
              <Stepper steps={STEPS} currentStep={step} completedSteps={completedSteps} />
            </div>

            {/* Content */}
            <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-6">
              {step !== STEP_DOCUMENTS && currentStepAiCount > 0 && (
                <AiReviewBanner
                  count={currentStepAiCount}
                  sourceCount={analyzedDocCount}
                  className="mb-6"
                />
              )}
              {renderStep()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-3">
              <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                {isEditMode ? (
                  <>
                    <Info className="h-4 w-4 text-[var(--brand-primary)]" />
                    Changes apply when you click <span className="font-medium">Save changes</span>
                  </>
                ) : isLast ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    Ready: <span className="font-medium">Save &amp; activate</span> creates the product
                  </>
                ) : (
                  <>
                    <Info className="h-4 w-4 text-[var(--brand-primary)]" />
                    Nothing is saved until you click <span className="font-medium">Save &amp; activate</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleBack} disabled={isSaving} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />Previous
                  </Button>
                )}
                <Button size="sm" onClick={isLast ? handleComplete : handleNext} disabled={isSaving} className="gap-2">
                  {isLast ? (
                    <><Check className="h-4 w-4" />{isEditMode ? 'Save changes' : 'Save & activate'}</>
                  ) : isAnalyzing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Reading documents…</>
                  ) : step === STEP_DOCUMENTS && hasFilesToAnalyze ? (
                    <><Sparkles className="h-4 w-4" />Analyse &amp; continue</>
                  ) : (
                    <>{step === STEP_DOCUMENTS ? 'Continue without documents' : 'Next'}<ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <DraftsPanel
            drafts={loadDrafts()}
            onResume={handleResumeDraft}
            onDelete={handleDeleteDraft}
            onStartNew={() => { clearAutosave(); setView('wizard'); }}
          />
        )}
      </DialogContent>
    </Dialog>

      {/* Closing before activation: the hidden draft folder must not survive silently. */}
      <Dialog open={!!pendingDiscard} onOpenChange={(v) => !v && setPendingDiscard(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discard this product?</DialogTitle>
            <DialogDescription className="text-[13px]">
              You have not activated it, so it was never added to your products. Discarding
              deletes it and {uploadedDocCount > 0
                ? `the ${uploadedDocCount} uploaded file${uploadedDocCount > 1 ? 's' : ''}`
                : 'anything uploaded'}{' '}
              for good.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2">
            <Button variant="outline" onClick={() => setPendingDiscard(null)} disabled={isDiscarding}>
              Keep editing
            </Button>
            <Button variant="outline" onClick={keepAsDraft} disabled={isDiscarding} className="gap-2">
              <FileText className="h-4 w-4" />
              Save as draft &amp; close
            </Button>
            <Button
              onClick={confirmDiscard}
              disabled={isDiscarding}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              {isDiscarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Discard everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DraftsPanel({
  drafts,
  onResume,
  onDelete,
  onStartNew,
}: {
  drafts: DraftEntry[];
  onResume: (d: DraftEntry) => void;
  onDelete: (id: string) => void;
  onStartNew: () => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--nav-hover)]">
          <FileText className="h-7 w-7 text-[var(--muted)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">No saved drafts</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Save your progress as a draft to resume later</p>
        </div>
        <Button size="sm" onClick={onStartNew} className="gap-2">
          <ArrowRight className="h-3.5 w-3.5" />
          Start new product
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">{drafts.length} saved draft{drafts.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={onStartNew} className="gap-2">
          <ArrowRight className="h-3.5 w-3.5" />
          New product
        </Button>
      </div>
      <div className="space-y-2">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/20 px-5 py-4 transition-colors hover:bg-[var(--nav-hover)]/40"
          >
            {/* Icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <FileText className="h-5 w-5" />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {draft.name || 'Untitled product'}
              </p>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                <span className="flex items-center gap-1">
                  <History className="h-3 w-3" />
                  {new Date(draft.savedAt).toLocaleDateString()} {new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>Step {draft.step + 1} of {STEPS.length}</span>
                <span className="rounded-full bg-[var(--brand-primary)]/8 px-2 py-0.5 text-[10px] font-medium text-[var(--brand-primary)]">
                  {STEPS[draft.step]?.label}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" onClick={() => onResume(draft)} className="gap-1.5">
                Resume
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--muted)] hover:text-red-500 hover:bg-red-50"
                onClick={() => onDelete(draft.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
