'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StepIdentity, type CompanyIdentityData } from '@/components/company/StepIdentity';
import { StepActivity, type ActivityProductsData } from '@/components/company/StepActivity';
import { StepMarkets, type MarketsComplianceData } from '@/components/company/StepMarkets';
import { StepQuality, type QualityTeamData } from '@/components/company/StepQuality';
import { companyProfileApi } from '@/lib/api';
import toast from 'react-hot-toast';
import './company-wizard.css';

type Step = { label: string; subtitle: string };

const STEPS: Step[] = [
  { label: 'Company Identity', subtitle: 'Legal info & location' },
  { label: 'Activity & Products', subtitle: 'Sector, products, processes' },
  { label: 'Markets & Compliance', subtitle: 'Export scope & certifications' },
  { label: 'Quality Team', subtitle: 'Maturity & contacts' },
];

const READINESS_CHIPS = ['Company identity', 'Activity & products', 'Markets & compliance', 'Quality team'];

function createEmptyIdentity(): CompanyIdentityData {
  return {
    legalName: '',
    tradeName: '',
    country: '',
    address: '',
    registrationNumber: '',
    yearFounded: '',
    website: '',
    logoFile: null,
    logoPreview: '',
  };
}

function createEmptyActivity(): ActivityProductsData {
  return {
    primarySector: '',
    subSectors: [],
    products: [],
    productionProcesses: [],
    rawMaterials: [],
    assetTypes: [],
  };
}

function createEmptyMarkets(): MarketsComplianceData {
  return {
    sites: [{ siteName: '', country: '', city: '', role: '' }],
    targetMarkets: [],
    certifications: [],
    targetCertifications: [],
    industryLabels: [],
  };
}

function createEmptyQuality(): QualityTeamData {
  return {
    maturityLevel: '',
    employeeRange: '',
    revenueRange: '',
    qualityTeamSize: '',
    qualityManagerName: '',
    qualityManagerEmail: '',
    qualityChallenges: [],
    hasDocuments: false,
  };
}

/** Map API response entity fields → local step data shapes. */
function mapProfileToState(profile: any) {
  const identity: CompanyIdentityData = {
    legalName: profile.legalName ?? '',
    tradeName: profile.tradeName ?? '',
    country: profile.headquartersCountry ?? '',
    address: profile.headquartersAddress ?? '',
    registrationNumber: profile.registrationNumber ?? '',
    yearFounded: profile.yearFounded?.toString() ?? '',
    website: profile.website ?? '',
    logoFile: null,
    logoPreview: '',
  };

  const activity: ActivityProductsData = {
    primarySector: profile.primarySector ?? '',
    subSectors: profile.subSectors ?? [],
    products: profile.products ?? [],
    productionProcesses: profile.productionProcesses ?? [],
    rawMaterials: profile.rawMaterials ?? [],
    assetTypes: profile.assetTypes ?? [],
  };

  const sites = profile.sites ?? [];
  const markets: MarketsComplianceData = {
    sites: sites.length > 0 ? sites : [{ siteName: '', country: '', city: '', role: '' }],
    targetMarkets: profile.targetMarkets ?? [],
    certifications: profile.certifications ?? [],
    targetCertifications: profile.targetCertifications ?? [],
    industryLabels: profile.industryLabels ?? [],
  };

  const quality: QualityTeamData = {
    maturityLevel: profile.maturityLevel ?? '',
    employeeRange: profile.employeeRange ?? '',
    revenueRange: profile.revenueRange ?? '',
    qualityTeamSize: profile.qualityTeamSize?.toString() ?? '',
    qualityManagerName: profile.qualityManagerName ?? '',
    qualityManagerEmail: profile.qualityManagerEmail ?? '',
    qualityChallenges: profile.qualityChallenges ?? [],
    hasDocuments: profile.hasDocuments ?? false,
  };

  return { identity, activity, markets, quality };
}

