'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  Play,
  Building2,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  FileText,
  Sparkles,
  type LucideIcon,
} from '@/components/icons';

/* ─── Constants ──────────────────────────────────────────────────────────── */
type EaseTuple = [number, number, number, number];
const EASE_OUT: EaseTuple = [0.22, 1, 0.36, 1];

type LiveEvent = {
  id: string;
  Icon: LucideIcon;
  tone: 'success' | 'warn' | 'info';
  title: string;
  meta: string;
};

const LIVE_EVENTS: LiveEvent[] = [
  { id: 'a1', Icon: CheckCircle,   tone: 'success', title: 'Audit AUD-214 closed', meta: '2 findings · 0 majors' },
  { id: 'a2', Icon: AlertTriangle, tone: 'warn',    title: 'NC-117 opened',         meta: 'Severity: minor' },
  { id: 'a3', Icon: FileText,      tone: 'info',    title: 'SOP-052 approved',      meta: 'rev. 04 · QA lead' },
  { id: 'a4', Icon: ShieldCheck,   tone: 'success', title: 'Regulation update flagged', meta: '3 products affected' },
];

/* ─── Word-stagger animator ──────────────────────────────────────────────── */
function AnimatedWords({
  text,
  className,
  delayBase = 0,
  delayStep = 0.06,
}: {
  text: string;
  className?: string;
  delayBase?: number;
  delayStep?: number;
}) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span
            className="inline-block overflow-hidden align-bottom"
            style={{ paddingBottom: '0.14em' }}
          >
            <motion.span
              initial={{ y: '115%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{
                duration: 0.75,
                delay: delayBase + i * delayStep,
                ease: EASE_OUT,
              }}
              className="inline-block"
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </span>
  );
}

