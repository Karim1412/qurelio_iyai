'use client';

import React from 'react';
import { ReqDot, QwCheckGrid } from '@/components/company/qw-fields';

const MATURITY_LEVELS = [
  { value: 'none', icon: '🌱', label: 'None', description: 'Starting from scratch, no QMS or documentation in place' },
  { value: 'informal', icon: '📋', label: 'Informal', description: 'Practices exist but are undocumented or inconsistent' },
  { value: 'developing', icon: '🔧', label: 'Developing', description: 'Some written procedures, no formal QMS yet' },
  { value: 'established', icon: '🏗️', label: 'Established', description: 'Full QMS in place and operational, not yet certified' },
  { value: 'certified', icon: '🏆', label: 'Certified', description: 'Active certification in force (ISO 9001 or similar)' },
];

const EMPLOYEE_RANGES = ['1–10', '11–25', '26–50', '51–250', '251–500', '501–1000', '1000+'];

const REVENUE_RANGES = [
  'Under €1M', '€1M – €5M', '€5M – €10M', '€10M – €50M',
  '€50M – €100M', '€100M – €500M', 'Over €500M',
];

const QUALITY_CHALLENGES = [
  'Supplier control', 'Customer complaints', 'Document management',
  'Regulatory compliance', 'Production nonconformances', 'Employee training',
  'Audit preparation', 'Risk management',
];

export interface QualityTeamData {
  maturityLevel: string;
  employeeRange: string;
  revenueRange: string;
  qualityTeamSize: string;
  qualityManagerName: string;
  qualityManagerEmail: string;
  qualityChallenges: string[];
  hasDocuments: boolean;
}

interface StepQualityProps {
  data: QualityTeamData;
  onChange: (data: Partial<QualityTeamData>) => void;
}

export function StepQuality({ data, onChange }: StepQualityProps) {
  return (
    <div className="wizard-panel">
      <div className="panel-header">
        <h2>Quality Team &amp; Context</h2>
        <p>Tell us about your team and your current quality maturity. The AI calibrates its output to your level.</p>
      </div>

      <div className="form-section">
        <div className="section-title">Quality System Maturity <ReqDot /></div>
        <div className="maturity-grid">
          {MATURITY_LEVELS.map((level) => (
            <div
              key={level.value}
              className={`maturity-card${data.maturityLevel === level.value ? ' selected' : ''}`}
              onClick={() => onChange({ maturityLevel: level.value })}
            >
              <div className="maturity-icon">{level.icon}</div>
              <div className="maturity-title">{level.label}</div>
              <div className="maturity-desc">{level.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">Organisational Scale <ReqDot /></div>
        <div className="form-grid cols-3">
          <div className="field">
            <label>Number of employees <ReqDot /></label>
            <select value={data.employeeRange} onChange={(e) => onChange({ employeeRange: e.target.value })}>
              <option value="">Select…</option>
              {EMPLOYEE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Annual revenue range</label>
            <select value={data.revenueRange} onChange={(e) => onChange({ revenueRange: e.target.value })}>
              <option value="">Prefer not to say</option>
              {REVENUE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Quality team size</label>
            <input
              type="number"
              min={0}
              value={data.qualityTeamSize}
              onChange={(e) => onChange({ qualityTeamSize: e.target.value })}
              placeholder="Number of people"
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">Quality Manager <ReqDot /></div>
        <div className="tip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <p>The Quality Manager is pre-filled as the default reviewer for all AI-generated outputs (quarantine inbox), CAPA assignments, and audit programs.</p>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Full name <ReqDot /></label>
            <input type="text" value={data.qualityManagerName} onChange={(e) => onChange({ qualityManagerName: e.target.value })} placeholder="Full name" />
          </div>
          <div className="field">
            <label>Email <ReqDot /></label>
            <input type="email" value={data.qualityManagerEmail} onChange={(e) => onChange({ qualityManagerEmail: e.target.value })} placeholder="Work email address" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">Main Quality Challenges</div>
        <QwCheckGrid options={QUALITY_CHALLENGES} selected={data.qualityChallenges} onChange={(qualityChallenges) => onChange({ qualityChallenges })} />
      </div>

      <div className="form-section">
        <div className="section-title">Existing Documentation</div>
        <label className={`check-option${data.hasDocuments ? ' checked' : ''}`} style={{ width: '100%' }}>
          <input
            type="checkbox"
            checked={data.hasDocuments}
            onChange={(e) => onChange({ hasDocuments: e.target.checked })}
          />
          <span className="check-box" />
          We have existing quality documents to upload (procedures, records, reports…)
        </label>
        {data.hasDocuments && (
          <div className="tip" style={{ marginTop: 12, marginBottom: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
            <p>After saving this step, you&apos;ll be prompted to upload your product folder. Those documents build your <strong>Compliance Memory</strong> and unlock AI-powered compliance evaluation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