/** Map local step data → API payload fields. */
function buildPayload(identity: CompanyIdentityData, activity: ActivityProductsData, markets: MarketsComplianceData, quality: QualityTeamData) {
  return {
    identity: {
      legalName: identity.legalName || undefined,
      tradeName: identity.tradeName || undefined,
      headquartersCountry: identity.country || undefined,
      headquartersAddress: identity.address || undefined,
      registrationNumber: identity.registrationNumber || undefined,
      yearFounded: identity.yearFounded ? parseInt(identity.yearFounded, 10) : undefined,
      website: identity.website || undefined,
    },
    activity: {
      primarySector: activity.primarySector || undefined,
      subSectors: activity.subSectors.length > 0 ? activity.subSectors : undefined,
      products: activity.products.length > 0 ? activity.products : undefined,
      productionProcesses: activity.productionProcesses.length > 0 ? activity.productionProcesses : undefined,
      rawMaterials: activity.rawMaterials.length > 0 ? activity.rawMaterials : undefined,
      assetTypes: activity.assetTypes.length > 0 ? activity.assetTypes : undefined,
    },
    markets: {
      sites: markets.sites.filter((s) => s.siteName.trim()),
      targetMarkets: markets.targetMarkets.length > 0 ? markets.targetMarkets : undefined,
      certifications: markets.certifications.length > 0 ? markets.certifications : undefined,
      targetCertifications: markets.targetCertifications.length > 0 ? markets.targetCertifications : undefined,
      industryLabels: markets.industryLabels.length > 0 ? markets.industryLabels : undefined,
    },
    quality: {
      maturityLevel: quality.maturityLevel || undefined,
      employeeRange: quality.employeeRange || undefined,
      revenueRange: quality.revenueRange || undefined,
      qualityTeamSize: quality.qualityTeamSize ? parseInt(quality.qualityTeamSize, 10) : undefined,
      qualityManagerName: quality.qualityManagerName || undefined,
      qualityManagerEmail: quality.qualityManagerEmail || undefined,
      qualityChallenges: quality.qualityChallenges.length > 0 ? quality.qualityChallenges : undefined,
      hasDocuments: quality.hasDocuments || undefined,
    },
  };
}

