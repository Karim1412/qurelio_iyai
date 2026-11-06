'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

/* ─── iOS-like motion variants ───────────────────────────────────────────── */
const panelContainer: Variants = {
  hidden: { opacity: 0, scale: 0.985 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.055,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    y: -6,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 1] },
  },
};

const illuVariants: Variants = {
  idle: {
    scale: 0.9,
    y: 6,
    opacity: 0.82,
    filter: 'saturate(0.65) blur(1px)',
    transition: { type: 'spring', stiffness: 200, damping: 28, mass: 0.7 },
  },
  active: {
    scale: 1,
    y: -4,
    opacity: 1,
    filter: 'saturate(1) blur(0px)',
    transition: { type: 'spring', stiffness: 240, damping: 26, mass: 0.65 },
  },
};

const panelItem: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 240, damping: 26, mass: 0.7 },
  },
  exit: {
    opacity: 0,
    y: -10,
    filter: 'blur(6px)',
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// ILLUSTRATIONS: miniature product UI scenes.
// Linear / Stripe / Notion vibe: layered soft cards, gauges, chips, signatures.
// `currentColor` adapts to .feature-card state (muted → card-accent on active).
// ──────────────────────────────────────────────────────────────────────────────

const SoftDefs = ({ id }: { id: string }) => (
  <defs>
    <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stopColor="currentColor" stopOpacity="0.20" />
      <stop offset="55%"  stopColor="currentColor" stopOpacity="0.06" />
      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
    </radialGradient>
    <linearGradient id={`${id}-card`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.95" />
      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.78" />
    </linearGradient>
    <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="currentColor" stopOpacity="0.30" />
      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
    </linearGradient>
  </defs>
);

/* ─────────── 1. Compliance: KPI scorecard with gauge + compliance chips ─────────── */
const ComplianceCharacter = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <SoftDefs id="cmp" />
    <circle cx="100" cy="100" r="92" fill="url(#cmp-halo)" stroke="none" />

    {/* Main card */}
    <g className="illu-card">
      <rect x="24" y="38" width="152" height="124" rx="14" fill="url(#cmp-card)" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />

      {/* Header strip */}
      <rect x="24" y="38" width="152" height="22" rx="14" fill="currentColor" fillOpacity="0.06" stroke="none" />
      <rect x="36" y="46" width="46" height="6" rx="3" fill="currentColor" fillOpacity="0.55" stroke="none" />

      {/* AI badge */}
      <g className="illu-fade-1">
        <rect x="130" y="44" width="36" height="10" rx="5" fill="currentColor" fillOpacity="0.18" stroke="none" />
        <path d="M137 49 L138.5 47 L140 49 L142 49.5 L140 50 L138.5 52 L137 50 L135 49.5 Z" fill="currentColor" stroke="none" />
        <rect x="144" y="47" width="18" height="4" rx="2" fill="currentColor" fillOpacity="0.6" stroke="none" />
      </g>

      {/* Circular gauge */}
      <g transform="translate(60 116)">
        <circle r="22" stroke="currentColor" strokeOpacity="0.18" strokeWidth="4" />
        <circle
          className="illu-arc"
          r="22"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset="100"
          transform="rotate(-90)"
        />
        <text x="0" y="2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">94%</text>
        <text x="0" y="14" textAnchor="middle" fontSize="6" fontWeight="600" fill="currentColor" fillOpacity="0.5" stroke="none" letterSpacing="0.5">SCORE</text>
      </g>

      {/* Compliance chips */}
      <g className="illu-fade-2" transform="translate(100 80)">
        <rect width="62" height="14" rx="7" fill="currentColor" fillOpacity="0.10" stroke="none" />
        <circle cx="10" cy="7" r="3.4" fill="currentColor" stroke="none" />
        <path d="M8.2 7 L9.6 8.4 L12 6" stroke="#FAFAF9" strokeWidth="1.4" />
        <rect x="20" y="4" width="34" height="6" rx="3" fill="currentColor" fillOpacity="0.55" stroke="none" />
      </g>
      <g className="illu-fade-3" transform="translate(100 100)">
        <rect width="62" height="14" rx="7" fill="currentColor" fillOpacity="0.10" stroke="none" />
        <circle cx="10" cy="7" r="3.4" fill="currentColor" stroke="none" />
        <path d="M8.2 7 L9.6 8.4 L12 6" stroke="#FAFAF9" strokeWidth="1.4" />
        <rect x="20" y="4" width="30" height="6" rx="3" fill="currentColor" fillOpacity="0.55" stroke="none" />
      </g>
      <g className="illu-fade-4" transform="translate(100 120)">
        <rect width="62" height="14" rx="7" fill="currentColor" fillOpacity="0.10" stroke="none" />
        <circle cx="10" cy="7" r="3.4" fill="currentColor" stroke="none" />
        <path d="M8.2 7 L9.6 8.4 L12 6" stroke="#FAFAF9" strokeWidth="1.4" />
        <rect x="20" y="4" width="26" height="6" rx="3" fill="currentColor" fillOpacity="0.55" stroke="none" />
      </g>

      {/* Footer progress */}
      <rect x="36" y="146" width="128" height="5" rx="2.5" fill="currentColor" fillOpacity="0.12" stroke="none" />
      <rect className="illu-bar" x="36" y="146" width="128" height="5" rx="2.5" fill="currentColor" stroke="none" />
    </g>
  </svg>
);

/* ─────────── 2. Audit: calendar + workflow with assigned auditors ─────────── */
const AuditCharacter = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <SoftDefs id="aud" />
    <ellipse cx="100" cy="108" rx="90" ry="76" fill="url(#aud-halo)" stroke="none" />

    {/* Calendar card */}
    <g className="illu-card">
      <rect x="18" y="50" width="76" height="92" rx="10" fill="url(#aud-card)" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
      {/* header */}
      <rect x="18" y="50" width="76" height="18" rx="10" fill="currentColor" fillOpacity="0.10" stroke="none" />
      <rect x="28" y="57" width="28" height="4" rx="2" fill="currentColor" fillOpacity="0.6" stroke="none" />
      <circle cx="80" cy="59" r="2" fill="currentColor" stroke="none" />
      {/* day grid */}
      {Array.from({ length: 16 }).map((_, i) => {
        const c = i % 4;
        const r = Math.floor(i / 4);
        const x = 28 + c * 14;
        const y = 78 + r * 14;
        const highlighted = i === 9;
        return (
          <g key={i}>
            {highlighted ? (
              <>
                <rect x={x - 5} y={y - 5} width="10" height="10" rx="5" fill="currentColor" stroke="none" />
                <circle className="illu-pulse-core" cx={x} cy={y} r="3" fill="#FAFAF9" stroke="none" />
              </>
            ) : (
              <circle cx={x} cy={y} r="2" fill="currentColor" fillOpacity={i % 3 === 0 ? 0.4 : 0.2} stroke="none" />
            )}
          </g>
        );
      })}
    </g>

    {/* Connector arrow */}
    <g className="illu-fade-1">
      <path d="M96 96 L116 96" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="2 3" />
      <path d="M114 93 L118 96 L114 99" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.4" />
    </g>

    {/* Audit card */}
    <g className="illu-card illu-fade-2" transform="translate(118 60)">
      <rect width="68" height="86" rx="10" fill="url(#aud-card)" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
      {/* status pill */}
      <rect x="8" y="10" width="32" height="11" rx="5.5" fill="currentColor" fillOpacity="0.15" stroke="none" />
      <circle cx="14" cy="15.5" r="2.2" fill="currentColor" stroke="none" />
      <rect x="20" y="13" width="16" height="5" rx="2.5" fill="currentColor" fillOpacity="0.65" stroke="none" />
      <circle cx="58" cy="15" r="3.4" fill="currentColor" fillOpacity="0.18" stroke="none" />
      <circle cx="58" cy="15" r="1.6" fill="currentColor" stroke="none" />

      {/* findings list */}
      <rect className="illu-line line-1" x="8"  y="32" width="44" height="5" rx="2.5" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <rect className="illu-line line-2" x="8"  y="44" width="38" height="5" rx="2.5" fill="currentColor" fillOpacity="0.45" stroke="none" />
      <rect className="illu-line line-3" x="8"  y="56" width="48" height="5" rx="2.5" fill="currentColor" fillOpacity="0.4" stroke="none" />

      {/* auditor avatars */}
      <g transform="translate(8 72)">
        <circle cx="6"  cy="6" r="6" fill="currentColor" fillOpacity="0.85" stroke="#FAFAF9" strokeWidth="1.2" />
        <circle cx="14" cy="6" r="6" fill="currentColor" fillOpacity="0.55" stroke="#FAFAF9" strokeWidth="1.2" />
        <circle cx="22" cy="6" r="6" fill="currentColor" fillOpacity="0.3"  stroke="#FAFAF9" strokeWidth="1.2" />
      </g>
    </g>
  </svg>
);

