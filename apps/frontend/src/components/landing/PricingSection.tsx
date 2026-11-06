'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Check, Sparkles } from '@/components/icons';

type Feature = { label: string };

type Plan = {
  name: string;
  description: string;
  price: number | null; // null → "Tailored"
  priceNote: string;
  /** null → this plan has no quarterly option (price stays annual) */
  quarterlyPrice: number | null;
  quarterlyNote: string;
  scope: string;
  ctaLabel: string;
  ctaNote: string;
  badge?: string;
  badgeTone?: 'brand' | 'gold';
  highlighted?: boolean;
  features: Feature[];
};

const plans: Plan[] = [
  {
    name: 'Early Access Pilot',
    description:
      'Professional, in full, at pilot pricing — shape the product with us.',
    price: 6000,
    priceNote: '€500 / month equivalent · 75% off Professional',
    quarterlyPrice: null,
    quarterlyNote: 'Annual billing only for the pilot programme',
    scope: '5 users · Professional scope otherwise · open worldwide',
    ctaLabel: 'Request pilot access',
    ctaNote: 'contact@qurelio.com · open worldwide',
    badge: 'Early access',
    badgeTone: 'brand',
    features: [
      { label: 'The complete Professional plan — no feature exceptions' },
      { label: 'Dedicated onboarding session, no charge' },
      { label: 'Priority addition of your regulatory sources to the monitored registry' },
      { label: 'Direct feedback line to the product team + roadmap input' },
      { label: 'Custom scope available after pilot' },
      { label: 'Standard Professional pricing applies from client 6 onward' },
    ],
  },
  {
    name: 'Starter',
    description:
      'Run quality operations properly, and get your first regulations under control.',
    price: 9600,
    priceNote: '€800 / month equivalent',
    quarterlyPrice: 2520,
    quarterlyNote: 'Billed every 3 months · +5% on the annual price',
    scope: '3 users · 3 products · 2 active regulations',
    ctaLabel: 'Start free trial',
    ctaNote: '14-day trial · no credit card',
    features: [
      { label: 'Onboarding wizard & organizational profile' },
      { label: 'Product folder ingestion → private Compliance Memory' },
      { label: 'Compliance engine — obligations, gap list, weighted score, every finding cited' },
      { label: 'Legal Guardrail & HITL Quarantine on every AI output' },
      { label: 'File Library, Non-Conformities & CAPA lifecycle' },
      { label: 'Internal audits, root-cause tools, action plans' },
      { label: 'Email support, 48h · assisted onboarding included' },
    ],
  },
  {
    name: 'Professional',
    description:
      'Everything in Starter — plus the regulatory landscape watching itself.',
    price: 24000,
    priceNote: '€2,000 / month equivalent',
    quarterlyPrice: 6300,
    quarterlyNote: 'Billed every 3 months · +5% on the annual price',
    scope: '10 users · 25 products · unlimited regulations · 3 sites',
    ctaLabel: 'Start free trial',
    ctaNote: '14-day trial · no credit card',
    badge: 'Most popular',
    badgeTone: 'gold',
    highlighted: true,
    features: [
      { label: 'Everything in Starter, unmetered' },
      { label: 'Regulatory Monitoring — substantive-vs-cosmetic change filtering' },
      { label: 'Impact analysis on your obligations, products and scores' },
      { label: 'Missing-regulation detection' },
      { label: 'Qurelio AI Assistant — cited Q&A over your Compliance Memory' },
      { label: 'Audit-Readiness Dossier + PDF / Excel / PowerPoint export' },
      { label: 'Priority email + chat support · assisted onboarding included' },
    ],
  },
  {
    name: 'Enterprise',
    description: 'Multi-site, multi-supplier, configured to your quality system.',
    price: null,
    priceNote: '€5,000 / month minimum · scoped to sites, products & markets',
    quarterlyPrice: null,
    quarterlyNote: 'Semi-annual billing available on request',
    scope: 'Unlimited users, products & regulations · multi-site consolidation',
    ctaLabel: 'Request a quote',
    ctaNote: 'tailored scope · no fixed price',
    features: [
      { label: 'Everything in Professional' },
      { label: 'Supplier Quality Management — AVL, scorecards, risk tiering, SCAR' },
      { label: 'External Supplier Portal with isolated access' },
      { label: 'Multi-site portfolio — consolidated and per-site scoring' },
      { label: 'Configurable scoring, custom roles & external auditor access' },
      { label: 'SSO (Google, Microsoft, SAML 2.0) · public API & webhooks' },
      { label: 'Dedicated Customer Success Manager + contractual SLA' },
    ],
  },
];

