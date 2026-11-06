'use client';

import React from 'react';

/**
 * Compact wireframe "preview images" for the dashboard TV banner.
 *
 * Each mockup is a tiny SVG illustration that *visually evokes* what the
 * corresponding tab contains: like a screenshot in miniature, without
 * needing real screenshots.
 *
 * They use `currentColor` so the parent can tint them to match the tab's
 * accent color. The frame uses a soft outer translucent fill to simulate
 * a phone/laptop screen.
 */

type MockupProps = {
  /** Width × height ratio is roughly 16:10. Default 320×200. */
  className?: string;
};

/* Common SVG wrapper: 320×200 viewBox with a soft window frame */
const MockFrame = ({ children, className }: MockupProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 320 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className={className}
    preserveAspectRatio="xMidYMid meet"
  >
    {/* Window frame */}
    <rect x="4" y="4" width="312" height="192" rx="14" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.2" />
    {/* Browser dots */}
    <circle cx="14" cy="14" r="1.8" fill="currentColor" fillOpacity="0.30" />
    <circle cx="22" cy="14" r="1.8" fill="currentColor" fillOpacity="0.30" />
    <circle cx="30" cy="14" r="1.8" fill="currentColor" fillOpacity="0.30" />
    {/* Address bar */}
    <rect x="42" y="10" width="170" height="8" rx="3" fill="currentColor" fillOpacity="0.08" />
    <line x1="14" y1="26" x2="306" y2="26" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.8" />
    {children}
  </svg>
);

/* ───── Dashboard preview ─────
   4 KPI cards + a line/area chart underneath. */
export const DashboardPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* 4 KPI tiles */}
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x={16 + i * 74} y="36" width="68" height="42" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
        <rect x={22 + i * 74} y="42" width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.55" />
        <rect x={22 + i * 74} y="60" width="32" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x={22 + i * 74} y="67" width="22" height="2" rx="1" fill="currentColor" fillOpacity="0.35" />
      </g>
    ))}
    {/* Area chart card */}
    <rect x="16" y="88" width="200" height="96" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <line x1="22" y1="108" x2="208" y2="108" stroke="currentColor" strokeOpacity="0.10" strokeWidth="0.6" />
    <line x1="22" y1="138" x2="208" y2="138" stroke="currentColor" strokeOpacity="0.10" strokeWidth="0.6" />
    <line x1="22" y1="168" x2="208" y2="168" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6" />
    {/* Filled area */}
    <path d="M22 160 L60 140 L100 150 L140 120 L180 130 L210 105 L210 168 L22 168 Z" fill="currentColor" fillOpacity="0.18" />
    <path d="M22 160 L60 140 L100 150 L140 120 L180 130 L210 105" stroke="currentColor" strokeOpacity="0.85" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="210" cy="105" r="2.4" fill="currentColor" />
    {/* Donut card */}
    <rect x="224" y="88" width="80" height="96" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <circle cx="264" cy="138" r="26" stroke="currentColor" strokeOpacity="0.25" strokeWidth="6" fill="none" />
    <path d="M264 112 A26 26 0 0 1 286 152" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
  </MockFrame>
);

/* ───── File library preview ─────
   Folder tabs on top + grid of file cards */
export const FileLibraryPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Tabs */}
    <rect x="16" y="36" width="56" height="14" rx="4" fill="currentColor" fillOpacity="0.55" />
    <rect x="76" y="36" width="56" height="14" rx="4" fill="currentColor" fillOpacity="0.18" />
    <rect x="136" y="36" width="56" height="14" rx="4" fill="currentColor" fillOpacity="0.18" />
    {/* File cards grid 4×2 */}
    {Array.from({ length: 8 }).map((_, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return (
        <g key={i}>
          <rect x={16 + col * 74} y={62 + row * 64} width="68" height="56" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
          <rect x={26 + col * 74} y={70 + row * 64} width="32" height="22" rx="2" fill="currentColor" fillOpacity="0.30" />
          <rect x={26 + col * 74} y={98 + row * 64} width="32" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
          <rect x={26 + col * 74} y={104 + row * 64} width="20" height="2" rx="1" fill="currentColor" fillOpacity="0.35" />
        </g>
      );
    })}
  </MockFrame>
);