export default function CompanyPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);

  const [identity, setIdentity] = useState<CompanyIdentityData>(createEmptyIdentity());
  const [activity, setActivity] = useState<ActivityProductsData>(createEmptyActivity());
  const [markets, setMarkets] = useState<MarketsComplianceData>(createEmptyMarkets());
  const [quality, setQuality] = useState<QualityTeamData>(createEmptyQuality());

  // Load existing profile on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await companyProfileApi.getProfile();
        if (cancelled) return;
        const profile = res.data;
        if (profile) {
          const mapped = mapProfileToState(profile);
          setIdentity(mapped.identity);
          setActivity(mapped.activity);
          setMarkets(mapped.markets);
          setQuality(mapped.quality);
          if (profile.currentStep) setCurrentStep(profile.currentStep);
          if (profile.onboardingStatus === 'COMPLETED') {
            setIsCompleted(true);
          }
          // Mark completed steps based on data presence
          const completed: number[] = [];
          if (profile.legalName) completed.push(0);
          if (profile.primarySector) completed.push(1);
          if (profile.sites?.length > 0) completed.push(2);
          if (profile.maturityLevel) completed.push(3);
          setCompletedSteps(completed);
        }
      } catch {
        // Profile doesn't exist yet: that's fine
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const validateStep = useCallback(
    (step: number): boolean => {
      switch (step) {
        case 0:
          if (!identity.legalName.trim()) {
            toast.error('Legal company name is required');
            return false;
          }
          if (!identity.country) {
            toast.error('Country of headquarters is required');
            return false;
          }
          return true;
        case 1:
          if (!activity.primarySector) {
            toast.error('Primary industry sector is required');
            return false;
          }
          if (activity.subSectors.length === 0) {
            toast.error('At least one sub-sector is required');
            return false;
          }
          if (activity.products.length === 0) {
            toast.error('At least one product is required');
            return false;
          }
          if (activity.productionProcesses.length === 0) {
            toast.error('Select at least one production process');
            return false;
          }
          return true;
        case 2:
          if (markets.sites.some((s) => !s.siteName.trim() || !s.country || !s.role)) {
            toast.error('Complete all required site fields');
            return false;
          }
          if (markets.targetMarkets.length === 0) {
            toast.error('Select at least one target market');
            return false;
          }
          if (markets.targetCertifications.length === 0) {
            toast.error('Add at least one target certification');
            return false;
          }
          return true;
        case 3:
          if (!quality.maturityLevel) {
            toast.error('Select your quality maturity level');
            return false;
          }
          if (!quality.employeeRange) {
            toast.error('Number of employees is required');
            return false;
          }
          if (!quality.qualityManagerName.trim()) {
            toast.error('Quality manager name is required');
            return false;
          }
          if (!quality.qualityManagerEmail.trim()) {
            toast.error('Quality manager email is required');
            return false;
          }
          return true;
        default:
          return true;
      }
    },
    [identity, activity, markets, quality]
  );

  const saveStepToApi = async (nextStep: number) => {
    const payload = buildPayload(identity, activity, markets, quality);
    await companyProfileApi.saveProfile({
      ...payload,
      currentStep: nextStep,
      onboardingStatus: 'IN_PROGRESS',
    });
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) return;
    setIsSaving(true);
    try {
      const nextStep = Math.min(currentStep + 1, STEPS.length - 1);
      await saveStepToApi(nextStep);
      setCompletedSteps((prev) => [...new Set([...prev, currentStep])]);
      setCurrentStep(nextStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('Failed to save progress');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAndExit = async () => {
    setIsSaving(true);
    try {
      const payload = buildPayload(identity, activity, markets, quality);
      await companyProfileApi.saveProfile({
        ...payload,
        currentStep,
        onboardingStatus: 'IN_PROGRESS',
      });
      toast.success('Progress saved successfully');
    } catch {
      toast.error('Failed to save progress');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!validateStep(currentStep)) return;
    setIsSaving(true);
    try {
      const payload = buildPayload(identity, activity, markets, quality);
      await companyProfileApi.saveProfile({
        ...payload,
        currentStep: STEPS.length - 1,
        onboardingStatus: 'COMPLETED',
      });
      await companyProfileApi.complete();
      toast.success('Company profile completed!');
      setIsCompleted(true);
      setCompletedSteps((prev) => [...new Set([...prev, currentStep])]);
    } catch {
      toast.error('Failed to submit profile');
    } finally {
      setIsSaving(false);
    }
  };

  const isLastStep = currentStep === STEPS.length - 1;

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepIdentity data={identity} onChange={(d) => setIdentity((p) => ({ ...p, ...d }))} />;
      case 1:
        return <StepActivity data={activity} onChange={(d) => setActivity((p) => ({ ...p, ...d }))} />;
      case 2:
        return <StepMarkets data={markets} onChange={(d) => setMarkets((p) => ({ ...p, ...d }))} />;
      case 3:
        return <StepQuality data={quality} onChange={(d) => setQuality((p) => ({ ...p, ...d }))} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout pageTitle="My company" pageTagline="">
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-[var(--muted)]">Loading profile...</p>
        </div>
      </DashboardLayout>
    );
  }

  // Per-step completion drives the readiness ring, chips, and step-bar checkmarks.
  const stepDone = [
    !!identity.legalName.trim() && !!identity.country,
    !!activity.primarySector && activity.subSectors.length > 0 && activity.products.length > 0 && activity.productionProcesses.length > 0,
    markets.sites.some((s) => s.siteName.trim() && s.country && s.role) && markets.targetMarkets.length > 0 && markets.targetCertifications.length > 0,
    !!quality.maturityLevel && !!quality.employeeRange && !!quality.qualityManagerName.trim() && !!quality.qualityManagerEmail.trim(),
  ];
  const stepComplete = STEPS.map((_, i) => stepDone[i] || completedSteps.includes(i));
  const doneCount = stepComplete.filter(Boolean).length;
  const readinessPct = isCompleted ? 100 : Math.round((doneCount / STEPS.length) * 100);
  const RING_C = 2 * Math.PI * 24;
  const ringOffset = RING_C * (1 - readinessPct / 100);

  return (
    <DashboardLayout pageTitle="My company" pageTagline="">
      <div className="qw">
        {/* Readiness banner */}
        <div className="readiness-banner">
          <div className="readiness-ring">
            <svg width="58" height="58" viewBox="0 0 58 58">
              <circle className="ring-track" cx="29" cy="29" r="24" />
              <circle
                className="ring-fill"
                cx="29"
                cy="29"
                r="24"
                style={{ strokeDasharray: RING_C, strokeDashoffset: ringOffset }}
              />
            </svg>
            <div className="ring-label">{readinessPct}%</div>
          </div>
          <div className="readiness-info">
            <div className="readiness-title">
              {isCompleted
                ? 'Readiness: Profile complete'
                : 'Readiness: In Progress, AI features are locked'}
            </div>
            <div className="readiness-desc">
              Complete your company profile and upload your product documents to unlock compliance
              evaluation and regulatory monitoring.
            </div>
            <div className="readiness-items">
              {READINESS_CHIPS.map((label, i) => (
                <span key={label} className={`readiness-chip ${stepComplete[i] ? 'done' : 'todo'}`}>
                  {stepComplete[i] ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  )}
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Wizard card */}
        <div className="wizard-card">
          <div className="wizard-steps">
            {STEPS.map((step, i) => {
              const cls = i === currentStep ? 'active' : stepComplete[i] ? 'done' : '';
              return (
                <button
                  type="button"
                  key={step.label}
                  className={`step-item ${cls}`}
                  onClick={() => setCurrentStep(i)}
                >
                  <div className="step-circle">
                    {stepComplete[i] && i !== currentStep ? '✓' : i + 1}
                  </div>
                  <div className="step-text">
                    <div className="step-label">{step.label}</div>
                    <div className="step-sub">{step.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {renderStep()}

          <div className="wizard-footer">
            <div className="footer-left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Progress saved automatically
            </div>
            <div className="footer-btns">
              {currentStep > 0 && (
                <button type="button" className="btn btn-text" onClick={handleBack} disabled={isSaving}>
                  ← Back
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={handleSaveAndExit} disabled={isSaving}>
                Save &amp; exit
              </button>
              {isLastStep ? (
                <button type="button" className="btn btn-complete" onClick={handleComplete} disabled={isSaving}>
                  {isSaving ? <><span className="btn-spinner" />Completing…</> : <>Complete profile&nbsp;✓</>}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={handleNext} disabled={isSaving}>
                  {isSaving ? <><span className="btn-spinner" />Saving…</> : <>Continue&nbsp;→</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
