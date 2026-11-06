'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, UserPlus, ArrowLeft } from '@/components/icons';
import { motion } from 'framer-motion';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { cn } from '@/utils/cn';

const OPTIONS = [
  {
    href: '/auth/register-company',
    title: 'Register as a company',
    description: 'Create a new organization workspace, invite your team, and manage ISO quality in one place.',
    icon: Building2,
    emphasis: 'For directors & organization owners',
  },
  {
    href: '/auth/register-user',
    title: 'Join as part of a company',
    description: 'You received an invite or your admin asked you to create an account under an existing organization.',
    icon: UserPlus,
    emphasis: 'For employees & team members',
  },
] as const;

export default function RegisterHubPage() {
  return (
    <AuthLayout
      title="Choose how you want to get started"
      subtitle="Pick the path that matches your situation. You can always contact support if you are unsure."
      heroLeft
    >
      <div>
        <Link
          href="/auth/login"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition-hover hover:text-[var(--brand-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-[var(--text-primary)]">Create an account</h1>
        <p className="mb-8 text-sm text-[var(--muted)]">Select one of the options below to continue.</p>

        <ul className="space-y-4">
          {OPTIONS.map((opt, idx) => {
            const Icon = opt.icon;
            return (
              <motion.li
                key={opt.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.35 }}
              >
                <Link
                  href={opt.href}
                  className={cn(
                    'flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left shadow-sm transition-hover',
                    'hover:border-[var(--brand-primary)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]'
                  )}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-hover)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-accent)]/30">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-accent)]">
                      {opt.emphasis}
                    </p>
                    <p className="mt-0.5 text-base font-bold text-[var(--text-primary)]">{opt.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{opt.description}</p>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-semibold text-[var(--brand-primary)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
