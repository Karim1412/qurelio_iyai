'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Eye, EyeOff } from '@/components/icons';
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
    code: z.string().min(6, 'Enter the code from email'),
    newPassword: zPasswordPolicy,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
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
    setLoading(true);
    try {
      await authApi.resetPassword({ token: '', ...data });
      toast.success('Password reset successfully!');
      router.push('/auth/login');
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Reset failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-bg)]">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          href="/auth/forgot-password"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] transition-hover hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
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
            <KeyRound className="h-8 w-8 text-[var(--brand-primary)]" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Set new password</h1>
          <p className="mb-6 text-sm text-[var(--muted)]">Enter the code from your email and create a new password.</p>

          <form className="space-y-4 text-left" onSubmit={handleSubmit(onSubmit, toastFirstFieldError)}>
            <div>
              <Label htmlFor="code">Code from email</Label>
              <Input id="code" {...register('code')} />
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
            </div>
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
                  aria-label="Toggle password"
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
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" type={showPwd ? 'text' : 'password'} {...register('confirmPassword')} />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Resetting…' : 'Set new password'}
            </Button>
          </form>

          <Link href="/auth/login" className="mt-6 inline-block text-sm text-[var(--muted)] hover:text-[var(--text-primary)]">
            Return to sign in
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
