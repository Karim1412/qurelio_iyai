'use client';

import React, { useRef, useState } from 'react';
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import {
  ArrowRight,
  Github,
  Linkedin,
  Twitter,
  Mail,
  ShieldCheck,
  Sparkles,
  CheckCircle,
  type LucideIcon,
} from '@/components/icons';

/* ---------- Data ---------- */

type NavColumn = {
  heading: string;
  links: { label: string; href: string }[];
};

const NAV_COLUMNS: NavColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Why Qurelio', href: '#why-qurelio' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Blog', href: '#' },
      { label: 'Help Center', href: '#' },
      { label: 'Customer Stories', href: '#' },
      { label: 'Documentation', href: '#' },
      { label: 'Security & Compliance', href: '#' },
      { label: 'Newsletter', href: '#' },
      { label: 'Partners', href: '#' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '#about' },
      { label: 'Careers', href: '#' },
      { label: 'Press', href: '#' },
      { label: 'Contact', href: '#contact' },
    ],
  },
];

const SOCIALS: { Icon: LucideIcon; label: string; href: string }[] = [
  { Icon: Twitter, label: 'Twitter', href: '#' },
  { Icon: Linkedin, label: 'LinkedIn', href: '#' },
  { Icon: Github, label: 'GitHub', href: '#' },
];



const WORDMARK = 'Qurelio';

/* ---------- Easing ---------- */

const SOFT = [0.22, 1, 0.36, 1] as const;

/* ---------- Main Footer ---------- */

