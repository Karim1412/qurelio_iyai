'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from '@/components/icons';
import { useTranslation, type Lang } from './TranslationProvider';

function FlagGB({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <clipPath id="lt-gb-cut">
        <path d="M30,15 h30 v15 z M30,15 v15 h-30 z M30,15 h-30 v-15 z M30,15 v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath="url(#lt-gb-cut)"
        stroke="#C8102E"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function FlagFR({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 3 2" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="1" height="2" x="0" fill="#002654" />
      <rect width="1" height="2" x="1" fill="#FFFFFF" />
      <rect width="1" height="2" x="2" fill="#CE1126" />
    </svg>
  );
}

function FlagES({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 6 4" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="6" height="4" fill="#AA151B" />
      <rect width="6" height="2" y="1" fill="#F1BF00" />
    </svg>
  );
}

const LANGS: {
  code: Lang;
  label: string;
  short: string;
  Flag: React.ComponentType<{ className?: string }>;
}[] = [
  { code: 'en', label: 'English',  short: 'EN', Flag: FlagGB },
  { code: 'fr', label: 'Français', short: 'FR', Flag: FlagFR },
  { code: 'es', label: 'Español',  short: 'ES', Flag: FlagES },
];

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, isTranslating } = useTranslation();
  const [open, setOpen] = useState(false);
  // Tracks whether the dropdown is closing because the user picked an option
  // (→ iOS "tab close" exit) versus closing via outside-click / Esc (→ normal exit).
  const [closingViaSelect, setClosingViaSelect] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  useEffect(() => setMounted(true), []);

  // Recompute the portal-positioned menu anchor relative to the trigger
  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  // Outside-click + Escape to dismiss
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setClosingViaSelect(false);
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClosingViaSelect(false);
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = (code: Lang) => {
    if (code !== lang) setLang(code);
    setClosingViaSelect(true);
    setOpen(false);
  };

  // iOS-style "tab/window close": the panel zooms back, fades, and softly blurs
  // away: same feel as flicking a Safari tab into the stack.
  const tabCloseExit = {
    opacity: 0,
    scale: 0.7,
    y: -14,
    filter: 'blur(6px)',
    transition: { duration: 0.34, ease: [0.34, 0.04, 0.36, 1] as [number, number, number, number] },
  };

  // Calmer dismissal when closing via outside click / Esc
  const calmExit = {
    opacity: 0,
    scale: 0.92,
    y: -6,
    filter: 'blur(0px)',
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as [number, number, number, number] },
  };

  const triggerHeight = compact ? 'h-8' : 'h-9';
  const triggerFlag   = compact ? 'h-[18px] w-[18px]' : 'h-5 w-5';

  const menu = (
    <AnimatePresence>
      {open && menuPos && (
        <motion.ul
          ref={menuRef}
          role="listbox"
          aria-label="Language"
          data-no-translate
          initial={{ opacity: 0, scale: 0.86, y: -8, filter: 'blur(4px)' }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 },
          }}
          exit={closingViaSelect ? tabCloseExit : calmExit}
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            transformOrigin: 'top right',
            zIndex: 100,
          }}
          className="min-w-[180px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-1 shadow-[0_18px_50px_-18px_rgba(15,23,42,0.28),0_2px_8px_-2px_rgba(15,23,42,0.08)] backdrop-blur-xl"
        >
          {LANGS.map((l, i) => {
            const active = l.code === lang;
            const Flag = l.Flag;
            return (
              <motion.li
                key={l.code}
                initial={{ opacity: 0, y: -6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    delay: 0.04 + i * 0.035,
                    duration: 0.22,
                    ease: [0.22, 1, 0.36, 1],
                  },
                }}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={isTranslating && !active}
                  onClick={() => handleSelect(l.code)}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--brand-primary)]/8',
                    isTranslating && !active ? 'cursor-wait opacity-60' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10">
                    <Flag className="absolute inset-0 h-full w-full" />
                  </span>
                  <span className="flex-1 font-medium">{l.label}</span>
                  <AnimatePresence>
                    {active && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        className="inline-flex"
                        aria-hidden
                      >
                        <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </AnimatePresence>
  );

  return (
    <div data-no-translate className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        onClick={() => {
          setClosingViaSelect(false);
          setOpen((o) => !o);
        }}
        className={[
          'relative inline-flex items-center gap-2 rounded-full border bg-[var(--surface)]/70 px-2.5 backdrop-blur-sm transition-colors',
          triggerHeight,
          open
            ? 'border-[var(--brand-primary)]/50 bg-[var(--surface)]'
            : 'border-[var(--border)] hover:border-[var(--brand-primary)]/30 hover:bg-[var(--surface)]',
        ].join(' ')}
      >
        <span
          className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10 ${triggerFlag}`}
        >
          <current.Flag className="absolute inset-0 h-full w-full" />
        </span>
        <span className="text-xs font-semibold tracking-wide text-[var(--text-primary)]">
          {current.short}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="ml-0.5 inline-flex"
          aria-hidden
        >
          <ChevronDown className="h-3 w-3 text-[var(--muted)]" />
        </motion.span>
        {isTranslating && (
          <span aria-hidden className="ml-0.5 inline-flex h-2.5 w-2.5">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[var(--brand-primary)]/40 border-t-[var(--brand-primary)]" />
          </span>
        )}
      </button>

      {mounted && createPortal(menu, document.body)}
    </div>
  );
}
