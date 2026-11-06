'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import {
  ReportsIllustration,
  ComplianceIllustration,
  CalendarIllustration,
  AnalyticsIllustration,
  CompanyManagementIllustration,
  UserManagementIllustration,
  AiAssistantIllustration,
} from '@/components/icons/sidebar-illustrations';

const EASE = [0.22, 1, 0.36, 1] as const;

type Action = {
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.ComponentType<any>;
  /** Single accent color per action (used by the icon tile and hover rail). */
  tint: string;
  /** Either onClick (opens a dialog) or href (route). */
  onClick?: () => void;
  href?: string;
};

export function QuickActionsPanel({
  className,
  isSuperAdmin,
  onUpload,
  onRunEval,
  onScheduleAudit,
}: {
  className?: string;
  isSuperAdmin?: boolean;
  onUpload?: () => void;
  onRunEval?: () => void;
  onScheduleAudit?: () => void;
}) {
  const actions: Action[] = isSuperAdmin
    ? [
        {
          label: 'Manage companies',
          description: 'Onboard, approve and oversee tenants.',
          Icon: CompanyManagementIllustration,
          tint: '#7DD3FC',
          href: '/admin/companies',
        },
        {
          label: 'User management',
          description: 'Invite directors, set roles & access.',
          Icon: UserManagementIllustration,
          tint: '#C4B5FD',
          href: '/company/users',
        },
        {
          label: 'Analytics',
          description: 'Platform-wide adoption & health.',
          Icon: AnalyticsIllustration,
          tint: '#86EFAC',
          href: '/analytics',
        },
        {
          label: 'AI Assistant',
          description: 'Ask anything about the data.',
          Icon: AiAssistantIllustration,
          tint: '#FCD34D',
          href: '/rag-chat',
        },
      ]
    : [
        {
          label: 'Upload document',
          description: 'Add a product file or standard.',
          Icon: ReportsIllustration,
          tint: '#7DD3FC',
          onClick: onUpload,
        },
        {
          label: 'Run evaluation',
          description: 'Score evidence against a standard.',
          Icon: ComplianceIllustration,
          tint: '#86EFAC',
          onClick: onRunEval,
        },
        {
          label: 'Schedule audit',
          description: 'Plan an internal or supplier audit.',
          Icon: CalendarIllustration,
          tint: '#C4B5FD',
          onClick: onScheduleAudit,
        },
        {
          label: 'View analytics',
          description: 'Trends, donuts and module health.',
          Icon: AnalyticsIllustration,
          tint: '#FCD34D',
          href: '/analytics',
        },
      ];

  return (
    <div
      className={cn(
        'relative h-full min-h-[220px] overflow-hidden rounded-[28px] border border-white/[0.08] px-5 py-7 text-white sm:px-7 sm:py-8',
        className,
      )}
      style={{
        background:
          'linear-gradient(135deg, #0a1c30 0%, #103048 42%, #0c2842 70%, #050e1a 100%)',
      }}
    >
      {/* Atmospheric (same recipe as the welcome banner) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 88% 36%, rgba(255,193,7,0.28) 0%, transparent 42%), radial-gradient(circle at 14% 82%, rgba(77,146,196,0.32) 0%, transparent 40%)',
        }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[var(--brand-primary)]/22 blur-3xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0.9, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-[var(--brand-accent)]/14 blur-3xl"
        animate={{ scale: [1, 1.06, 1], opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)]/55 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-accent)]/45 to-transparent"
      />

      {/* Header */}
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Quick actions
          </p>
          <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-white sm:text-[18px]">
            Pick a task to start with
          </h3>
        </div>
        
      </div>

      {/* Independent framed action buttons: 2×2 grid */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
        }}
        className="relative grid grid-cols-2 gap-3"
      >
        {actions.map((a) => {
          const Icon = a.Icon;
          const inner = (
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.55, ease: EASE }}
              className="group/qa relative h-full overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.04] p-3 transition-all duration-500 hover:-translate-y-0.5 hover:border-white/[0.20] hover:bg-white/[0.07]"
              style={{ transitionTimingFunction: EASE.join(' ') }}
            >
              {/* Accent rail on top revealed on hover */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-4 top-0 h-px origin-center scale-x-0 transition-transform duration-700 group-hover/qa:scale-x-100"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${a.tint} 50%, transparent 100%)`,
                  transitionTimingFunction: EASE.join(' '),
                }}
              />
              {/* Soft corner glow tinted with action color */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-0 transition-opacity duration-500 group-hover/qa:opacity-100"
                style={{
                  background: `radial-gradient(closest-side, ${a.tint}33, transparent 70%)`,
                  filter: 'blur(10px)',
                }}
              />
              {/* Icon tile */}
              <div
                className="relative flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-500 group-hover/qa:scale-[1.06]"
                style={{
                  backgroundColor: `${a.tint}1F`,
                  color: a.tint,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ['--tw-ring-color' as any]: `${a.tint}33`,
                  transitionTimingFunction: EASE.join(' '),
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1.5 top-1 h-1.5 rounded-full opacity-60"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 100%)',
                  }}
                />
                <Icon size={22} />
              </div>
              <p className="mt-2.5 text-[13px] font-semibold tracking-tight text-white">
                {a.label}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-white/65">
                {a.description}
              </p>
            </motion.div>
          );

          if (a.href) {
            return (
              <Link
                key={a.label}
                href={a.href}
                aria-label={a.label}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1c30]"
              >
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              aria-label={a.label}
              className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1c30]"
            >
              {inner}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