/* ─── 3. CAPA: fishbone-inspired root cause with 5 Whys + verified badge ─── */
const NonConformityCharacter = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <SoftDefs id="nc" />
    <ellipse cx="100" cy="100" rx="92" ry="74" fill="url(#nc-halo)" stroke="none" />

    {/* Spine */}
    <path d="M28 100 L152 100" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.6" />

    {/* Issue pill (left) */}
    <g className="illu-card">
      <rect x="14" y="90" width="28" height="20" rx="10" fill="url(#nc-card)" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
      <circle cx="22" cy="100" r="2.5" fill="currentColor" stroke="none" />
      <rect x="28" y="97" width="10" height="3.5" rx="1.5" fill="currentColor" fillOpacity="0.6" stroke="none" />
      <rect x="28" y="103" width="6"  height="2.5" rx="1.2" fill="currentColor" fillOpacity="0.4" stroke="none" />
    </g>

    {/* Why branches */}
    {[
      { i: 1, x1: 56,  y1: 100, x2: 70,  y2: 70,  bx: 60,  by: 56, w: 36 },
      { i: 2, x1: 80,  y1: 100, x2: 94,  y2: 70,  bx: 84,  by: 56, w: 36 },
      { i: 3, x1: 70,  y1: 100, x2: 60,  y2: 130, bx: 36,  by: 132, w: 36 },
      { i: 4, x1: 94,  y1: 100, x2: 88,  y2: 130, bx: 70,  by: 132, w: 36 },
    ].map((b) => (
      <g key={b.i} className={`illu-branch branch-${b.i}`}>
        <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.3" />
        <rect x={b.bx} y={b.by} width={b.w} height="14" rx="7" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
        <circle cx={b.bx + 7} cy={b.by + 7} r="2" fill="currentColor" stroke="none" />
        <rect x={b.bx + 12} y={b.by + 5} width={b.w - 18} height="4" rx="2" fill="currentColor" fillOpacity="0.55" stroke="none" />
      </g>
    ))}

    {/* Verified badge (right) */}
    <g className="illu-stamp" transform="translate(158 100)">
      <circle r="16" fill="currentColor" fillOpacity="0.14" stroke="none" />
      <circle r="11" fill="currentColor" stroke="none" />
      <path d="M-4 0 L-1 3 L5 -3" stroke="#FAFAF9" strokeWidth="2" />
    </g>

    {/* Spine pulse dot */}
    <circle className="illu-pulse-core" cx="100" cy="100" r="3" fill="currentColor" stroke="none" />
  </svg>
);

