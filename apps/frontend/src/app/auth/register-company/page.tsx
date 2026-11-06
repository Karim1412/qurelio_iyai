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
import { Textarea } from '@/components/ui/textarea';
import { zPasswordPolicy, zPhoneE164Required } from '@/lib/account-validation';
import { toastFirstFieldError } from '@/lib/form-errors';
import { QurelioPhoneInput } from '@/components/ui/phone-input';

const FIELDS = [
  'Manufacturing',
  'Healthcare',
  'Technology',
  'Finance',
  'Retail',
  'Construction',
  'Education',
  'Logistics',
  'Food & Beverage',
  'Other',
];

const CAPACITIES = ['1-10', '11-50', '51-200', '201-500', '500+'];

const schema = z
  .object({
    companyName: z.string().min(2, 'Company name required'),
    field: z.string().min(1, 'Field required'),
    email: z.string().email('Invalid email'),
    phone: zPhoneE164Required,
    description: z.string().min(10, 'Description too short'),
    companyCapacity: z.string().min(1, 'Capacity required'),
    password: zPasswordPolicy,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
type FormData = z.infer<typeof schema>;

export default function RegisterCompanyPage() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
      companyName: '',
      field: '',
      email: '',
      phone: '',
      description: '',
      companyCapacity: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await authApi.registerCompany(data);
      toast.success('Account created! Please verify your email.');
      router.push(`/auth/verify-otp?email=${encodeURIComponent(data.email)}&type=company`);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    'flex h-10 w-full rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-[var(--brand-primary)] focus-visible:shadow-[0_0_0_3px_rgba(77,146,196,0.2)]';

  return (
    <AuthLayout
      title="Your ISO workspace starts here"
      subtitle="Register your organization to centralize documents, audits, and non-conformities in Qurelio."
      heroLeft
    >
      <div>
        <h1 className="mb-1 text-2xl font-bold text-[var(--text-primary)]">Create Company Account</h1>
        <p className="mb-2 text-sm text-[var(--muted)]">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-[var(--brand-primary)] hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Joining an existing company instead?{' '}
          <Link href="/auth/register-user" className="font-semibold text-[var(--brand-primary)] hover:underline">
            Sign up as team member
          </Link>
          {' · '}
          <Link href="/auth/register" className="font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--brand-primary)] hover:underline">
           
          </Link>
        </p>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit, toastFirstFieldError)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input id="companyName" {...register('companyName')} />
              {errors.companyName && <p className="mt-1 text-xs text-red-600">{errors.companyName.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="field">Field</Label>
              <select id="field" className={selectClass} defaultValue="" {...register('field', { required: true })}>
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
            <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="company@email.com" {...register('email')} />
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
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="Briefly describe your company and quality goals..."
                {...register('description')}
              />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="companyCapacity">Company capacity</Label>
              <select
                id="companyCapacity"
                className={selectClass}
                defaultValue=""
                {...register('companyCapacity', { required: true })}
              >
                <option value="" disabled>
                  Select size
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
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  className="pr-10"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)]"
                  onClick={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>


          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