/* ───── Company preview ─────
   Big company card + small members list. */
export const CompanyPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Hero company card */}
    <rect x="16" y="36" width="288" height="60" rx="8" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <rect x="24" y="46" width="40" height="40" rx="6" fill="currentColor" fillOpacity="0.30" />
    <rect x="72" y="50" width="100" height="6" rx="2" fill="currentColor" fillOpacity="0.85" />
    <rect x="72" y="60" width="68" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    <rect x="72" y="68" width="80" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    <rect x="240" y="56" width="56" height="20" rx="10" fill="currentColor" fillOpacity="0.55" />
    {/* Member rows */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="16" y={106 + i * 28} width="288" height="22" rx="6" fill="currentColor" fillOpacity="0.06" />
        <circle cx="30" cy={117 + i * 28} r="7" fill="currentColor" fillOpacity="0.55" />
        <rect x="44" y={113 + i * 28} width="120" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="44" y={120 + i * 28} width="80" height="2" rx="1" fill="currentColor" fillOpacity="0.35" />
        <rect x="266" y={113 + i * 28} width="30" height="10" rx="5" fill="currentColor" fillOpacity="0.30" />
      </g>
    ))}
  </MockFrame>
);

/* ───── Kanban preview ─────
   3 columns with cards. */
export const KanbanPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {[0, 1, 2].map((col) => (
      <g key={col}>
        <rect x={16 + col * 100} y="36" width="92" height="150" rx="6" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
        <rect x={22 + col * 100} y="42" width="60" height="4" rx="1" fill="currentColor" fillOpacity="0.55" />
        {/* Cards */}
        {[0, 1, 2].map((c) => (
          <g key={c}>
            <rect x={22 + col * 100} y={56 + c * 36} width="80" height="28" rx="4" fill="currentColor" fillOpacity={col === 0 ? 0.85 : col === 1 ? 0.55 : 0.40} />
            <circle cx={28 + col * 100} cy={68 + c * 36} r="2" fill="currentColor" fillOpacity="0.20" />
            <rect x={36 + col * 100} y={66 + c * 36} width="40" height="2" rx="1" fill="currentColor" fillOpacity="0.20" />
          </g>
        ))}
      </g>
    ))}
  </MockFrame>
);

/* ───── Calendar preview ─────
   Mini month grid with a today highlight. */
export const CalendarPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    <rect x="16" y="36" width="288" height="148" rx="8" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    {/* Header band */}
    <rect x="16" y="36" width="288" height="22" rx="8" fill="currentColor" fillOpacity="0.12" />
    {/* Weekday letters */}
    {Array.from({ length: 7 }).map((_, i) => (
      <rect key={i} x={26 + i * 40} y="46" width="14" height="3" rx="1" fill="currentColor" fillOpacity="0.55" />
    ))}
    {/* Day cells 4 rows × 7 cols */}
    {Array.from({ length: 28 }).map((_, i) => {
      const col = i % 7;
      const row = Math.floor(i / 7);
      const isToday = i === 11;
      return (
        <g key={i}>
          {isToday && <rect x={20 + col * 40} y={64 + row * 28} width="32" height="22" rx="4" fill="currentColor" fillOpacity="0.85" />}
          <circle cx={36 + col * 40} cy={75 + row * 28} r="1.6" fill="currentColor" fillOpacity={isToday ? 0 : 0.40} />
        </g>
      );
    })}
  </MockFrame>
);

/* ───── Training preview ─────
   Hero "course" card + progress bars list. */
