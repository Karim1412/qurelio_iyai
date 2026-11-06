'use client';

import { Fragment, useEffect, useRef, useState } from 'react';

/** true → included · false → not included · string → a qualified value */
type Cell = boolean | string;

type Row = { label: string; cells: [Cell, Cell, Cell, Cell] };
type Group = { title: string; rows: Row[] };

const columns = [
  { name: 'Early Access', price: '€6,000 / yr' },
  { name: 'Starter', price: '€9,600 / yr' },
  { name: 'Professional', price: '€24,000 / yr' },
  { name: 'Enterprise', price: 'On request' },
];

/** index of the highlighted column (Professional) */
const HL = 2;

const groups: Group[] = [
  {
    title: 'Scope',
    rows: [
      { label: 'Users', cells: ['5 · worldwide', '3', '10', 'Unlimited'] },
      { label: 'Products in registry', cells: ['25', '3', '25', 'Unlimited'] },
      { label: 'Active regulations', cells: ['Unlimited', '2', 'Unlimited', 'Unlimited'] },
      { label: 'AI evaluation runs / year', cells: ['Fair use', '4', 'Fair use', 'Unlimited'] },
      { label: 'Sites / legal entities', cells: ['3', '1', '3', 'Unlimited'] },
    ],
  },
  {
    title: 'Pillar 1 — Context & Memory',
    rows: [
      { label: 'Onboarding wizard & organizational profile', cells: [true, true, true, true] },
      { label: 'Product folder ingestion → Compliance Memory', cells: [true, true, true, true] },
      { label: 'Product Registry & regulatory profile', cells: [true, true, true, true] },
      { label: 'OCR & text extraction', cells: [true, true, true, true] },
    ],
  },
  {
    title: 'Pillar 2 — Compliance Engine',
    rows: [
      { label: 'Public-regulation upload & analysis', cells: [true, true, true, true] },
      { label: 'Obligation extraction, cited to the source passage', cells: [true, true, true, true] },
      { label: 'Obligations Register + liability acceptance', cells: [true, true, true, true] },
      { label: 'Gap list & evidence mapping', cells: [true, true, true, true] },
      { label: 'Compliance score (criticality-weighted)', cells: [true, true, true, 'Configurable'] },
      { label: '5-level maturity model', cells: [true, true, true, 'Configurable'] },
      { label: 'Confidence indicators on every AI output', cells: [true, true, true, true] },
      {
        label: 'Re-evaluation & score history',
        cells: ['+ automatic', 'On demand', '+ automatic', '+ automatic'],
      },
      { label: 'AI-suggested NCs & CAPAs from gaps', cells: [true, true, true, true] },
    ],
  },
  {
    title: 'Pillar 3 — Regulatory Monitoring',
    rows: [
      { label: 'Monitored source registry', cells: [true, false, true, true] },
      { label: 'Scheduled change detection (cosmetic changes filtered)', cells: [true, false, true, true] },
      { label: 'Impact analysis on your obligations & scores', cells: [true, false, true, true] },
      { label: 'Missing-regulation detection', cells: [true, false, true, true] },
      { label: 'Severity-based alerts', cells: [true, false, true, true] },
    ],
  },
  {
    title: 'Pillar 4 — Quality Operations',
    rows: [
      { label: 'File Library — versioning, approval, ACL, search', cells: [true, true, true, true] },
      { label: 'Non-Conformities', cells: [true, true, true, true] },
      { label: 'CAPA lifecycle & effectiveness verification', cells: [true, true, true, true] },
      { label: 'Internal audits, checklists, findings → NC', cells: [true, true, true, true] },
      { label: 'Root-cause: 5-Whys · Ishikawa', cells: [true, true, true, true] },
      { label: 'Root-cause: 8D', cells: [true, false, true, true] },
      { label: 'Action Plan Center · Kanban · calendar', cells: [true, true, true, true] },
      { label: 'Training portal & competency matrix', cells: [true, true, true, true] },
      { label: 'Supplier Quality — AVL, scorecards, SCAR', cells: [false, false, false, true] },
      { label: 'External Supplier Portal', cells: [false, false, false, true] },
      {
        label: 'Management Review · Change Control · Calibration · CSAT · HSE',
        cells: [false, false, false, true],
      },
    ],
  },
  {
    title: 'Pillar 5 — Intelligence & Control',
    rows: [
      { label: 'Legal Guardrail — pre-upload liability consent', cells: [true, true, true, true] },
      { label: 'Legal Guardrail — licensed-standard detection & block', cells: [true, true, true, true] },
      { label: 'HITL Quarantine on every AI output', cells: [true, true, true, true] },
      { label: 'AI disclosure label on every AI output', cells: [true, true, true, true] },
      { label: 'Quarantine inbox & transition history', cells: [true, true, true, true] },
      { label: 'Qurelio AI Assistant (cited, tenant-scoped)', cells: [true, false, true, true] },
      {
        label: 'Dashboard & KPIs',
        cells: ['Full + heatmap', 'Standard', 'Full + heatmap', 'Full + consolidated'],
      },
      { label: 'Audit-readiness score', cells: [true, false, true, true] },
      { label: 'Drill-down & date filtering', cells: [true, false, true, true] },
    ],
  },
  {
    title: 'Reporting & export',
    rows: [
      { label: 'PDF scorecard', cells: [true, false, true, '+ branded'] },
      { label: 'Excel / PowerPoint export', cells: [true, false, true, '+ branded'] },
      { label: 'Audit-Readiness Dossier', cells: [true, false, true, true] },
    ],
  },
  {
    title: 'Platform & security',
    rows: [
      { label: 'Roles', cells: ['5', '3', '5', 'Custom'] },
      { label: 'Scoped External Auditor access', cells: [false, false, false, true] },
      { label: 'SSO — Google · Microsoft · SAML', cells: [false, false, false, true] },
      { label: 'Tenant data isolation', cells: [true, true, true, true] },
      { label: 'Append-only audit trail', cells: [true, true, true, true] },
      { label: 'Audit-log export & retention configuration', cells: [false, false, false, true] },
      { label: 'Public API & webhooks', cells: [false, false, false, true] },
      { label: 'Interface languages', cells: ['FR · EN', 'FR · EN', 'FR · EN', 'FR · EN'] },
    ],
  },
  {
    title: 'Support & onboarding',
    rows: [
      {
        label: 'Onboarding',
        cells: ['Dedicated', 'Self-service', '2 sessions', 'Full programme'],
      },
      { label: 'Support', cells: ['Priority email', 'Email · 48h', 'Email + chat', 'CSM + SLA'] },
      { label: 'Trial', cells: ['Negotiated', '14 days', '14 days', '30-day POC'] },
    ],
  },
];

