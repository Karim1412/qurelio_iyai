'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@/components/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { QurelioLogo } from '@/components/brand/qurelio-logo';
import { cn } from '@/utils/cn';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  illustration?: React.ReactNode;
  /** If true, hero panel is on the left (Minimal-style: left marketing, right form). */
  heroLeft?: boolean;
}

export function AuthLayout({ children, title, subtitle, illustration, heroLeft = true }: AuthLayoutProps) {
  const reduceMotion = useReducedMotion();

  const hero = (
    <div
      className={cn(
        'relative hidden flex-col justify-between overflow-hidden bg-gradient-to-b from-[var(--auth-hero-from)] to-[var(--auth-hero-to)] p-8 text-[var(--text-primary)] md:flex md:w-[42%] lg:p-10',
        heroLeft ? 'order-first' : 'order-last'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 50% at 50% 0%, var(--auth-hero-glow), transparent 58%)',
        }}
      />
      <Link href="/" className="relative z-[1] inline-flex items-center gap-2">
        <QurelioLogo height={36} />
      </Link>
      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-[1] mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center py-6 text-center"
      >
        {illustration || (
          <>
            <div className="relative mb-6 h-[min(42vh,320px)] w-full max-w-sm rounded-2xl bg-[var(--surface)] p-3 shadow-md ring-1 ring-[var(--border)] dark:bg-[var(--surface-elevated)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] dark:ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- avoids Next image optimizer / missing sharp in Docker */}
              <img
                src="/brand/auth-illustration-light.png"
                alt=""
                className="h-full w-full object-contain object-center dark:hidden"
              />
              <img
                src="/brand/auth-illustration.png"
                alt=""
                className="hidden h-full w-full object-contain object-center dark:block"
              />
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">{title}</h2>
            <p className="text-base leading-relaxed text-[var(--muted)]">{subtitle}</p>
            <div className="mx-auto mt-6 h-1 w-10 rounded-full bg-[var(--brand-accent)] shadow-sm" />
          </>
        )}
      </motion.div>
      <div className="relative z-[1] flex gap-3">
        <span className="text-xs text-[var(--muted)]">ISO-ready quality workflows</span>
      </div>
    </div>
  );

  const formPanel = (
    <div className="flex min-h-screen flex-1 flex-col bg-[var(--surface)]">
      <div className="flex items-center border-b border-[var(--border)] px-4 py-4 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] transition-hover hover:text-[var(--brand-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to home
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-12 pt-4 sm:px-8">
        <motion.div
          className="w-full max-w-[440px]"
          initial={reduceMotion ? undefined : { opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--page-bg)]">
      {heroLeft ? (
        <>
          {hero}
          {formPanel}
        </>
      ) : (
        <>
          {formPanel}
          {hero}
        </>
      )}
    </div>
  );
}
