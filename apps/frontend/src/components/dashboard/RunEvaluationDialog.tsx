'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, LineChart } from '@/components/icons';
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
import { documentApi, evaluationApi, productApi } from '@/lib/api';
import { parseClauseRefListToWeights } from '@/lib/evaluation-clause-refs';
import { formatIsoNormSelectLabel } from '@/lib/file-library-helpers';
import {
  collectProductStandards, standardMatchesRef, type ProductStandardRef,
} from '@/lib/product-standards';
import { useAuthStore } from '@/lib/auth-store';

interface RunEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface IsoNormOption {
  id: string;
  isoStandard?: string | null;
  name?: string | null;
}

interface ProductDocOption {
  id: string;
  name?: string | null;
  fileName?: string | null;
  productId?: string | null;
  type?: string | null;
  status?: string | null;
  approvalStatus?: string | null;
}

interface ProductOption {
  id: string;
  name?: string | null;
  /** Standards & regulations declared in the product wizard. */
  requiredCertifications?: string[] | null;
  applicableRegulations?: string[] | null;
  industryLabels?: string[] | null;
  productCertifications?: Array<{ standardName?: string | null }> | null;
}

function apiMessage(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : m || fallback;
}

function productDocLabel(d: ProductDocOption, products: ProductOption[]): string {
  const file = d.name?.trim() || d.fileName?.trim() || '-';
  const productName = products.find((p) => p.id === d.productId)?.name?.trim();
  return productName ? `${productName} · ${file}` : file;
}

