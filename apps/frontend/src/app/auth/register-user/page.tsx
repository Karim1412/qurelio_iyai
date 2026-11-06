'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from '@/components/icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { zPasswordPolicy, zPhoneE164Required } from '@/lib/account-validation';
import { toastFirstFieldError } from '@/lib/form-errors';
import { QurelioPhoneInput } from '@/components/ui/phone-input';

const ROLES = [
  { value: 'QUALITY_MANAGER', label: 'Quality Manager' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'OPERATOR', label: 'Operator' },
];

const companyCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^QUR[A-Z0-9]{5}$/,
        'Use the 8-character workspace code from your director (QUR plus 5 letters or digits)',
      ),
  );

const schema = z.object({
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.string().email('Invalid email'),
  phone: zPhoneE164Required,
  companyCode: companyCodeSchema,
  role: z.string().min(1, 'Please select a role'),
  password: zPasswordPolicy,
});
type FormData = z.infer<typeof schema>;

export default function RegisterUserPage() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      companyCode: '',
      role: '',
      password: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await authApi.registerUser(data);
      toast.success('Account created! Please verify your email.');
      router.push(`/auth/verify-otp?email=${encodeURIComponent(data.email)}&type=user`);
    } catch (err: unknown) {
      const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const msg = Array.isArray(m) ? m.join(' ') : (m || 'Registration failed. Please try again.');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    'flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-[var(--brand-primary)] focus-visible:shadow-[0_0_0_3px_rgba(77,146,196,0.2)]';

  return (
    <AuthLayout
      title="Elevate your quality standards"
      subtitle="Join our platform to streamline your quality management processes."
      heroLeft
    >
      <div>
        <h1 className="mb-1 text-2xl font-bold text-[var(--text-primary)]">Create your Personal Account</h1>
        <p className="mb-2 text-sm text-[var(--muted)]">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-[var(--brand-primary)] hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Creating a new organization?{' '}
          <Link href="/auth/register-company" className="font-semibold text-[var(--brand-primary)] hover:underline">
            Register your company
          </Link>
        </p>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit, toastFirstFieldError)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" placeholder="John" {...register('firstName')} />
              {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
            </div>
            <div>
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" placeholder="Doe" {...register('lastName')} />
              {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="your@email.com" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <div className="min-w-0">
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
          </div>

          <div>
            <Label htmlFor="companyCode">Company workspace code</Label>
            <Input
              id="companyCode"
              placeholder="QUR12AB3"
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase tracking-wide"
              {...register('companyCode')}
            />
            {errors.companyCode && <p className="mt-1 text-xs text-red-600">{errors.companyCode.message}</p>}
            
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? 'text' : 'password'}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)]"
                onClick={() => setShowPwd(!showPwd)}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            
          </div>

          <div>
            <Label htmlFor="role">Select your role</Label>
            <select id="role" className={selectClass} defaultValue="" {...register('role', { required: true })}>
              <option value="" disabled>
                Choose a role…
              </option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