export function PricingComparison() {
  const sectionRef = useRef<HTMLElement | null>(null);
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
      { threshold: 0.06, rootMargin: '0px 0px -6% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .cmp-root {
          font-family: "Poppins", -apple-system, system-ui, sans-serif;
          position: relative;
          overflow: hidden;
          padding: 96px 40px 110px;
          box-sizing: border-box;
          background:
            radial-gradient(ellipse 60% 40% at 50% 0%, rgba(77, 146, 196, 0.05), transparent 70%),
            linear-gradient(180deg, #FBFAF7 0%, #FFFFFF 55%, #FBFAF7 100%);
        }
        .cmp-inner { position: relative; max-width: 1240px; margin: 0 auto; }

        .cmp-eyebrow {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--brand-accent, #4D92C4);
          font-weight: 600;
          margin: 0 0 18px;
        }
        .cmp-heading {
          font-size: clamp(30px, 4.2vw, 48px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #1C1917;
          text-align: center;
          line-height: 1.1;
          margin: 0 auto 16px;
          max-width: 720px;
        }
        .cmp-heading em {
          font-style: normal;
          background: linear-gradient(90deg, #4D92C4 0%, #3F7BAB 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .cmp-sub {
          font-size: clamp(15px, 1.4vw, 17px);
          color: #78716C;
          line-height: 1.65;
          text-align: center;
          max-width: 560px;
          margin: 0 auto 28px;
        }

        /* entrance */
        .cmp-root .cmp-eyebrow,
        .cmp-root .cmp-heading,
        .cmp-root .cmp-sub,
        .cmp-root .cmp-legend,
        .cmp-root .cmp-tbl-wrap {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(2px);
          transition:
            opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1),
            transform 1.2s cubic-bezier(0.16, 1, 0.3, 1),
            filter 0.9s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cmp-root.is-in-view .cmp-eyebrow,
        .cmp-root.is-in-view .cmp-heading,
        .cmp-root.is-in-view .cmp-sub,
        .cmp-root.is-in-view .cmp-legend,
        .cmp-root.is-in-view .cmp-tbl-wrap {
          opacity: 1; transform: none; filter: blur(0);
        }
        .cmp-root.is-in-view .cmp-eyebrow  { transition-delay: 0.06s; }
        .cmp-root.is-in-view .cmp-heading  { transition-delay: 0.16s; }
        .cmp-root.is-in-view .cmp-sub      { transition-delay: 0.26s; }
        .cmp-root.is-in-view .cmp-legend   { transition-delay: 0.34s; }
        .cmp-root.is-in-view .cmp-tbl-wrap { transition-delay: 0.44s; }

        /* legend */
        .cmp-legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 22px;
          margin: 0 0 30px;
          font-size: 12px;
          color: #8C8681;
        }
        .cmp-legend span { display: inline-flex; align-items: center; gap: 7px; }
        .cmp-legend .yes { color: #3F7BAB; font-weight: 700; }
        .cmp-legend .no  { color: #C4BFB8; font-weight: 700; }

        /* table shell */
        .cmp-tbl-wrap {
          position: relative;
          background: linear-gradient(180deg, #FFFFFF 0%, #FDFCF9 100%);
          border: 1px solid rgba(231, 229, 224, 0.85);
          border-radius: 22px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 18px 50px -34px rgba(15, 23, 42, 0.18);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .cmp-tbl {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
          font-size: 13px;
        }

        .cmp-tbl thead th {
          background: #FFFFFF;
          padding: 20px 14px 18px;
          text-align: center;
          font-size: 13.5px;
          font-weight: 700;
          color: #1C1917;
          letter-spacing: -0.005em;
          border-bottom: 1px solid rgba(231, 229, 224, 0.95);
          white-space: nowrap;
        }
        .cmp-tbl thead th:first-child {
          text-align: left;
          min-width: 300px;
          padding-left: 24px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #A8A29E;
        }
        .cmp-tbl thead th.hl {
          background: linear-gradient(180deg, #F4F8FD 0%, #FFFFFF 100%);
          color: #3F7BAB;
        }
        .cmp-th-price {
          display: block;
          margin-top: 5px;
          font-size: 11.5px;
          font-weight: 500;
          color: #A8A29E;
          letter-spacing: 0;
        }
        .cmp-tbl thead th.hl .cmp-th-price { color: #5C7E9B; }

        /* group rows */
        .cmp-grp td {
          padding: 16px 24px 9px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #4D92C4;
          background: rgba(244, 241, 235, 0.5);
          border-top: 1px solid rgba(231, 229, 224, 0.9);
          border-bottom: 1px solid rgba(231, 229, 224, 0.9);
        }

        .cmp-tbl tbody tr:not(.cmp-grp):hover td { background: rgba(244, 241, 235, 0.45); }
        .cmp-tbl tbody td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(231, 229, 224, 0.55);
          transition: background 0.25s ease;
        }
        .cmp-tbl tbody td:first-child {
          text-align: left;
          padding-left: 24px;
          color: #44403C;
          font-weight: 400;
          line-height: 1.5;
        }
        .cmp-tbl tbody td.cell {
          text-align: center;
          font-weight: 500;
          color: #57534E;
          font-size: 12.5px;
          white-space: nowrap;
        }
        .cmp-tbl tbody td.cell.hl { background: rgba(77, 146, 196, 0.045); }
        .cmp-tbl tbody tr:not(.cmp-grp):hover td.cell.hl { background: rgba(77, 146, 196, 0.08); }
        .cmp-tbl tbody td.cell.yes { color: #3F7BAB; font-weight: 700; font-size: 15px; }
        .cmp-tbl tbody td.cell.no  { color: #D6D1CA; font-weight: 700; font-size: 15px; }
        .cmp-tbl tbody tr:last-child td { border-bottom: none; }

        .cmp-scroll-hint {
          display: none;
          margin: 12px 0 0;
          text-align: center;
          font-size: 11.5px;
          color: #A8A29E;
        }

        @media (max-width: 900px) {
          .cmp-root { padding: 80px 20px 92px; }
          .cmp-scroll-hint { display: block; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cmp-root *, .cmp-root *::before, .cmp-root *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .cmp-root .cmp-eyebrow, .cmp-root .cmp-heading, .cmp-root .cmp-sub,
          .cmp-root .cmp-legend, .cmp-root .cmp-tbl-wrap {
            opacity: 1 !important; transform: none !important; filter: none !important;
          }
        }
      `}</style>

      <section
        ref={sectionRef}
        className={`cmp-root${inView ? ' is-in-view' : ''}`}
        aria-label="Plan comparison"
        id="compare"
      >
        <div className="cmp-inner">
          <p className="cmp-eyebrow">Compare</p>
          <h2 className="cmp-heading">
            Every feature, <em>every plan</em>
          </h2>
          <p className="cmp-sub">
            Organised by the five pillars of the platform. Scroll horizontally on smaller screens.
          </p>

          <div className="cmp-legend">
            <span>
              <b className="yes">✓</b> included
            </span>
            <span>
              <b className="no">✗</b> not included
            </span>
          </div>

          <div className="cmp-tbl-wrap">
            <table className="cmp-tbl">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {columns.map((col, i) => (
                    <th key={col.name} scope="col" className={i === HL ? 'hl' : undefined}>
                      {col.name}
                      <span className="cmp-th-price">{col.price}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="cmp-grp">
                      <td colSpan={5}>{group.title}</td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        {row.cells.map((cell, i) => (
                          <td key={i} className={cellClass(cell, i)}>
                            {typeof cell === 'boolean' ? (
                              <span aria-label={cell ? 'included' : 'not included'}>
                                {cell ? '✓' : '✗'}
                              </span>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cmp-scroll-hint">Scroll the table sideways to see every plan →</p>
        </div>
      </section>
    </>
  );
}

function cellClass(cell: Cell, index: number) {
  const parts = ['cell'];
  if (cell === true) parts.push('yes');
  else if (cell === false) parts.push('no');
  if (index === HL) parts.push('hl');
  return parts.join(' ');
}