export function Footer() {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.12 });
  const prefersReducedMotion = useReducedMotion();

  /* ─── Scroll-driven "shutter" reveal (slow, soft) ─── */
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start 95%', 'end 85%'],
  });
  // Smooth the raw scroll progress so the reveal feels gentle and inertial
  const progress = useSpring(scrollYProgress, {
    stiffness: 55,
    damping: 22,
    mass: 0.9,
  });
  const yReveal = useTransform(progress, [0, 1], prefersReducedMotion ? [0, 0] : [80, 0]);
  const opacityReveal = useTransform(progress, [0, 0.4, 1], prefersReducedMotion ? [1, 1, 1] : [0, 0.55, 1]);
  const radiusReveal = useTransform(progress, [0, 1], prefersReducedMotion ? [32, 32] : [56, 32]);
  const shadowReveal = useTransform(
    progress,
    [0, 1],
    [
      '0 -4px 14px -12px rgba(219,234,254,0.30)',
      '0 -16px 40px -32px rgba(191,219,254,0.45)',
    ],
  );
  // Stage cushion gradient softly fades in behind the footer as it lifts
  const stageOpacity = useTransform(progress, [0, 1], [0, 1]);

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setEmail('');
    }, 2400);
  };

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0 },
  };

  const letter: Variants = {
    hidden: { opacity: 0, y: 40 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div
      ref={stageRef}
      className="relative isolate"
      style={{ perspective: 1400 }}
    >
      {/* ─── Stage cushion: soft gradient backdrop behind the footer card ─── */}
      <motion.div
        aria-hidden
        style={{ opacity: stageOpacity }}
        className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10"
      >
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-transparent via-[#EEF1FA]/40 to-[#E9EDF8]/70" />
        <div className="absolute left-1/2 top-8 h-[260px] w-[80%] max-w-5xl -translate-x-1/2 rounded-[60px] bg-[radial-gradient(ellipse_at_top,rgba(27,27,245,0.10),transparent_70%)] blur-2xl" />
      </motion.div>

      <motion.footer
        ref={ref}
        style={{
          y: yReveal,
          opacity: opacityReveal,
          borderTopLeftRadius: radiusReveal,
          borderTopRightRadius: radiusReveal,
          boxShadow: shadowReveal,
          transformOrigin: '50% 100%',
          willChange: 'transform, opacity',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          backfaceVisibility: 'hidden',
        }}
        className="relative isolate overflow-hidden border border-b-0 border-[var(--border)]/60 bg-gradient-to-b from-white via-white to-[#FAFBFF]"
      >
      {/* ─── Soft ambient background ─── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Soft top hairline gradient */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-primary)]/30 to-transparent" />
        {/* Soft grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(15,23,42,1) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,1) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage:
              'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 80%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-14 sm:px-10 lg:pt-16">
        {/* ── Main row: Brand + Newsletter | Nav ── */}
        <div className="mb-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
          {/* Left: Logo + tagline + newsletter + trust */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate={inView ? 'show' : 'hidden'}
            transition={{ duration: 0.8, ease: SOFT }}
            className="flex flex-col gap-7"
          >
            <div className="flex items-start gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/querlio-mini.png"
                alt="Qurelio"
                height={88}
                style={{ height: 88, width: 'auto' }}
                className="block shrink-0 select-none drop-shadow-[0_8px_24px_rgba(27,27,245,0.10)]"
                draggable={false}
              />
              <div className="flex flex-col gap-3">
                <p className="max-w-md text-[15px] leading-relaxed text-[var(--text-primary)]/85">
                  Regulatory compliance, audits and quality operations: calm, clear,
                  AI-assisted, and always under your control.
                </p>
                
              </div>
            </div>

            {/* Newsletter */}
            <div className="flex flex-col gap-3">
              <label
                htmlFor="footer-newsletter"
                className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-accent)]"
              >
                Stay in the loop
              </label>
              <form
                onSubmit={handleSubmit}
                className="group relative flex max-w-md items-center overflow-hidden rounded-full border border-[var(--border)]/50 bg-[var(--surface)]/50 transition-all duration-500 focus-within:border-[var(--brand-primary)]/35 focus-within:bg-white/80"
              >
                {/* Soft inner glow on focus */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-focus-within:opacity-100"
                  style={{
                    boxShadow:
                      'inset 0 0 0 1px rgba(27,27,245,0.10), 0 0 0 6px rgba(27,27,245,0.05)',
                  }}
                />
                <span className="pointer-events-none absolute left-4 flex h-9 w-9 items-center justify-center text-[var(--muted)]/70 transition-colors duration-500 group-focus-within:text-[var(--brand-primary)]">
                  <Mail className="h-[15px] w-[15px]" strokeWidth={1.6} />
                </span>
                <input
                  id="footer-newsletter"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email address"
                  placeholder="you@company.com"
                  className="flex-1 bg-transparent py-3.5 pl-12 pr-3 text-[13.5px] font-medium tracking-[-0.005em] text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--muted)]/70 focus:outline-none"
                />
                {/* Soft hairline divider before the button */}
                <span
                  aria-hidden
                  className="mr-1 hidden h-5 w-px bg-gradient-to-b from-transparent via-[var(--border)]/70 to-transparent sm:block"
                />
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.96 }}
                  className="group/btn relative m-1 inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-[var(--brand-primary)] px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-500 hover:bg-[var(--brand-primary)]/92"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover/btn:translate-x-[200%]"
                  />
                  <motion.span
                    key={submitted ? 'done' : 'idle'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: SOFT }}
                    className="relative inline-flex items-center gap-1.5"
                  >
                    {submitted ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Subscribed
                      </>
                    ) : (
                      <>
                        Subscribe
                        <motion.span
                          aria-hidden
                          className="inline-flex"
                          animate={prefersReducedMotion ? undefined : { x: [0, 3, 0] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </motion.span>
                      </>
                    )}
                  </motion.span>
                </motion.button>
              </form>
              <p className="text-xs text-[var(--muted)]">
                One email per month. No spam, unsubscribe in one click.
              </p>
            </div>

           
          </motion.div>

          {/* Right: Nav columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-12 lg:justify-items-end">
            {NAV_COLUMNS.map((col, colIdx) => (
              <motion.div
                key={col.heading}
                variants={fadeUp}
                initial="hidden"
                animate={inView ? 'show' : 'hidden'}
                transition={{
                  duration: 0.7,
                  delay: 0.18 + colIdx * 0.1,
                  ease: SOFT,
                }}
                className="flex min-w-[120px] flex-col gap-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-accent)]">
                  {col.heading}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((link, linkIdx) => (
                    <motion.li
                      key={link.label}
                      initial={{ opacity: 0, x: -6 }}
                      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
                      transition={{
                        duration: 0.5,
                        delay: 0.32 + colIdx * 0.08 + linkIdx * 0.04,
                        ease: SOFT,
                      }}
                    >
                      <a
                        href={link.href}
                        className="group relative inline-flex items-center text-sm text-[var(--text-primary)]/75 transition-colors duration-300 hover:text-[var(--brand-primary)]"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -left-3 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-[var(--brand-primary)] opacity-0 transition-all duration-300 group-hover:left-[-10px] group-hover:opacity-100"
                        />
                        <span className="relative">
                          {link.label}
                          <span
                            aria-hidden
                            className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-accent)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100"
                          />
                        </span>
                      </a>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Giant wordmark: letter-by-letter reveal ─── */}
      <div
        aria-hidden
        className="pointer-events-none relative select-none overflow-hidden"
        style={{ height: 'clamp(3.5rem, 12vw, 9.5rem)' }}
      >
        <motion.div
          initial="hidden"
          animate={inView ? 'show' : 'hidden'}
          variants={{
            hidden: {},
            show: {
              transition: { staggerChildren: 0.06, delayChildren: 0.6 },
            },
          }}
          className="flex justify-center"
          style={{
            fontSize: 'clamp(4.5rem, 17vw, 14rem)',
            fontWeight: 800,
            letterSpacing: '-0.05em',
            lineHeight: 0.86,
          }}
        >
          {WORDMARK.split('').map((ch, i) => (
            <motion.span
              key={i}
              variants={letter}
              transition={{ duration: 0.9, ease: SOFT }}
              className="inline-block bg-gradient-to-b from-slate-300/70 via-slate-400/40 to-slate-200/10 bg-clip-text text-transparent"
              style={{ WebkitTextFillColor: 'transparent' }}
            >
              {ch}
            </motion.span>
          ))}
        </motion.div>
        {/* Soft gradient veil at the bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[#FAFBFF]" />
      </div>

      {/* ── Bottom bar ── */}
      <div className="relative mx-auto max-w-7xl px-6 pb-8 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.7, delay: 1, ease: SOFT }}
          className="relative flex flex-col items-center justify-between gap-4 pt-6 sm:flex-row"
        >
          {/* Animated soft divider */}
          <motion.span
            aria-hidden
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
            transition={{ duration: 1.2, delay: 0.85, ease: SOFT }}
            className="absolute inset-x-0 top-0 h-px origin-center bg-gradient-to-r from-transparent via-[var(--border)] to-transparent"
          />

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[var(--muted)] sm:justify-start">
            <p>© {new Date().getFullYear()} Qurelio. Powered by Pura Solutions.</p>
            <span aria-hidden className="hidden h-3 w-px bg-[var(--border)]/60 sm:inline" />
            <a
              href="/terms"
              className="relative transition-colors duration-300 hover:text-[var(--brand-primary)]"
            >
              Terms of Service
            </a>
            <span aria-hidden className="hidden h-3 w-px bg-[var(--border)]/60 sm:inline" />
            <a
              href="/privacy"
              className="relative transition-colors duration-300 hover:text-[var(--brand-primary)]"
            >
              Privacy Policy
            </a>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="mailto:hello@qurelio.com"
              className="hidden text-xs text-[var(--muted)] transition-colors duration-300 hover:text-[var(--brand-primary)] sm:inline"
            >
              hello@qurelio.com
            </a>
            <span aria-hidden className="hidden h-3 w-px bg-[var(--border)]/60 sm:inline" />
            <div className="flex items-center gap-2">
              {SOCIALS.map(({ Icon, label, href }, i) => (
                <motion.a
                  key={label}
                  href={href}
                  aria-label={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.5, delay: 1.05 + i * 0.08, ease: SOFT }}
                  whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                  whileTap={{ scale: 0.94 }}
                  className="group relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--border)]/60 bg-white/70 text-[var(--muted)] transition-all duration-500 hover:border-[var(--brand-primary)]/40 hover:text-[var(--brand-primary)] hover:shadow-[0_10px_24px_-12px_rgba(27,27,245,0.45)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 scale-0 rounded-full bg-[var(--brand-primary)]/10 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100"
                  />
                  <Icon className="relative h-4 w-4 transition-transform duration-500 group-hover:scale-110" />
                </motion.a>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
      </motion.footer>
    </div>
  );
}
