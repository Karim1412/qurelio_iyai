
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Edit, Eye, EyeOff, Lock, Camera, Plus, Loader2, Trash2, Mail, Building2, ShieldCheck } from '@/components/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuthStore, type User } from '@/lib/auth-store';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import { useAvatarBlobUrl } from '@/hooks/use-avatar-blob-url';
import { zPasswordPolicy, zPhoneE164Optional } from '@/lib/account-validation';
import { toastFirstFieldError } from '@/lib/form-errors';
import { QurelioPhoneInput } from '@/components/ui/phone-input';

const userProfileSchema = z.object({
  firstName: z.string().min(2, 'At least 2 characters'),
  lastName: z.string().min(2, 'At least 2 characters'),
  phone: zPhoneE164Optional,
});

const directorProfileSchema = z.object({
  name: z.string().min(2, 'At least 2 characters'),
  phone: zPhoneE164Optional,
});

const superAdminProfileSchema = z.object({
  firstName: z.string().min(2, 'At least 2 characters'),
  lastName: z.string().min(2, 'At least 2 characters'),
});

const pwdSchema = z
  .object({
    currentPassword: z.string().min(6, 'Required'),
    newPassword: zPasswordPolicy,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type UserProfileData = z.infer<typeof userProfileSchema>;
type DirectorProfileData = z.infer<typeof directorProfileSchema>;
type SuperAdminProfileData = z.infer<typeof superAdminProfileSchema>;
type PwdData = z.infer<typeof pwdSchema>;

function roleLabel(role?: string) {
  if (!role) return '';
  return role.replace(/_/g, ' ');
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const isDirector = user?.role === 'DIRECTOR';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register: rUser,
    control: cUser,
    handleSubmit: hUser,
    reset: resetUser,
    formState: { errors: eUser },
  } = useForm<UserProfileData>({
    resolver: zodResolver(userProfileSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { firstName: '', lastName: '', phone: '' },
  });

  const {
    register: rDir,
    control: cDir,
    handleSubmit: hDir,
    reset: resetDir,
    formState: { errors: eDir },
  } = useForm<DirectorProfileData>({
    resolver: zodResolver(directorProfileSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { name: '', phone: '' },
  });

  const {
    register: rPwd,
    handleSubmit: hPwd,
    reset: resetPwd,
    formState: { errors: ePwd },
  } = useForm<PwdData>({
    resolver: zodResolver(pwdSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const {
    register: rSuper,
    handleSubmit: hSuper,
    reset: resetSuper,
    formState: { errors: eSuper },
  } = useForm<SuperAdminProfileData>({
    resolver: zodResolver(superAdminProfileSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { firstName: '', lastName: '' },
  });

  useEffect(() => {
    if (!user) return;
    if (user.role === 'DIRECTOR') {
      resetDir({ name: user.firstName || '', phone: user.phone || '' });
    } else if (user.role === 'SUPER_ADMIN') {
      resetSuper({ firstName: user.firstName || '', lastName: user.lastName || '' });
    } else {
      resetUser({ firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '' });
    }
  }, [user, resetDir, resetUser, resetSuper]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authApi.me();
        if (!cancelled && data) {
          const row = data as User & { isEmailVerified?: boolean };
          updateUser({
            ...row,
            isVerified: row.isVerified ?? Boolean(row.isEmailVerified),
          });
        }
      } catch {
        /* session invalid: interceptor may redirect */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateUser]);

  const hasCustomAvatar = Boolean(user?.hasCustomAvatar ?? user?.avatarUrl);
  const avatarBlobUrl = useAvatarBlobUrl(hasCustomAvatar, user?.avatarKey);

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authApi.uploadProfileAvatar(fd);
      const row = res.data as User & { isEmailVerified?: boolean };
      updateUser({
        ...row,
        isVerified: row.isVerified ?? Boolean(row.isEmailVerified),
      });
      toast.success('Profile photo updated');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'Could not upload photo');
    } finally {
      setAvatarLoading(false);
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarLoading(true);
    try {
      const res = await authApi.removeProfileAvatar();
      const row = res.data as User & { isEmailVerified?: boolean };
      updateUser({
        ...row,
        isVerified: row.isVerified ?? Boolean(row.isEmailVerified),
      });
      toast.success('Profile photo removed');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'Could not remove photo');
    } finally {
      setAvatarLoading(false);
    }
  };

  const onSuperAdminProfileSave = async (data: SuperAdminProfileData) => {
    setProfileLoading(true);
    try {
      const res = await authApi.updateProfile({ firstName: data.firstName, lastName: data.lastName });
      updateUser(res.data);
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const onUserProfileSave = async (data: UserProfileData) => {
    setProfileLoading(true);
    try {
      const res = await authApi.updateProfile(data);
      updateUser(res.data);
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const onDirectorProfileSave = async (data: DirectorProfileData) => {
    setProfileLoading(true);
    try {
      const res = await authApi.updateProfile({ name: data.name, phone: data.phone });
      updateUser({ firstName: data.name, phone: data.phone, ...res.data });
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const onPwdSave = async (data: PwdData) => {
    setPwdLoading(true);
    try {
      await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed successfully');
      resetPwd();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'Failed to change password');
    } finally {
      setPwdLoading(false);
    }
  };

  const displayName = isDirector
    ? user?.firstName || ''
    : `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

  const initials = isDirector
    ? (user?.firstName?.[0] || '').toUpperCase()
    : `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  const infoRows: { label: string; value: string; mono?: boolean }[] = isDirector
    ? [
        { label: 'Company', value: user?.company?.name || '-' },
        {
          label: 'Workspace code',
          value: user?.company?.companyCode || '-',
          mono: true,
        },
        { label: 'Role', value: roleLabel(user?.role) },
        { label: 'Status', value: user?.isActive ? 'Active' : 'Inactive' },
      ]
    : [
        { label: 'Company', value: user?.company?.name || '-' },
        {
          label: 'Workspace code',
          value: user?.company?.companyCode || '-',
          mono: true,
        },
        { label: 'Role', value: roleLabel(user?.role) },
        { label: 'Status', value: user?.isActive ? 'Active' : 'Inactive' },
      ];

  const SOFT_EASE = [0.22, 1, 0.36, 1] as const;

  return (
    <DashboardLayout>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onAvatarFile}
      />

      {/* ─── Hero card ─────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: SOFT_EASE }}
        className="relative mb-6 overflow-hidden rounded-[28px] border border-[var(--border)]/55 bg-[var(--surface)]"
      >
        {/* Soft inner highlight at the top edge (replaces drop shadow) */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
        />
        {/* Atmospheric brand orbs */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 22%, transparent), transparent 70%)',
            filter: 'blur(24px)',
          }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0.95, 0.7] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-28 h-72 w-72 rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--brand-accent) 18%, transparent), transparent 70%)',
            filter: 'blur(26px)',
          }}
          animate={{ scale: [1, 1.06, 1], opacity: [0.55, 0.8, 0.55] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
        />
        {/* Soft dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '18px 18px',
            color: 'var(--text-primary)',
            maskImage:
              'radial-gradient(ellipse 70% 55% at 50% 55%, black 30%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 55% at 50% 55%, black 30%, transparent 80%)',
          }}
        />
        {/* Brand accent hairline along the bottom */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/35 to-transparent"
        />

        <div className="relative flex flex-col items-center gap-6 px-6 py-8 sm:flex-row sm:items-end sm:px-10 sm:py-10">
          {/* Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.7, ease: SOFT_EASE }}
            className="group relative shrink-0"
          >
            {/* Outer breathing halo (no shadow) */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -inset-3 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, color-mix(in srgb, var(--brand-primary) 35%, transparent), color-mix(in srgb, var(--brand-accent) 45%, transparent), color-mix(in srgb, var(--brand-primary) 35%, transparent))',
                filter: 'blur(10px)',
                opacity: 0.45,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
            />
            {/* Gradient ring */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-[3px] rounded-full p-[2px]"
              style={{
                background:
                  'conic-gradient(from 180deg, var(--brand-primary), var(--brand-accent), var(--brand-primary))',
              }}
            />
            <button
              type="button"
              disabled={avatarLoading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Update profile photo"
              className="relative z-[1] flex h-[124px] w-[124px] items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] outline-none ring-2 ring-[var(--surface)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-[var(--brand-primary)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {avatarBlobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarBlobUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-[34px] font-semibold text-[var(--brand-primary)]"
                  style={{
                    background:
                      'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 12%, transparent), color-mix(in srgb, var(--brand-accent) 18%, transparent))',
                  }}
                >
                  {initials || '·'}
                </div>
              )}
              {/* Hover overlay (no shadow) */}
              <div
                className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white opacity-0 backdrop-blur-[2px] transition-opacity duration-400',
                  'group-hover:opacity-100',
                  avatarLoading && 'opacity-100',
                )}
              >
                {avatarLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2} />
                ) : (
                  <>
                    <span className="relative inline-flex">
                      <Camera className="h-7 w-7" strokeWidth={1.5} />
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[var(--text-primary)]">
                        <Plus className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold tracking-wide">Update</span>
                  </>
                )}
              </div>
            </button>
          </motion.div>

          {/* Identity */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
            }}
            className="min-w-0 flex-1 text-center sm:text-left"
          >
            <motion.div
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.55, ease: SOFT_EASE }}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)] backdrop-blur-sm"
            >
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/55" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              {roleLabel(user?.role) || 'Member'}
            </motion.div>
            <motion.h1
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.65, ease: SOFT_EASE }}
              className="mt-2 text-[26px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[30px]"
              style={{ letterSpacing: '-0.018em' }}
            >
              {displayName || 'Your profile'}
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.55, ease: SOFT_EASE }}
              className="mt-1 text-[13px] text-[var(--muted)]"
            >
              Manage your account information and security preferences.
            </motion.p>

            {/* Email chip only: other details are in the bento grid below */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.55, ease: SOFT_EASE }}
              className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 px-3 py-1.5 text-[11.5px] text-[var(--text-primary)] backdrop-blur-sm">
                <Mail className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                <span className="truncate">{user?.email}</span>
              </span>
            </motion.div>
          </motion.div>

          {/* Avatar actions */}
          {hasCustomAvatar && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.5, ease: SOFT_EASE }}
              className="shrink-0"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-full border-red-200 bg-transparent text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
                disabled={avatarLoading}
                onClick={onRemoveAvatar}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove photo
              </Button>
            </motion.div>
          )}
        </div>
      </motion.section>

      {/* ─── Innovative bento info grid: 3 cards, distinct personalities ─── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.10, delayChildren: 0.35 } },
        }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-12"
      >
        {/* ── Card 1 · Organization (span 5) ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.7, ease: SOFT_EASE }}
          className="group relative overflow-hidden rounded-[24px] border border-[var(--border)]/55 bg-[var(--surface)] p-6 md:col-span-5"
        >
          {/* Top hairline */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/35 to-transparent"
          />
          {/* Floating background illustration */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-2 text-[var(--brand-primary)] opacity-[0.06] transition-opacity duration-500 group-hover:opacity-[0.10]"
          >
            <Building2 className="h-44 w-44" strokeWidth={1.2} />
          </span>
          {/* Accent rail revealed on hover */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 bottom-0 h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-[var(--brand-primary)] to-transparent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100"
          />

          <div className="relative">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                color: 'var(--brand-primary)',
              }}
            >
              <Building2 className="h-3 w-3" />
              Organization
            </span>
            <p className="mt-3 text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {user?.company?.name || '-'}
            </p>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              The workspace you are signed into right now.
            </p>
          </div>
        </motion.div>

        {/* ── Card 2 · Workspace code (span 4) ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.7, ease: SOFT_EASE }}
          className="group relative overflow-hidden rounded-[24px] border border-[var(--border)]/55 bg-[var(--surface)] p-6 md:col-span-4"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)]/35 to-transparent"
          />
          {/* Diagonal dot pattern decoration */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'radial-gradient(currentColor 1px, transparent 1px)',
              backgroundSize: '14px 14px',
              color: 'var(--brand-primary)',
              maskImage:
                'linear-gradient(135deg, black 0%, transparent 70%)',
              WebkitMaskImage:
                'linear-gradient(135deg, black 0%, transparent 70%)',
            }}
          />
          {/* Accent rail revealed on hover */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 bottom-0 h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-[var(--brand-accent)] to-transparent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100"
          />

          <div className="relative">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: 'color-mix(in srgb, var(--brand-accent) 12%, transparent)',
                color: 'var(--brand-accent)',
              }}
            >
              <ShieldCheck className="h-3 w-3" />
              Workspace code
            </span>
            <p
              className="mt-3 font-mono text-[22px] font-semibold leading-tight tracking-[0.08em] text-[var(--text-primary)]"
              style={{ wordBreak: 'break-all' }}
            >
              {user?.company?.companyCode || '-'}
            </p>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Unique identifier for your tenant.
            </p>
          </div>
        </motion.div>

        {/* ── Card 3 · Role + Status (span 3) ── */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.7, ease: SOFT_EASE }}
          className="group relative overflow-hidden rounded-[24px] border border-[var(--border)]/55 bg-[var(--surface)] p-6 md:col-span-3"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/30 to-transparent"
          />
          {/* Center radial brand halo */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full"
            style={{
              background:
                'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 18%, transparent), transparent 70%)',
              filter: 'blur(14px)',
            }}
          />

          <div className="relative flex h-full flex-col items-start justify-between gap-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                color: 'var(--brand-primary)',
              }}
            >
              <ShieldCheck className="h-3 w-3" />
              Access
            </span>
            <div>
              <p className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
                {roleLabel(user?.role) || '-'}
              </p>
              <span
                className={cn(
                  'mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold',
                  user?.isActive
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-[var(--border)]/60 bg-[var(--nav-hover)] text-[var(--muted)]',
                )}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {user?.isActive && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex h-1.5 w-1.5 rounded-full',
                      user?.isActive ? 'bg-emerald-500' : 'bg-[var(--muted)]',
                    )}
                  />
                </span>
                {user?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ─── Tabs (full width) ─── */}
      <div className="grid gap-6 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.65, ease: SOFT_EASE }}
          className="lg:col-span-12"
        >
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="mb-5 flex h-auto w-fit items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--surface)]/70 p-1 backdrop-blur-sm">
              <TabsTrigger
                value="general"
                className="gap-2 rounded-full border-0 px-4 py-1.5 text-[12.5px] font-medium text-[var(--muted)] transition-colors data-[state=active]:bg-[var(--brand-primary)] data-[state=active]:text-white"
              >
                <Edit className="h-3.5 w-3.5" />
                General
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="gap-2 rounded-full border-0 px-4 py-1.5 text-[12.5px] font-medium text-[var(--muted)] transition-colors data-[state=active]:bg-[var(--brand-primary)] data-[state=active]:text-white"
              >
                <Lock className="h-3.5 w-3.5" />
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <AnimatePresence mode="wait">
                <motion.div
                  key="general"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.45, ease: SOFT_EASE }}
                  className="relative overflow-hidden rounded-[24px] border border-[var(--border)]/55 bg-[var(--surface)]"
                >
                  {/* Top hairline */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/30 to-transparent"
                  />
                  {/* Atmospheric halo top-right */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full"
                    style={{
                      background:
                        'radial-gradient(closest-side, color-mix(in srgb, var(--brand-primary) 16%, transparent), transparent 70%)',
                      filter: 'blur(22px)',
                    }}
                  />
                  {/* Soft dot grid */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.035]"
                    style={{
                      backgroundImage:
                        'radial-gradient(currentColor 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                      color: 'var(--text-primary)',
                      maskImage:
                        'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)',
                      WebkitMaskImage:
                        'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)',
                    }}
                  />
                  {/* Decorative watermark */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-6 -right-6 text-[var(--brand-primary)] opacity-[0.05]"
                  >
                    <Edit className="h-44 w-44" strokeWidth={1.1} />
                  </span>

                  <div className="relative p-6 sm:p-8">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)]/40 pb-5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)]"
                          style={{
                            background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                            color: 'var(--brand-primary)',
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
                            Personal
                          </p>
                          <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
                            Edit profile
                          </h2>
                          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                            Update your name, contact details, and how you appear in the app.
                          </p>
                        </div>
                      </div>
                      <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-700 backdrop-blur-sm sm:inline-flex dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Auto-saved
                      </span>
                    </div>

                  {isDirector ? (
                    <form className="grid gap-4" onSubmit={hDir(onDirectorProfileSave, toastFirstFieldError)}>
                      <div>
                        <Label htmlFor="name">Company name</Label>
                        <Input id="name" {...rDir('name')} />
                        {eDir.name && <p className="mt-1 text-xs text-red-600">{eDir.name.message}</p>}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <Label>Email</Label>
                          <Input value={user?.email || ''} disabled className="bg-[var(--page-bg)]" />
                          <p className="mt-1 text-xs text-[var(--muted)]">Email cannot be changed here</p>
                        </div>
                        <div className="min-w-0">
                          <Label htmlFor="dphone">Phone number</Label>
                          <Controller
                            name="phone"
                            control={cDir}
                            render={({ field }) => (
                              <QurelioPhoneInput
                                id="dphone"
                                value={field.value ? field.value : undefined}
                                onChange={(v) => field.onChange(v ?? '')}
                                onBlur={field.onBlur}
                                error={Boolean(eDir.phone)}
                              />
                            )}
                          />
                          {eDir.phone && <p className="mt-1 text-xs text-red-600">{eDir.phone.message}</p>}
                          <p className="mt-1 text-xs text-[var(--muted)]">Choose country, then enter a valid number.</p>
                        </div>
                      </div>
                      <Button
                        type="submit"
                        disabled={profileLoading}
                        className="group/save relative w-fit gap-1.5 overflow-hidden rounded-full border-0 bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[var(--brand-primary)]/92 disabled:opacity-70"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/22 to-transparent transition-transform duration-700 group-hover/save:translate-x-[200%]"
                        />
                        <span className="relative">{profileLoading ? 'Saving…' : 'Save changes'}</span>
                      </Button>
                    </form>
                  ) : isSuperAdmin ? (
                    <form className="grid gap-4" onSubmit={hSuper(onSuperAdminProfileSave, toastFirstFieldError)}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="sa-firstName">First name</Label>
                          <Input id="sa-firstName" {...rSuper('firstName')} />
                          {eSuper.firstName && (
                            <p className="mt-1 text-xs text-red-600">{eSuper.firstName.message}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="sa-lastName">Last name</Label>
                          <Input id="sa-lastName" {...rSuper('lastName')} />
                          {eSuper.lastName && (
                            <p className="mt-1 text-xs text-red-600">{eSuper.lastName.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="max-w-md">
                        <Label>Email</Label>
                        <Input value={user?.email || ''} disabled className="bg-[var(--page-bg)]" />
                        <p className="mt-1 text-xs text-[var(--muted)]">Email cannot be changed here</p>
                      </div>
                      <Button
                        type="submit"
                        disabled={profileLoading}
                        className="group/save relative w-fit gap-1.5 overflow-hidden rounded-full border-0 bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[var(--brand-primary)]/92 disabled:opacity-70"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/22 to-transparent transition-transform duration-700 group-hover/save:translate-x-[200%]"
                        />
                        <span className="relative">{profileLoading ? 'Saving…' : 'Save changes'}</span>
                      </Button>
                    </form>
                  ) : (
                    <form className="grid gap-4" onSubmit={hUser(onUserProfileSave, toastFirstFieldError)}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="firstName">First name</Label>
                          <Input id="firstName" {...rUser('firstName')} />
                          {eUser.firstName && <p className="mt-1 text-xs text-red-600">{eUser.firstName.message}</p>}
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last name</Label>
                          <Input id="lastName" {...rUser('lastName')} />
                          {eUser.lastName && <p className="mt-1 text-xs text-red-600">{eUser.lastName.message}</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0">
                          <Label>Email</Label>
                          <Input value={user?.email || ''} disabled className="bg-[var(--page-bg)]" />
                          <p className="mt-1 text-xs text-[var(--muted)]">Email cannot be changed here</p>
                        </div>
                        <div className="min-w-0">
                          <Label htmlFor="phone">Phone number</Label>
                          <Controller
                            name="phone"
                            control={cUser}
                            render={({ field }) => (
                              <QurelioPhoneInput
                                id="phone"
                                value={field.value ? field.value : undefined}
                                onChange={(v) => field.onChange(v ?? '')}
                                onBlur={field.onBlur}
                                error={Boolean(eUser.phone)}
                              />
                            )}
                          />
                          {eUser.phone && <p className="mt-1 text-xs text-red-600">{eUser.phone.message}</p>}
                          <p className="mt-1 text-xs text-[var(--muted)]">Choose country, then enter a valid number.</p>
                        </div>
                      </div>
                      <Button
                        type="submit"
                        disabled={profileLoading}
                        className="group/save relative w-fit gap-1.5 overflow-hidden rounded-full border-0 bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[var(--brand-primary)]/92 disabled:opacity-70"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/22 to-transparent transition-transform duration-700 group-hover/save:translate-x-[200%]"
                        />
                        <span className="relative">{profileLoading ? 'Saving…' : 'Save changes'}</span>
                      </Button>
                    </form>
                  )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </TabsContent>

            <TabsContent value="security">
              <AnimatePresence mode="wait">
                <motion.div
                  key="security"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.45, ease: SOFT_EASE }}
                  className="relative overflow-hidden rounded-[24px] border border-[var(--border)]/55 bg-[var(--surface)]"
                >
                  {/* Top hairline */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/30 to-transparent"
                  />
                  {/* Atmospheric halo top-right */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full"
                    style={{
                      background:
                        'radial-gradient(closest-side, color-mix(in srgb, var(--brand-accent) 16%, transparent), transparent 70%)',
                      filter: 'blur(22px)',
                    }}
                  />
                  {/* Soft dot grid */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.035]"
                    style={{
                      backgroundImage:
                        'radial-gradient(currentColor 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                      color: 'var(--text-primary)',
                      maskImage:
                        'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)',
                      WebkitMaskImage:
                        'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)',
                    }}
                  />
                  {/* Decorative watermark */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-6 -right-6 text-[var(--brand-primary)] opacity-[0.05]"
                  >
                    <Lock className="h-44 w-44" strokeWidth={1.1} />
                  </span>

                  <div className="relative p-6 sm:p-8">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)]/40 pb-5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)]"
                          style={{
                            background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                            color: 'var(--brand-primary)',
                          }}
                        >
                          <Lock className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
                            Security
                          </p>
                          <h2 className="text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
                            Change password
                          </h2>
                          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                            Keep your account safe. Use a strong, unique password.
                          </p>
                        </div>
                      </div>
                      <span className="hidden items-center gap-1.5 rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/8 px-2.5 py-1 text-[10.5px] font-semibold text-[var(--brand-primary)] backdrop-blur-sm sm:inline-flex">
                        <ShieldCheck className="h-3 w-3" />
                        Encrypted
                      </span>
                    </div>
                    <form className="grid max-w-xl gap-4" onSubmit={hPwd(onPwdSave, toastFirstFieldError)}>
                    <div>
                      <Label htmlFor="currentPassword">Current password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrent ? 'text' : 'password'}
                          className="pr-10"
                          {...rPwd('currentPassword')}
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                          onClick={() => setShowCurrent(!showCurrent)}
                        >
                          {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {ePwd.currentPassword && (
                        <p className="mt-1 text-xs text-red-600">{ePwd.currentPassword.message}</p>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="newPassword">New password</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNew ? 'text' : 'password'}
                            className="pr-10"
                            {...rPwd('newPassword')}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                            onClick={() => setShowNew(!showNew)}
                          >
                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {ePwd.newPassword && <p className="mt-1 text-xs text-red-600">{ePwd.newPassword.message}</p>}
                        
                      </div>
                      <div>
                        <Label htmlFor="confirmPassword">Confirm new password</Label>
                        <Input id="confirmPassword" type={showNew ? 'text' : 'password'} {...rPwd('confirmPassword')} />
                        {ePwd.confirmPassword && (
                          <p className="mt-1 text-xs text-red-600">{ePwd.confirmPassword.message}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={pwdLoading}
                      className="group/pwd relative w-fit gap-1.5 overflow-hidden rounded-full border-0 bg-[var(--brand-primary)] px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-300 hover:bg-[var(--brand-primary)]/92 disabled:opacity-70"
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/22 to-transparent transition-transform duration-700 group-hover/pwd:translate-x-[200%]"
                      />
                      <span className="relative inline-flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        {pwdLoading ? 'Updating…' : 'Update password'}
                      </span>
                    </Button>
                  </form>
                  </div>
                </motion.div>
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