export const TrainingPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Hero course card */}
    <rect x="16" y="36" width="288" height="56" rx="8" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <rect x="24" y="46" width="36" height="36" rx="6" fill="currentColor" fillOpacity="0.55" />
    <rect x="68" y="50" width="140" height="5" rx="2" fill="currentColor" fillOpacity="0.85" />
    <rect x="68" y="60" width="100" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    {/* Progress on hero */}
    <rect x="68" y="74" width="180" height="4" rx="2" fill="currentColor" fillOpacity="0.18" />
    <rect x="68" y="74" width="124" height="4" rx="2" fill="currentColor" fillOpacity="0.85" />
    {/* Course list rows with progress */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="16" y={102 + i * 28} width="288" height="22" rx="6" fill="currentColor" fillOpacity="0.06" />
        <rect x="22" y={108 + i * 28} width="120" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="22" y={114 + i * 28} width="180" height="3" rx="1.5" fill="currentColor" fillOpacity="0.12" />
        <rect x="22" y={114 + i * 28} width={[140, 90, 160][i]} height="3" rx="1.5" fill="currentColor" fillOpacity="0.55" />
      </g>
    ))}
  </MockFrame>
);

/* ───── Analytics preview ─────
   Mixed: bar chart left + donut right + small KPI strip on top. */
export const AnalyticsPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* KPI strip */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x={16 + i * 96} y="36" width="88" height="32" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
        <rect x={22 + i * 96} y="44" width="40" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x={22 + i * 96} y="52" width="60" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
      </g>
    ))}
    {/* Bar chart card */}
    <rect x="16" y="78" width="190" height="108" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <line x1="22" y1="170" x2="198" y2="170" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6" />
    {[
      { x: 32, h: 60 },
      { x: 60, h: 80 },
      { x: 88, h: 50 },
      { x: 116, h: 90 },
      { x: 144, h: 70 },
      { x: 172, h: 100 },
    ].map((b, i) => (
      <rect
        key={i}
        x={b.x}
        y={170 - b.h}
        width="14"
        height={b.h}
        rx="2"
        fill="currentColor"
        fillOpacity={i % 2 === 0 ? 0.85 : 0.55}
      />
    ))}
    {/* Donut card */}
    <rect x="214" y="78" width="90" height="108" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <circle cx="259" cy="132" r="28" stroke="currentColor" strokeOpacity="0.20" strokeWidth="7" fill="none" />
    <path d="M259 104 A28 28 0 0 1 287 132" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
    <path d="M287 132 A28 28 0 0 1 268 158" stroke="currentColor" strokeOpacity="0.55" strokeWidth="7" fill="none" strokeLinecap="round" />
  </MockFrame>
);

/* ───── Products preview ─────
   Grid of product cards with image + meta. */
export const ProductsPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {Array.from({ length: 6 }).map((_, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      return (
        <g key={i}>
          <rect x={16 + col * 100} y={36 + row * 76} width="92" height="68" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
          <rect x={22 + col * 100} y={42 + row * 76} width="80" height="36" rx="3" fill="currentColor" fillOpacity="0.30" />
          <rect x={22 + col * 100} y={82 + row * 76} width="50" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
          <rect x={22 + col * 100} y={89 + row * 76} width="34" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
          <rect x={84 + col * 100} y={86 + row * 76} width="14" height="8" rx="4" fill="currentColor" fillOpacity="0.55" />
        </g>
      );
    })}
  </MockFrame>
);

/* ───── Standards preview ─────
   Open book / catalog with rows of regulations. */
export const StandardsPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Search */}
    <rect x="16" y="36" width="288" height="20" rx="10" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <circle cx="28" cy="46" r="3" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.8" fill="none" />
    <rect x="38" y="44" width="60" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    {/* List rows */}
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x="16" y={66 + i * 30} width="288" height="24" rx="6" fill="currentColor" fillOpacity="0.06" />
        <rect x="22" y={74 + i * 30} width="6" height="8" rx="2" fill="currentColor" fillOpacity="0.85" />
        <rect x="34" y={73 + i * 30} width="90" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="34" y={80 + i * 30} width="160" height="2" rx="1" fill="currentColor" fillOpacity="0.35" />
        <rect x="260" y={76 + i * 30} width="36" height="10" rx="5" fill="currentColor" fillOpacity="0.30" />
      </g>
    ))}
  </MockFrame>
);

/* ───── Compliance engine preview ─────
   Big check card + 3 small score chips */
