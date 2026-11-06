'use client';

import React from 'react';
import { ReqDot, QwTagField, QwCheckGrid } from '@/components/company/qw-fields';

const COUNTRIES = [
  'Tunisia', 'Morocco', 'Algeria', 'Egypt', 'France', 'Germany', 'Italy',
  'Spain', 'United Kingdom', 'Netherlands', 'Belgium', 'Turkey', 'Saudi Arabia',
  'UAE', 'Qatar', 'Kuwait', 'China', 'India', 'USA', 'Canada', 'Brazil',
];

const SITE_ROLES = ['Production', 'Warehouse', 'R&D Lab', 'Office', 'Distribution Center', 'Other'];

const EXPORT_MARKETS = [
  'European Union', 'USA (FDA-regulated)', 'USA (General)',
  'Gulf (GCC / GSO)', 'North Africa / Maghreb', 'Sub-Saharan Africa',
  'United Kingdom', 'Canada', 'China', 'Domestic (Tunisia)',
];

const INDUSTRY_LABELS = [
  'CE Marking', 'FDA Registration', 'Halal', 'Kosher',
  'Organic', 'Fair Trade', 'Ecolabel',
];

export interface SiteEntry {
  siteName: string;
  country: string;
  city: string;
  role: string;
}

export interface CertificationEntry {
  standardName: string;
  certifyingBody: string;
  issueDate: string;
  expiryDate: string;
  scopeNote: string;
}

export interface MarketsComplianceData {
  sites: SiteEntry[];
  targetMarkets: string[];
  certifications: CertificationEntry[];
  targetCertifications: string[];
  industryLabels: string[];
}

interface StepMarketsProps {
  data: MarketsComplianceData;
  onChange: (data: Partial<MarketsComplianceData>) => void;
}

function createEmptySite(): SiteEntry {
  return { siteName: '', country: '', city: '', role: '' };
}

function createEmptyCert(): CertificationEntry {
  return { standardName: '', certifyingBody: '', issueDate: '', expiryDate: '', scopeNote: '' };
}

export function StepMarkets({ data, onChange }: StepMarketsProps) {
  const updateSite = (index: number, field: keyof SiteEntry, value: string) => {
    const updated = [...data.sites];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ sites: updated });
  };
  const addSite = () => onChange({ sites: [...data.sites, createEmptySite()] });
  const removeSite = (index: number) => {
    if (data.sites.length <= 1) return;
    onChange({ sites: data.sites.filter((_, i) => i !== index) });
  };

  const updateCert = (index: number, field: keyof CertificationEntry, value: string) => {
    const updated = [...data.certifications];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ certifications: updated });
  };
  const addCert = () => onChange({ certifications: [...data.certifications, createEmptyCert()] });
  const removeCert = (index: number) =>
    onChange({ certifications: data.certifications.filter((_, i) => i !== index) });

  return (
    <div className="wizard-panel">
      <div className="panel-header">
        <h2>Markets &amp; Compliance Landscape</h2>
        <p>Where you sell determines which regulations apply. Your certifications set the baseline for AI evaluation.</p>
      </div>

      {/* Geographic Footprint */}
      <div className="form-section">
        <div className="section-title">Geographic Footprint</div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Production / Operation sites <ReqDot /></label>
          <div className="field-hint" style={{ marginBottom: 4 }}>Add at least one site. Multi-site companies can scope compliance evaluations per site.</div>
          <div className="repeatable-list">
            {data.sites.map((site, index) => (
              <div className="repeatable-block" key={index}>
                <div className="block-header">
                  <span className="block-label">Site {index + 1}</span>
                  {data.sites.length > 1 && (
                    <button type="button" className="block-remove" onClick={() => removeSite(index)}>Remove</button>
                  )}
                </div>
                <div className="form-grid cols-3" style={{ gap: 12 }}>
                  <div className="field">
                    <label>Site name <ReqDot /></label>
                    <input type="text" value={site.siteName} onChange={(e) => updateSite(index, 'siteName', e.target.value)} placeholder="e.g. Monastir Plant" />
                  </div>
                  <div className="field">
                    <label>Country <ReqDot /></label>
                    <select value={site.country} onChange={(e) => updateSite(index, 'country', e.target.value)}>
                      <option value="">Select</option>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>City</label>
                    <input type="text" value={site.city} onChange={(e) => updateSite(index, 'city', e.target.value)} placeholder="e.g. Monastir" />
                  </div>
                  <div className="field col-span-2" style={{ gridColumn: '1 / -1' }}>
                    <label>Role <ReqDot /></label>
                    <select value={site.role} onChange={(e) => updateSite(index, 'role', e.target.value)}>
                      <option value="">Select role</option>
                      {SITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="add-block-btn" onClick={addSite}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add another site
          </button>
        </div>

        <div className="field">
          <label>Target export markets <ReqDot /></label>
          <div className="field-hint" style={{ marginBottom: 4 }}>Select all markets you currently sell to or are actively targeting.</div>
          <QwCheckGrid options={EXPORT_MARKETS} selected={data.targetMarkets} onChange={(targetMarkets) => onChange({ targetMarkets })} />
        </div>
      </div>

      {/* Compliance Landscape */}
      <div className="form-section">
        <div className="section-title">Compliance Landscape</div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Current active certifications</label>
          <div className="field-hint" style={{ marginBottom: 4 }}>Add your existing certifications. Expiry dates trigger automatic reminders.</div>
          <div className="repeatable-list">
            {data.certifications.map((cert, index) => (
              <div className="repeatable-block" key={index}>
                <div className="block-header">
                  <span className="block-label">Certification {index + 1}</span>
                  <button type="button" className="block-remove" onClick={() => removeCert(index)}>Remove</button>
                </div>
                <div className="form-grid" style={{ gap: 12 }}>
                  <div className="field">
                    <label>Standard name <ReqDot /></label>
                    <input type="text" value={cert.standardName} onChange={(e) => updateCert(index, 'standardName', e.target.value)} placeholder="e.g. ISO 9001:2015" />
                  </div>
                  <div className="field">
                    <label>Certifying body</label>
                    <input type="text" value={cert.certifyingBody} onChange={(e) => updateCert(index, 'certifyingBody', e.target.value)} placeholder="e.g. Bureau Veritas, TÜV, SGS" />
                  </div>
                  <div className="field">
                    <label>Issue date</label>
                    <input type="date" value={cert.issueDate} onChange={(e) => updateCert(index, 'issueDate', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Expiry date</label>
                    <input type="date" value={cert.expiryDate} onChange={(e) => updateCert(index, 'expiryDate', e.target.value)} />
                  </div>
                  <div className="field col-span-2">
                    <label>Scope note</label>
                    <input type="text" value={cert.scopeNote} onChange={(e) => updateCert(index, 'scopeNote', e.target.value)} placeholder="Optional: e.g. 'Manufacturing of denim fabrics, Monastir plant only'" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="add-block-btn" onClick={addCert}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add a certification
          </button>
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Target certifications / standards <ReqDot /></label>
          <QwTagField
            tags={data.targetCertifications}
            onChange={(targetCertifications) => onChange({ targetCertifications })}
            placeholder="Add a target standard and press Enter…"
          />
          <div className="field-hint">The monitoring engine watches all regulatory families related to these standards.</div>
        </div>

        <div className="field">
          <label>Industry-specific labels / marks</label>
          <QwCheckGrid options={INDUSTRY_LABELS} selected={data.industryLabels} onChange={(industryLabels) => onChange({ industryLabels })} />
        </div>
      </div>
    </div>
  );
}
