'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusChip } from '@/components/dashboard/ManagementTable';
import { Search, Plus, RefreshCw, Trash2, CircleCheck, Ban, Building2 } from '@/components/icons';
import { adminApi } from '@/lib/api';
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
import { Textarea } from '@/components/ui/textarea';
import { ManagedCompanyAvatar } from '@/components/avatars/ManagedCompanyAvatar';
import { zPhoneE164Required } from '@/lib/account-validation';
import { QurelioPhoneInput } from '@/components/ui/phone-input';
import { cn } from '@/utils/cn';

const FIELDS = ['Manufacturing', 'Healthcare', 'Technology', 'Finance', 'Retail', 'Construction', 'Education', 'Other'];
const CAPACITIES = ['1-10', '11-50', '51-200', '201-500', '500+'];

const addCompanySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  field: z.string().min(1, 'Field is required'),
  email: z.string().email('Invalid email'),
  phone: zPhoneE164Required,
  description: z.string().optional(),
  companyCapacity: z.string().min(1, 'Capacity is required'),
  password: z.string().min(1, 'Password is required'),
});
type AddCompanyForm = z.infer<typeof addCompanySchema>;

interface CompanyRow {
  id: string;
  companyName: string;
  field: string;
  email: string;
  phone: string;
  isActive: boolean;
  companyCapacity: string;
  status: string;
  isEmailVerified?: boolean;
  avatarKey?: string | null;
}

function apiMessage(err: unknown): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : (m || 'Request failed');
}

