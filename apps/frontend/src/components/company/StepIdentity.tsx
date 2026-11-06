'use client';

import React, { useRef } from 'react';
import { ReqDot } from '@/components/company/qw-fields';

const COUNTRIES = [
  'Tunisia', 'Morocco', 'Algeria', 'Egypt', 'France', 'Germany', 'Italy',
  'Spain', 'United Kingdom', 'Netherlands', 'Belgium', 'Turkey', 'Saudi Arabia',
  'UAE', 'Qatar', 'Kuwait', 'China', 'India', 'USA', 'Canada', 'Brazil',
  'Japan', 'South Korea', 'Singapore', 'Australia', 'South Africa', 'Nigeria',
];

export interface CompanyIdentityData {
  legalName: string;
  tradeName: string;
  country: string;
  address: string;
  registrationNumber: string;
  yearFounded: string;
  website: string;
  logoFile: File | null;
  logoPreview: string;
}

interface StepIdentityProps {
  data: CompanyIdentityData;
  onChange: (data: Partial<CompanyIdentityData>) => void;
}

export function StepIdentity({ data, onChange }: StepIdentityProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2 MB');
        return;
      }
      const preview = URL.createObjectURL(file);
      onChange({ logoFile: file, logoPreview: preview });
    }
  };

  return (
    <div className="wizard-panel">
      <div className="panel-header">
        <h2>Company Identity</h2>
        <p>Legal and administrative information about your organisation.</p>
      </div>

      <div className="form-section">
        <div className="form-grid">
          <div className="field">
            <label>Legal company name <ReqDot /></label>
            <input
              type="text"
              value={data.legalName}
              onChange={(e) => onChange({ legalName: e.target.value })}
              placeholder="e.g. Textile Industrie Maghreb S.A."
            />
          </div>
          <div className="field">
            <label>Trade name / Brand</label>
            <input
              type="text"
              value={data.tradeName}
              onChange={(e) => onChange({ tradeName: e.target.value })}
              placeholder="e.g. TIM Group"
            />
          </div>
          <div className="field">
            <label>Country of headquarters <ReqDot /></label>
            <select value={data.country} onChange={(e) => onChange({ country: e.target.value })}>
              <option value="">Select a country…</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Headquarters address</label>
            <input
              type="text"
              value={data.address}
              onChange={(e) => onChange({ address: e.target.value })}
              placeholder="Street, city, postal code"
            />
          </div>
          <div className="field">
            <label>Registration / Tax number</label>
            <input
              type="text"
              value={data.registrationNumber}
              onChange={(e) => onChange({ registrationNumber: e.target.value })}
              placeholder="MF, SIRET, RCS…"
            />
          </div>
          <div className="field">
            <label>Year founded</label>
            <input
              type="number"
              min={1800}
              max={new Date().getFullYear()}
              value={data.yearFounded}
              onChange={(e) => onChange({ yearFounded: e.target.value })}
              placeholder="e.g. 2004"
            />
          </div>
          <div className="field col-span-2">
            <label>Company website</label>
            <input
              type="url"
              value={data.website}
              onChange={(e) => onChange({ website: e.target.value })}
              placeholder="https://www.example.com"
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">Company Logo</div>
        <div className="logo-upload">
          <div className="logo-preview">
            {data.logoPreview ? (
              <img src={data.logoPreview} alt="Logo preview" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            )}
          </div>
          <div>
            <label className="logo-upload-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></svg>
              Upload logo
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                onChange={handleLogoChange}
                style={{ display: 'none' }}
              />
            </label>
            <div className="logo-upload-hint">PNG, JPG or SVG · Max 2 MB · Will be resized to 256×256</div>
          </div>
        </div>
      </div>
    </div>
  );
}
