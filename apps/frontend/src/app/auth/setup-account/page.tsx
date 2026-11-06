'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff } from '@/components/icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { QurelioLogo } from '@/components/brand/qurelio-logo';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { zPasswordPolicy } from '@/lib/account-validation';
import { toastFirstFieldError } from '@/lib/form-errors';

const schema = z
  .object({
    newPassword: zPasswordPolicy,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
type FormData = z.infer<typeof schema>;

function SetupAccountForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') || '';
  const code = params.get('code') || '';

  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: FormData) => {
    if (!email || !code) {
      toast.error('Invalid setup link. Please ask your director to resend the invitation.');
      return;
    }
    setLoading(true);
    try {
      await authApi.setupAccount({ email, code, newPassword: data.newPassword });
      toast.success('Password set! You can now sign in.');
      router.push('/auth/login');
    } catch (err: unknown) {
      const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(' ') : (m || 'Setup failed. The link may have expired.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-bg)]">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text-primary)]"
        >
          ← Back to sign in
        </Link>
        <div className="flex justify-end">
          <QurelioLogo height={28} />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-lg shadow-black/20"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--nav-hover)]">
            <Lock className="h-8 w-8 text-[var(--brand-primary)]" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Set your password</h1>
          <p className="mb-1 text-sm text-[var(--muted)]">Welcome to Qurelio! Create a password for</p>
          <p className="mb-6 font-semibold text-[var(--brand-primary)]">{email}</p>

          <form className="space-y-4 text-left" onSubmit={handleSubmit(onSubmit, toastFirstFieldError)}>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPwd ? 'text' : 'password'}
                  className="pr-10"
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)]"
                  onClick={() => setShowPwd(!showPwd)}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>}
              <p className="mt-1 text-xs text-[var(--muted)]">
                8–128 characters, with uppercase, lowercase, a number, and a special character.
              </p>
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" type={showPwd ? 'text' : 'password'} {...register('confirmPassword')} />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Activating…' : 'Activate my account'}
            </Button>
          </form>

          <Link href="/auth/login" className="mt-6 inline-block text-sm text-[var(--muted)] hover:text-[var(--text-primary)]">
            Back to sign in
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

export default function SetupAccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <SetupAccountForm />
    </Suspense>
  );
}