function mapApiToRow(c: {
  id: string;
  name: string;
  field: string;
  email: string;
  phone: string;
  capacity?: string | null;
  status: string;
  isEmailVerified?: boolean;
  avatarKey?: string | null;
}): CompanyRow {
  return {
    id: c.id,
    companyName: c.name,
    field: c.field,
    email: c.email,
    phone: c.phone,
    companyCapacity: c.capacity?.trim() ? c.capacity : '-',
    isActive: c.status === 'ACTIVE',
    status: c.status,
    isEmailVerified: c.isEmailVerified,
    avatarKey: c.avatarKey ?? null,
  };
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddCompanyForm>({
    resolver: zodResolver(addCompanySchema),
    defaultValues: {
      companyName: '',
      field: '',
      email: '',
      phone: '',
      description: '',
      companyCapacity: '',
      password: '',
    },
  });

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getCompanies();
      const list = Array.isArray(data) ? data : [];
      setCompanies(list.map(mapApiToRow));
    } catch (err: unknown) {
      toast.error(apiMessage(err));
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const handleActivate = async (row: CompanyRow) => {
    try {
      if (row.isActive) {
        await adminApi.suspendCompany(row.id);
        toast.success('Company suspended');
      } else {
        await adminApi.activateCompany(row.id);
        toast.success('Company activated');
      }
      await loadCompanies();
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    }
  };

  const handleDelete = async (row: CompanyRow) => {
    try {
      await adminApi.deleteCompany(row.id);
      toast.success('Company deleted');
      await loadCompanies();
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    }
  };

  const handleAdd = async (data: AddCompanyForm) => {
    try {
      await adminApi.createCompany({
        companyName: data.companyName,
        field: data.field,
        email: data.email,
        phone: data.phone,
        description: data.description?.trim() || undefined,
        companyCapacity: data.companyCapacity,
        password: data.password,
      });
      toast.success('Company created and activated successfully.');
      setAddOpen(false);
      reset();
      await loadCompanies();
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    }
  };

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.field.toLowerCase().includes(q),
    );
  }, [companies, search]);

  const activeCount = useMemo(() => companies.filter((c) => c.status === 'ACTIVE').length, [companies]);
  const pendingCount = useMemo(() => companies.filter((c) => c.status === 'PENDING').length, [companies]);

  return (
    <DashboardLayout showRouteHeader={false}>
      <motion.div className="min-h-full px-4 pb-12 pt-2 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6"
        >
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--text-primary)]">Company management</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Onboard organizations, approve accounts, and manage platform access.
          </p>
        </motion.div>

        {(pendingCount > 0 || companies.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'mb-6 overflow-hidden rounded-3xl border px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)]',
              pendingCount > 0
                ? 'border-amber-500/25 bg-amber-500/[0.06]'
                : 'border-[var(--border)]/55 bg-[var(--surface)]',
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">Platform overview</p>
            <p className="mt-1 text-[14px] text-[var(--text-primary)]">
              <span className="font-semibold">{companies.length}</span>{' '}
              <span className="text-[var(--muted)]">
                {companies.length === 1 ? 'organization' : 'organizations'} ·{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{activeCount} active</span>
                {pendingCount > 0 && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {pendingCount} pending approval
                    </span>
                  </>
                )}
              </span>
            </p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="group relative overflow-hidden rounded-3xl border border-[var(--border)]/50 bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-20 h-44 w-44 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(closest-side, var(--brand-primary), transparent 70%)',
              filter: 'blur(14px)',
            }}
          />

          <motion.div
            className="relative flex flex-col gap-4 border-b border-[var(--border)]/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-inset ring-[var(--brand-primary)]/15"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-accent) 16%, transparent))',
                  color: 'var(--brand-primary)',
                }}
              >
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">Organizations</p>
                <p className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                  {companies.length} {companies.length === 1 ? 'company' : 'companies'} on the platform
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {activeCount} active
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-[var(--border)]/60"
                onClick={() => void loadCompanies()}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
              <Button type="button" className="gap-2 rounded-full px-4" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add company
              </Button>
            </div>
          </motion.div>

          <div className="relative border-b border-[var(--border)]/40 px-5 py-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                placeholder="Search by name, email, or field…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-full border-[var(--border)]/60 bg-[var(--surface)]/80 pl-9"
              />
            </div>
          </div>

          <div className="relative hidden grid-cols-[minmax(0,1fr)_9rem_7rem_6rem_8rem_5.5rem] gap-3 border-b border-[var(--border)]/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] lg:grid">
            <span>Company</span>
            <span>Field</span>
            <span>Status</span>
            <span>Size</span>
            <span className="hidden xl:inline">Phone</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="relative max-h-[min(70vh,640px)] divide-y divide-[var(--border)]/40 overflow-y-auto">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-4">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--nav-hover)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 animate-pulse rounded-lg bg-[var(--nav-hover)]" />
                      <div className="h-3 w-56 animate-pulse rounded-lg bg-[var(--nav-hover)]" />
                    </div>
                  </li>
                ))
              : filteredCompanies.length === 0
                ? (
                    <li className="px-5 py-14 text-center text-sm text-[var(--muted)]">
                      {search ? 'No companies match your search.' : 'No companies yet. Add your first organization.'}
                    </li>
                  )
                : filteredCompanies.map((r, idx) => {
                    const pendingApproval = r.status === 'PENDING';
                    const pendingEmail = r.status !== 'PENDING' && r.isEmailVerified === false;
                    return (
                      <motion.li
                        key={r.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: 0.04 + idx * 0.02,
                          duration: 0.45,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="group/row grid grid-cols-1 items-center gap-3 px-5 py-3.5 transition-colors duration-300 hover:bg-[var(--nav-hover)]/40 lg:grid-cols-[minmax(0,1fr)_9rem_7rem_6rem_8rem_5.5rem]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="relative shrink-0">
                            <ManagedCompanyAvatar
                              companyId={r.id}
                              avatarKey={r.avatarKey}
                              initial={(r.companyName[0] ?? '?').toUpperCase()}
                              className="h-10 w-10 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.12)]"
                            />
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--surface)]',
                                pendingApproval || pendingEmail
                                  ? 'bg-amber-500'
                                  : r.isActive
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600',
                              )}
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">
                              {r.companyName}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--muted)]">{r.email}</p>
                            <p className="mt-1 text-[11px] text-[var(--muted)] lg:hidden">{r.phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 lg:block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] lg:hidden">
                            Field
                          </span>
                          <p className="truncate text-[12.5px] text-[var(--text-primary)]">{r.field}</p>
                        </div>

                        <div className="flex items-center gap-2 lg:block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] lg:hidden">
                            Status
                          </span>
                          {pendingApproval ? (
                            <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Pending approval
                            </span>
                          ) : pendingEmail ? (
                            <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Pending email
                            </span>
                          ) : (
                            <StatusChip active={r.isActive} />
                          )}
                        </div>

                        <p className="text-[12.5px] text-[var(--muted)]">{r.companyCapacity}</p>
                        <p className="hidden truncate text-[12.5px] text-[var(--muted)] xl:block">{r.phone}</p>

                        <div className="flex justify-start gap-1 lg:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full border border-transparent hover:border-[var(--border)]/60 hover:bg-[var(--surface)]"
                            onClick={() => void handleActivate(r)}
                            aria-label={r.isActive ? 'Suspend' : 'Activate'}
                            disabled={pendingApproval}
                            title={pendingApproval ? 'Approve the company from pending workflow first' : undefined}
                          >
                            {r.isActive ? (
                              <CircleCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Ban className="h-4 w-4 text-[var(--muted)]" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full text-red-600 hover:bg-red-500/10"
                            onClick={() => setDeleteTarget(r)}
                            aria-label="Delete company"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.li>
                    );
                  })}
          </ul>
        </motion.div>
      </motion.div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete organization</DialogTitle>
            <DialogDescription>
              Permanently remove {deleteTarget?.companyName}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) void handleDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add company</DialogTitle>
            <DialogDescription>Create a new organization account.</DialogDescription>
          </DialogHeader>
          <form id="add-company-form" className="grid gap-4" onSubmit={handleSubmit(handleAdd)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" {...register('companyName')} />
                {errors.companyName && (
                  <p className="mt-1 text-xs text-red-600">{errors.companyName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="field">Field</Label>
                <select
                  id="field"
                  className="flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-[var(--brand-primary)] focus-visible:shadow-[0_0_0_3px_rgba(0,174,239,0.13)]"
                  {...register('field')}
                >
                  <option value="" disabled>
                    Select field
                  </option>
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                {errors.field && <p className="mt-1 text-xs text-red-600">{errors.field.message}</p>}
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Phone number</Label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <QurelioPhoneInput
                      id="phone"
                      value={field.value ? field.value : undefined}
                      onChange={(v) => field.onChange(v ?? '')}
                      onBlur={field.onBlur}
                      error={Boolean(errors.phone)}
                    />
                  )}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={2} {...register('description')} />
              </div>
              <div>
                <Label htmlFor="companyCapacity">Capacity</Label>
                <select
                  id="companyCapacity"
                  className="flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-[var(--brand-primary)] focus-visible:shadow-[0_0_0_3px_rgba(0,174,239,0.13)]"
                  {...register('companyCapacity')}
                >
                  <option value="" disabled>
                    Employees
                  </option>
                  {CAPACITIES.map((c) => (
                    <option key={c} value={c}>
                      {c} employees
                    </option>
                  ))}
                </select>
                {errors.companyCapacity && (
                  <p className="mt-1 text-xs text-red-600">{errors.companyCapacity.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register('password')} />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>
            </div>
          </form>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-company-form">
              Add company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
