'use client';

import React from 'react';
import { ReqDot, QwTagField, QwCheckGrid } from '@/components/company/qw-fields';

const INDUSTRY_SECTORS = [
  'Textile & Apparel', 'Food & Beverage', 'Chemical & Pharmaceutical',
  'Automotive', 'Electronics & Electrical', 'Metal & Metallurgy',
  'Construction & Building Materials', 'Plastics & Rubber',
  'Paper & Packaging', 'Aerospace & Defense', 'Oil & Gas',
  'Agriculture & Agri-food', 'Mining & Quarrying', 'Energy & Utilities',
  'Healthcare & Medical Devices', 'Furniture & Wood', 'Printing & Publishing',
  'Sports & Leisure', 'Shipbuilding & Marine', 'Other',
];

const PRODUCTION_PROCESSES = [
  'Production / Assembly', 'Quality Control', 'Procurement',
  'Dyeing & Finishing', 'Cold Chain', 'Chemical Synthesis',
  'Sterilization', 'Logistics / Warehousing', 'R&D',
  'Packaging', 'Surface Treatment', 'Machining',
];

const ASSET_TYPES = [
  'Production machinery', 'Measuring instruments', 'Lifting equipment',
  'Pressure vessels', 'Electrical installations', 'Vehicles',
  'IT infrastructure', 'Medical equipment',
];

export interface ActivityProductsData {
  primarySector: string;
  subSectors: string[];
  products: string[];
  productionProcesses: string[];
  rawMaterials: string[];
  assetTypes: string[];
}

interface StepActivityProps {
  data: ActivityProductsData;
  onChange: (data: Partial<ActivityProductsData>) => void;
}

export function StepActivity({ data, onChange }: StepActivityProps) {
  return (
    <div className="wizard-panel">
      <div className="panel-header">
        <h2>Activity &amp; Products</h2>
        <p>Describe what your company makes and how. The AI uses this as its primary context filter.</p>
      </div>

      <div className="tip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <p><strong>Why this matters:</strong> the more specific you are here, the more accurate your compliance evaluations will be. &ldquo;Stainless steel food-contact valves&rdquo; is far more useful to the AI than &ldquo;industrial parts&rdquo;.</p>
      </div>

      <div className="form-section">
        <div className="form-grid cols-1">
          <div className="field">
            <label>Primary industry sector <ReqDot /></label>
            <select value={data.primarySector} onChange={(e) => onChange({ primarySector: e.target.value })}>
              <option value="">Select a sector…</option>
              {INDUSTRY_SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Sub-sector / Specific activity <ReqDot /></label>
            <QwTagField
              tags={data.subSectors}
              onChange={(subSectors) => onChange({ subSectors })}
              placeholder="Type and press Enter…"
            />
            <div className="field-hint">Be specific. E.g. &ldquo;Denim manufacturing&rdquo;, &ldquo;Contract finishing&rdquo;, &ldquo;Technical textiles&rdquo;</div>
          </div>

          <div className="field">
            <label>Products manufactured / sold <ReqDot /></label>
            <QwTagField
              tags={data.products}
              onChange={(products) => onChange({ products })}
              placeholder="Add a product and press Enter…"
            />
            <div className="field-hint">List specific products. The AI matches these against the regulation landscape to detect missing standards.</div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">Key Production Processes <ReqDot /></div>
        <QwCheckGrid
          options={PRODUCTION_PROCESSES}
          selected={data.productionProcesses}
          onChange={(productionProcesses) => onChange({ productionProcesses })}
        />
      </div>

      <div className="form-section">
        <div className="section-title">Raw Materials &amp; Key Inputs</div>
        <QwTagField
          tags={data.rawMaterials}
          onChange={(rawMaterials) => onChange({ rawMaterials })}
          placeholder="Add a material and press Enter…"
        />
        <div className="field-hint">Optional: helps the AI flag relevant chemical/material regulations (REACH, OEKO-TEX, etc.).</div>
      </div>

      <div className="form-section">
        <div className="section-title">Asset Types</div>
        <QwCheckGrid
          options={ASSET_TYPES}
          selected={data.assetTypes}
          onChange={(assetTypes) => onChange({ assetTypes })}
        />
      </div>
    </div>
  );
}
