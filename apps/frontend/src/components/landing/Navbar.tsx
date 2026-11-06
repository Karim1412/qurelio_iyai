'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, Search, ChevronDown } from '@/components/icons';
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/utils/cn';
import { LanguageToggle } from './LanguageToggle';

const NAV_LINKS = [
  { label: 'Home',        href: '#home' },
  { label: 'Why Qurelio', href: '#why-qurelio' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing',     href: '#pricing' },
  { label: 'Contact',     href: '#contact' },
];

export function Navbar() {
  const [scrolled, setScrolled]       = useState(false);
  const [scrollY, setScrollY]         = useState(0);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [hovered, setHovered]         = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeLink, setActiveLink]   = useState<string | null>(null);

  const { scrollYProgress } = useScroll();
  const progressScaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    mass: 0.3,
    restDelta: 0.001,
  });

  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.href.replace('#', ''));
    let raf = 0;

    const compute = () => {
      const y = window.scrollY;
      setScrollY(y);
      setScrolled(y > 20);

      // Use getBoundingClientRect (viewport-relative, works through any transform/positioning ancestor)
      // and pick the section whose center is closest to the viewport center.
      const viewportH = window.innerHeight;
      const viewportCenter = viewportH / 2;
      let activeId: string | null = null;
      let bestDist = Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Skip sections fully outside the viewport: they can't be "active"
        if (rect.bottom < 0 || rect.top > viewportH) continue;
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          activeId = id;
        }
      }

      // Edge cases
      if (y < 80) activeId = ids[0];
      const atBottom = viewportH + y >= document.documentElement.scrollHeight - 4;
      if (atBottom) activeId = ids[ids.length - 1];

      if (activeId) {
        setActiveLink((prev) => (prev === `#${activeId}` ? prev : `#${activeId}`));
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // Navbar shrinks and "floats" as a pill when scrolled
  const navWidth  = scrolled ? '92%'  : '100%';
  const navTop    = scrolled ? '14px' : '12px';
  const navRadius = scrolled ? '999px': '0px';

  return (
    <>
      {/* ── Full-page scroll progress: always at very top, full width ── */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[1.5px]"
        style={{ transformOrigin: 'left center', scaleX: progressScaleX }}
      >
        {/* Track */}
        <div className="absolute inset-0 bg-[var(--border)]/25" />
        {/* Filled gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--brand-primary)] via-[var(--brand-accent)] to-[var(--brand-primary)]" />
        {/* Glowing leading dot */}
        
      </motion.div>

      <div className="fixed inset-x-0 top-0 z-50 flex justify-center pointer-events-none">
        <motion.header
          initial={false}
          animate={{
            width: navWidth,
            top: scrolled ? 14 : 12,
            borderRadius: scrolled ? 999 : 0,
          }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto relative overflow-hidden"
          style={{ position: 'fixed' }}
        >
          {/* ── Background layer ── */}
          <motion.div
            aria-hidden
            className="absolute inset-0"
            initial={false}
            animate={{
              opacity: scrolled ? 1 : 0,
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: 'color-mix(in srgb, var(--surface) 72%, transparent)',
              backdropFilter: 'blur(32px) saturate(200%) brightness(1.06)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%) brightness(1.06)',
              boxShadow: [
                'inset 0 1px 0 0 color-mix(in srgb, white 50%, transparent)',
                'inset 0 -1px 0 0 color-mix(in srgb, white 10%, transparent)',
                '0 8px 40px -12px rgba(15, 23, 42, 0.18)',
                '0 2px 8px -2px rgba(15, 23, 42, 0.08)',
              ].join(', '),
              border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            }}
          />

          {/* Subtle top sheen */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            animate={{ opacity: scrolled ? 1 : 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, white 55%, transparent) 50%, transparent 100%)',
            }}
          />


          {/* ── Inner row ── (fixed height: logo cannot grow it) */}
          <motion.div
            initial={false}
            animate={{
              height: scrolled ? 60 : 76,
              paddingTop: 0,
              paddingBottom: 0,
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex w-full items-center justify-between gap-4 px-6 sm:px-8 lg:px-10"
          >
            {/* ── Logo: fills the row height, no overflow ── */}
            <Link
              href="/"
              className="flex h-full shrink-0 items-center gap-2.5 py-1"
              aria-label="Qurelio"
            >
              <motion.div
                animate={{ scale: scrolled ? 0.94 : 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- avoids Next image optimizer / missing sharp in Docker */}
                <img
                  src="/brand/querlio-logo.png"
                  alt="Qurelio"
                  className="block h-[80px] w-auto max-w-none select-none object-contain"
                  draggable={false}
                />
              </motion.div>
            </Link>

            {/* ── Nav links ── */}
            <nav
              className="relative hidden flex-1 items-center justify-center md:flex"
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-0.5">
                {NAV_LINKS.map((link) => {
                  const isHovered = hovered === link.href;
                  const isActive  = activeLink === link.href;
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      onMouseEnter={() => setHovered(link.href)}
                      onClick={() => setActiveLink(link.href)}
                      className={cn(
                        'relative px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-full',
                        isHovered || isActive
                          ? 'text-[var(--brand-primary)]'
                          : 'text-[var(--muted)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      {/* Hover pill */}
                      {isHovered && (
                        <motion.span
                          layoutId="nav-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          className="absolute inset-0 -z-10 rounded-full bg-[var(--brand-primary)]/8"
                        />
                      )}
                      {/* Active dot: instant snap (no spring delay) */}
                      {isActive && (
                        <motion.span
                          layoutId="nav-active-dot"
                          className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--brand-primary)]"
                          transition={{ duration: 0 }}
                        />
                      )}
                      <span className="relative">{link.label}</span>
                    </a>
                  );
                })}
              </div>
            </nav>

            {/* ── Right: Search + Language + CTA ── */}
            <div className="hidden shrink-0 items-center gap-2.5 md:flex">
              {/* Language toggle */}
              <LanguageToggle />

              {/* Search */}
              <motion.div
                animate={{ width: searchFocused ? 192 : 140 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'relative flex items-center overflow-hidden rounded-full border transition-all duration-300',
                  searchFocused
                    ? 'border-[var(--brand-primary)]/50 bg-[var(--surface)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-primary)_10%,transparent)]'
                    : 'border-[var(--border)] bg-[var(--surface)]/60'
                )}
              >
                <Search
                  className={cn(
                    'ml-3 h-3.5 w-3.5 shrink-0 transition-colors duration-200',
                    searchFocused ? 'text-[var(--brand-primary)]' : 'text-[var(--muted)]'
                  )}
                />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="w-full bg-transparent py-2 pl-2 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--muted)] focus:outline-none"
                />
              </motion.div>

              {/* CTA: morphs subtly on scroll */}
              <Link
                href="/auth/register"
                className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--page-bg)] transition-all duration-200 hover:-translate-y-0.5"
              >
                {/* Shimmer sweep on hover */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/15 transition-transform duration-500 group-hover:translate-x-[200%]"
                />
                <span className="relative">Get started</span>
                <motion.span
                  className="relative"
                  animate={{ x: [0, 2, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </motion.span>
              </Link>
            </div>

            {/* ── Mobile trigger ── */}
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface)] md:hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                {drawerOpen ? (
                  <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }} className="absolute">
                    <X className="h-5 w-5" />
                  </motion.span>
                ) : (
                  <motion.span key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }} className="absolute">
                    <Menu className="h-5 w-5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        </motion.header>
      </div>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-[var(--page-bg)]/60 backdrop-blur-sm md:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-4 top-20 z-50 rounded-3xl border border-[var(--border)] bg-[var(--surface)]/95 p-4 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur-xl md:hidden"
            >
              {/* Mobile search */}
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                <input type="text" placeholder="Search…" className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--muted)] focus:outline-none" />
              </div>

              {/* Mobile language toggle */}
              <div className="mb-3 flex justify-center">
                <LanguageToggle compact />
              </div>

              <nav className="flex flex-col gap-0.5">
                {NAV_LINKS.map((link, i) => (
                  <motion.a
                    key={link.href}
                    href={link.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-xl px-3 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--brand-primary)]/8 hover:text-[var(--brand-primary)]"
                  >
                    {link.label}
                  </motion.a>
                ))}
              </nav>

              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <Link
                  href="/auth/register"
                  onClick={() => setDrawerOpen(false)}
                  className="group relative flex items-center justify-center gap-1.5 overflow-hidden rounded-full bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--page-bg)]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/15 transition-transform duration-500 group-hover:translate-x-[200%]"
                  />
                  Get started
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}