/* ─────── 4. Documents: versioned doc stack with signature + approval ─────── */
const DocumentsCharacter = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <SoftDefs id="doc" />
    <ellipse cx="100" cy="110" rx="86" ry="68" fill="url(#doc-halo)" stroke="none" />

    {/* Back versions */}
    <g className="illu-paper paper-3">
      <rect x="34" y="58" width="98" height="120" rx="10" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" transform="rotate(-7 83 118)" />
      <rect x="46" y="68" width="20" height="6" rx="3" fill="currentColor" fillOpacity="0.3" stroke="none" transform="rotate(-7 56 71)" />
    </g>
    <g className="illu-paper paper-2">
      <rect x="48" y="38" width="98" height="120" rx="10" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" transform="rotate(4 97 98)" />
      <rect x="60" y="50" width="22" height="6" rx="3" fill="currentColor" fillOpacity="0.35" stroke="none" transform="rotate(4 71 53)" />
    </g>

    {/* Front doc */}
    <g className="illu-paper paper-1 illu-card">
      <rect x="54" y="22" width="98" height="124" rx="10" fill="url(#doc-card)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />

      {/* Title + version tag */}
      <rect x="66" y="36" width="42" height="6" rx="3" fill="currentColor" fillOpacity="0.65" stroke="none" />
      <rect x="66" y="48" width="28" height="4" rx="2" fill="currentColor" fillOpacity="0.35" stroke="none" />
      <rect x="116" y="36" width="28" height="11" rx="5.5" fill="currentColor" fillOpacity="0.18" stroke="none" />
      <text x="130" y="45" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">v3.0</text>

      {/* Divider */}
      <line x1="66" y1="62" x2="140" y2="62" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />

      {/* Content lines */}
      <rect x="66" y="70" width="74" height="4" rx="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <rect x="66" y="80" width="64" height="4" rx="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <rect x="66" y="90" width="70" height="4" rx="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <rect x="66" y="100" width="48" height="4" rx="2" fill="currentColor" fillOpacity="0.4" stroke="none" />

      {/* Signature line + scribble */}
      <line x1="66" y1="124" x2="140" y2="124" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.8" strokeDasharray="2 2" />
      <path
        className="illu-soft-draw"
        d="M70 118 C76 110, 82 124, 88 116 C94 110, 100 122, 108 114 C116 108, 124 120, 130 116"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset="100"
      />
    </g>

    {/* Approved stamp (corner) */}
    <g className="illu-stamp" transform="translate(146 32)">
      <circle r="14" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="2 1.5" />
      <path d="M-4 0 L-1 3 L5 -4" stroke="currentColor" strokeWidth="2.2" fill="none" />
    </g>
  </svg>
);

/* ───────────── 5. AI Assistant: chat conversation with citations ───────────── */
const AIAssistantCharacter = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <SoftDefs id="ai" />
    <circle cx="100" cy="100" r="92" fill="url(#ai-halo)" stroke="none" />

    {/* User question bubble (right-aligned, smaller) */}
    <g className="illu-card illu-fade-1">
      <rect x="74" y="34" width="100" height="32" rx="12" fill="url(#ai-card)" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
      <rect x="86" y="44" width="68" height="5" rx="2.5" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <rect x="86" y="53" width="48" height="5" rx="2.5" fill="currentColor" fillOpacity="0.4" stroke="none" />
      {/* user avatar */}
      <circle cx="166" cy="50" r="9" fill="currentColor" fillOpacity="0.85" stroke="#FAFAF9" strokeWidth="1.4" />
    </g>

    {/* AI response card (left-aligned, bigger) */}
    <g className="illu-card illu-fade-2">
      <rect x="22" y="78" width="124" height="80" rx="14" fill="url(#ai-card)" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />

      {/* AI sparkle avatar */}
      <g transform="translate(36 96)">
        <circle r="10" fill="currentColor" stroke="none" />
        <g className="illu-sparkle">
          <path d="M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5 Z" fill="#FAFAF9" stroke="none" />
        </g>
      </g>

      {/* Response lines */}
      <rect className="illu-line line-1" x="54" y="90" width="78" height="5" rx="2.5" fill="currentColor" fillOpacity="0.55" stroke="none" />
      <rect className="illu-line line-2" x="54" y="100" width="64" height="5" rx="2.5" fill="currentColor" fillOpacity="0.45" stroke="none" />
      <rect className="illu-line line-3" x="54" y="110" width="70" height="5" rx="2.5" fill="currentColor" fillOpacity="0.45" stroke="none" />

      {/* Typing dots */}
      <circle className="illu-typing t-1" cx="56" cy="130" r="2.6" fill="currentColor" fillOpacity="0.5" stroke="none" />
      <circle className="illu-typing t-2" cx="66" cy="130" r="2.6" fill="currentColor" fillOpacity="0.5" stroke="none" />
      <circle className="illu-typing t-3" cx="76" cy="130" r="2.6" fill="currentColor" fillOpacity="0.5" stroke="none" />

      {/* Citation chips */}
      <g className="illu-fade-3" transform="translate(54 142)">
        <rect width="34" height="10" rx="5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.8" />
        <rect x="4" y="3" width="26" height="4" rx="2" fill="currentColor" fillOpacity="0.6" stroke="none" />
      </g>
      <g className="illu-fade-4" transform="translate(92 142)">
        <rect width="40" height="10" rx="5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.8" />
        <rect x="4" y="3" width="32" height="4" rx="2" fill="currentColor" fillOpacity="0.6" stroke="none" />
      </g>
    </g>
  </svg>
);