export const CompliancePreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Hero "Run" card */}
    <rect x="16" y="36" width="288" height="78" rx="8" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <circle cx="60" cy="75" r="22" stroke="currentColor" strokeOpacity="0.18" strokeWidth="6" fill="none" />
    <path d="M60 53 A22 22 0 0 1 82 75" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
    <rect x="100" y="58" width="140" height="6" rx="2" fill="currentColor" fillOpacity="0.85" />
    <rect x="100" y="70" width="100" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    <rect x="100" y="78" width="60" height="14" rx="7" fill="currentColor" fillOpacity="0.55" />
    {/* 3 score chips */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x={16 + i * 100} y="124" width="92" height="60" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
        <rect x={22 + i * 100} y="132" width="36" height="3" rx="1" fill="currentColor" fillOpacity="0.55" />
        <rect x={22 + i * 100} y="142" width="44" height="8" rx="2" fill="currentColor" fillOpacity="0.85" />
        <rect x={22 + i * 100} y="158" width="80" height="3" rx="1.5" fill="currentColor" fillOpacity="0.18" />
        <rect x={22 + i * 100} y="158" width={[60, 40, 70][i]} height="3" rx="1.5" fill="currentColor" fillOpacity="0.55" />
      </g>
    ))}
  </MockFrame>
);

/* ───── Audits preview ─────
   Clipboard / checklist style */
export const AuditsPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Header */}
    <rect x="16" y="36" width="288" height="22" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <rect x="22" y="44" width="100" height="6" rx="2" fill="currentColor" fillOpacity="0.85" />
    <rect x="264" y="42" width="36" height="10" rx="5" fill="currentColor" fillOpacity="0.55" />
    {/* Checklist rows */}
    {[0, 1, 2, 3, 4].map((i) => {
      const done = i < 3;
      return (
        <g key={i}>
          <rect x="16" y={66 + i * 24} width="288" height="18" rx="4" fill="currentColor" fillOpacity={done ? 0.10 : 0.04} />
          <rect x="22" y={70 + i * 24} width="10" height="10" rx="2" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.8" fill={done ? 'currentColor' : 'none'} fillOpacity={done ? 0.85 : 0} />
          {done && <path d={`M24 ${75 + i * 24} L26 ${77 + i * 24} L30 ${73 + i * 24}`} stroke="white" strokeOpacity="0.95" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="38" y={73 + i * 24} width={[160, 200, 140, 180, 150][i]} height="3" rx="1" fill="currentColor" fillOpacity={done ? 0.85 : 0.55} />
          <rect x="260" y={71 + i * 24} width="36" height="8" rx="4" fill="currentColor" fillOpacity={done ? 0.30 : 0.18} />
        </g>
      );
    })}
  </MockFrame>
);

/* ───── Non-conformities preview ─────
   Severity buckets + alert list */
export const NonConformitiesPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Severity tiles */}
    {[
      { label: 'Critical', op: 0.85 },
      { label: 'Major', op: 0.65 },
      { label: 'Minor', op: 0.45 },
      { label: 'Obs.', op: 0.30 },
    ].map((s, i) => (
      <g key={i}>
        <rect x={16 + i * 74} y="36" width="68" height="50" rx="6" fill="currentColor" fillOpacity={s.op} />
        <rect x={22 + i * 74} y="44" width="30" height="3" rx="1" fill="white" fillOpacity="0.7" />
        <rect x={22 + i * 74} y="56" width="20" height="8" rx="2" fill="white" fillOpacity="0.9" />
        <rect x={22 + i * 74} y="72" width="46" height="2" rx="1" fill="white" fillOpacity="0.35" />
      </g>
    ))}
    {/* NC rows */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="16" y={98 + i * 28} width="288" height="22" rx="6" fill="currentColor" fillOpacity="0.06" />
        {/* Triangle */}
        <path d={`M28 ${108 + i * 28} L34 ${118 + i * 28} L22 ${118 + i * 28} Z`} fill="currentColor" fillOpacity="0.85" />
        <rect x="42" y={106 + i * 28} width="140" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="42" y={113 + i * 28} width="180" height="2" rx="1" fill="currentColor" fillOpacity="0.35" />
        <rect x="260" y={108 + i * 28} width="36" height="10" rx="5" fill="currentColor" fillOpacity="0.30" />
      </g>
    ))}
  </MockFrame>
);