type BillingMode = 'annual' | 'quarterly';

const numberFormatter = new Intl.NumberFormat('en-US');

export function PricingSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [billing, setBilling] = useState<BillingMode>('annual');

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
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .pricing-root {
          font-family: "Poppins", -apple-system, system-ui, sans-serif;
          position: relative;
          overflow: hidden;
          padding: 110px 40px 130px;
          box-sizing: border-box;
          background:
            radial-gradient(ellipse 65% 45% at 50% 0%, rgba(77, 146, 196, 0.06), transparent 70%),
            radial-gradient(ellipse 55% 35% at 50% 100%, rgba(255, 232, 168, 0.10), transparent 70%),
            linear-gradient(180deg, #FBFAF7 0%, #FFFFFF 60%, #FBFAF7 100%);
        }
        .pricing-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 18% 28%, rgba(77, 146, 196, 0.05) 0%, transparent 32%),
            radial-gradient(circle at 82% 72%, rgba(255, 193, 7, 0.045) 0%, transparent 36%);
          pointer-events: none;
        }

        .pricing-inner { position: relative; max-width: 1320px; margin: 0 auto; }

        /* ─── Heading ─── */
        .pricing-eyebrow {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--brand-accent);
          font-weight: 600;
          margin: 0 0 18px;
        }
        .pricing-heading {
          font-size: clamp(36px, 5vw, 60px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #1C1917;
          text-align: center;
          line-height: 1.08;
          margin: 0 auto 18px;
          max-width: 760px;
        }
        .pricing-heading em {
          font-style: normal;
          font-weight: 700;
          background: linear-gradient(90deg, #4D92C4 0%, #3F7BAB 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pricing-sub {
          font-size: clamp(16px, 1.5vw, 18px);
          color: #78716C;
          line-height: 1.65;
          text-align: center;
          max-width: 640px;
          margin: 0 auto 34px;
          font-weight: 400;
        }

        /* ─── Header entrance ─── */
        .pricing-root .pricing-eyebrow,
        .pricing-root .pricing-heading,
        .pricing-root .pricing-sub,
        .pricing-root .pricing-frame {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(2px);
          transition:
            opacity 1.3s cubic-bezier(0.16, 1, 0.3, 1),
            transform 1.3s cubic-bezier(0.16, 1, 0.3, 1),
            filter 1.0s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: opacity, transform, filter;
        }
        .pricing-root.is-in-view .pricing-eyebrow,
        .pricing-root.is-in-view .pricing-heading,
        .pricing-root.is-in-view .pricing-sub,
        .pricing-root.is-in-view .pricing-frame {
          opacity: 1; transform: none; filter: blur(0);
        }
        .pricing-root.is-in-view .pricing-eyebrow { transition-delay: 0.08s; }
        .pricing-root.is-in-view .pricing-heading { transition-delay: 0.20s; }
        .pricing-root.is-in-view .pricing-sub     { transition-delay: 0.34s; }
        .pricing-root.is-in-view .pricing-frame   { transition-delay: 0.50s; }

        /* ─── Billing toggle ─── */
        .pricing-billing {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin: 0 auto 44px;
          padding: 5px;
          background: rgba(244, 241, 235, 0.75);
          border: 1px solid rgba(231, 229, 224, 0.95);
          border-radius: 100px;
        }
        .pricing-billing-wrap { display: flex; justify-content: center; }
        .pricing-billing button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: #78716C;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 100px;
          padding: 9px 20px;
          cursor: pointer;
          transition:
            background 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.3s ease,
            box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pricing-billing button:hover { color: #44403C; }
        .pricing-billing button.on {
          background: #FFFFFF;
          color: #1C1917;
          border-color: rgba(231, 229, 224, 0.9);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 6px 16px -10px rgba(15, 23, 42, 0.22);
        }
        .pricing-billing button:focus-visible {
          box-shadow: 0 0 0 3px rgba(77, 146, 196, 0.28);
        }
        .pricing-billing .tag {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #3F7BAB;
          background: rgba(77, 146, 196, 0.12);
          border-radius: 100px;
          padding: 3px 7px;
          line-height: 1;
        }

        /* ─── Price context note under the grid ─── */
        .pricing-context {
          max-width: 780px;
          margin: 42px auto 0;
          text-align: center;
          font-size: 12.5px;
          line-height: 1.8;
          color: #8C8681;
          font-weight: 400;
        }
        .pricing-context b { color: #44403C; font-weight: 600; }

        /* ─── Outer frame ─── */
        .pricing-frame {
          position: relative;
          background:
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(77, 146, 196, 0.05), transparent 70%),
            linear-gradient(180deg, #FFFFFF 0%, #FDFCF9 100%);
          border: 1px solid rgba(231, 229, 224, 0.85);
          border-radius: 28px;
          padding: 18px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 18px 50px -32px rgba(15, 23, 42, 0.16);
        }
        .pricing-frame::before {
          content: '';
          position: absolute;
          left: 14%; right: 14%; top: -1px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(77, 146, 196, 0.4) 50%, transparent);
          pointer-events: none;
        }

        .pricing-grid {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          align-items: stretch;
          gap: 0;
        }

        @media (max-width: 1180px) {
          .pricing-grid    { grid-template-columns: repeat(2, 1fr); }
          .pricing-divider { display: none; }
        }

        @media (max-width: 760px) {
          .pricing-frame   { padding: 12px; border-radius: 22px; }
          .pricing-grid    { grid-template-columns: 1fr; gap: 0; }
          .pricing-root    { padding: 90px 22px 110px; }
        }

        /* Vertical separators */
        .pricing-divider {
          position: absolute;
          top: 28px; bottom: 28px;
          width: 1px;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(168, 162, 158, 0.30) 18%,
            rgba(168, 162, 158, 0.30) 82%,
            transparent 100%
          );
          pointer-events: none;
        }
        .pricing-divider.d1 { left: 25%; }
        .pricing-divider.d2 { left: 50%; }
        .pricing-divider.d3 { left: 75%; }

        @media (max-width: 760px) {
          .pricing-divider-h {
            position: relative;
            height: 1px;
            margin: 0 28px;
            background: linear-gradient(
              to right,
              transparent 0%,
              rgba(168, 162, 158, 0.30) 50%,
              transparent 100%
            );
          }
        }
        @media (min-width: 761px) {
          .pricing-divider-h { display: none; }
        }

        /* ─── Card base ─── */
        .pricing-card {
          position: relative;
          padding: 44px 24px 34px;
          display: flex;
          flex-direction: column;
          background: transparent;
          border-radius: 18px;
          transition:
            transform 0.6s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          z-index: 1;
          /* Staggered entry */
          opacity: 0;
          transform: translateY(20px);
        }
        .pricing-root.is-in-view .pricing-card {
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity 1.0s cubic-bezier(0.22, 1, 0.36, 1),
            transform 1.0s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          transition-delay: calc(0.68s + var(--idx, 0) * 0.14s);
        }
        .pricing-card:hover { transform: translateY(-4px); }

        /* ─── Featured card: brand-tinted, with a slow aurora breathing bg ─── */
        .pricing-card.featured {
          background:
            radial-gradient(ellipse 100% 55% at 50% 0%, rgba(77, 146, 196, 0.10), transparent 75%),
            linear-gradient(180deg, #FFFFFF 0%, #F4F8FD 100%);
          z-index: 3;
        }
        .pricing-card.featured::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 18px;
          padding: 1px;
          background: linear-gradient(
            145deg,
            rgba(77, 146, 196, 0.35) 0%,
            rgba(255, 193, 7, 0.18) 50%,
            rgba(77, 146, 196, 0.30) 100%
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
          background-size: 200% 200%;
          animation: pricing-aurora 14s ease-in-out infinite;
        }
        @keyframes pricing-aurora {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        .pricing-card.featured:hover {
          transform: translateY(-6px);
        }

        /* "Most Popular" tab: brand blue (cohesive with rest of design) */
        .pricing-popular-tab {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 600;
          color: #FFFFFF;
          background: linear-gradient(180deg, #5BA3D2 0%, #4D92C4 100%);
          border: 1px solid rgba(77, 146, 196, 0.55);
          padding: 7px 14px;
          border-radius: 100px;
          line-height: 1;
          white-space: nowrap;
        }
        .pricing-popular-tab svg {
          width: 10px;
          height: 10px;
        }
        .pricing-popular-tab.gold {
          color: #4A3B0B;
          background: linear-gradient(180deg, #FFD966 0%, #F5C518 100%);
          border-color: rgba(180, 140, 20, 0.55);
        }

        .pricing-name {
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.20em;
          text-transform: uppercase;
          color: #57534E;
          margin: 0 0 8px;
        }
        .pricing-card.featured .pricing-name { color: #3F7BAB; }

        .pricing-desc {
          font-size: 13px;
          color: #78716C;
          line-height: 1.6;
          margin: 0 0 26px;
          font-weight: 400;
          min-height: 62px;
        }

        /* Price block */
        .pricing-price-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 6px;
          min-height: 58px;
        }
        .pricing-price-currency {
          font-size: 18px;
          font-weight: 600;
          color: #A8A29E;
          letter-spacing: -0.01em;
          align-self: flex-start;
          margin-top: 10px;
        }
        .pricing-card.featured .pricing-price-currency { color: #4D92C4; }
        .pricing-price {
          font-size: 44px;
          font-weight: 700;
          letter-spacing: -0.038em;
          color: #1C1917;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .pricing-card.featured .pricing-price {
          background: linear-gradient(180deg, #1C1917 0%, #3F7BAB 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pricing-price.is-text {
          font-size: 24px;
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.015em;
          align-self: center;
        }
        .pricing-period {
          font-size: 12.5px;
          color: #A8A29E;
          margin: 6px 0 0;
          font-weight: 500;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .pricing-price-note {
          font-size: 12px;
          color: #8C8681;
          line-height: 1.5;
          margin: 8px 0 0;
          font-weight: 400;
          min-height: 36px;
        }
        .pricing-card.featured .pricing-price-note { color: #5C7E9B; }

        /* User range: chip-style instead of horizontal lines */
        .pricing-userrange {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 18px 0 24px;
          padding: 9px 14px;
          background: rgba(244, 241, 235, 0.6);
          border: 1px solid rgba(231, 229, 224, 0.9);
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          color: #44403C;
          letter-spacing: 0.01em;
          line-height: 1.5;
          border-radius: 14px;
        }
        .pricing-card.featured .pricing-userrange {
          background: rgba(77, 146, 196, 0.08);
          border-color: rgba(77, 146, 196, 0.22);
          color: #3F7BAB;
        }
        .pricing-userrange-dot {
          width: 5px;
          height: 5px;
          margin-top: 6px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #A8A29E;
        }
        .pricing-card.featured .pricing-userrange-dot { background: #4D92C4; }

        /* Soft divider above features */
        .pricing-features-rule {
          height: 1px;
          margin: 4px 0 22px;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(168, 162, 158, 0.30) 20%,
            rgba(168, 162, 158, 0.30) 80%,
            transparent 100%
          );
        }
        .pricing-card.featured .pricing-features-rule {
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(77, 146, 196, 0.30) 20%,
            rgba(77, 146, 196, 0.30) 80%,
            transparent 100%
          );
        }

        .pricing-features {
          list-style: none;
          padding: 0;
          margin: 0 0 32px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pricing-feature {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          font-size: 12.5px;
          color: #44403C;
          line-height: 1.55;
          font-weight: 400;
          /* per-item staggered enter */
          opacity: 0;
          transform: translateY(6px);
          transition:
            opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
          transition-delay: calc(0.86s + var(--idx, 0) * 0.14s + var(--fi, 0) * 0.10s);
        }
        .pricing-root.is-in-view .pricing-feature {
          opacity: 1;
          transform: translateY(0);
        }
        .pricing-feature-dot {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          margin-top: 1px;
          border-radius: 50%;
          flex-shrink: 0;
          background: #F4F1EB;
          color: #57534E;
          transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pricing-card:hover .pricing-feature-dot { transform: scale(1.08); }
        .pricing-card.featured .pricing-feature-dot {
          background: linear-gradient(180deg, #5BA3D2 0%, #4D92C4 100%);
          color: #FFFFFF;
        }

        /* ─── CTA ─── */
        .pricing-cta {
          position: relative;
          overflow: hidden;
          width: 100%;
          padding: 13px 22px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.005em;
          border-radius: 100px;
          cursor: pointer;
          outline: none;
          margin-top: auto;
          transition:
            background 0.35s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.35s ease,
            transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pricing-cta.outline {
          background: #FFFFFF;
          border: 1px solid #E1DED7;
          color: #1C1917;
        }
        .pricing-cta.outline:hover {
          background: #FBFAF7;
          border-color: #4D92C4;
          color: #4D92C4;
          transform: translateY(-1.5px);
        }
        .pricing-cta.solid {
          background: linear-gradient(135deg, #4D92C4 0%, #3F7BAB 100%);
          border: 1px solid rgba(63, 123, 171, 0.5);
          color: #FFFFFF;
        }
        .pricing-cta.solid:hover {
          transform: translateY(-1.5px);
        }
        /* Sheen sweep on CTA hover (only on solid) */
        .pricing-cta.solid::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%);
          transform: translateX(-110%);
          transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
        }
        .pricing-cta.solid:hover::after {
          transform: translateX(110%);
        }
        .pricing-cta:focus-visible {
          box-shadow: 0 0 0 3px rgba(77, 146, 196, 0.28);
        }
        .pricing-cta-note {
          font-size: 11px;
          color: #A8A29E;
          text-align: center;
          margin: 10px 0 0;
          line-height: 1.5;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .pricing-card, .pricing-feature {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <section
        ref={sectionRef}
        className={`pricing-root${inView ? ' is-in-view' : ''}`}
        aria-label="Pricing"
        id="pricing"
      >
        <div className="pricing-inner">
          <p className="pricing-eyebrow">Pricing</p>
          <h2 className="pricing-heading">
            Simple, <em>transparent</em> pricing
          </h2>
          <p className="pricing-sub">
            Choose the plan that fits your regulatory complexity. Annual contracts, no implementation
            fee, no hidden costs. The legal guardrail, the human-in-the-loop quarantine and the audit
            trail are in <strong style={{ fontWeight: 600, color: '#44403C' }}>every</strong> plan —
            what scales is your portfolio, not your safety.
          </p>

          <div className="pricing-billing-wrap">
            <div className="pricing-billing" role="group" aria-label="Billing period">
              <button
                type="button"
                className={billing === 'annual' ? 'on' : undefined}
                aria-pressed={billing === 'annual'}
                onClick={() => setBilling('annual')}
              >
                Annual
              </button>
              <button
                type="button"
                className={billing === 'quarterly' ? 'on' : undefined}
                aria-pressed={billing === 'quarterly'}
                onClick={() => setBilling('quarterly')}
              >
                Quarterly <span className="tag">+5%</span>
              </button>
            </div>
          </div>

          <div className="pricing-frame">
            <div className="pricing-grid">
              <div aria-hidden className="pricing-divider d1" />
              <div aria-hidden className="pricing-divider d2" />
              <div aria-hidden className="pricing-divider d3" />

              {plans.map((plan, i) => (
                <Fragment key={plan.name}>
                  {i > 0 && <div aria-hidden className="pricing-divider-h" />}
                  <PricingCard plan={plan} index={i} billing={billing} />
                </Fragment>
              ))}
            </div>
          </div>

          <p className="pricing-context">
            <b>How does Qurelio compare?</b> eQMS platforms for regulated industries range from
            $5,000–$15,000 / year for small teams to $25,000–$100,000+ / year for mid-market
            (SimplerQMS, Qualio, Greenlight Guru). Qurelio&rsquo;s Professional plan, at €24,000 / year
            for 10 users, includes regulatory monitoring and AI compliance analysis — capabilities not
            included in standard eQMS pricing. No implementation fee. No per-module add-ons for core
            quality operations.
          </p>
        </div>
      </section>
    </>
  );
}

function PricingCard({
  plan,
  index,
  billing,
}: {
  plan: Plan;
  index: number;
  billing: BillingMode;
}) {
  const cardClass = plan.highlighted ? 'pricing-card featured' : 'pricing-card';
  const ctaClass = plan.highlighted ? 'pricing-cta solid' : 'pricing-cta outline';

  const isCustom = plan.price === null;
  // Plans without a quarterly option keep their annual figure and only swap the note.
  const isQuarterly = billing === 'quarterly';
  const showQuarterlyPrice = isQuarterly && plan.quarterlyPrice !== null;
  const amount = showQuarterlyPrice ? plan.quarterlyPrice : plan.price;
  const period = showQuarterlyPrice ? 'per quarter' : 'per year';
  const note = isQuarterly ? plan.quarterlyNote : plan.priceNote;

  return (
    <div
      className={cardClass}
      style={{ ['--idx' as string]: index } as React.CSSProperties}
    >
      {plan.badge && (
        <span
          className={`pricing-popular-tab${plan.badgeTone === 'gold' ? ' gold' : ''}`}
        >
          <Sparkles aria-hidden />
          {plan.badge}
        </span>
      )}

      <h3 className="pricing-name">{plan.name}</h3>
      <p className="pricing-desc">{plan.description}</p>

      <div className="pricing-price-row">
        {isCustom ? (
          <span className="pricing-price is-text">Tailored to your industry</span>
        ) : (
          <>
            <span className="pricing-price-currency">€</span>
            <span className="pricing-price">
              {numberFormatter.format(amount as number)}
            </span>
          </>
        )}
      </div>
      <p className="pricing-period">{isCustom ? 'On request' : period}</p>
      <p className="pricing-price-note">{note}</p>

      <span className="pricing-userrange">
        <span className="pricing-userrange-dot" aria-hidden />
        {plan.scope}
      </span>

      <div className="pricing-features-rule" aria-hidden />

      <ul className="pricing-features">
        {plan.features.map((feature, fi) => (
          <li
            key={feature.label}
            className="pricing-feature"
            style={{ ['--fi' as string]: fi } as React.CSSProperties}
          >
            <span className="pricing-feature-dot" aria-hidden>
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {feature.label}
          </li>
        ))}
      </ul>

      <button type="button" className={ctaClass}>
        <span style={{ position: 'relative', zIndex: 1 }}>{plan.ctaLabel}</span>
      </button>
      <p className="pricing-cta-note">{plan.ctaNote}</p>
    </div>
  );
}
