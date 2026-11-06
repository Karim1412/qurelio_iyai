'use client';

import { authApi } from '@/lib/api';
import { Mail } from '@/components/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { QurelioLogo } from '@/components/brand/qurelio-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

/** Cooldown before "Resend code" is available again (matches OTP validity window). */
const RESEND_COOLDOWN_SEC = 10 * 60;

function formatCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VerifyOtpPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <VerifyOtpPage />
    </Suspense>
  );
}

function VerifyOtpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') || '';
  const type = searchParams.get('type') || 'user';
  const [emailInput, setEmailInput] = useState(emailFromUrl);

  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN_SEC);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const e = searchParams.get('email');
    if (e) setEmailInput(e);
  }, [searchParams]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const effectiveEmail = (emailFromUrl || emailInput).trim();

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text) {
      const newOtp = text.split('').concat(Array(6).fill('')).slice(0, 6);
      setOtp(newOtp);
      inputRefs.current[Math.min(text.length, 5)]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (!effectiveEmail) {
      toast.error('Enter the email you used to register');
      return;
    }
    if (code.length < 6) {
      toast.error('Please enter the complete 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const payload = { email: effectiveEmail, code };
      if (type === 'company') {
        await authApi.verifyCompanyOtp(payload);
      } else {
        await authApi.verifyUserOtp(payload);
      }
      toast.success(
        type === 'company'
          ? 'Email verified. A super admin must still approve your company before you can log in.'
          : 'Email verified. Your company admin must activate your account before you can log in.'
      );
      router.push('/auth/login');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const joined = Array.isArray(msg) ? msg.join(' ') : msg;
      toast.error(joined || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!effectiveEmail) {
      toast.error('Enter your registration email first');
      return;
    }
    try {
      await authApi.resendOtp(effectiveEmail);
      toast.success('New code sent!');
      setResendTimer(RESEND_COOLDOWN_SEC);
      setOtp(Array(6).fill(''));
    } catch {
      toast.error('Failed to resend code');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-bg)]">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          href={type === 'company' ? '/auth/register-company' : '/auth/register-user'}
          className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--text-primary)]"
        >
          ← Back
        </Link>
        <div className="flex justify-end">
          <QurelioLogo height={28} />
        </div>
        <span className="w-12" />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-lg shadow-black/20"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--nav-hover)]">
            <Mail className="h-8 w-8 text-[var(--brand-primary)]" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Verify your email</h1>
          <p className="mb-4 text-left text-sm text-[var(--muted)]">
            If you closed this page before, your account is still saved. Enter the same email you used to register, then the
            code from your email (valid 10 minutes). Use <strong>Resend code</strong> if it expired.
          </p>

          {!emailFromUrl ? (
            <div className="mb-4 text-left">
              <label className="mb-1.5 block text-[13px] text-[var(--muted)]">Registration email</label>
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>
          ) : (
            <>
              <p className="mb-1 text-sm text-[var(--muted)]">We&apos;ve sent a 6-digit code to</p>
              <p className="mb-6 font-semibold text-[var(--brand-primary)]">{effectiveEmail}</p>
            </>
          )}

          <div className="mb-6 flex justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                maxLength={1}
                inputMode="numeric"
                className={cn(
                  'h-14 w-12 rounded-lg border-2 bg-transparent text-center text-xl font-bold outline-none transition-hover focus:border-[var(--brand-primary)] focus:shadow-[0_0_0_3px_rgba(77,146,196,0.25)]',
                  digit ? 'border-[var(--brand-primary)] bg-[rgba(0,174,239,0.06)]' : 'border-[var(--border)]'
                )}
              />
            ))}
          </div>

          <Button className="mb-4 w-full" onClick={handleVerify} disabled={loading}>
            {loading ? 'Verifying…' : 'Verify email'}
          </Button>

          <p className="mb-1 text-sm text-[var(--muted)]">Didn&apos;t receive a code?</p>
          {resendTimer > 0 ? (
            <p className="text-sm text-[#919eab]">Resend in {formatCooldown(resendTimer)}</p>
          ) : (
            <button type="button" className="font-semibold text-[var(--brand-primary)] hover:underline" onClick={handleResend}>
              Resend code
            </button>
          )}

          <div className="mt-6 border-t border-[var(--border)] pt-6">
            <Link href="/auth/login" className="text-sm text-[var(--muted)] hover:text-[var(--text-primary)]">
              Change email address
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