/* ───── Reports preview ─────
   Document with chart + paragraph */
export const ReportsPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Doc */}
    <rect x="16" y="36" width="180" height="148" rx="8" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
    <rect x="24" y="44" width="120" height="6" rx="2" fill="currentColor" fillOpacity="0.85" />
    <rect x="24" y="56" width="80" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    {/* Embedded bars */}
    <line x1="24" y1="116" x2="184" y2="116" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6" />
    {[
      { x: 36, h: 26 },
      { x: 60, h: 44 },
      { x: 84, h: 38 },
      { x: 108, h: 56 },
      { x: 132, h: 30 },
      { x: 156, h: 64 },
    ].map((b, i) => (
      <rect key={i} x={b.x} y={116 - b.h} width="14" height={b.h} rx="2" fill="currentColor" fillOpacity={i === 5 ? 0.85 : 0.45} />
    ))}
    {/* Lines paragraph */}
    <rect x="24" y="130" width="160" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    <rect x="24" y="140" width="150" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    <rect x="24" y="150" width="130" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
    {/* Side report cards */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="208" y={36 + i * 52} width="96" height="44" rx="6" fill="currentColor" fillOpacity="0.10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.8" />
        <rect x="216" y={44 + i * 52} width="40" height="4" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="216" y={54 + i * 52} width="60" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
        <rect x="216" y={64 + i * 52} width="50" height="10" rx="5" fill="currentColor" fillOpacity="0.30" />
      </g>
    ))}
  </MockFrame>
);

/* ───── Company management preview ─────
   Tenants list with avatar + status. */
export const CompanyManagementPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Header */}
    <rect x="16" y="36" width="180" height="20" rx="10" fill="currentColor" fillOpacity="0.08" />
    <rect x="208" y="36" width="96" height="20" rx="10" fill="currentColor" fillOpacity="0.55" />
    {/* Tenant rows */}
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <rect x="16" y={66 + i * 30} width="288" height="24" rx="6" fill="currentColor" fillOpacity="0.06" />
        <rect x="22" y={70 + i * 30} width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.55" />
        <rect x="44" y={72 + i * 30} width="100" height="4" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="44" y={80 + i * 30} width="60" height="3" rx="1" fill="currentColor" fillOpacity="0.35" />
        <rect x="220" y={74 + i * 30} width="40" height="8" rx="4" fill="currentColor" fillOpacity={i === 0 ? 0.85 : i === 1 ? 0.55 : 0.30} />
        <rect x="270" y={74 + i * 30} width="28" height="8" rx="4" fill="currentColor" fillOpacity="0.18" />
      </g>
    ))}
  </MockFrame>
);

/* ───── User management preview ─────
   Avatars grid + roles */
export const UserManagementPreview = ({ className }: MockupProps) => (
  <MockFrame className={className}>
    {/* Search */}
    <rect x="16" y="36" width="180" height="20" rx="10" fill="currentColor" fillOpacity="0.08" />
    <rect x="208" y="36" width="96" height="20" rx="10" fill="currentColor" fillOpacity="0.55" />
    {/* Avatars row */}
    {Array.from({ length: 8 }).map((_, i) => (
      <circle key={i} cx={28 + i * 36} cy="78" r="10" fill="currentColor" fillOpacity={0.85 - i * 0.08} />
    ))}
    {/* List */}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x="16" y={104 + i * 28} width="288" height="22" rx="6" fill="currentColor" fillOpacity="0.06" />
        <circle cx="28" cy={115 + i * 28} r="7" fill="currentColor" fillOpacity="0.55" />
        <rect x="42" y={111 + i * 28} width="100" height="3" rx="1" fill="currentColor" fillOpacity="0.85" />
        <rect x="42" y={118 + i * 28} width="60" height="2" rx="1" fill="currentColor" fillOpacity="0.35" />
        <rect x="240" y={113 + i * 28} width="56" height="10" rx="5" fill="currentColor" fillOpacity="0.30" />
      </g>
    ))}
  </MockFrame>
);
