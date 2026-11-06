'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusChip, RoleChip } from '@/components/dashboard/ManagementTable';
import { Search, Plus, RefreshCw, Trash2, CircleCheck, Ban, Users } from '@/components/icons';
import { companyApi, normalizeCompanyUsersResponse, type CompanySeatInfo } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
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
import { ManagedUserAvatar } from '@/components/avatars/ManagedUserAvatar';
import { zPhoneE164Required } from '@/lib/account-validation';
import { toastFirstFieldError } from '@/lib/form-errors';
import { QurelioPhoneInput } from '@/components/ui/phone-input';
import { cn } from '@/utils/cn';

const addUserSchema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  email: z.string().email('Invalid email'),
  phone: zPhoneE164Required,
  role: z.string().min(1, 'Select a role'),
});
type AddUserForm = z.infer<typeof addUserSchema>;

const ROLES = [
  { value: 'QUALITY_MANAGER', label: 'Quality Manager' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'OPERATOR', label: 'Operator' },
];

function apiMessage(err: unknown): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' ') : (m || 'Request failed');
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  avatarKey?: string | null;
}

function mapUser(u: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: string;
  isEmailVerified: boolean;
  isActive: boolean;
  avatarKey?: string | null;
}): UserRow {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone || '-',
    role: u.role,
    isActive: u.isActive,
    isEmailVerified: u.isEmailVerified,
    avatarKey: u.avatarKey ?? null,
  };
}

