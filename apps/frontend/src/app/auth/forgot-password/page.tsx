'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from '@/components/icons';
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

const schema = z.object({ email: z.string().email('Invalid email') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await authApi.forgotPassword(data.email);
      setSent(true);
      toast.success('Reset link sent to your email');
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to send reset email'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-bg)]">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] transition-hover hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--nav-hover)]">
            <Mail className="h-8 w-8 text-[var(--brand-primary)]" />
          </div>

          {!sent ? (
            <>
              <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Forgot your password?</h1>
              <p className="mb-6 text-sm leading-relaxed text-[var(--muted)]">
                Please enter the email address associated with your account and we&apos;ll email you a link to reset your password.
              </p>

              <form className="space-y-4 text-left" onSubmit={handleSubmit(onSubmit)}>
                <div>
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@gmail.com"
                    {...register('email')}
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending…' : 'Send request'}
                </Button>
              </form>

              <p className="mt-6 text-sm text-[var(--muted)]">
                Remembered your password?{' '}
                <Link href="/auth/login" className="font-semibold text-[var(--brand-primary)] hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Check your email</h1>
              <p className="mb-6 text-sm leading-relaxed text-[var(--muted)]">
                We sent a password reset link to <strong className="text-[var(--brand-primary)]">{getValues('email')}</strong>
              </p>
              <Button className="mb-4 w-full" asChild>
                <Link href="/auth/reset-password">Enter reset code</Link>
              </Button>
              <Link href="/auth/login" className="text-sm text-[var(--muted)] hover:text-[var(--text-primary)]">
                ← Return to sign in
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