export function RunEvaluationDialog({ open, onOpenChange, onCreated }: RunEvaluationDialogProps) {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isoNorms, setIsoNorms] = useState<IsoNormOption[]>([]);
  const [productDocs, setProductDocs] = useState<ProductDocOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [isoDocumentId, setIsoDocumentId] = useState('');
  const [productDocumentId, setProductDocumentId] = useState('');
  /** Declared standard/regulation chosen from the product's own profile. */
  const [productStandardRef, setProductStandardRef] = useState('');
  const [clauseRefsList, setClauseRefsList] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [normsRes, docsRes, prodsRes] = await Promise.all([
          documentApi.getIsoNorms(),
          documentApi.list(),
          productApi.list(),
        ]);
        if (cancelled) return;
        setIsoNorms(Array.isArray(normsRes.data) ? (normsRes.data as IsoNormOption[]) : []);
        const allDocs = Array.isArray(docsRes.data) ? (docsRes.data as ProductDocOption[]) : [];
        setProductDocs(
          allDocs.filter((d) => d.status === 'READY' && d.type !== 'WORKSPACE_FILE' && (d.type === 'PRODUCT_DOC' || (!!d.productId && d.type !== 'ISO_NORM'))),
        );
        setProducts(Array.isArray(prodsRes.data) ? (prodsRes.data as ProductOption[]) : []);
      } catch (err) {
        if (!cancelled) toast.error(apiMessage(err, 'Failed to load options'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setIsoDocumentId('');
    setProductDocumentId('');
    setProductStandardRef('');
    setClauseRefsList('');
  };

  /** Product behind the chosen document: the source of the declared standards. */
  const selectedProduct = useMemo(() => {
    const doc = productDocs.find((d) => d.id === productDocumentId);
    if (!doc?.productId) return null;
    return products.find((p) => p.id === doc.productId) ?? null;
  }, [productDocumentId, productDocs, products]);

  const declaredStandards: ProductStandardRef[] = useMemo(
    () => collectProductStandards(selectedProduct),
    [selectedProduct],
  );

  /**
   * Standard options built from the product's declarations, same model as the
   * Compliance Engine form. Declarations with no activated document are listed
   * but disabled, since an evaluation needs real clauses to score against.
   */
  const { declaredOptions, unmatchedDeclarations, otherNorms } = useMemo(() => {
    const declared: Array<{ value: string; label: string; sourceLabel: string }> = [];
    const unmatched: Array<{ value: string; sourceLabel: string }> = [];
    const usedNormIds = new Set<string>();

    for (const s of declaredStandards) {
      const hits = isoNorms.filter((n) => standardMatchesRef(n, s.value));
      if (hits.length === 0) {
        unmatched.push({ value: s.value, sourceLabel: s.sourceLabel });
        continue;
      }
      for (const n of hits) {
        usedNormIds.add(n.id);
        declared.push({
          value: `${n.id}::${s.value}`,
          label: `${s.value} → ${formatIsoNormSelectLabel(n)}`,
          sourceLabel: s.sourceLabel,
        });
      }
    }
    return {
      declaredOptions: declared,
      unmatchedDeclarations: unmatched,
      otherNorms: isoNorms.filter((n) => !usedNormIds.has(n.id)),
    };
  }, [isoNorms, declaredStandards]);

  // Changing the product invalidates a standard picked for the previous one.
  useEffect(() => {
    setProductStandardRef('');
    setIsoDocumentId('');
  }, [productDocumentId]);

  const handleClose = (next: boolean) => {
    if (creating) return;
    onOpenChange(next);
    if (!next) setTimeout(reset, 220);
  };

  const onSubmit = async () => {
    if (!productDocumentId) {
      toast.error('Select a product document first');
      return;
    }
    if (!isoDocumentId) {
      toast.error('Select the standard document to evaluate against');
      return;
    }
    setCreating(true);
    try {
      const norm = isoNorms.find((n) => n.id === isoDocumentId);
      const productDoc = productDocs.find((d) => d.id === productDocumentId);
      const product = products.find((p) => p.id === productDoc?.productId);
      await evaluationApi.create({
        isoDocumentId,
        productDocumentId,
        isoStandard: norm?.isoStandard ?? norm?.name ?? '',
        productName: typeof product?.name === 'string' ? product.name : undefined,
        evaluationMetadata: {
          standardReference: norm?.isoStandard?.trim() || norm?.name?.trim() || null,
          standardTitle:
            norm?.name?.trim() && norm?.isoStandard?.trim() && norm.name.trim() !== norm.isoStandard.trim()
              ? norm.name.trim()
              : null,
          standardName: norm?.name ?? norm?.isoStandard ?? null,
          isoStandard: norm?.isoStandard ?? norm?.name ?? null,
          productName: product?.name ?? null,
          productId: product?.id ?? productDoc?.productId ?? null,
          productDocumentName: productDoc?.name ?? productDoc?.fileName ?? null,
          /** Which of the product's declared obligations this run was started for. */
          productDeclaredStandard: productStandardRef || null,
          companyName: user?.company?.name?.trim() || null,
        },
        reportContext: {
          company: {
            companyName: user?.company?.name?.trim() || '',
            address: (user?.company as { field?: string } | undefined)?.field?.trim() || '',
            email: '',
            phone: user?.phone?.trim() || '',
          },
          initiator: {
            firstName: user?.firstName?.trim() || '',
            lastName: user?.lastName?.trim() || '',
            email: user?.email?.trim() || '',
          },
        },
        clauseWeights: parseClauseRefListToWeights(clauseRefsList),
      });
      toast.success('Evaluation queued. Visible on the Compliance engine page');
      onCreated?.();
      onOpenChange(false);
      setTimeout(reset, 220);
    } catch (err) {
      toast.error(apiMessage(err, 'Failed to create evaluation'));
    } finally {
      setCreating(false);
    }
  };

  const canSubmit = !loading && !creating && !!isoDocumentId && !!productDocumentId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run a new evaluation</DialogTitle>
          <DialogDescription>
            Start from the product, then choose which of its declared standards to assess it
            against. Clauses are optional.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" />
            <p className="text-xs text-[var(--muted)]">Loading documents…</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* 1: the product being assessed drives everything below it. */}
            <div>
              <Label>
                <span className="mr-1.5 text-[var(--brand-primary)]">1.</span>Product document
              </Label>
              <Select
                value={productDocumentId}
                onValueChange={setProductDocumentId}
                disabled={creating}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a product document" />
                </SelectTrigger>
                <SelectContent>
                  {productDocs.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-[var(--muted)]">
                      No product documents yet. Upload one from the file library.
                    </div>
                  ) : (
                    productDocs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {productDocLabel(d, products)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {productDocumentId && <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Processed, accessible documents for this product will be included as evidence. Evidence that was not approved makes the result preliminary; approve it and run the assessment again to receive a score.</p>}
            </div>

            {/* 2: the standard, listed from the certificates the product declares. */}
            <div>
              <Label>
                <span className="mr-1.5 text-[var(--brand-primary)]">2.</span>Standard document
              </Label>
              <Select
                value={isoDocumentId ? `${isoDocumentId}::${productStandardRef}` : ''}
                onValueChange={(v) => {
                  const [docId, declaredRef = ''] = v.split('::');
                  setIsoDocumentId(docId);
                  setProductStandardRef(declaredRef);
                }}
                disabled={creating || !productDocumentId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={productDocumentId ? 'Choose a standard' : 'Select a product document first'}
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[min(30rem,90vw)]">
                  {isoNorms.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-[var(--muted)]">
                      No active standards yet. Activate one from the file library.
                    </div>
                  ) : (
                    <>
                      {declaredOptions.length > 0 && (
                        <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-primary)]">
                          Declared by this product
                        </div>
                      )}
                      {declaredOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="block max-w-[26rem]" title={o.label}>
                            <span className="line-clamp-2 text-[13px] leading-snug">{o.label}</span>
                            <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--muted)]">
                              {o.sourceLabel}
                            </span>
                          </span>
                        </SelectItem>
                      ))}

                      {unmatchedDeclarations.length > 0 && (
                        <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Declared: not in Standards Library
                        </div>
                      )}
                      {unmatchedDeclarations.map((o) => (
                        <div
                          key={o.value}
                          title={o.value}
                          className="px-2 py-1.5 text-[12px] leading-snug text-[var(--muted)] opacity-70"
                        >
                          <span className="line-clamp-2">{o.value}</span>
                        </div>
                      ))}

                      {otherNorms.length > 0 && (
                        <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {declaredOptions.length > 0 ? 'Other standards in the library' : 'Standards library'}
                        </div>
                      )}
                      {otherNorms.map((n) => (
                        <SelectItem key={n.id} value={`${n.id}::`}>
                          {formatIsoNormSelectLabel(n)}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {productDocumentId && declaredStandards.length === 0 && (
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {selectedProduct?.name?.trim() || 'This product'} declares no certifications or
                  regulations yet. Add them in the product form to see them listed here.
                </p>
              )}
              {productDocumentId && declaredOptions.length === 0 && unmatchedDeclarations.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  This product declares {unmatchedDeclarations.length} standard
                  {unmatchedDeclarations.length > 1 ? 's' : ''}, but none is activated in the
                  Standards Library yet.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="run-eval-clauses">
                <span className="mr-1.5 text-[var(--brand-primary)]">3.</span>Optional clauses
              </Label>
              <Input
                id="run-eval-clauses"
                value={clauseRefsList}
                onChange={(e) => setClauseRefsList(e.target.value)}
                placeholder="e.g. 4.1, 4.2.1, 6.3"
                disabled={creating}
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Comma-separated clause refs. Leave blank to evaluate all.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit} className="gap-2">
            <LineChart className="h-4 w-4" />
            {creating ? 'Starting…' : 'Start evaluation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
