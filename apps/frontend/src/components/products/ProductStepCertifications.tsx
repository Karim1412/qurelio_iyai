'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Info, Plus } from '@/components/icons';
import { AiChip } from '@/components/products/AiFilled';

export interface ProductCertEntry {
  standardName: string;
  certifyingBody: string;
  certificateNumber: string;
  marketScope: string;
  issueDate: string;
  expiryDate: string;
}

export interface ProductCertificationsData {
  productCertifications: ProductCertEntry[];
}

interface Props {
  data: ProductCertificationsData;
  onChange: (d: Partial<ProductCertificationsData>) => void;
  /** Field keys pre-filled from uploaded documents (see product-prefill.ts). */
  aiFields?: string[];
}

function createEmpty(): ProductCertEntry {
  return { standardName: '', certifyingBody: '', certificateNumber: '', marketScope: '', issueDate: '', expiryDate: '' };
}

export function ProductStepCertifications({ data, onChange, aiFields }: Props) {
  const update = (i: number, field: keyof ProductCertEntry, val: string) => {
    const next = [...data.productCertifications];
    next[i] = { ...next[i], [field]: val };
    onChange({ productCertifications: next });
  };

  const add = () => onChange({ productCertifications: [...data.productCertifications, createEmpty()] });
  const remove = (i: number) => onChange({ productCertifications: data.productCertifications.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Certifications</h2>
      </div>

      <div className="callout-info flex items-start gap-3 rounded-xl border border-[var(--callout-info-border)] bg-[var(--callout-info-bg)] p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
        <p className="text-[13px] leading-relaxed text-[var(--callout-info-text)]">
          These are certifications obtained for <strong>this specific product</strong>, distinct from company-level certifications in your Company Profile. Expiry alerts are sent 90 days before the expiry date.
        </p>
      </div>

      <div className="space-y-4">
        {data.productCertifications.map((cert, i) => (
          <div key={i} className="rounded-2xl border border-[var(--input-border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                Product certification {i + 1}
                {aiFields?.includes(`certifications.productCertifications.${i}`) && <AiChip />}
              </span>
              <button type="button" onClick={() => remove(i)} className="text-[var(--muted)] transition-hover hover:text-red-500">Remove</button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Standard / certification name <span className="text-red-500">*</span></Label>
                <Input value={cert.standardName} onChange={(e) => update(i, 'standardName', e.target.value)} placeholder="e.g. OEKO-TEX Standard 100" />
              </div>
              <div className="space-y-1.5">
                <Label>Certifying body</Label>
                <Input value={cert.certifyingBody} onChange={(e) => update(i, 'certifyingBody', e.target.value)} placeholder="e.g. Hohenstein Institute" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Certificate number</Label>
                <Input value={cert.certificateNumber} onChange={(e) => update(i, 'certificateNumber', e.target.value)} placeholder="e.g. 22.HIN.47821" />
              </div>
              <div className="space-y-1.5">
                <Label>Market scope</Label>
                <Input value={cert.marketScope} onChange={(e) => update(i, 'marketScope', e.target.value)} placeholder="e.g. EU, adult denim range" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Issue date</Label>
                <Input type="date" value={cert.issueDate} onChange={(e) => update(i, 'issueDate', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry date</Label>
                <Input type="date" value={cert.expiryDate} onChange={(e) => update(i, 'expiryDate', e.target.value)} />
              </div>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={add} className="w-full gap-2 border-dashed">
          <Plus className="h-4 w-4" />Add another product certification
        </Button>
      </div>
    </div>
  );
}
