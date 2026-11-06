'use client';

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { TagInput } from '@/components/company/TagInput';
import { AiLabel } from '@/components/products/AiFilled';
import { INDUSTRY_LABELS as LABELS, MARKETS } from '@/components/products/product-options';
import { cn } from '@/utils/cn';

export interface ProductMarketsData {
  targetMarkets: string[];
  requiredCertifications: string[];
  applicableRegulations: string[];
  industryLabels: string[];
}

interface Props {
  data: ProductMarketsData;
  onChange: (d: Partial<ProductMarketsData>) => void;
  /** Field keys pre-filled from uploaded documents (see product-prefill.ts). */
  aiFields?: string[];
}

export function ProductStepMarkets({ data, onChange, aiFields }: Props) {
  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Markets</h2>
      </div>

      <div className="space-y-2.5">
        <AiLabel required field="markets.targetMarkets" aiFields={aiFields}>Target markets for this product</AiLabel>
        <p className="text-[11px] text-[var(--muted)]">Select only the markets where this specific product is sold or targeted, not the company&apos;s full market list. The monitoring engine watches regulatory families for these markets only.</p>
        <div className="flex flex-wrap gap-2.5">
          {MARKETS.map((m) => {
            const checked = data.targetMarkets.includes(m);
            return (
              <label key={m} className={cn('inline-flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                checked ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
                  : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/25')}>
                <Checkbox checked={checked} onCheckedChange={() => onChange({ targetMarkets: toggle(data.targetMarkets, m) })} />{m}
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <AiLabel field="markets.requiredCertifications" aiFields={aiFields}>Required certifications</AiLabel>
        <TagInput tags={data.requiredCertifications} onChange={(requiredCertifications) => onChange({ requiredCertifications })} placeholder="Add a required certification..." />
        <p className="text-[11px] text-[var(--muted)]">Certifications legally required or targeted for the selected markets. These seed the compliance evaluation backlog and monitoring engine.</p>
      </div>

      <div className="space-y-1.5">
        <AiLabel field="markets.applicableRegulations" aiFields={aiFields}>Known applicable regulations</AiLabel>
        <TagInput tags={data.applicableRegulations} onChange={(applicableRegulations) => onChange({ applicableRegulations })} placeholder="Add a regulation name or ref..." />
        <p className="text-[11px] text-[var(--muted)]">Add any regulations you already know apply. Qurelio will suggest additional ones based on your product profile.</p>
      </div>

      <div className="space-y-2.5">
        <AiLabel field="markets.industryLabels" aiFields={aiFields}>Industry labels &amp; marks needed</AiLabel>
        <div className="flex flex-wrap gap-2.5">
          {LABELS.map((l) => {
            const checked = data.industryLabels.includes(l);
            return (
              <label key={l} className={cn('inline-flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                checked ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
                  : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/25')}>
                <Checkbox checked={checked} onCheckedChange={() => onChange({ industryLabels: toggle(data.industryLabels, l) })} />{l}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
