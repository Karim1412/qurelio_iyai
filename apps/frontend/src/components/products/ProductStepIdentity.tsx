'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AiChip, AiLabel } from '@/components/products/AiFilled';
import { cn } from '@/utils/cn';

// ── Soft illustrated SVG icons for each product type ────────────────────────

function FinishedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <rect x="8" y="14" width="32" height="24" rx="4" fill="currentColor" opacity="0.12" />
      <rect x="12" y="10" width="24" height="28" rx="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M18 22l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="6" width="8" height="6" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function SemiFinishedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <rect x="10" y="16" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" opacity="0.08" />
      <path d="M10 24h28" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
      <rect x="16" y="20" width="6" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="currentColor" opacity="0.15" />
      <rect x="26" y="20" width="6" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="currentColor" opacity="0.15" />
      <circle cx="24" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M24 9v-3M21 12h-3M27 12h3M21.5 10l-2-2M26.5 10l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ComponentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="1.8" fill="currentColor" opacity="0.08" />
      <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="1.4" fill="currentColor" opacity="0.18" />
      <path d="M24 10v4M24 34v4M10 24h4M34 24h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.3 14.3l2.8 2.8M30.9 30.9l2.8 2.8M14.3 33.7l2.8-2.8M30.9 17.1l2.8-2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function RawMaterialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <path d="M12 34l12-6 12 6v4l-12 6-12-6v-4z" fill="currentColor" opacity="0.1" />
      <path d="M12 34l12-6 12 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 26l12-6 12 6v8l-12 6-12-6v-8z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      <path d="M12 18l12-6 12 6v8l-12 6-12-6v-8z" stroke="currentColor" strokeWidth="1.8" fill="currentColor" opacity="0.15" strokeLinejoin="round" />
      <path d="M12 18l12-6 12 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ServiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.8" fill="currentColor" opacity="0.06" />
      <path d="M18 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="28" r="2" fill="currentColor" opacity="0.25" />
      <path d="M24 30v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21 36h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 18l-2-3M32 18l2-3M24 12v-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="24" cy="20" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

const PRODUCT_TYPES = [
  { value: 'finished', label: 'Finished', desc: 'Ready-to-sell product', Icon: FinishedIcon, color: 'emerald' },
  { value: 'semi_finished', label: 'Semi-finished', desc: 'Needs further processing', Icon: SemiFinishedIcon, color: 'blue' },
  { value: 'component', label: 'Component', desc: 'Supplied to manufacturer', Icon: ComponentIcon, color: 'violet' },
  { value: 'raw_material', label: 'Raw material', desc: 'Input / feedstock', Icon: RawMaterialIcon, color: 'amber' },
  { value: 'service', label: 'Service', desc: 'Engineering / lab service', Icon: ServiceIcon, color: 'rose' },
];

const TYPE_COLORS: Record<string, { sel: string; hover: string; icon: string }> = {
  emerald: { sel: 'border-emerald-400 bg-emerald-50 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]', hover: 'hover:border-emerald-300/50', icon: 'text-emerald-600' },
  blue:    { sel: 'border-blue-400 bg-blue-50 shadow-[0_0_0_3px_rgba(96,165,250,0.15)]', hover: 'hover:border-blue-300/50', icon: 'text-blue-600' },
  violet:  { sel: 'border-violet-400 bg-violet-50 shadow-[0_0_0_3px_rgba(167,139,250,0.15)]', hover: 'hover:border-violet-300/50', icon: 'text-violet-600' },
  amber:   { sel: 'border-amber-400 bg-amber-50 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]', hover: 'hover:border-amber-300/50', icon: 'text-amber-600' },
  rose:    { sel: 'border-rose-400 bg-rose-50 shadow-[0_0_0_3px_rgba(251,113,133,0.15)]', hover: 'hover:border-rose-300/50', icon: 'text-rose-600' },
};

const PRODUCT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'discontinued', label: 'Discontinued' },
];

export interface ProductIdentityData {
  name: string;
  sku: string;
  brandName: string;
  productFamily: string;
  category: string;
  productType: string;
  description: string;
  productStatus: string;
}

interface Props {
  data: ProductIdentityData;
  onChange: (d: Partial<ProductIdentityData>) => void;
  /** Field keys pre-filled from uploaded documents (see product-prefill.ts). */
  aiFields?: string[];
}

export function ProductStepIdentity({ data, onChange, aiFields }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Product Identity</h2>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <AiLabel required field="identity.name" aiFields={aiFields}>Product name</AiLabel>
          <Input value={data.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Classic Denim Jeans, Adult Range" />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <AiLabel field="identity.sku" aiFields={aiFields}>Internal reference / SKU</AiLabel>
            <Input value={data.sku} onChange={(e) => onChange({ sku: e.target.value })} placeholder="e.g. TIM-DJ-001" />
          </div>
          <div className="space-y-1.5">
            <AiLabel field="identity.brandName" aiFields={aiFields}>Brand / Trade name</AiLabel>
            <Input value={data.brandName} onChange={(e) => onChange({ brandName: e.target.value })} placeholder="If different from company brand" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <AiLabel field="identity.productFamily" aiFields={aiFields}>Product family / Line</AiLabel>
            <Input value={data.productFamily} onChange={(e) => onChange({ productFamily: e.target.value })} placeholder="e.g. Classic Range, Pro Series" />
          </div>
          <div className="space-y-1.5">
            <AiLabel field="identity.category" aiFields={aiFields}>Category</AiLabel>
            <Input value={data.category} onChange={(e) => onChange({ category: e.target.value })} placeholder="e.g. Denim outerwear, Workwear" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          <span>Product Type <span className="text-red-500">*</span></span>
          {aiFields?.includes('identity.productType') && <AiChip />}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PRODUCT_TYPES.map((t) => {
            const sel = data.productType === t.value;
            const colors = TYPE_COLORS[t.color];
            return (
              <button key={t.value} type="button" onClick={() => onChange({ productType: t.value })}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-200',
                  sel
                    ? colors.sel
                    : cn('border-[var(--input-border)] bg-[var(--surface)]', colors.hover),
                )}>
                <div className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                  sel ? 'bg-white/60' : 'bg-[var(--surface-muted)]',
                )}>
                  <t.Icon className={cn('h-8 w-8', sel ? colors.icon : 'text-[var(--muted)]')} />
                </div>
                <span className={cn('text-sm font-bold', sel ? colors.icon : 'text-[var(--text-primary)]')}>{t.label}</span>
                <span className="text-[11px] text-[var(--muted)]">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Description &amp; Status</p>
        <div className="space-y-1.5">
          <AiLabel field="identity.description" aiFields={aiFields}>Description</AiLabel>
          <Textarea value={data.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Optional: brief product description for internal reference..." rows={4} />
        </div>
        <div className="space-y-1.5">
          <Label>Product status <span className="text-red-500">*</span></Label>
          <Select value={data.productStatus} onValueChange={(v) => onChange({ productStatus: v })}>
            <SelectTrigger className="w-full md:w-64"><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {PRODUCT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
