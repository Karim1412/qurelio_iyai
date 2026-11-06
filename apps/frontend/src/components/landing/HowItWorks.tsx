'use client';

import { Fragment, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ILLUSTRATIONS
// ─────────────────────────────────────────────────────────────────────────────

const UploadIllustration = () => (
  <svg viewBox="0 0 220 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <defs>
      <linearGradient id="up-card" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#FAFAF7" />
      </linearGradient>
      <linearGradient id="up-drop" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#F4FAFE" />
        <stop offset="100%" stopColor="#EAF3FA" />
      </linearGradient>
      <linearGradient id="up-bar" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="#7DAFD6" />
        <stop offset="100%" stopColor="#9CC4E3" />
      </linearGradient>
      <filter id="up-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feOffset in="b" dy="2" />
        <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <ellipse cx="110" cy="184" rx="78" ry="5" fill="#1C1917" opacity="0.05" />

    {/* Browser-like card */}
    <g filter="url(#up-shadow)">
      <rect x="18" y="24" width="184" height="148" rx="12" fill="url(#up-card)" stroke="#E7E5E0" strokeWidth="1" />
      {/* Top bar */}
      <path d="M18 36 a12 12 0 0 1 12 -12 h160 a12 12 0 0 1 12 12 v0 h-184 z" fill="#F4F1EA" />
      <circle cx="30" cy="32" r="2" fill="#F0A4A4" />
      <circle cx="38" cy="32" r="2" fill="#F0CE85" />
      <circle cx="46" cy="32" r="2" fill="#A4D9B6" />
      <rect x="78" y="28" width="64" height="8" rx="4" fill="#E7E5E0" />
    </g>

    {/* Dashed dropzone */}
    <rect x="30" y="48" width="160" height="56" rx="10" fill="url(#up-drop)" stroke="#7DAFD6" strokeWidth="1.2" strokeDasharray="4 4" />
    {/* Cloud + arrow inside dropzone */}
    <g className="hiw-cloud" transform="translate(0, 6)">
      <path
        d="M88 66 Q88 56 98 56 Q102 48 112 49 Q124 48 128 58 Q138 59 138 69 Q138 77 130 77 L96 77 Q88 77 88 66 Z"
        fill="#FFFFFF"
        stroke="#7DAFD6"
        strokeWidth="1.3"
      />
      <path d="M113 73 L113 60 M108 65 L113 60 L118 65" stroke="#4D92C4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <text x="110" y="98" textAnchor="middle" fontSize="6" fill="#78716C" fontFamily="Poppins, sans-serif" fontWeight="500">Drop files here</text>

    {/* File row 1: completed (green tick + full bar) */}
    <g className="hiw-paper hiw-paper-1">
      <rect x="30" y="114" width="160" height="22" rx="6" fill="#FFFFFF" stroke="#E7E5E0" strokeWidth="1" />
      <rect x="36" y="120" width="10" height="10" rx="2" fill="#EAF3FA" />
      <path d="M38 125 L41 128 L45 122" stroke="#4D92C4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="52" y="120" width="58" height="3" rx="1.5" fill="#3F3F3F" opacity="0.55" />
      <rect x="52" y="127" width="34" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.55" />
      <rect x="118" y="124" width="56" height="3.5" rx="1.75" fill="#EDEAE3" />
      <rect x="118" y="124" width="56" height="3.5" rx="1.75" fill="#82C9B0" />
      <g transform="translate(178, 125)">
        <circle r="4" fill="#EAF8F2" />
        <path d="M-1.6 0 L-0.4 1.3 L1.8 -1.4" stroke="#5BC0A1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </g>

    {/* File row 2: uploading (animated bar) */}
    <g className="hiw-paper hiw-paper-2">
      <rect x="30" y="142" width="160" height="22" rx="6" fill="#FFFFFF" stroke="#E1DED7" strokeWidth="1" />
      <rect x="36" y="148" width="10" height="10" rx="2" fill="#F4EEFC" />
      <path d="M39 152 h4 M39 155 h3" stroke="#B89FE5" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="52" y="148" width="48" height="3" rx="1.5" fill="#3F3F3F" opacity="0.5" />
      <rect x="52" y="155" width="28" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.5" />
      <rect x="118" y="152" width="56" height="3.5" rx="1.75" fill="#EDEAE3" />
      <rect className="hiw-progress" x="118" y="152" width="56" height="3.5" rx="1.75" fill="url(#up-bar)" />
    </g>

    {/* Floating particles rising from the cloud */}
    <circle className="hiw-particle p1" cx="100" cy="58" r="1.6" fill="#7DAFD6" />
    <circle className="hiw-particle p2" cx="113" cy="52" r="1.4" fill="#9CC4E3" />
    <circle className="hiw-particle p3" cx="126" cy="58" r="1.5" fill="#7DAFD6" opacity="0.7" />
  </svg>
);

const AnalyzeIllustration = () => (
  <svg viewBox="0 0 220 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <defs>
      <linearGradient id="scan-grad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="rgba(184, 159, 229, 0)" />
        <stop offset="50%" stopColor="rgba(184, 159, 229, 0.85)" />
        <stop offset="100%" stopColor="rgba(184, 159, 229, 0)" />
      </linearGradient>
      <linearGradient id="ai-card" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#FAFAF7" />
      </linearGradient>
      <linearGradient id="ai-side" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#FBF8FF" />
        <stop offset="100%" stopColor="#F4EEFC" />
      </linearGradient>
      <filter id="ai-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feOffset in="b" dy="2" />
        <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <ellipse cx="110" cy="184" rx="78" ry="5" fill="#1C1917" opacity="0.05" />

    {/* Document on the left */}
    <g className="hiw-doc" filter="url(#ai-shadow)">
      <rect x="20" y="28" width="118" height="148" rx="10" fill="url(#ai-card)" stroke="#E1DED7" strokeWidth="1" />
      {/* Doc header */}
      <rect x="30" y="38" width="48" height="5" rx="2.5" fill="#3F3F3F" opacity="0.55" />
      <rect x="30" y="48" width="78" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.4" />

      {/* Text lines with bullets */}
      <circle cx="34" cy="64" r="2.4" fill="#B89FE5" />
      <rect x="42" y="62" width="84" height="3" rx="1.5" fill="#A8A29E" opacity="0.55" />
      <rect x="42" y="69" width="56" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.35" />

      <circle cx="34" cy="86" r="2.4" stroke="#B89FE5" strokeWidth="1" fill="#FAF7FF" />
      <rect x="42" y="84" width="78" height="3" rx="1.5" fill="#A8A29E" opacity="0.55" />
      <rect x="42" y="91" width="48" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.35" />

      <circle cx="34" cy="108" r="2.4" fill="#B89FE5" />
      <rect x="42" y="106" width="80" height="3" rx="1.5" fill="#A8A29E" opacity="0.55" />
      {/* Highlighted finding */}
      <rect x="42" y="113" width="62" height="4" rx="2" fill="#FCE9A8" opacity="0.7" />
      <rect x="42" y="113" width="62" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.55" />

      <circle cx="34" cy="130" r="2.4" stroke="#B89FE5" strokeWidth="1" fill="#FAF7FF" />
      <rect x="42" y="128" width="74" height="3" rx="1.5" fill="#A8A29E" opacity="0.55" />
      <rect x="42" y="135" width="52" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.35" />

      <circle cx="34" cy="152" r="2.4" fill="#B89FE5" />
      <rect x="42" y="150" width="80" height="3" rx="1.5" fill="#A8A29E" opacity="0.55" />
      <rect x="42" y="157" width="40" height="2.5" rx="1.25" fill="#A8A29E" opacity="0.35" />
    </g>

    {/* Scanning beam */}
    <rect className="hiw-beam" x="20" y="28" width="118" height="2.5" rx="1.25" fill="url(#scan-grad)" />

    {/* AI side panel: detected clauses */}
    <g filter="url(#ai-shadow)">
      <rect x="148" y="36" width="58" height="132" rx="9" fill="url(#ai-side)" stroke="#E5DDF3" strokeWidth="1" />

      {/* Header: AI dot + label */}
      <circle cx="156" cy="46" r="2.4" fill="#B89FE5">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <rect x="162" y="44" width="32" height="4" rx="2" fill="#7C5DBE" opacity="0.75" />

      {/* Score ring */}
      <g transform="translate(177, 70)">
        <circle r="14" fill="#FFFFFF" stroke="#EFE5FB" strokeWidth="2" />
        <circle r="14" fill="none" stroke="#B89FE5" strokeWidth="2" strokeLinecap="round"
                strokeDasharray="88" strokeDashoffset="22"
                transform="rotate(-90)" />
        <text x="0" y="3" textAnchor="middle" fontSize="8" fill="#7C5DBE" fontFamily="Poppins, sans-serif" fontWeight="700">76%</text>
      </g>

      {/* Detected clause chips: gentle staggered enter */}
      <g className="hiw-chip c1">
        <rect x="154" y="98" width="46" height="11" rx="5.5" fill="#FFFFFF" stroke="#E5DDF3" strokeWidth="0.8" />
        <circle cx="160" cy="103.5" r="1.6" fill="#82C9B0" />
        <text x="166" y="106" fontSize="5.6" fill="#57534E" fontFamily="Poppins, sans-serif" fontWeight="500">Decree</text>
      </g>
      <g className="hiw-chip c2">
        <rect x="154" y="114" width="46" height="11" rx="5.5" fill="#FFFFFF" stroke="#E5DDF3" strokeWidth="0.8" />
        <circle cx="160" cy="119.5" r="1.6" fill="#F0CE85" />
        <text x="166" y="122" fontSize="5.6" fill="#57534E" fontFamily="Poppins, sans-serif" fontWeight="500">Regulation</text>
      </g>
      <g className="hiw-chip c3">
        <rect x="154" y="130" width="46" height="11" rx="5.5" fill="#FFFFFF" stroke="#E5DDF3" strokeWidth="0.8" />
        <circle cx="160" cy="135.5" r="1.6" fill="#F0A4A4" />
        <text x="166" y="138" fontSize="5.6" fill="#57534E" fontFamily="Poppins, sans-serif" fontWeight="500">Law</text>
      </g>

      {/* Gap counter at bottom */}
      <rect x="154" y="148" width="46" height="14" rx="4" fill="#F4EEFC" />
      <text x="160" y="157" fontSize="5.6" fill="#7C5DBE" fontFamily="Poppins, sans-serif" fontWeight="600">3 gaps found</text>
    </g>

    {/* Connection between doc highlight and side panel */}
    <path d="M104 115 Q 130 115 148 110" stroke="#B89FE5" strokeWidth="1" strokeDasharray="2 3" fill="none" opacity="0.6" />
  </svg>
);

const TrackIllustration = () => (
  <svg viewBox="0 0 220 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <defs>
      <linearGradient id="track-area" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="rgba(130, 201, 176, 0.32)" />
        <stop offset="100%" stopColor="rgba(130, 201, 176, 0)" />
      </linearGradient>
      <linearGradient id="track-card" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#FAFAF7" />
      </linearGradient>
      <linearGradient id="track-line" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="#82C9B0" />
        <stop offset="100%" stopColor="#5BC0A1" />
      </linearGradient>
      <filter id="track-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feOffset in="b" dy="2" />
        <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <ellipse cx="110" cy="184" rx="78" ry="5" fill="#1C1917" opacity="0.05" />

    {/* Dashboard card */}
    <g filter="url(#track-shadow)">
      <rect x="18" y="22" width="184" height="154" rx="12" fill="url(#track-card)" stroke="#E1DED7" strokeWidth="1" />

      {/* Header row */}
      <rect x="28" y="32" width="58" height="5" rx="2.5" fill="#3F3F3F" opacity="0.65" />
      <rect x="28" y="42" width="44" height="3" rx="1.5" fill="#A8A29E" opacity="0.45" />

      {/* +12% pill badge */}
      <g transform="translate(160, 36)">
        <rect x="-22" y="-7" width="42" height="14" rx="7" fill="#EAF8F2" />
        <path d="M-15 0 L-12 -3 L-9 0" stroke="#5BC0A1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <text x="-5" y="3" fontSize="6.4" fill="#3F9F7E" fontFamily="Poppins, sans-serif" fontWeight="700">+12%</text>
      </g>

      {/* KPI row */}
      <g>
        <rect x="28" y="56" width="50" height="22" rx="6" fill="#F7F5EF" />
        <text x="33" y="65" fontSize="5.4" fill="#78716C" fontFamily="Poppins, sans-serif" fontWeight="500">SCORE</text>
        <text x="33" y="74" fontSize="9" fill="#1C1917" fontFamily="Poppins, sans-serif" fontWeight="700">94%</text>

        <rect x="84" y="56" width="50" height="22" rx="6" fill="#F7F5EF" />
        <text x="89" y="65" fontSize="5.4" fill="#78716C" fontFamily="Poppins, sans-serif" fontWeight="500">CLOSED</text>
        <text x="89" y="74" fontSize="9" fill="#1C1917" fontFamily="Poppins, sans-serif" fontWeight="700">128</text>

        <rect x="140" y="56" width="50" height="22" rx="6" fill="#F7F5EF" />
        <text x="145" y="65" fontSize="5.4" fill="#78716C" fontFamily="Poppins, sans-serif" fontWeight="500">OPEN</text>
        <text x="145" y="74" fontSize="9" fill="#1C1917" fontFamily="Poppins, sans-serif" fontWeight="700">7</text>
      </g>

      {/* Chart area */}
      <line x1="28" y1="98" x2="190" y2="98" stroke="#F1EEE7" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="28" y1="118" x2="190" y2="118" stroke="#F1EEE7" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="28" y1="138" x2="190" y2="138" stroke="#F1EEE7" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="28" y1="158" x2="190" y2="158" stroke="#F1EEE7" strokeWidth="1" strokeDasharray="2 4" />

      <path
        className="hiw-area"
        d="M30 156 L58 142 L86 128 L114 116 L142 100 L170 86 L170 162 L30 162 Z"
        fill="url(#track-area)"
      />
      <path
        className="hiw-line"
        d="M30 156 L58 142 L86 128 L114 116 L142 100 L170 86"
        stroke="url(#track-line)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset="100"
      />

      <g className="hiw-milestones">
        <circle className="hiw-dot d1" cx="30"  cy="156" r="2.6" fill="#FFFFFF" stroke="#82C9B0" strokeWidth="1.5" />
        <circle className="hiw-dot d2" cx="58"  cy="142" r="2.6" fill="#FFFFFF" stroke="#82C9B0" strokeWidth="1.5" />
        <circle className="hiw-dot d3" cx="86"  cy="128" r="2.6" fill="#FFFFFF" stroke="#82C9B0" strokeWidth="1.5" />
        <circle className="hiw-dot d4" cx="114" cy="116" r="2.6" fill="#FFFFFF" stroke="#82C9B0" strokeWidth="1.5" />
        <circle className="hiw-dot d5" cx="170" cy="86"  r="3.6" fill="#82C9B0" />
        <circle className="hiw-dot-pulse" cx="170" cy="86" r="3.6" fill="none" stroke="#82C9B0" strokeWidth="1.4" />
      </g>

      {/* Live value tooltip near the latest dot */}
      <g transform="translate(170, 70)">
        <rect x="-14" y="-9" width="28" height="12" rx="3" fill="#1C1917" />
        <text x="0" y="-1" textAnchor="middle" fontSize="6" fill="#FFFFFF" fontFamily="Poppins, sans-serif" fontWeight="600">94%</text>
        <path d="M-3 3 L0 6 L3 3 Z" fill="#1C1917" />
      </g>
    </g>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// STEP DATA
// ─────────────────────────────────────────────────────────────────────────────

type Step = {
  number: string;
  action: string;
  title: string;
  lead: string;
  description: string;
  detailsLabel: string;
  details: string[];
  accent: string;
  accentSoft: string;
  Illustration: React.FC;
};

const steps: Step[] = [
  {
    number: '01',
    action: 'Onboard',
    title: 'Teach Qurelio your organization',
    lead: 'Start where you are.',
    description:
      'Describe your company, products and markets, then bring your product folders and quality documents into one organised home. Qurelio builds a private compliance memory of your organization, so every answer is about your reality.',
    detailsLabel: 'What happens here',
    details: [
      'Guided onboarding captures your activity, markets and quality context',
      'Drag-and-drop bulk import of product folders and records',
      'Private by default: your memory is yours alone, never shared',
    ],
    accent: '#7DAFD6',
    accentSoft: '#EAF3FA',
    Illustration: UploadIllustration,
  },
  {
    number: '02',
    action: 'Assess',
    title: 'Upload a regulation, get your verdict',
    lead: 'See the gaps clearly.',
    description:
      'Add any public law, decree or regulation that applies to you. Qurelio evaluates your products against it, clause by clause, and returns a compliance score and maturity level, with every gap explained in plain language.',
    detailsLabel: 'What you receive',
    details: [
      'Clause-by-clause compliance and maturity assessment',
      'Plain-language explanation of every gap',
      'Suggested fixes, each with an owner and a date, pending your approval',
    ],
    accent: '#B89FE5',
    accentSoft: '#F4EEFC',
    Illustration: AnalyzeIllustration,
  },
  {
    number: '03',
    action: 'Monitor & improve',
    title: 'Never be surprised by a regulation again',
    lead: 'Keep the momentum.',
    description:
      'Qurelio keeps watching. When a regulation changes, or a relevant one you never mentioned appears, you get an alert that says exactly which products are affected and what to do. Every closed gap becomes a visible milestone.',
    detailsLabel: 'What stays with you',
    details: [
      'Alerts when regulatory changes affect your compliance',
      'Detection of applicable regulations you didn’t know about',
      'Live KPIs and a one-click evidence trail, ready for any auditor',
    ],
    accent: '#82C9B0',
    accentSoft: '#EAF8F2',
    Illustration: TrackIllustration,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

function useJourneyProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const windowH = window.innerHeight;
      const start = windowH * 0.85;
      const end = windowH * 0.05;
      const total = rect.height;
      const visibleTop = Math.max(0, start - rect.top);
      const raw = visibleTop / Math.max(1, total + (start - end) - windowH);
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    compute();
    return () => {
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [ref]);

  return progress;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const progress = useJourneyProgress(trackRef);
  const [inView, setInView] = useState(false);

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
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const stepThresholds = [0.1, 0.45, 0.8];
  const activeStates = stepThresholds.map((t) => progress >= t);

  return (
    <>
      <style>{`
        .hiw-root {
          font-family: "Poppins", -apple-system, system-ui, sans-serif;
          position: relative;
          overflow: hidden;
          padding: 120px 40px 140px;
          background:
            radial-gradient(ellipse 70% 50% at 50% 0%, rgba(244, 240, 230, 0.6), transparent 70%),
            radial-gradient(ellipse 80% 40% at 50% 100%, rgba(250, 248, 242, 0.9), transparent 70%),
            linear-gradient(180deg, #FAF8F2 0%, #FDFCF9 50%, #FAF8F2 100%);
        }

        .hiw-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(125, 175, 214, 0.04) 0%, transparent 35%),
            radial-gradient(circle at 80% 60%, rgba(184, 159, 229, 0.04) 0%, transparent 35%),
            radial-gradient(circle at 40% 80%, rgba(130, 201, 176, 0.04) 0%, transparent 35%);
          pointer-events: none;
        }

        .hiw-inner {
          position: relative;
          max-width: 1100px;
          margin: 0 auto;
        }

        /* ─── Header ─── */
        .hiw-eyebrow {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--brand-accent);
          font-weight: 600;
          margin: 0 0 18px;
        }
        .hiw-heading {
          font-size: clamp(36px, 5vw, 60px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #1C1917;
          text-align: center;
          line-height: 1.08;
          margin: 0 auto 18px;
          max-width: 760px;
        }
        .hiw-heading em {
          font-style: normal;
          color: #2563EB;
          font-weight: 700;
        }
        .hiw-sub {
          font-size: clamp(16px, 1.5vw, 18px);
          color: #78716C;
          line-height: 1.65;
          text-align: center;
          max-width: 560px;
          margin: 0 auto 96px;
          font-weight: 400;
        }

        .hiw-eyebrow, .hiw-heading, .hiw-sub {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(2px);
          transition:
            opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1),
            transform 1.2s cubic-bezier(0.16, 1, 0.3, 1),
            filter 1s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hiw-root.is-in-view .hiw-eyebrow { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.05s; }
        .hiw-root.is-in-view .hiw-heading { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.18s; }
        .hiw-root.is-in-view .hiw-sub     { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.32s; }

        /* ─── Journey track ─── */
        .hiw-track {
          position: relative;
        }

        /* ─── Horizontal wavy timeline ─── */
        .hiw-grid {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-rows: auto 96px auto;
          column-gap: 32px;
          row-gap: 28px;
        }

        .hiw-wave {
          grid-row: 2;
          grid-column: 1 / -1;
          width: 100%;
          height: 100%;
          align-self: center;
          pointer-events: none;
          overflow: visible;
          display: block;
        }
        .hiw-wave--bg { z-index: 0; }
        .hiw-wave--progress {
          z-index: 1;
        }

        /* Soft, perpetual current along the background dashes. */
        .hiw-wave--bg path {
          animation: hiw-wave-flow 14s linear infinite;
        }
        @keyframes hiw-wave-flow {
          to { stroke-dashoffset: -14; }
        }

        /* Subtle breathing on the whole wave: calm, almost imperceptible */
        .hiw-wave-shell {
          animation: hiw-wave-breathe 9s ease-in-out infinite;
        }
        @keyframes hiw-wave-breathe {
          0%, 100% { opacity: 0.92; transform: translateY(0); }
          50%      { opacity: 1;    transform: translateY(-1.5px); }
        }

        /* Traveling shimmer along the wave path */
        .hiw-wave-shimmer {
          animation: hiw-wave-shimmer-move 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        @keyframes hiw-wave-shimmer-move {
          0%, 100% { opacity: 0; }
          15%      { opacity: 1; }
          85%      { opacity: 1; }
        }

        /* ─── Step columns (illustration top, orb on wave, description bottom) ─── */
        .hiw-illu-col {
          grid-row: 1;
          grid-column: var(--col);
          display: flex;
          justify-content: center;
          width: 100%;
          z-index: 1;
          opacity: 0.45;
          transform: translateY(12px);
          transition:
            opacity 1s cubic-bezier(0.22, 1, 0.36, 1),
            transform 1s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .hiw-orb-col {
          grid-row: 2;
          grid-column: var(--col);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 3;
        }

        .hiw-text-col {
          grid-row: 3;
          grid-column: var(--col);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-self: center;
          align-self: stretch;
          width: 100%;
          max-width: 320px;
          margin: 0 auto;
          height: 100%;
          z-index: 1;
          opacity: 0.45;
          transform: translateY(12px);
          transition:
            opacity 1s cubic-bezier(0.22, 1, 0.36, 1),
            transform 1s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .hiw-illu-col.active,
        .hiw-text-col.active {
          opacity: 1;
          transform: translateY(0);
        }

        /* ─── Orb ─── */
        .hiw-orb {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #FFFFFF;
          border: 1px solid #E7E5E0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: #A8A29E;
          transition:
            border-color 0.6s ease,
            color 0.6s ease,
            box-shadow 0.6s ease,
            transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hiw-orb-col.active .hiw-orb {
          color: var(--step-accent);
          border-color: var(--step-accent);
          box-shadow:
            0 0 0 6px var(--step-accent-soft),
            0 8px 20px -10px var(--step-accent);
          transform: scale(1.05);
        }
        .hiw-orb-ring {
          position: absolute;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 1px dashed rgba(168, 162, 158, 0.35);
          opacity: 0;
          transition: opacity 0.6s ease;
        }
        .hiw-orb-col.active .hiw-orb-ring {
          opacity: 1;
          animation: hiw-orb-spin 18s linear infinite;
        }
        @keyframes hiw-orb-spin {
          to { transform: rotate(360deg); }
        }

        /* ─── Illustration card ─── */
        .hiw-illu {
          position: relative;
          width: 100%;
          max-width: 320px;
          background: #FFFFFF;
          border: 1px solid rgba(231, 229, 224, 0.9);
          border-radius: 22px;
          padding: 22px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 1px 2px rgba(15, 23, 42, 0.04),
            0 12px 30px -18px rgba(15, 23, 42, 0.12);
          aspect-ratio: 11 / 10;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .hiw-illu::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 35%, var(--step-accent-soft), transparent 70%);
          opacity: 0;
          transition: opacity 0.7s ease;
        }
        .hiw-illu-col.active .hiw-illu::before { opacity: 1; }
        .hiw-illu svg {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
        }

        /* Soft hover-lift on the illustration card: interactive without being loud. */
        .hiw-illu {
          transition:
            transform 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.5s ease;
          will-change: transform;
        }
        .hiw-illu-col:hover .hiw-illu {
          transform: translateY(-6px);
          border-color: color-mix(in srgb, var(--step-accent) 30%, #E7E5E0);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 2px 6px rgba(15, 23, 42, 0.05),
            0 22px 44px -22px color-mix(in srgb, var(--step-accent) 55%, transparent);
        }
        /* Hovering an inactive column wakes it up: interactive preview. */
        .hiw-illu-col:hover,
        .hiw-illu-col:hover + .hiw-orb-col,
        .hiw-text-col:hover {
          opacity: 1;
          transform: translateY(0);
        }
        .hiw-illu-col:hover .hiw-illu::before { opacity: 1; }

        /* ─── Text card (the elegant block under each illustration) ─── */
        .hiw-text-card {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: linear-gradient(180deg, #FFFFFF 0%, #FDFCF8 100%);
          border: 1px solid rgba(231, 229, 224, 0.9);
          border-radius: 20px;
          padding: 28px 24px 26px;
          text-align: left;
          overflow: hidden;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 1px 2px rgba(15, 23, 42, 0.03),
            0 14px 32px -22px rgba(15, 23, 42, 0.10);
          transition:
            transform 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.5s ease;
          will-change: transform;
        }
        .hiw-text-col:hover .hiw-text-card {
          transform: translateY(-4px);
          border-color: color-mix(in srgb, var(--step-accent) 28%, #E7E5E0);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 2px 6px rgba(15, 23, 42, 0.04),
            0 22px 44px -22px color-mix(in srgb, var(--step-accent) 55%, transparent);
        }

        /* Left accent rail */
        .hiw-text-rail {
          position: absolute;
          top: 22px;
          bottom: 22px;
          left: 0;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--step-accent) 70%, transparent),
            color-mix(in srgb, var(--step-accent) 18%, transparent)
          );
          transform: scaleY(0.4);
          transform-origin: top center;
          opacity: 0.5;
          transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.05s,
                      opacity 0.6s ease;
        }
        .hiw-text-col.active .hiw-text-rail,
        .hiw-text-col:hover .hiw-text-rail {
          transform: scaleY(1);
          opacity: 1;
        }

        /* Watermark step number: ghosted in the corner */
        .hiw-text-watermark {
          position: absolute;
          top: 14px;
          right: 18px;
          font-size: 56px;
          font-weight: 800;
          letter-spacing: -0.04em;
          line-height: 1;
          color: var(--step-accent);
          opacity: 0;
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--step-accent) 18%, transparent) 0%,
            transparent 90%
          );
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          pointer-events: none;
          transition: opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.1s;
        }
        .hiw-text-col.active .hiw-text-watermark,
        .hiw-text-col:hover .hiw-text-watermark {
          opacity: 1;
        }

        .hiw-text-head {
          margin: 0 0 14px;
        }
        .hiw-text-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--step-accent);
          background: var(--step-accent-soft);
          padding: 6px 11px;
          border-radius: 100px;
          line-height: 1;
        }
        .hiw-text-tag-num {
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--step-accent);
          opacity: 0.7;
        }
        .hiw-text-tag-sep {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--step-accent);
          opacity: 0.5;
        }
        .hiw-text-title {
          font-size: clamp(20px, 1.9vw, 22px);
          font-weight: 700;
          letter-spacing: -0.024em;
          color: #1C1917;
          line-height: 1.25;
          margin: 0 0 10px;
        }
        .hiw-text-lead {
          font-size: 13px;
          font-style: italic;
          color: var(--step-accent);
          line-height: 1.5;
          margin: 0 0 12px;
          font-weight: 500;
          opacity: 0.92;
        }
        .hiw-text-desc {
          font-size: 13.5px;
          color: #57534E;
          line-height: 1.7;
          margin: 0 0 20px;
          font-weight: 400;
        }

        /* Divider with centered label: pushed to the bottom so titles align */
        .hiw-text-divider {
          position: relative;
          height: 1px;
          margin: auto 0 18px;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(168, 162, 158, 0.28) 18%,
            rgba(168, 162, 158, 0.28) 82%,
            transparent 100%
          );
        }
        .hiw-text-divider-label {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 9.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 600;
          color: #A8A29E;
          background: linear-gradient(180deg, #FFFFFF 0%, #FDFCF8 100%);
          padding: 0 10px;
          white-space: nowrap;
        }

        .hiw-text-details {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          /* Reserve space for the worst-case 3 items × 2 wrapped lines so
             the divider label sits at the same Y on every card. */
          min-height: 142px;
        }
        .hiw-text-details li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13px;
          color: #44403C;
          line-height: 1.55;
          font-weight: 400;
          /* Soft per-item enter */
          opacity: 0;
          transform: translateY(6px);
          transition:
            opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
          transition-delay: calc(0.45s + var(--i) * 0.12s);
        }
        .hiw-text-col.active .hiw-text-details li,
        .hiw-text-col:hover .hiw-text-details li {
          opacity: 1;
          transform: translateY(0);
        }
        .hiw-detail-tick {
          width: 18px;
          height: 18px;
          margin-top: 2px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--step-accent-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--step-accent);
          transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hiw-text-col:hover .hiw-detail-tick {
          transform: scale(1.08);
        }
        .hiw-detail-tick svg {
          width: 9px;
          height: 9px;
        }

        /* Element-level staggered enter for the head/title/lead/desc */
        .hiw-text-head,
        .hiw-text-title,
        .hiw-text-lead,
        .hiw-text-desc,
        .hiw-text-divider {
          opacity: 0;
          transform: translateY(8px);
          filter: blur(2px);
          transition:
            opacity 0.85s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.85s cubic-bezier(0.22, 1, 0.36, 1),
            filter 0.7s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hiw-text-col.active .hiw-text-head,
        .hiw-text-col:hover .hiw-text-head     { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.08s; }
        .hiw-text-col.active .hiw-text-title,
        .hiw-text-col:hover .hiw-text-title    { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.18s; }
        .hiw-text-col.active .hiw-text-lead,
        .hiw-text-col:hover .hiw-text-lead     { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.28s; }
        .hiw-text-col.active .hiw-text-desc,
        .hiw-text-col:hover .hiw-text-desc     { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.36s; }
        .hiw-text-col.active .hiw-text-divider,
        .hiw-text-col:hover .hiw-text-divider  { opacity: 1; transform: none; filter: blur(0); transition-delay: 0.42s; }

        /* ─── Mobile (stack vertically, hide wave) ─── */
        @media (max-width: 820px) {
          .hiw-grid {
            grid-template-columns: 1fr;
            grid-template-rows: none;
            grid-auto-rows: auto;
            row-gap: 24px;
            column-gap: 0;
          }
          .hiw-illu-col,
          .hiw-orb-col,
          .hiw-text-col {
            grid-column: 1;
            grid-row: auto;
          }
          .hiw-illu-col { order: calc(var(--col) * 3 - 2); }
          .hiw-orb-col  { order: calc(var(--col) * 3 - 1); }
          .hiw-text-col {
            order: calc(var(--col) * 3);
            margin-bottom: 36px;
          }
          .hiw-wave { display: none; }
          .hiw-illu {
            aspect-ratio: 4 / 3;
            max-width: none;
          }
        }

        /* ─── Animations ─── */
        .hiw-illu-col:not(.active) svg .hiw-paper,
        .hiw-illu-col:not(.active) svg .hiw-particle,
        .hiw-illu-col:not(.active) svg .hiw-cloud,
        .hiw-illu-col:not(.active) svg .hiw-beam,
        .hiw-illu-col:not(.active) svg .hiw-sparkle,
        .hiw-illu-col:not(.active) svg .hiw-mini-spark,
        .hiw-illu-col:not(.active) svg .hiw-line,
        .hiw-illu-col:not(.active) svg .hiw-dot,
        .hiw-illu-col:not(.active) svg .hiw-dot-pulse,
        .hiw-illu-col:not(.active) svg .hiw-area {
          animation: none;
        }

        .hiw-illu-col.active svg .hiw-paper-1 {
          animation: hiw-float-1 4.2s ease-in-out infinite;
          transform-origin: center;
        }
        .hiw-illu-col.active svg .hiw-paper-2 {
          animation: hiw-float-2 4.6s ease-in-out infinite;
          transform-origin: center;
        }
        .hiw-illu-col.active svg .hiw-paper-3 {
          animation: hiw-float-3 5s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes hiw-float-1 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes hiw-float-2 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes hiw-float-3 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        .hiw-illu-col.active svg .hiw-cloud {
          animation: hiw-cloud-bob 5.5s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes hiw-cloud-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

        /* Upload progress bar: animated fill that loops gently */
        .hiw-illu-col.active svg .hiw-progress {
          transform-box: fill-box;
          transform-origin: left center;
          animation: hiw-progress-fill 3.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }
        @keyframes hiw-progress-fill {
          0%   { transform: scaleX(0.05); opacity: 0.9; }
          70%  { transform: scaleX(1);    opacity: 1; }
          85%  { transform: scaleX(1);    opacity: 1; }
          100% { transform: scaleX(1);    opacity: 0; }
        }

        .hiw-illu-col.active svg .hiw-particle {
          animation: hiw-particle-rise 3s ease-in-out infinite;
        }
        .hiw-illu-col.active svg .hiw-particle.p1 { animation-delay: 0s; }
        .hiw-illu-col.active svg .hiw-particle.p2 { animation-delay: 0.6s; }
        .hiw-illu-col.active svg .hiw-particle.p3 { animation-delay: 1.2s; }
        @keyframes hiw-particle-rise {
          0%   { opacity: 0; transform: translateY(0); }
          30%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-22px); }
        }

        .hiw-illu-col.active svg .hiw-beam {
          animation: hiw-beam-sweep 2.6s ease-in-out infinite;
        }
        @keyframes hiw-beam-sweep {
          0%   { transform: translateY(0); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(122px); opacity: 0; }
        }
        .hiw-illu-col.active svg .hiw-sparkle {
          animation: hiw-sparkle-spin 6s linear infinite;
          transform-origin: 178px 66px;
        }
        @keyframes hiw-sparkle-spin {
          0%   { transform: translate(178px, 66px) rotate(0deg); }
          100% { transform: translate(178px, 66px) rotate(360deg); }
        }
        .hiw-illu-col.active svg .hiw-mini-spark {
          animation: hiw-mini-pulse 2.4s ease-in-out infinite;
          transform-origin: center;
        }
        .hiw-illu-col.active svg .hiw-mini-spark.s1 { animation-delay: 0s; }
        .hiw-illu-col.active svg .hiw-mini-spark.s2 { animation-delay: 1.2s; }
        @keyframes hiw-mini-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%      { opacity: 1; transform: scale(1.2); }
        }

        /* Clause chips: soft slide-in-from-right, staggered. No infinite jitter. */
        .hiw-illu-col.active svg .hiw-chip {
          opacity: 0;
          animation: hiw-chip-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-box: fill-box;
          transform-origin: center;
        }
        .hiw-illu-col.active svg .hiw-chip.c1 { animation-delay: 0.4s; }
        .hiw-illu-col.active svg .hiw-chip.c2 { animation-delay: 0.65s; }
        .hiw-illu-col.active svg .hiw-chip.c3 { animation-delay: 0.9s; }
        @keyframes hiw-chip-in {
          0%   { opacity: 0; transform: translateX(6px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        .hiw-illu-col.active svg .hiw-line {
          animation: hiw-draw 1.4s 0.2s cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }
        @keyframes hiw-draw { to { stroke-dashoffset: 0; } }

        .hiw-illu-col.active svg .hiw-area {
          animation: hiw-area-fade 1.6s 0.6s ease forwards;
          opacity: 0;
        }
        @keyframes hiw-area-fade { to { opacity: 1; } }

        .hiw-illu-col.active svg .hiw-dot {
          opacity: 0;
          animation: hiw-dot-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          transform-box: fill-box;
          transform-origin: center;
        }
        .hiw-illu-col.active svg .hiw-dot.d1 { animation-delay: 0.4s; }
        .hiw-illu-col.active svg .hiw-dot.d2 { animation-delay: 0.7s; }
        .hiw-illu-col.active svg .hiw-dot.d3 { animation-delay: 1.0s; }
        .hiw-illu-col.active svg .hiw-dot.d4 { animation-delay: 1.3s; }
        .hiw-illu-col.active svg .hiw-dot.d5 { animation-delay: 1.6s; }
        @keyframes hiw-dot-pop {
          0% { opacity: 0; transform: scale(0); }
          100% { opacity: 1; transform: scale(1); }
        }
        .hiw-illu-col.active svg .hiw-dot-pulse {
          transform-box: fill-box;
          transform-origin: center;
          animation: hiw-pulse-ring 2s 1.6s ease-out infinite;
          opacity: 0;
        }
        @keyframes hiw-pulse-ring {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.4); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
          .hiw-illu-col, .hiw-text-col { opacity: 1 !important; transform: none !important; }
          .hiw-text-head,
          .hiw-text-title,
          .hiw-text-lead,
          .hiw-text-desc,
          .hiw-text-divider,
          .hiw-text-details li,
          .hiw-text-rail,
          .hiw-text-watermark {
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>

      <section
        id="how-it-works"
        ref={sectionRef}
        className={`hiw-root${inView ? ' is-in-view' : ''}`}
        aria-label="How Qurelio works"
      >
        <div className="hiw-inner">
          <p className="hiw-eyebrow">How it works</p>
          <h2 className="hiw-heading">
            How it <em>works</em>
          </h2>
          <p className="hiw-sub">
            Three calm steps. From the day you describe your organization to the daily rhythm of staying
            compliant, Qurelio guides every move, and you approve every decision.
          </p>

          <div className="hiw-track" ref={trackRef}>
            <div className="hiw-grid">
              {/* Soft wave geometry: gentle S-curves whose zero-crossings land
                  exactly at each orb column (x = 200, 600, 1000 in viewBox 1200). */}
              <svg
                className="hiw-wave hiw-wave--bg hiw-wave-shell"
                viewBox="0 0 1200 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  d="M 0 50 C 80 50, 140 32, 200 50 C 260 68, 340 68, 400 50 C 460 32, 540 32, 600 50 C 660 68, 740 68, 800 50 C 860 32, 940 32, 1000 50 C 1060 68, 1140 50, 1200 50"
                  stroke="rgba(168, 162, 158, 0.42)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeDasharray="2 6"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              <svg
                className="hiw-wave hiw-wave--progress"
                viewBox="0 0 1200 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <defs>
                  <linearGradient id="hiw-wave-grad" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%"  stopColor="#7DAFD6" />
                    <stop offset="50%" stopColor="#B89FE5" />
                    <stop offset="100%" stopColor="#82C9B0" />
                  </linearGradient>
                </defs>

                {/* Main progress line */}
                <path
                  d="M 0 50 C 80 50, 140 32, 200 50 C 260 68, 340 68, 400 50 C 460 32, 540 32, 600 50 C 660 68, 740 68, 800 50 C 860 32, 940 32, 1000 50 C 1060 68, 1140 50, 1200 50"
                  stroke="url(#hiw-wave-grad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  pathLength={100}
                  strokeDasharray="100"
                  strokeDashoffset={100 - progress * 100}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    transition: 'stroke-dashoffset 0.85s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />

                {/* Traveling shimmer dot: glides along the active portion */}
                {progress > 0.04 && (
                  <circle r="3.5" fill="#FFFFFF" className="hiw-wave-shimmer">
                    <animateMotion
                      dur="7s"
                      repeatCount="indefinite"
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="spline"
                      keySplines="0.45 0 0.55 1"
                      path="M 0 50 C 80 50, 140 32, 200 50 C 260 68, 340 68, 400 50 C 460 32, 540 32, 600 50 C 660 68, 740 68, 800 50 C 860 32, 940 32, 1000 50 C 1060 68, 1140 50, 1200 50"
                    />
                  </circle>
                )}
              </svg>

              {steps.map((step, i) => {
                const active = activeStates[i];
                const colVar = {
                  ['--col' as string]: i + 1,
                  ['--step-accent' as string]: step.accent,
                  ['--step-accent-soft' as string]: step.accentSoft,
                } as React.CSSProperties;
                return (
                  <Fragment key={step.number}>
                    <div className={`hiw-illu-col${active ? ' active' : ''}`} style={colVar}>
                      <div className="hiw-illu">
                        <step.Illustration />
                      </div>
                    </div>

                    <div
                      className={`hiw-orb-col${active ? ' active' : ''}`}
                      style={colVar}
                      aria-hidden
                    >
                      <span className="hiw-orb-ring" />
                      <span className="hiw-orb">{step.number}</span>
                    </div>

                    <div className={`hiw-text-col${active ? ' active' : ''}`} style={colVar}>
                      <div className="hiw-text-card">
                        <span className="hiw-text-rail" aria-hidden />
                        <span className="hiw-text-watermark" aria-hidden>{step.number}</span>

                        <div className="hiw-text-head">
                          <span className="hiw-text-tag">
                            <span className="hiw-text-tag-num">{step.number}</span>
                            <span className="hiw-text-tag-sep" aria-hidden />
                            {step.action}
                          </span>
                        </div>

                        <h3 className="hiw-text-title">{step.title}</h3>
                        <p className="hiw-text-lead">{step.lead}</p>
                        <p className="hiw-text-desc">{step.description}</p>

                        <div className="hiw-text-divider" aria-hidden>
                          <span className="hiw-text-divider-label">{step.detailsLabel}</span>
                        </div>

                        <ul className="hiw-text-details">
                          {step.details.map((d, di) => (
                            <li key={d} style={{ ['--i' as string]: di } as React.CSSProperties}>
                              <span className="hiw-detail-tick" aria-hidden>
                                <svg viewBox="0 0 12 12" fill="none">
                                  <path
                                    d="M2.5 6.2 L5 8.5 L9.5 3.8"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}