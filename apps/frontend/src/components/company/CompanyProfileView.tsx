'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  CheckCircle,
  Edit,
  Building,
  Factory,
  ShieldCheck,
  Pin,
  Mail,
  ExternalLink,
  Users,
  Camera,
  Settings,
} from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/utils/cn';
import type { CompanyIdentityData } from '@/components/company/StepIdentity';
import type { ActivityProductsData } from '@/components/company/StepActivity';
import type { MarketsComplianceData } from '@/components/company/StepMarkets';
import type { QualityTeamData } from '@/components/company/StepQuality';

const MATURITY_LABELS: Record<string, string> = {
  none: 'None',
  informal: 'Informal',
  developing: 'Developing',
  established: 'Established',
  certified: 'Certified',
};

interface CompanyProfileViewProps {
  identity: CompanyIdentityData;
  activity: ActivityProductsData;
  markets: MarketsComplianceData;
  quality: QualityTeamData;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (identity: CompanyIdentityData) => void;
  onSaveQuality: (activity: ActivityProductsData, markets: MarketsComplianceData, quality: QualityTeamData) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-[var(--muted)]">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-block rounded-full bg-[var(--brand-primary)]/8 px-2.5 py-0.5 text-xs font-medium text-[var(--brand-primary)]"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function InfoCard({ label, labelColor, icon, children }: { label: string; labelColor: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', labelColor)}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function CompanyProfileView({
  identity,
  activity,
  markets,
  quality,
  isEditing,
  onEdit,
  onSave,
  onSaveQuality,
  onCancel,
  isSaving,
}: CompanyProfileViewProps) {
  const user = useAuthStore((s) => s.user);
  const companyName = identity.legalName || user?.company?.name || 'Company';
  const companyEmail = user?.email || '';
  const companyCode = user?.company?.companyCode || '-';
  const roleLabel = user?.role?.replace('_', ' ') || 'Member';
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [editIdentity, setEditIdentity] = useState<CompanyIdentityData>(identity);
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [logoPreview, setLogoPreview] = useState<string>(identity.logoPreview || '');

  // Quality Info editing state
  const [isEditingQuality, setIsEditingQuality] = useState(false);
  const [editActivity, setEditActivity] = useState<ActivityProductsData>(activity);
  const [editMarkets, setEditMarkets] = useState<MarketsComplianceData>(markets);
  const [editQuality, setEditQuality] = useState<QualityTeamData>(quality);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setEditIdentity((p) => ({ ...p, logoFile: file, logoPreview: dataUrl }));
      // Auto-save logo immediately
      onSave({ ...identity, logoFile: file, logoPreview: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave(editIdentity);
  };

  const handleSaveQuality = () => {
    onSaveQuality(editActivity, editMarkets, editQuality);
    setIsEditingQuality(false);
  };

  const handleCancelQuality = () => {
    setEditActivity(activity);
    setEditMarkets(markets);
    setEditQuality(quality);
    setIsEditingQuality(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-8 py-6 shadow-sm">
        <div className="flex items-start gap-6">
          {/* Logo */}
          <div className="relative shrink-0">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--brand-primary)]/20 bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-accent)]/10">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-[var(--brand-primary)]">
                  {companyName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-colors hover:bg-[var(--nav-hover)]"
            >
              <Camera className="h-3.5 w-3.5 text-[var(--muted)]" />
            </button>
          </div>

          {/* Info */}
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border-[var(--brand-primary)]/20 text-[10px] font-bold uppercase tracking-wider">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {roleLabel}
              </Badge>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {companyName}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              Manage your company information and quality settings.
            </p>
            {companyEmail && (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--muted)]">
                <Mail className="h-3.5 w-3.5" />
                {companyEmail}
              </div>
            )}
          </div>

          {/* Remove photo (only when editing) */}
            {isEditing && identity.logoPreview && (
              <Button variant="ghost" className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => { setLogoPreview(''); setEditIdentity((p) => ({ ...p, logoFile: null, logoPreview: '' })); }}>
                Remove photo
              </Button>
            )}
        </div>
      </div>

      {/* ── Info Cards ─────────────────────────────────────────────── */}
      <div className="flex gap-4">
        <InfoCard
          label="Organization"
          labelColor="bg-blue-50 text-blue-600"
          icon={<Building className="h-3.5 w-3.5 text-blue-600" />}
        >
          <p className="text-base font-bold text-[var(--text-primary)]">{companyName}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">The workspace you are signed into right now.</p>
        </InfoCard>

        <InfoCard
          label="Workspace Code"
          labelColor="bg-amber-50 text-amber-600"
          icon={<Settings className="h-3.5 w-3.5 text-amber-600" />}
        >
          <p className="text-base font-bold tracking-wide text-[var(--text-primary)]">{companyCode}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Unique identifier for your tenant.</p>
        </InfoCard>

        <InfoCard
          label="Access"
          labelColor="bg-emerald-50 text-emerald-600"
          icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
        >
          <p className="text-base font-bold text-[var(--text-primary)]">{roleLabel}</p>
          <Badge variant="default" className="mt-1 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </Badge>
        </InfoCard>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="general">
        <TabsList className="px-2">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Quality Info
          </TabsTrigger>
        </TabsList>

        {/* ── General Tab ───────────────────────────────────────────── */}
        <TabsContent value="general">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  <Edit className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">Personal</p>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Edit profile</h3>
                </div>
              </div>
              {!isEditing && (
                <Button variant="outline" onClick={onEdit} className="gap-2">
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>

            <p className="mb-6 text-sm text-[var(--muted)]">
              Update your company name, contact details, and how you appear in the app.
            </p>

            {isEditing && (
              <div className="mb-3 flex justify-end">
                <Badge variant="default" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Editing
                </Badge>
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Company name
                </Label>
                {isEditing ? (
                  <Input
                    value={editIdentity.legalName}
                    onChange={(e) => setEditIdentity((p) => ({ ...p, legalName: e.target.value }))}
                    placeholder="Enter company name"
                  />
                ) : (
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 px-4 py-2.5 text-sm text-[var(--text-primary)]">
                    {identity.legalName || '-'}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Trade name
                </Label>
                {isEditing ? (
                  <Input
                    value={editIdentity.tradeName}
                    onChange={(e) => setEditIdentity((p) => ({ ...p, tradeName: e.target.value }))}
                    placeholder="Enter trade name"
                  />
                ) : (
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 px-4 py-2.5 text-sm text-[var(--text-primary)]">
                    {identity.tradeName || '-'}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Email
                  </Label>
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 px-4 py-2.5 text-sm text-[var(--muted)]">
                    {companyEmail}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">Email cannot be changed here</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Phone number
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+216 XX XXX XXX"
                    />
                  ) : (
                    <p className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 px-4 py-2.5 text-sm text-[var(--text-primary)]">
                      {user?.phone || '-'}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Country
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editIdentity.country}
                      onChange={(e) => setEditIdentity((p) => ({ ...p, country: e.target.value }))}
                      placeholder="Country"
                    />
                  ) : (
                    <p className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 px-4 py-2.5 text-sm text-[var(--text-primary)]">
                      {identity.country || '-'}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Website
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editIdentity.website}
                      onChange={(e) => setEditIdentity((p) => ({ ...p, website: e.target.value }))}
                      placeholder="https://example.com"
                    />
                  ) : (
                    <p className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 px-4 py-2.5 text-sm text-[var(--text-primary)]">
                      {identity.website ? (
                        <a
                          href={identity.website.startsWith('http') ? identity.website : `https://${identity.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {identity.website}
                        </a>
                      ) : (
                        '-'
                      )}
                    </p>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
                  <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                    {isSaving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Saving...
                      </>
                    ) : (
                      'Save changes'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Quality Info Tab ──────────────────────────────────────── */}
        <TabsContent value="quality">
          <div className="space-y-5">
            {/* Section header with Edit/Save */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--muted)]">
                {isEditingQuality ? 'Editing quality information' : 'View and manage your quality profile'}
              </p>
              <div className="flex items-center gap-2">
                {isEditingQuality ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={handleCancelQuality} disabled={isSaving}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveQuality} disabled={isSaving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                      {isSaving ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      Save changes
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsEditingQuality(true)} className="gap-2">
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Activity & Products */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Factory className="h-4.5 w-4.5" />
                </span>
                <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">Activity & Products</h3>
              </div>
              <div className="space-y-4">
                <EditRow label="Primary sector" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editActivity.primarySector} onChange={(e) => setEditActivity((p) => ({ ...p, primarySector: e.target.value }))} placeholder="Primary sector" />
                  ) : (
                    <span>{activity.primarySector || '-'}</span>
                  )}
                </EditRow>
                <EditRow label="Sub-sectors" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editActivity.subSectors.join(', ')} onChange={(e) => setEditActivity((p) => ({ ...p, subSectors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={activity.subSectors} />
                  )}
                </EditRow>
                <EditRow label="Products" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editActivity.products.join(', ')} onChange={(e) => setEditActivity((p) => ({ ...p, products: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={activity.products} />
                  )}
                </EditRow>
                <EditRow label="Processes" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editActivity.productionProcesses.join(', ')} onChange={(e) => setEditActivity((p) => ({ ...p, productionProcesses: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={activity.productionProcesses} />
                  )}
                </EditRow>
                <EditRow label="Raw materials" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editActivity.rawMaterials.join(', ')} onChange={(e) => setEditActivity((p) => ({ ...p, rawMaterials: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={activity.rawMaterials} />
                  )}
                </EditRow>
                <EditRow label="Asset types" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editActivity.assetTypes.join(', ')} onChange={(e) => setEditActivity((p) => ({ ...p, assetTypes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={activity.assetTypes} />
                  )}
                </EditRow>
              </div>
            </div>

            {/* Markets & Compliance */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Pin className="h-4.5 w-4.5" />
                </span>
                <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">Markets & Compliance</h3>
              </div>
              <div className="space-y-4">
                {markets.sites.filter((s) => s.siteName.trim()).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Sites</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {markets.sites
                        .filter((s) => s.siteName.trim())
                        .map((site, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-[var(--border)] bg-[var(--nav-hover)]/30 p-3"
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                              <Pin className="h-3 w-3 text-[var(--muted)]" />
                              {site.siteName}
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {site.city && `${site.city}, `}{site.country}
                              {site.role && ` · ${site.role}`}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                <EditRow label="Target markets" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editMarkets.targetMarkets.join(', ')} onChange={(e) => setEditMarkets((p) => ({ ...p, targetMarkets: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={markets.targetMarkets} />
                  )}
                </EditRow>
                <EditRow label="Certifications" editing={isEditingQuality}>
                  <ChipList items={isEditingQuality ? editMarkets.certifications.map((c) => c.standardName) : markets.certifications.map((c) => c.standardName)} />
                </EditRow>
                <EditRow label="Target certs" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editMarkets.targetCertifications.join(', ')} onChange={(e) => setEditMarkets((p) => ({ ...p, targetCertifications: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={markets.targetCertifications} />
                  )}
                </EditRow>
                <EditRow label="Industry labels" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editMarkets.industryLabels.join(', ')} onChange={(e) => setEditMarkets((p) => ({ ...p, industryLabels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={markets.industryLabels} />
                  )}
                </EditRow>
              </div>
            </div>

            {/* Quality Team */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </span>
                <h3 className="text-base font-bold tracking-tight text-[var(--text-primary)]">Quality Team & Context</h3>
              </div>
              <div className="space-y-4">
                <EditRow label="Maturity level" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editQuality.maturityLevel} onChange={(e) => setEditQuality((p) => ({ ...p, maturityLevel: e.target.value }))} placeholder="e.g. developing" />
                  ) : (
                    quality.maturityLevel ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)]/8 px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-primary)]">
                        <ShieldCheck className="h-3 w-3" />
                        {MATURITY_LABELS[quality.maturityLevel] || quality.maturityLevel}
                      </span>
                    ) : (
                      <span>-</span>
                    )
                  )}
                </EditRow>
                <EditRow label="Employees" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editQuality.employeeRange} onChange={(e) => setEditQuality((p) => ({ ...p, employeeRange: e.target.value }))} placeholder="e.g. 51–250" />
                  ) : (
                    <span>{quality.employeeRange || '-'}</span>
                  )}
                </EditRow>
                <EditRow label="Annual revenue" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editQuality.revenueRange} onChange={(e) => setEditQuality((p) => ({ ...p, revenueRange: e.target.value }))} placeholder="e.g. €1M – €5M" />
                  ) : (
                    <span>{quality.revenueRange || '-'}</span>
                  )}
                </EditRow>
                <EditRow label="Team size" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input type="number" min={0} value={editQuality.qualityTeamSize} onChange={(e) => setEditQuality((p) => ({ ...p, qualityTeamSize: e.target.value }))} placeholder="e.g. 4" />
                  ) : (
                    <span>{quality.qualityTeamSize ? `${quality.qualityTeamSize} people` : '-'}</span>
                  )}
                </EditRow>
                <EditRow label="Quality manager" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={editQuality.qualityManagerName} onChange={(e) => setEditQuality((p) => ({ ...p, qualityManagerName: e.target.value }))} placeholder="Name" />
                      <Input value={editQuality.qualityManagerEmail} onChange={(e) => setEditQuality((p) => ({ ...p, qualityManagerEmail: e.target.value }))} placeholder="Email" />
                    </div>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-[var(--muted)]" />
                      {quality.qualityManagerName || '-'}
                      {quality.qualityManagerEmail && (
                        <a href={`mailto:${quality.qualityManagerEmail}`} className="inline-flex items-center gap-1 text-[var(--brand-primary)] hover:underline">
                          <Mail className="h-3 w-3" />
                          {quality.qualityManagerEmail}
                        </a>
                      )}
                    </span>
                  )}
                </EditRow>
                <EditRow label="Challenges" editing={isEditingQuality}>
                  {isEditingQuality ? (
                    <Input value={editQuality.qualityChallenges.join(', ')} onChange={(e) => setEditQuality((p) => ({ ...p, qualityChallenges: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Comma-separated" />
                  ) : (
                    <ChipList items={quality.qualityChallenges} />
                  )}
                </EditRow>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-6">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

function EditRow({ label, editing, children }: { label: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-6">
      <span className="w-40 shrink-0 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <div className="flex-1 text-sm text-[var(--text-primary)]">{children}</div>
    </div>
  );
}
