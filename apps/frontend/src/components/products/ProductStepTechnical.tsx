'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { TagInput } from '@/components/company/TagInput';
import { Info } from '@/components/icons';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AiLabel } from '@/components/products/AiFilled';
import { COUNTRIES, PHYSICAL_FORMS, TARGET_USERS } from '@/components/products/product-options';
import { cn } from '@/utils/cn';

export interface ProductTechnicalData {
  intendedUse: string;
  targetUsers: string[];
  keyMaterials: string[];
  physicalForm: string;
  hsTariffCode: string;
  countryOfOrigin: string;
}

interface Props {
  data: ProductTechnicalData;
  onChange: (d: Partial<ProductTechnicalData>) => void;
  /** Field keys pre-filled from uploaded documents (see product-prefill.ts). */
  aiFields?: string[];
}

export function ProductStepTechnical({ data, onChange, aiFields }: Props) {
  const toggleUser = (u: string) => {
    const next = data.targetUsers.includes(u) ? data.targetUsers.filter((x) => x !== u) : [...data.targetUsers, u];
    onChange({ targetUsers: next });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Technical</h2>
      </div>

      <div className="callout-info flex items-start gap-3 rounded-xl border border-[var(--callout-info-border)] bg-[var(--callout-info-bg)] p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
        <p className="text-[13px] leading-relaxed text-[var(--callout-info-text)]">
          <strong>Most important field for AI accuracy.</strong> The intended use is injected directly into compliance evaluation prompts. A specific description (including what the product does, who uses it, in what context, and any known hazards) produces more accurate obligation matching than a vague one.
        </p>
      </div>

      <div className="space-y-1.5">
        <AiLabel required field="technical.intendedUse" aiFields={aiFields}>Intended use / Application</AiLabel>
        <Textarea value={data.intendedUse} onChange={(e) => onChange({ intendedUse: e.target.value })}
          placeholder="e.g. Denim jeans for adults: casual daily wear, retail-sold. 98% cotton, 2% elastane. Reactive dyes used for coloring. Stone-washed finish. Intended for EU and North African markets."
          rows={5} />
        <p className="text-right text-[11px] text-[var(--muted)]">{data.intendedUse.length} characters, aim for 80+ for best AI results</p>
        <p className="text-[11px] text-[var(--muted)]">Mention: what it is, who uses it, how it is used, what it is made of, and any known hazards or special conditions.</p>
      </div>

      <div className="space-y-2.5">
        <AiLabel required field="technical.targetUsers" aiFields={aiFields}>Target users</AiLabel>
        <div className="flex flex-wrap gap-2.5">
          {TARGET_USERS.map((u) => {
            const checked = data.targetUsers.includes(u);
            return (
              <label key={u} className={cn('inline-flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                checked ? 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
                  : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/25')}>
                <Checkbox checked={checked} onCheckedChange={() => toggleUser(u)} />{u}
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <AiLabel field="technical.keyMaterials" aiFields={aiFields}>Key materials &amp; components</AiLabel>
        <TagInput tags={data.keyMaterials} onChange={(keyMaterials) => onChange({ keyMaterials })} placeholder="Add material..." />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="space-y-1.5">
          <AiLabel field="technical.physicalForm" aiFields={aiFields}>Physical form</AiLabel>
          <Select value={data.physicalForm} onValueChange={(v) => onChange({ physicalForm: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {PHYSICAL_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <AiLabel field="technical.hsTariffCode" aiFields={aiFields}>HS tariff code</AiLabel>
          <Input value={data.hsTariffCode} onChange={(e) => onChange({ hsTariffCode: e.target.value })} placeholder="e.g. 620462" />
          <p className="text-[11px] text-[var(--muted)]">Harmonised System code. Used to match customs &amp; import regulations per export market.</p>
        </div>
        <div className="space-y-1.5">
          <AiLabel field="technical.countryOfOrigin" aiFields={aiFields}>Country of origin</AiLabel>
          <Select value={data.countryOfOrigin} onValueChange={(v) => onChange({ countryOfOrigin: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