export default function CompanyUsersPage() {
  const { user: authUser } = useAuthStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [seats, setSeats] = useState<CompanySeatInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors: addErrors },
  } = useForm<AddUserForm>({
    resolver: zodResolver(addUserSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', role: '' },
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await companyApi.getUsers();
      const { users: raw, seats: seatInfo } = normalizeCompanyUsersResponse(data);
      setSeats(seatInfo);
      setUsers((raw as Parameters<typeof mapUser>[0][]).map(mapUser));
    } catch (err: unknown) {
      toast.error(apiMessage(err));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleActivate = async (row: UserRow) => {
    try {
      await companyApi.toggleUser(row.id);
      toast.success(`User ${row.isActive ? 'deactivated' : 'activated'}`);
      await loadUsers();
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    }
  };

  const handleDelete = async (row: UserRow) => {
    try {
      await companyApi.removeUser(row.id);
      toast.success('User removed');
      await loadUsers();
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    }
  };

  const handleAdd = async (data: AddUserForm) => {
    try {
      await companyApi.addUser({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        role: data.role,
      });
      toast.success('Invitation sent. The user will receive an email to set their password.');
      setAddOpen(false);
      reset();
      await loadUsers();
    } catch (err: unknown) {
      toast.error(apiMessage(err));
    }
  };

  const handleRoleChange = useCallback(
    async (row: UserRow, newRole: string) => {
      if (newRole === row.role) return;
      try {
        await companyApi.updateUserRole(row.id, { role: newRole });
        toast.success('Role updated');
        await loadUsers();
      } catch (err: unknown) {
        toast.error(apiMessage(err));
      }
    },
    [loadUsers],
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const activeCount = useMemo(
    () => users.filter((u) => u.isActive && u.isEmailVerified).length,
    [users],
  );

  const atSeatLimit =
    authUser?.role === 'DIRECTOR' &&
    seats &&
    !seats.unlimited &&
    seats.max != null &&
    seats.used >= seats.max;
  const nearSeatLimit =
    seats &&
    !seats.unlimited &&
    seats.max != null &&
    seats.used >= Math.max(1, Math.ceil(seats.max * 0.8)) &&
    seats.used < seats.max;

  return (
    <DashboardLayout showRouteHeader={false}>
      <motion.div className="min-h-full px-4 pb-12 pt-2 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6"
        >
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--text-primary)]">My company</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Invite people, assign roles, and keep access aligned with ISO responsibilities.
          </p>
        </motion.div>

        {seats && !seats.unlimited && seats.max != null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'mb-6 overflow-hidden rounded-3xl border px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)]',
              atSeatLimit
                ? 'border-red-500/25 bg-red-500/[0.06]'
                : nearSeatLimit
                  ? 'border-amber-500/25 bg-amber-500/[0.06]'
                  : 'border-[var(--border)]/55 bg-[var(--surface)]',
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
              Team size (plan)
            </p>
            <p className="mt-1 text-[14px] text-[var(--text-primary)]">
              <span className="font-semibold">
                {seats.used} / {seats.max}
              </span>{' '}
              <span className="text-[var(--muted)]">
                seats, including you as company owner and every active team account.
              </span>
            </p>
            {(atSeatLimit || nearSeatLimit) && (
              <p className="mt-2 text-[12.5px] text-[var(--muted)]">
                {atSeatLimit
                  ? 'Remove a user or ask an administrator to increase your company size before inviting anyone new.'
                  : 'You are close to your limit; remove inactive users or upgrade your plan to add more people.'}
              </p>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="group relative overflow-hidden rounded-3xl border border-[var(--border)]/50 bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.55)]"
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-20 h-44 w-44 rounded-full opacity-20"
            style={{
              background:
                'radial-gradient(closest-side, var(--brand-primary), transparent 70%)',
              filter: 'blur(14px)',
            }}
          />

          <div className="relative flex flex-col gap-4 border-b border-[var(--border)]/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-inset ring-[var(--brand-primary)]/15"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-accent) 16%, transparent))',
                  color: 'var(--brand-primary)',
                }}
              >
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--muted)]">
                  Members
                </p>
                <p className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                  {users.length} {users.length === 1 ? 'person' : 'people'} on the platform
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
                onClick={() => void loadUsers()}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
              <Button
                type="button"
                className="gap-2 rounded-full px-4"
                onClick={() => setAddOpen(true)}
                disabled={Boolean(atSeatLimit)}
                title={
                  atSeatLimit
                    ? 'Your workspace reached its plan seat limit. Remove a user or upgrade the company size.'
                    : undefined
                }
              >
                <Plus className="h-4 w-4" />
                Add user
              </Button>
            </div>
          </div>

          <div className="relative border-b border-[var(--border)]/40 px-5 py-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-full border-[var(--border)]/60 bg-[var(--surface)]/80 pl-9"
              />
            </div>
          </div>

          <div className="relative hidden grid-cols-[minmax(0,1fr)_10rem_7rem_8rem_5.5rem] gap-3 border-b border-[var(--border)]/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] lg:grid">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
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
              : filteredUsers.length === 0
                ? (
                    <li className="px-5 py-14 text-center text-sm text-[var(--muted)]">
                      {search ? 'No members match your search.' : 'No team members yet. Invite your first user.'}
                    </li>
                  )
                : filteredUsers.map((r, idx) => {
                    const initials = `${r.firstName[0] ?? ''}${r.lastName[0] ?? ''}`.toUpperCase();
                    const pendingSetup = !r.isEmailVerified;
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
                        className="group/row grid grid-cols-1 items-center gap-3 px-5 py-3.5 transition-colors duration-300 hover:bg-[var(--nav-hover)]/40 lg:grid-cols-[minmax(0,1fr)_10rem_7rem_8rem_5.5rem]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="relative shrink-0">
                            <ManagedUserAvatar
                              userId={r.id}
                              avatarKey={r.avatarKey}
                              initials={initials || '?'}
                              size="lg"
                              className="h-10 w-10 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.12)]"
                            />
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--surface)]',
                                pendingSetup
                                  ? 'bg-amber-500'
                                  : r.isActive
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600',
                              )}
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">
                              {r.firstName} {r.lastName}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--muted)]">{r.email}</p>
                            <p className="mt-1 text-[11px] text-[var(--muted)] lg:hidden">{r.phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 lg:block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] lg:hidden">
                            Role
                          </span>
                          {r.role === 'DIRECTOR' ? (
                            <RoleChip role={r.role} />
                          ) : (
                            <select
                              aria-label={`Role for ${r.email}`}
                              className="w-full min-w-0 rounded-xl border border-[var(--border)]/60 bg-[var(--surface)]/90 px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40"
                              value={r.role}
                              onChange={(e) => void handleRoleChange(r, e.target.value)}
                            >
                              {ROLES.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="flex items-center gap-2 lg:block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] lg:hidden">
                            Status
                          </span>
                          {pendingSetup ? (
                            <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Pending setup
                            </span>
                          ) : (
                            <StatusChip active={r.isActive} />
                          )}
                        </div>

                        <p className="hidden truncate text-[12.5px] text-[var(--muted)] xl:block">{r.phone}</p>

                        <div className="flex justify-start gap-1 lg:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full border border-transparent hover:border-[var(--border)]/60 hover:bg-[var(--surface)]"
                            onClick={() => void handleActivate(r)}
                            aria-label={r.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {r.isActive ? (
                              <CircleCheck className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Ban className="h-4 w-4 text-[var(--muted)]" />
                            )}
                          </Button>
                          {r.role !== 'DIRECTOR' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-red-600 hover:bg-red-500/10"
                              onClick={() => setDeleteTarget(r)}
                              aria-label="Remove user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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
            <DialogTitle>Remove team member</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.firstName} {deleteTarget?.lastName} from your workspace? They will lose access
              immediately.
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
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              An email will be sent to the user to set their own password and activate their account.
            </DialogDescription>
          </DialogHeader>
          <form
            id="add-user-form"
            className="grid gap-4"
            onSubmit={handleSubmit(handleAdd, toastFirstFieldError)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...register('firstName')} />
                {addErrors.firstName && (
                  <p className="mt-1 text-xs text-red-600">{addErrors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...register('lastName')} />
                {addErrors.lastName && (
                  <p className="mt-1 text-xs text-red-600">{addErrors.lastName.message}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" {...register('email')} />
                {addErrors.email && <p className="mt-1 text-xs text-red-600">{addErrors.email.message}</p>}
              </div>
              <div className="sm:col-span-2">
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
                      error={Boolean(addErrors.phone)}
                    />
                  )}
                />
                {addErrors.phone && <p className="mt-1 text-xs text-red-600">{addErrors.phone.message}</p>}
                <p className="mt-1 text-xs text-[var(--muted)]">Choose country, then enter a valid number.</p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  className="flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-[var(--brand-primary)] focus-visible:shadow-[0_0_0_3px_rgba(0,174,239,0.13)]"
                  {...register('role')}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select role
                  </option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {addErrors.role && <p className="mt-1 text-xs text-red-600">{addErrors.role.message}</p>}
              </div>
            </div>
          </form>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-user-form">
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