/* ──────── 6. Dashboards: KPI card with sparkline + mini-tiles row ──────── */
const DashboardCharacter = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <SoftDefs id="dsh" />
    <ellipse cx="100" cy="108" rx="92" ry="74" fill="url(#dsh-halo)" stroke="none" />

    {/* Main KPI card */}
    <g className="illu-card">
      <rect x="24" y="34" width="152" height="92" rx="12" fill="url(#dsh-card)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />

      {/* Header: label + trend pill */}
      <rect x="36" y="46" width="54" height="6" rx="3" fill="currentColor" fillOpacity="0.45" stroke="none" />
      <rect x="36" y="56" width="36" height="4" rx="2" fill="currentColor" fillOpacity="0.3" stroke="none" />
      <g transform="translate(124 46)">
        <rect width="40" height="14" rx="7" fill="currentColor" fillOpacity="0.16" stroke="none" />
        <path d="M8 9 L12 5 L16 9" stroke="currentColor" strokeWidth="1.4" />
        <rect x="20" y="5" width="14" height="4" rx="2" fill="currentColor" fillOpacity="0.65" stroke="none" />
      </g>

      {/* Big KPI number */}
      <text x="36" y="92" fontSize="26" fontWeight="700" fill="currentColor" stroke="none" letterSpacing="-0.5">98%</text>
      <rect x="84" y="84" width="34" height="4" rx="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <rect x="84" y="92" width="24" height="3" rx="1.5" fill="currentColor" fillOpacity="0.25" stroke="none" />

      {/* Sparkline area */}
      <path
        className="illu-area"
        d="M124 110 Q132 96 140 100 T156 90 T172 78 L172 122 L124 122 Z"
        fill="url(#dsh-area)"
        stroke="none"
      />
      <path
        className="illu-curve"
        d="M124 110 Q132 96 140 100 T156 90 T172 78"
        stroke="currentColor"
        strokeWidth="1.8"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset="100"
      />
      <circle className="illu-dot d-1" cx="172" cy="78" r="2.4" fill="currentColor" stroke="#FAFAF9" strokeWidth="0.8" />
    </g>

    {/* Mini tiles row */}
    {[
      { x: 24,  w: 46, label: 78 },
      { x: 78,  w: 46, label: 60 },
      { x: 132, w: 44, label: 44 },
    ].map((t, i) => (
      <g key={i} className={`illu-card illu-fade-${i + 1}`}>
        <rect x={t.x} y="138" width={t.w} height="32" rx="8" fill="url(#dsh-card)" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
        <rect x={t.x + 8} y="146" width={t.w - 18} height="3" rx="1.5" fill="currentColor" fillOpacity="0.3" stroke="none" />
        <rect x={t.x + 8} y="155" width={t.label * 0.5} height="4" rx="2" fill="currentColor" fillOpacity="0.7" stroke="none" />
        <rect x={t.x + 8} y="163" width="14" height="3" rx="1.5" fill="currentColor" fillOpacity="0.5" stroke="none" />
      </g>
    ))}
  </svg>
);

// ──────────────────────────────────────────────────────────────────────────────
// FEATURE DATA
// ──────────────────────────────────────────────────────────────────────────────

type Feature = {
  id: string;
  tag: string;
  label: string;
  Illustration: React.FC;
  accent: string;
  headline: string;
  cta: string;
  blocks: { title: string; description: string }[];
};

