'use client';

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { TagInput } from '@/components/company/TagInput';
import { AiLabel } from '@/components/products/AiFilled';
import { PRODUCTION_PROCESSES as PROCESSES } from '@/components/products/product-options';
import { cn } from '@/utils/cn';

export interface ProductManufacturingData {
  productionSites: string[];
  productionProcesses: string[];
  criticalSuppliers: string[];
}

interface Props {
  data: ProductManufacturingData;
  companySites?: string[];
  companyProcesses?: string[];
  onChange: (d: Partial<ProductManufacturingData>) => void;
  /** Field keys pre-filled from uploaded documents (see product-prefill.ts). */
  aiFields?: string[];
}

/** Append selections that are not in the configured list so nothing selected is invisible. */
function withSelected(options: string[], selected: string[]): string[] {
  return [...options, ...selected.filter((s) => !options.includes(s))];
}

export function ProductStepManufacturing({ data, companySites = [], companyProcesses = [], onChange, aiFields }: Props) {
  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const configuredSites = companySites.length > 0 ? companySites : [];
  const sites = withSelected(configuredSites, data.productionSites);
  const processes = withSelected(companyProcesses.length > 0 ? companyProcesses : PROCESSES, data.productionProcesses);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Manufacturing</h2>
      </div>

      <div className="space-y-2.5">
        <AiLabel field="manufacturing.productionSites" aiFields={aiFields}>Production sites</AiLabel>
        <p className="text-[11px] text-[var(--muted)]">Select the company sites where this product is produced. Pulled from your <span className="font-semibold text-[var(--brand-primary)]">Company Profile</span>.</p>
        {sites.length === 0 && (
          <p className="text-[13px] text-[var(--muted)]">No sites configured.</p>
        )}
        <div className="flex flex-wrap gap-2.5">
          {sites.map((s) => {
            const checked = data.productionSites.includes(s);
            return (
              <label key={s} className={cn('inline-flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                checked ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
                  : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/25')}>
                <Checkbox checked={checked} onCheckedChange={() => onChange({ productionSites: toggle(data.productionSites, s) })} />{s}
              </label>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--muted)]">Missing a site? <span className="font-semibold text-[var(--brand-primary)] cursor-pointer hover:underline">Add it in Company Profile →</span></p>
      </div>

      <div className="space-y-2.5">
        <AiLabel field="manufacturing.productionProcesses" aiFields={aiFields}>Relevant production processes</AiLabel>
        <p className="text-[11px] text-[var(--muted)]">Select processes involved in making this product. Pre-filled from your company profile.</p>
        <div className="flex flex-wrap gap-2.5">
          {processes.map((p) => {
            const checked = data.productionProcesses.includes(p);
            return (
              <label key={p} className={cn('inline-flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                checked ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
                  : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/25')}>
                <Checkbox checked={checked} onCheckedChange={() => onChange({ productionProcesses: toggle(data.productionProcesses, p) })} />{p}
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <AiLabel field="manufacturing.criticalSuppliers" aiFields={aiFields}>Critical suppliers &amp; inputs</AiLabel>
        <TagInput tags={data.criticalSuppliers} onChange={(criticalSuppliers) => onChange({ criticalSuppliers })} placeholder="Add a supplier or input name..." />
        <p className="text-[11px] text-[var(--muted)]">Optional. Links to Supplier Quality module. Used to scope supplier audits and SCARs related to this product.</p>
      </div>
    </div>
  );
}