/* ─── Digit-flip ticker ──────────────────────────────────────────────────── */
function Digit({ value, delay = 0 }: { value: number; delay?: number }) {
  return (
    <span
      className="inline-block overflow-hidden"
      style={{ height: '1em', lineHeight: 1, verticalAlign: 'top' }}
      aria-hidden
    >
      <motion.span
        initial={{ y: 0 }}
        animate={{ y: `-${value}em` }}
        transition={{ duration: 1.4, delay, ease: EASE_OUT }}
        className="inline-block"
        style={{ willChange: 'transform' }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block" style={{ height: '1em', lineHeight: 1 }}>
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function NumberTicker({
  value,
  decimals = 0,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  delay?: number;
}) {
  const str = value.toFixed(decimals);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }} aria-label={str}>
      {str.split('').map((ch, i) =>
        ch >= '0' && ch <= '9' ? (
          <Digit key={i} value={parseInt(ch, 10)} delay={delay + i * 0.04} />
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </span>
  );
}

/* ─── Magnetic CTA ───────────────────────────────────────────────────────── */
function MagneticButton({
  children,
  className,
  href,
  strength = 14,
}: {
  children: React.ReactNode;
  className?: string;
  href: string;
  strength?: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const sx = useSpring(tx, { stiffness: 220, damping: 18 });
  const sy = useSpring(ty, { stiffness: 220, damping: 18 });

  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    tx.set(dx * strength);
    ty.set(dy * strength);
  };
  const reset = () => {
    tx.set(0);
    ty.set(0);
  };

  return (
    <motion.span style={{ x: sx, y: sy, display: 'inline-flex' }} className="will-change-transform">
      <Link
        ref={ref}
        href={href}
        onMouseMove={onMove}
        onMouseLeave={reset}
        className={className}
      >
        {children}
      </Link>
    </motion.span>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */
export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Scroll exit
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 28, mass: 0.5 });
  const exitOpacity = useTransform(smooth, [0, 0.55, 1], [1, 1, 0]);
  const exitScale   = useTransform(smooth, [0, 1], [1, 0.96]);
  const exitY       = useTransform(smooth, [0, 1], [0, -48]);
  const exitBlurPx  = useTransform(smooth, [0, 0.5, 1], [0, 0, 5]);
  const exitFilter  = useMotionTemplate`blur(${exitBlurPx}px)`;

  // Live event rotation
  const [eventIdx, setEventIdx] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => {
      setEventIdx((i) => (i + 1) % LIVE_EVENTS.length);
    }, 3200);
    return () => clearInterval(t);
  }, [mounted]);

  return (
    <section
      id="home"
      ref={sectionRef}
      className="relative overflow-hidden bg-[var(--page-bg)] pb-32 pt-28 sm:pt-32"
    >
      {/* ── Thin grid ────────────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--brand-primary) 9%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--brand-primary) 9%, transparent) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse 78% 70% at 50% 45%, black 25%, transparent 82%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 78% 70% at 50% 45%, black 25%, transparent 82%)',
        }}
      />

      {/* ── Hero content ─────────────────────────────────────────────────── */}
      <motion.div
        style={{
          opacity: exitOpacity,
          scale: exitScale,
          y: exitY,
          filter: exitFilter,
          willChange: 'transform, opacity, filter',
        }}
        className="relative mx-auto max-w-4xl px-4 text-center sm:px-6"
      >


        {/* Headline */}
        <h1 className="relative mb-6 text-4xl font-semibold leading-[1.06] tracking-tight text-[var(--text-primary)] sm:text-5xl md:text-6xl">
          <AnimatedWords
            text="Prove your"
            className="text-[var(--muted)]"
            delayBase={0.15}
          />{' '}
          <AnimatedWords
            text="compliance."
            className="text-[var(--brand-primary)]"
            delayBase={0.3}
          />
          <br />
          <AnimatedWords
            text="Every product, every market, every day."
            className="text-[var(--text-primary)]"
            delayBase={0.5}
          />
        </h1>

        {/* Sub-headline */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.0, ease: EASE_OUT }}
          className="mx-auto max-w-2xl text-base leading-relaxed text-[var(--muted)] sm:text-lg"
        >
          One platform to show your products meet the laws and regulations of every
          market you sell to. Documents, audits, non-conformities and evidence:
          organised, scored, and audit-ready every day, not just at certification time.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.12, ease: EASE_OUT }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <MagneticButton
            href="/demo"
            className="group relative inline-flex min-w-[180px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--brand-primary)] px-6 py-3.5 text-sm font-semibold tracking-wide text-white shadow-[0_10px_30px_-10px_color-mix(in_srgb,var(--brand-primary)_70%,transparent)] transition-shadow duration-300 hover:shadow-[0_18px_46px_-12px_color-mix(in_srgb,var(--brand-primary)_85%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]"
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              style={{
                background:
                  'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)',
                backgroundSize: '200% 100%',
              }}
            />
            <span className="relative">Book a demo</span>
            <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </MagneticButton>

          <MagneticButton
            href="#video"
            strength={10}
            className="group inline-flex min-w-[180px] cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--brand-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-6 py-3.5 text-sm font-semibold tracking-wide text-[var(--text-primary)] backdrop-blur-sm transition-all duration-300 hover:border-[var(--brand-primary)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)]"
          >
            <span
              className="relative flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110"
              style={{
                background: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                color: 'var(--brand-primary)',
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: 'color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                  animation: 'qrl-pulse 1.6s ease-out infinite',
                }}
              />
              <Play className="relative h-3 w-3 fill-current transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
            Watch video
          </MagneticButton>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.25, ease: EASE_OUT }}
          className="mt-9 flex items-center justify-center"
        >
          <div
            className="inline-flex items-center gap-2.5 backdrop-blur-md"
            style={{
              background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
              border: '1px solid color-mix(in srgb, var(--brand-primary) 14%, transparent)',
              borderRadius: 999,
              padding: '7px 18px',
              boxShadow: '0 1px 8px color-mix(in srgb, var(--brand-primary) 8%, transparent)',
            }}
          >
            <BreathingAvatar />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
                letterSpacing: '-0.01em',
              }}
            >
              Built with quality managers from Tunisia&apos;s export industry.
            </span>
          </div>
        </motion.div>

        {/* Cert marquee */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.5 }}
          className="relative mt-12 overflow-hidden"
          style={{
            maskImage:
              'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
          }}
        >
        </motion.div>
      </motion.div>

      <style>{`
        @keyframes qrl-pulse {
          0%   { transform: scale(0.9); opacity: 0.55; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </section>
  );
}

/* ─── Shimmer word ───────────────────────────────────────────────────────── */
function ShimmerWord({
  text,
  color,
  delay = 0,
  rotateIn = false,
}: {
  text: string;
  color: string;
  delay?: number;
  rotateIn?: boolean;
}) {
  return (
    <span
      className="inline-block overflow-hidden align-bottom"
      style={{ paddingBottom: '0.16em' }}
    >
      <motion.span
        initial={{ y: '115%', opacity: 0, rotate: rotateIn ? -8 : 0 }}
        animate={{ y: '0%', opacity: 1, rotate: 0 }}
        transition={{ duration: 0.8, delay, ease: EASE_OUT }}
        className="relative inline-block"
        style={{ color, willChange: 'transform' }}
      >
        {text}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'linear', delay: delay + 0.8 }}
          style={{
            background:
              'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.85) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          {text}
        </motion.span>
      </motion.span>
    </span>
  );
}

/* ─── Blinking caret ─────────────────────────────────────────────────────── */
function BlinkingCaret({ delay = 0 }: { delay?: number }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0, 0, 1] }}
      transition={{
        delay,
        duration: 1.4,
        times: [0, 0.05, 0.5, 0.55, 0.95, 1],
        repeat: Infinity,
        ease: 'linear',
      }}
      className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.05em] rounded-sm"
      style={{ background: 'var(--brand-primary)' }}
    />
  );
}

/* ─── Conic halo ─────────────────────────────────────────────────────────── */


/* ─── Breathing avatar ───────────────────────────────────────────────────── */
function BreathingAvatar() {
  return (
    <motion.span
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#fff',
        border: '1.5px solid var(--page-bg, #fff)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxShadow: '0 0 0 2px color-mix(in srgb, var(--brand-primary) 12%, transparent)',
      }}
    >
      <Building2 size={11} strokeWidth={2.25} color="#1c252e" />
    </motion.span>
  );
}

/* ─── Cert marquee ───────────────────────────────────────────────────────── */

