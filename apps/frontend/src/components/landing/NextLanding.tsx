'use client';

import React, { useRef } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';
import { ArrowRight } from '@/components/icons';

type Tracer = {
  duration: number;
  delay: number;
  repeatDelay: number;
  color: string;
};

const HORIZONTAL_TRACERS: (Tracer & { top: string; width: string })[] = [
  { top: '18%', width: '180px', duration: 9,  delay: 0,   repeatDelay: 2.2, color: 'rgba(27,27,245,0.55)' },
  { top: '38%', width: '140px', duration: 11, delay: 1.8, repeatDelay: 3.0, color: 'rgba(27,27,245,0.40)' },
  { top: '62%', width: '200px', duration: 10, delay: 3.4, repeatDelay: 2.6, color: 'rgba(99,102,241,0.45)' },
  { top: '82%', width: '160px', duration: 12, delay: 5.0, repeatDelay: 2.8, color: 'rgba(27,27,245,0.35)' },
];

const VERTICAL_TRACERS: (Tracer & { left: string; height: string })[] = [
  { left: '22%', height: '160px', duration: 10, delay: 0.6, repeatDelay: 2.4, color: 'rgba(27,27,245,0.45)' },
  { left: '48%', height: '200px', duration: 12, delay: 2.4, repeatDelay: 2.8, color: 'rgba(99,102,241,0.40)' },
  { left: '74%', height: '170px', duration: 11, delay: 4.2, repeatDelay: 3.0, color: 'rgba(27,27,245,0.50)' },
];

const TITLE_LINES = [
  ['Your', 'next', 'lending'],
  ['product', 'awaits'],
];

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.08,
    },
  },
};

const wordVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
    filter: 'blur(6px)',
  },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export function NextLanding() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });

  return (
    <section
      ref={ref}
      aria-labelledby="next-landing-title"
      className="relative isolate overflow-hidden"
      style={{
        background: [
          'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(244, 240, 230, 0.6), transparent 70%)',
          'radial-gradient(ellipse 80% 40% at 50% 100%, rgba(250, 248, 242, 0.9), transparent 70%)',
          'linear-gradient(180deg, #FAF8F2 0%, #FDFCF9 50%, #FAF8F2 100%)',
        ].join(', '),
      }}
    >
      {/* Grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
          maskImage:
            'radial-gradient(ellipse at center, black 35%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 35%, transparent 78%)',
        }}
      />

      {/* Soft moving tracer lines along the grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          maskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      >
        {/* Horizontal tracers */}
        {HORIZONTAL_TRACERS.map((t, i) => (
          <motion.span
            key={`h-${i}`}
            className="absolute h-px"
            style={{
              top: t.top,
              left: 0,
              width: t.width,
              background: `linear-gradient(to right, transparent, ${t.color}, transparent)`,
              filter: 'blur(0.4px)',
            }}
            initial={{ x: '-30%', opacity: 0 }}
            animate={{
              x: ['-30%', '120vw'],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: t.duration,
              delay: t.delay,
              repeat: Infinity,
              repeatDelay: t.repeatDelay,
              ease: 'easeInOut',
              times: [0, 0.15, 0.85, 1],
            }}
          />
        ))}

        {/* Vertical tracers */}
        {VERTICAL_TRACERS.map((t, i) => (
          <motion.span
            key={`v-${i}`}
            className="absolute w-px"
            style={{
              left: t.left,
              top: 0,
              height: t.height,
              background: `linear-gradient(to bottom, transparent, ${t.color}, transparent)`,
              filter: 'blur(0.4px)',
            }}
            initial={{ y: '-30%', opacity: 0 }}
            animate={{
              y: ['-30%', '120%'],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: t.duration,
              delay: t.delay,
              repeat: Infinity,
              repeatDelay: t.repeatDelay,
              ease: 'easeInOut',
              times: [0, 0.15, 0.85, 1],
            }}
          />
        ))}
      </div>

      {/* Soft brand glows */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[var(--brand-primary)]/10 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center sm:py-28 lg:py-32">

        {/* ── Animated title word by word ── */}
        <motion.h2
          id="next-landing-title"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'show' : 'hidden'}
          className="mt-6 text-balance text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl"
          aria-label="Your next lending product awaits"
        >
          {TITLE_LINES.map((line, li) => (
            <span key={li} className="block">
              {line.map((word, wi) => (
                <motion.span
                  key={wi}
                  variants={wordVariants}
                  className="inline-block"
                  style={{ marginRight: wi < line.length - 1 ? '0.28em' : 0 }}
                >
                  {word}
                </motion.span>
              ))}
            </span>
          ))}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'show' : 'hidden'}
          transition={{ duration: 0.7, delay: 0.62, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-[var(--muted)] sm:text-lg"
        >
          For those who want more from their lending products, there&apos;s
          Querlio. Get started today and never look back.
        </motion.p>

        {/* Book Demo button */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'show' : 'hidden'}
          transition={{ duration: 0.7, delay: 0.76, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10"
        >
          <a
            href="/demo"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[var(--brand-primary)] px-7 py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-all duration-300 ease-out hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            {/* Soft sheen: skew via style to avoid JSX > conflict */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-white/20 transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
              style={{ transform: 'translateX(-100%) skewX(-20deg)' }}
            />
            {/* Inner gradient softener */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent"
            />
            <span className="relative">Book Demo</span>
            <motion.span
              aria-hidden
              className="relative inline-flex"
              animate={{ x: [0, 3, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ArrowRight className="h-4 w-4" />
            </motion.span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}