const features: Feature[] = [
  {
    id: 'compliance',
    tag: 'AI-powered',
    label: 'AI Compliance Engine',
    Illustration: ComplianceCharacter,
    accent: '#2563EB',
    headline: 'Stay audit-ready, every day of the year',
    cta: 'Explore the Compliance Engine',
    blocks: [
      {
        title: 'Cut compliance prep by 70%',
        description:
          'Continuous AI assessment of your products against the public laws, decrees and regulations of your target markets, turning a 3-month exercise into a same-day, repeatable check.',
      },
      {
        title: 'Actionable, not abstract',
        description:
          'Every gap comes with a plain-language explanation, a recommended fix, an owner, and a deadline. No more 80-page audit reports nobody opens.',
      },
      {
        title: 'You stay in control',
        description:
          'Every AI-generated result (reports, action plans, detected gaps) lands in a review queue first. Nothing becomes an official record or an executable action until your Quality Manager approves it.',
      },
    ],
  },
  {
    id: 'monitoring',
    tag: 'AI-powered',
    label: 'Regulatory Monitoring',
    Illustration: AIAssistantCharacter,
    accent: '#0891B2',
    headline: 'Never be surprised by a regulation again',
    cta: 'Explore Regulatory Monitoring',
    blocks: [
      {
        title: 'Watches the laws that apply to you',
        description:
          'Qurelio tracks the public regulations relevant to your products and markets. When a law changes, you are the first to know exactly what it means for you.',
      },
      {
        title: 'Finds what you did not know to look for',
        description:
          'When a relevant regulation you never mentioned appears, Qurelio surfaces it and tells you precisely which products are affected, pending your review.',
      },
    ],
  },
  {
    id: 'audit',
    tag: 'Automated',
    label: 'Audit Automation',
    Illustration: AuditCharacter,
    accent: '#7C3AED',
    headline: 'Run audits without chasing a single email',
    cta: 'Explore Audit Automation',
    blocks: [
      {
        title: 'AI-drafted checklists and findings',
        description:
          'Define audit programs and assign auditors, then let AI draft checklists while the platform sends reminders, collects responses, and compiles findings automatically.',
      },
      {
        title: 'From audit to action in one click',
        description:
          'Findings flow straight into your action plans, with full traceability from observation to closure.',
      },
    ],
  },
  {
    id: 'capa',
    tag: 'Tracking',
    label: 'Non-Conformities & CAPA',
    Illustration: NonConformityCharacter,
    accent: '#059669',
    headline: 'Solve issues at the root, not at the symptom',
    cta: 'Explore CAPA',
    blocks: [
      {
        title: 'Built-in 5 Whys, Ishikawa & 8D',
        description:
          'Capture non-conformities from any source (audits, QC, customer complaints) and run structured root cause analysis without leaving the platform.',
      },
      {
        title: 'Verified effectiveness',
        description:
          'Drive corrective and preventive actions through implementation, then automatically verify they worked. Close the loop, every time.',
      },
    ],
  },
  {
    id: 'documents',
    tag: 'Documents',
    label: 'Controlled Documents & File Library',
    Illustration: DocumentsCharacter,
    accent: '#D97706',
    headline: 'One source of truth: versioned, signed, distributed',
    cta: 'Explore Documents',
    blocks: [
      {
        title: 'Approval workflows that actually work',
        description:
          'Multi-stage review, e-signatures, and automatic distribution to the right people, with a complete, audit-ready trail. Private by default.',
      },
      {
        title: 'No more rogue versions',
        description:
          'Old versions are archived automatically. Anyone can find the current procedure in seconds, not in a shared drive labyrinth.',
      },
    ],
  },
  {
    id: 'dashboards',
    tag: 'Analytics',
    label: 'Live KPI Dashboards',
    Illustration: DashboardCharacter,
    accent: '#DC2626',
    headline: 'See your quality posture at a glance',
    cta: 'Explore Dashboards',
    blocks: [
      {
        title: 'Real-time, role-based views',
        description:
          'Compliance scores, open actions, audit status and quality KPIs for every site, team and regulation, live, not end-of-month.',
      },
      {
        title: 'Drill from KPI to evidence',
        description:
          'Click any number to trace it back to the source: audit, finding, document, or signature. Total transparency.',
      },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────────────────

export function WhyQurelio() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const active = features[activeIndex];

  const handleClick = (i: number) => {
    setActiveIndex(i);
  };

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        @property --spot-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        .qurelio-section {
          background:
            radial-gradient(ellipse 60% 40% at 50% 0%, color-mix(in srgb, var(--brand-primary) 9%, transparent), transparent 70%),
            linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 3%, var(--page-bg)) 0%, var(--page-bg) 100%);
          padding: 80px 40px 96px;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }

        .qurelio-inner { max-width: 1200px; margin: 0 auto; }

        .qurelio-eyebrow {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--brand-accent);
          font-weight: 600;
          margin: 0 0 14px;
        }

        .qurelio-heading {
          font-size: clamp(36px, 5vw, 60px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: var(--text-primary);
          text-align: center;
          line-height: 1.08;
          margin: 0 auto 18px;
          max-width: 760px;
        }
        .qurelio-heading em { font-style: normal; color: var(--brand-primary); }

        .qurelio-sub {
          font-size: clamp(16px, 1.5vw, 18px);
          color: var(--muted);
          line-height: 1.65;
          text-align: center;
          max-width: 560px;
          margin: 0 auto 28px;
          font-weight: 400;
        }

        /* ─── Trust strip (legal-by-design) ─── */
        .qurelio-trust {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          max-width: 720px;
          margin: 0 auto 48px;
          padding: 14px 20px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--brand-primary) 5%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--brand-primary) 12%, var(--border));
          font-size: 13.5px;
          line-height: 1.6;
          color: var(--muted);
          text-align: left;
        }
        .qurelio-trust strong { color: var(--text-primary); font-weight: 600; }
        .qurelio-trust-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          margin-top: 7px;
          border-radius: 50%;
          background: var(--brand-accent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-accent) 18%, transparent);
        }

        /* ─── Spotlight frame ─── */
        .spotlight-wrap {
          position: relative;
          border-radius: 30px;
          --spot-angle: 0deg;
          --spot-offset: 16px;
        }
        .spotlight-wrap::before {
          content: '';
          position: absolute;
          inset: calc(-1 * var(--spot-offset));
          border-radius: calc(30px + var(--spot-offset));
          padding: 1.5px;
          background: conic-gradient(
            from var(--spot-angle),
            transparent 0%,
            color-mix(in srgb, var(--brand-primary) 75%, transparent) 6%,
            color-mix(in srgb, var(--brand-accent) 55%, transparent) 14%,
            color-mix(in srgb, var(--brand-primary) 35%, transparent) 22%,
            transparent 32%,
            transparent 100%
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: spotlight-rotate 18s linear infinite;
          pointer-events: none;
          z-index: 5;
        }
        @keyframes spotlight-rotate { to { --spot-angle: 360deg; } }

        /* ─── Scroll-in entrance ─── */
        .qurelio-section .qurelio-eyebrow,
        .qurelio-section .qurelio-heading,
        .qurelio-section .qurelio-sub,
        .qurelio-section .spotlight-wrap,
        .qurelio-section .feature-card {
          opacity: 0;
          transform: translateY(18px);
          filter: blur(3px);
          transition:
            opacity 1.4s cubic-bezier(0.22, 1, 0.36, 1),
            transform 1.4s cubic-bezier(0.22, 1, 0.36, 1),
            filter 1.2s cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform, filter;
        }
        .qurelio-section.is-in-view .qurelio-eyebrow,
        .qurelio-section.is-in-view .qurelio-heading,
        .qurelio-section.is-in-view .qurelio-sub,
        .qurelio-section.is-in-view .spotlight-wrap,
        .qurelio-section.is-in-view .feature-card {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
        }
        .qurelio-section.is-in-view .qurelio-eyebrow   { transition-delay: 0.10s; }
        .qurelio-section.is-in-view .qurelio-heading   { transition-delay: 0.28s; }
        .qurelio-section.is-in-view .qurelio-sub       { transition-delay: 0.46s; }
        .qurelio-section.is-in-view .spotlight-wrap    { transition-delay: 0.62s; }
        .qurelio-section.is-in-view .feature-card:nth-child(1) { transition-delay: 0.78s; }
        .qurelio-section.is-in-view .feature-card:nth-child(2) { transition-delay: 0.86s; }
        .qurelio-section.is-in-view .feature-card:nth-child(3) { transition-delay: 0.94s; }
        .qurelio-section.is-in-view .feature-card:nth-child(4) { transition-delay: 1.02s; }
        .qurelio-section.is-in-view .feature-card:nth-child(5) { transition-delay: 1.10s; }
        .qurelio-section.is-in-view .feature-card:nth-child(6) { transition-delay: 1.18s; }

        /* ─── Cards row ─── */
        .cards-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
          padding: 8px;
          background: color-mix(in srgb, var(--surface) 70%, transparent);
          backdrop-filter: blur(12px);
          border: 1px solid color-mix(in srgb, var(--brand-primary) 8%, var(--border));
          border-radius: 28px;
          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.04),
            0 14px 48px -18px color-mix(in srgb, var(--brand-primary) 22%, transparent);
        }
        @media (max-width: 1100px) { .cards-row { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 680px) {
          .cards-row { grid-template-columns: repeat(2, 1fr); }
          .qurelio-section { padding: 72px 20px 96px; }
        }

        /* iOS-natural cubic: smooth deceleration without bounce overshoot */
        .feature-card {
          position: relative;
          aspect-ratio: 4 / 5;
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          border: 1px solid transparent;
          border-radius: 20px;
          padding: 16px 12px 12px;
          cursor: pointer;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          transition:
            background 0.9s cubic-bezier(0.32, 0.72, 0, 1),
            border-color 0.9s cubic-bezier(0.32, 0.72, 0, 1),
            transform 0.9s cubic-bezier(0.32, 0.72, 0, 1),
            box-shadow 0.9s cubic-bezier(0.32, 0.72, 0, 1),
            opacity 1.4s cubic-bezier(0.22, 1, 0.36, 1),
            filter 1.2s cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, box-shadow;
        }
        .feature-card:not(.active):hover {
          background: var(--surface);
          border-color: color-mix(in srgb, var(--brand-primary) 12%, var(--border));
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 12px 30px -16px color-mix(in srgb, var(--brand-primary) 25%, transparent);
        }
        .feature-card:not(.active):hover .card-title { color: var(--text-primary); }
        .feature-card.active {
          background: var(--surface);
          border-color: var(--card-accent);
          box-shadow:
            0 0 0 1px var(--card-accent),
            0 22px 48px -20px color-mix(in srgb, var(--card-accent) 50%, transparent);
          transform: translateY(-8px) scale(1.025);
        }
        .feature-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%) scaleX(0);
          transform-origin: center;
          width: 42%;
          height: 3px;
          border-radius: 0 0 4px 4px;
          background: var(--card-accent);
          transition: transform 0.9s cubic-bezier(0.32, 0.72, 0, 1);
          z-index: 4;
        }
        .feature-card.active::before { transform: translateX(-50%) scaleX(1); }
        .feature-card:focus-visible { outline: 2px solid var(--card-accent); outline-offset: 3px; }

        .card-title {
          position: relative;
          z-index: 3;
          flex-shrink: 0;
          font-size: 14px;
          font-weight: 600;
          color: color-mix(in srgb, var(--muted) 70%, transparent);
          letter-spacing: -0.01em;
          line-height: 1.3;
          transition: color 0.9s cubic-bezier(0.32, 0.72, 0, 1);
          margin: 0;
          text-align: center;
        }
        .feature-card.active .card-title { color: var(--text-primary); }

        .card-illu {
          position: relative;
          flex: 1;
          min-height: 0;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }
        .card-illu > svg {
          width: 90%;
          height: 100%;
          max-height: 100%;
          color: color-mix(in srgb, var(--text-primary) 22%, transparent);
          transition: color 1s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .feature-card.active .card-illu > svg { color: var(--card-accent); }
        .feature-card:not(.active):hover .card-illu > svg {
          color: color-mix(in srgb, var(--text-primary) 60%, transparent);
        }

        /* ─── Content panel wrap (stable border + spacing) ─── */
        .content-panel-wrap {
          margin-top: 36px;
          padding-top: 36px;
          border-top: 1px solid color-mix(in srgb, var(--brand-primary) 8%, var(--border));
        }
        .content-panel {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
        }
        @media (max-width: 900px) { .content-panel { grid-template-columns: 1fr; gap: 32px; } }
        .content-left { display: flex; flex-direction: column; }
        .content-eyebrow {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--card-accent);
          margin-bottom: 16px;
        }
        .content-headline {
          font-size: clamp(24px, 3vw, 36px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: var(--text-primary);
          line-height: 1.1;
          margin: 0 0 24px;
          max-width: 440px;
        }
        .content-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 22px;
          border: 1px solid var(--text-primary);
          background: transparent;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.005em;
          border-radius: 100px;
          cursor: pointer;
          transition:
            background 0.5s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.5s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.5s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          align-self: flex-start;
        }
        .content-cta:hover { background: var(--text-primary); color: var(--surface); transform: translateY(-1px); }
        .content-cta svg { transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
        .content-cta:hover svg { transform: translate(2px, -2px); }
        .content-right { display: flex; flex-direction: column; gap: 22px; }
        .info-block { padding-bottom: 22px; border-bottom: 1px solid color-mix(in srgb, var(--brand-primary) 8%, var(--border)); }
        .info-block:last-child { border-bottom: none; padding-bottom: 0; }
        .info-block h3 {
          font-size: 17px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.015em;
          margin: 0 0 8px;
          line-height: 1.3;
        }
        .info-block p { font-size: 14px; color: var(--muted); line-height: 1.6; margin: 0; }

        /* ─── SVG motion: only on active card ─── */
        .card-illu g, .card-illu rect, .card-illu circle, .card-illu path, .card-illu ellipse {
          transform-box: fill-box;
          transform-origin: center;
        }

        /* Card slide-up on activation */
        .feature-card.active .illu-card {
          animation: illu-card-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes illu-card-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Sequential fade for chips / mini-tiles / lines */
        .feature-card.active .illu-fade-1 { animation: illu-fade 0.7s 0.30s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .feature-card.active .illu-fade-2 { animation: illu-fade 0.7s 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .feature-card.active .illu-fade-3 { animation: illu-fade 0.7s 0.60s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .feature-card.active .illu-fade-4 { animation: illu-fade 0.7s 0.75s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes illu-fade {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Soft draw: signature, curve */
        .feature-card.active .illu-soft-draw {
          animation: illu-draw 1.4s 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes illu-draw { to { stroke-dashoffset: 0; } }

        /* Progress bar fill */
        .feature-card.active .illu-bar {
          transform-origin: 0% 50%;
          animation: illu-bar 1.4s 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes illu-bar {
          0%   { transform: scaleX(0); }
          100% { transform: scaleX(0.62); }
        }

        /* Gauge arc: sweeps to 94% */
        .feature-card.active .illu-arc {
          animation: illu-arc 1.6s 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes illu-arc { to { stroke-dashoffset: 6; } }

        /* Pulse core (calendar highlighted day, spine dot) */
        .feature-card.active .illu-pulse-core {
          animation: illu-pulse 2.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        @keyframes illu-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.9; }
          50%      { transform: scale(1.25); opacity: 1; }
        }

        /* CAPA: branches grow from spine outward */
        .feature-card.active .illu-branch {
          animation: illu-grow-line 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: left center;
          opacity: 0;
        }
        .feature-card.active .branch-1 { animation-delay: 0.35s; }
        .feature-card.active .branch-2 { animation-delay: 0.50s; }
        .feature-card.active .branch-3 { animation-delay: 0.65s; }
        .feature-card.active .branch-4 { animation-delay: 0.80s; }
        @keyframes illu-grow-line {
          0%   { opacity: 0; transform: scale(0.6); }
          100% { opacity: 1; transform: scale(1); }
        }

        /* Stamp / badge bounce-in */
        .feature-card.active .illu-stamp {
          animation: illu-stamp 0.9s 0.95s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          opacity: 0;
        }
        @keyframes illu-stamp {
          0%   { opacity: 0; transform: scale(0.4) rotate(-12deg); }
          70%  { opacity: 1; transform: scale(1.08) rotate(4deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }

        /* Documents: papers float in stack */
        .feature-card.active .illu-paper {
          animation: illu-float 5.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .feature-card.active .paper-1 { animation-delay: 0s; }
        .feature-card.active .paper-2 { animation-delay: 1.2s; }
        .feature-card.active .paper-3 { animation-delay: 2.4s; }
        @keyframes illu-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }

        /* AI sparkle pulse-rotate */
        .feature-card.active .illu-sparkle {
          animation: illu-sparkle 4.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        @keyframes illu-sparkle {
          0%, 100% { transform: scale(1)    rotate(0deg);  opacity: 0.9; }
          50%      { transform: scale(1.18) rotate(20deg); opacity: 1; }
        }

        /* AI typing dots */
        .feature-card.active .illu-typing {
          animation: illu-typing 1.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .feature-card.active .t-1 { animation-delay: 0s; }
        .feature-card.active .t-2 { animation-delay: 0.18s; }
        .feature-card.active .t-3 { animation-delay: 0.36s; }
        @keyframes illu-typing {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30%           { transform: translateY(-3px); opacity: 1; }
        }

        /* Line shimmer (sequential highlight) */
        .feature-card.active .illu-line {
          animation: illu-line 4.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .feature-card.active .line-1 { animation-delay: 0s; }
        .feature-card.active .line-2 { animation-delay: 0.4s; }
        .feature-card.active .line-3 { animation-delay: 0.8s; }
        @keyframes illu-line {
          0%, 75%, 100% { opacity: 0.4; }
          35%           { opacity: 1; }
        }

        /* Dashboard area fade-in */
        .feature-card.active .illu-area {
          animation: illu-area 1.2s 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          opacity: 0;
        }
        @keyframes illu-area { to { opacity: 1; } }
        .feature-card.active .illu-curve {
          animation: illu-draw 1.6s 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .feature-card.active .illu-dot {
          animation: illu-dot-pop 0.6s 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          opacity: 0;
        }
        @keyframes illu-dot-pop {
          0%   { opacity: 0; transform: scale(0); }
          100% { opacity: 1; transform: scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <section
        id="why-qurelio"
        className={`qurelio-section${inView ? ' is-in-view' : ''}`}
        ref={sectionRef}
        aria-label="Why Qurelio"
      >
        <div className="qurelio-inner">
          <p className="qurelio-eyebrow">Why Qurelio</p>
          <h2 className="qurelio-heading">
            What makes Qurelio the <em>intelligent</em> compliance platform
          </h2>
          <p className="qurelio-sub">
            Built from the ground up for quality teams who need more than spreadsheets. Qurelio combines
            AI, automation, and deep regulatory intelligence into one unified platform. And because compliance
            is too important to leave to a machine, every AI result waits for your approval before it becomes real.
          </p>

          <p className="qurelio-trust">
            <span className="qurelio-trust-dot" aria-hidden />
            <span>
              <strong>100% legal by design.</strong> Qurelio works exclusively with public, legally free
              regulatory texts: laws, decrees and official regulations. Licensed standards such as ISO/IEC
              are automatically detected and are never stored or analyzed.
            </span>
          </p>

          <div className="spotlight-wrap">
            <div className="cards-row" role="tablist">
              {features.map((f, i) => {
                const isActive = i === activeIndex;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${f.id}`}
                    className={`feature-card${isActive ? ' active' : ''}`}
                    style={{ '--card-accent': f.accent } as React.CSSProperties}
                    onClick={() => handleClick(i)}
                    onFocus={() => handleClick(i)}
                  >
                    <h3 className="card-title">{f.label}</h3>
                    <motion.div
                      className="card-illu"
                      animate={isActive ? 'active' : 'idle'}
                      variants={illuVariants}
                      initial={false}
                      style={{ willChange: 'transform, filter, opacity' }}
                    >
                      <f.Illustration />
                    </motion.div>
                  </button>
                );
              })}
            </div>

            <div
              className="content-panel-wrap"
              style={{ ['--card-accent' as string]: active.accent }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active.id}
                  id={`panel-${active.id}`}
                  role="tabpanel"
                  className="content-panel"
                  variants={panelContainer}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  style={{ willChange: 'transform, opacity, filter' }}
                >
                  <motion.div variants={panelItem} className="content-left">
                    <motion.span variants={panelItem} className="content-eyebrow">
                      {active.tag}
                    </motion.span>
                    <motion.h3 variants={panelItem} className="content-headline">
                      {active.headline}
                    </motion.h3>
                    <motion.button variants={panelItem} className="content-cta" type="button">
                      {active.cta}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="7" y1="17" x2="17" y2="7" />
                        <polyline points="7 7 17 7 17 17" />
                      </svg>
                    </motion.button>
                  </motion.div>

                  <motion.div variants={panelItem} className="content-right">
                    {active.blocks.map((b, idx) => (
                      <motion.div variants={panelItem} className="info-block" key={idx}>
                        <h3>{b.title}</h3>
                        <p>{b.description}</p>
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
