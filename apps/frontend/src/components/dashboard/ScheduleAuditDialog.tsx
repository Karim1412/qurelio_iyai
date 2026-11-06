'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Calendar } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  auditApi,
  companyApi,
  documentApi,
  normalizeCompanyUsersResponse,
} from '@/lib/api';
import {
  buildAuditScopeFromClauses,
  extractSectionClauseNumbers,
} from '@/lib/audit-clause-scope';
import { useAuthStore } from '@/lib/auth-store';
import { formatIsoNormSelectLabel } from '@/lib/file-library-helpers';
import {
  currentUserLeadAuditorName,
  mapCompanyMemberOptions,
  type CompanyMemberOption,
} from '@/lib/company-user-display';

interface ScheduleAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultStartDate?: string;
}

interface IsoNormOption {
  id: string;
  isoStandard?: string | null;
  name?: string | null;
}

function apiMessage(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : m || fallback;
}

export function ScheduleAuditDialog({
  open,
  onOpenChange,
  onCreated,
  defaultStartDate,
}: ScheduleAuditDialogProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingIsoDetail, setLoadingIsoDetail] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<CompanyMemberOption[]>([]);
  const [isoNorms, setIsoNorms] = useState<IsoNormOption[]>([]);
  const [auditClauseOptions, setAuditClauseOptions] = useState<string[]>([]);

  const buildInitialForm = useCallback(
    () => ({
      title: '',
      type: 'INTERNAL',
      scheduledAt: defaultStartDate ?? '',
      scheduledEndAt: '',
      leadAuditor: currentUserLeadAuditorName(user),
      isoDocumentId: '',
      isoStandard: '',
      scopeClauseRefs: [] as string[],
    }),
    [defaultStartDate, user],
  );

  const [form, setForm] = useState(buildInitialForm);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm());
    setAuditClauseOptions([]);
  }, [open, buildInitialForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [normsRes, usersRes] = await Promise.all([
          documentApi.getIsoNorms(),
          companyApi.getUsers().catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setIsoNorms(Array.isArray(normsRes.data) ? (normsRes.data as IsoNormOption[]) : []);
        const { users } = normalizeCompanyUsersResponse(usersRes.data);
        setCompanyUsers(
          mapCompanyMemberOptions(users as { id: string; firstName?: string; lastName?: string; email?: string }[]),
        );
      } catch (err) {
        if (!cancelled) toast.error(apiMessage(err, 'Failed to load options'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onIsoNormChange = async (documentId: string) => {
    const norm = isoNorms.find((n) => n.id === documentId);
    const iso = norm?.isoStandard?.trim() || '';
    setForm((p) => ({
      ...p,
      isoDocumentId: documentId,
      isoStandard: iso,
      scopeClauseRefs: [],
    }));
    if (!documentId) {
      setAuditClauseOptions([]);
      return;
    }
    setLoadingIsoDetail(true);
    try {
      const res = await documentApi.get(documentId);
      const extracted = extractSectionClauseNumbers(res.data);
      setAuditClauseOptions(extracted);
      if (!extracted.length) {
        toast.error('No clauses found in this document. Run extraction on the standard in the file library first.');
      }
    } catch {
      setAuditClauseOptions([]);
      toast.error('Could not load clauses from the selected standard.');
    } finally {
      setLoadingIsoDetail(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (creating) return;
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!form.title?.trim() || !form.scheduledAt || !form.scheduledEndAt || !form.leadAuditor?.trim()) {
      toast.error('Name, type, lead auditor, start date, and end date are required.');
      return;
    }
    if (!form.isoDocumentId || !form.isoStandard?.trim()) {
      toast.error('Select an ISO norm document from the library (standard reference).');
      return;
    }
    if (!form.scopeClauseRefs.length) {
      toast.error('Select at least one clause in scope.');
      return;
    }
    if (!auditClauseOptions.length) {
      toast.error('This standard has no extracted clauses. Activate it in the file library after OCR extraction.');
      return;
    }
    setCreating(true);
    try {
      await auditApi.create({
        title: form.title.trim(),
        type: form.type,
        scheduledAt: `${form.scheduledAt}T09:00:00`,
        scheduledEndAt: `${form.scheduledEndAt}T17:00:00`,
        leadAuditor: form.leadAuditor.trim(),
        scope: buildAuditScopeFromClauses(form.isoStandard, form.scopeClauseRefs),
        isoStandard: form.isoStandard.trim() || undefined,
        isoDocumentId: form.isoDocumentId || undefined,
        scopeClauseRefs: form.scopeClauseRefs,
      });
      toast.success('Audit scheduled. Opening the audits page');
      onCreated?.();
      onOpenChange(false);
      router.push('/audits');
    } catch (err) {
      toast.error(apiMessage(err, 'Failed to create audit'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule a new audit</DialogTitle>
          <DialogDescription>
            Fill in the details. The audit will be added to your audits page.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" />
            <p className="text-xs text-[var(--muted)]">Loading options…</p>
          </div>
        ) : (
          <div className="grid gap-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                disabled={creating}
              />
            </div>

            <div>
              <Label>Type *</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                disabled={creating}
              >
                {['INTERNAL', 'SUPPLIER', 'CERTIFICATION'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start date *</Label>
                <Input
                  type="date"
                  value={form.scheduledAt}
                  onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                  disabled={creating}
                />
              </div>
              <div>
                <Label>End date *</Label>
                <Input
                  type="date"
                  value={form.scheduledEndAt}
                  onChange={(e) => setForm((p) => ({ ...p, scheduledEndAt: e.target.value }))}
                  disabled={creating}
                />
              </div>
            </div>

            <div>
              <Label>ISO norm document (standard reference) *</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.isoDocumentId}
                disabled={loadingIsoDetail || creating}
                onChange={(e) => void onIsoNormChange(e.target.value)}
              >
                <option value="">
                  {isoNorms.length === 0 ? 'No ISO norms uploaded yet' : 'Select a standard from the library…'}
                </option>
                {isoNorms.map((n) => (
                  <option key={n.id} value={n.id}>
                    {formatIsoNormSelectLabel(n)}
                  </option>
                ))}
              </select>
              {form.isoStandard && (
                <p className="mt-1 text-xs font-medium text-[var(--brand-primary)]">
                  Checklist reference: {form.isoStandard}
                </p>
              )}
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Lists only ISO norm files uploaded and activated for your company.
              </p>
            </div>

            <div>
              <Label className="text-xs">Clause scope *</Label>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                Clauses come from the selected standard&apos;s extraction in the file library. Select at least one.
              </p>
              <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                {loadingIsoDetail ? (
                  <span className="text-xs text-[var(--muted)]">Loading clauses from document…</span>
                ) : !form.isoDocumentId ? (
                  <span className="text-xs text-[var(--muted)]">Select a standard to load clauses.</span>
                ) : auditClauseOptions.length === 0 ? (
                  <span className="text-xs text-amber-700">
                    No clauses in this document. Run extraction and activate the standard in the file library.
                  </span>
                ) : (
                  auditClauseOptions.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={form.scopeClauseRefs.includes(c)}
                        onChange={(e) => {
                          setForm((p) => ({
                            ...p,
                            scopeClauseRefs: e.target.checked
                              ? [...p.scopeClauseRefs, c]
                              : p.scopeClauseRefs.filter((x) => x !== c),
                          }));
                        }}
                        disabled={creating}
                      />
                      {c}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <Label>Lead auditor * (company team)</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm"
                value={form.leadAuditor}
                onChange={(e) => setForm((p) => ({ ...p, leadAuditor: e.target.value }))}
                disabled={creating}
              >
                <option value="">{companyUsers.length ? 'Select a team member…' : 'Loading team…'}</option>
                {companyUsers.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={creating || loading} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            Schedule audit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
