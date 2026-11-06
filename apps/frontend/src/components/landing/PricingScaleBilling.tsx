'use client';

import { useEffect, useRef, useState } from 'react';

type AddOn = {
  label: string;
  /** null → not available on that plan */
  starter: string | null;
  professional: string | null;
  enterprise: string | null;
};

const addOns: AddOn[] = [
  { label: 'Additional user', starter: '€90 / mo', professional: '€80 / mo', enterprise: '€75 / mo' },
  { label: 'Products — pack of 10', starter: '€1,200 / yr', professional: '€900 / yr', enterprise: 'Included' },
  { label: 'Active regulations — pack of 5', starter: '€1,800 / yr', professional: 'Included', enterprise: 'Included' },
  { label: 'Additional site / legal entity', starter: null, professional: '€2,400 / yr', enterprise: 'Included' },
  { label: 'AI evaluation runs — pack of 10', starter: '€600', professional: 'Fair use', enterprise: 'Included' },
  { label: 'Supplier Portal seats — pack of 25', starter: null, professional: null, enterprise: '€3,000 / yr' },
];

const billingTerms: { term: string; detail: React.ReactNode }[] = [
  { term: 'Standard', detail: 'Annual, billed once per year. Lowest price.' },
  { term: 'Quarterly', detail: 'Starter and Professional, +5% on the annual price.' },
  { term: 'Semi-annual', detail: 'Enterprise, on request.' },
  {
    term: 'Implementation',
    detail: (
      <>
        <strong>None.</strong> Onboarding is included in every plan at no extra charge.
      </>
    ),
  },
  {
    term: 'Contract',
    detail: 'Minimum 12 months. Auto-renews unless cancelled 30 days before the renewal date.',
  },
  { term: 'Changes', detail: 'Upgrade any time, prorated. Downgrades take effect at renewal.' },
];

export function PricingScaleBilling() {
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
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .sb-root {
          font-family: "Poppins", -apple-system, system-ui, sans-serif;
          position: relative;
          overflow: hidden;
          padding: 96px 40px 110px;
          box-sizing: border-box;
          background:
            radial-gradient(ellipse 55% 40% at 50% 100%, rgba(255, 232, 168, 0.12), transparent 70%),
            linear-gradient(180deg, #FBFAF7 0%, #FFFFFF 100%);
        }
        .sb-inner { position: relative; max-width: 1180px; margin: 0 auto; }

        .sb-eyebrow {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--brand-accent, #4D92C4);
          font-weight: 600;
          margin: 0 0 18px;
        }
        .sb-heading {
          font-size: clamp(30px, 4.2vw, 48px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #1C1917;
          text-align: center;
          line-height: 1.1;
          margin: 0 auto 16px;
          max-width: 760px;
        }
        .sb-heading em {
          font-style: normal;
          background: linear-gradient(90deg, #4D92C4 0%, #3F7BAB 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .sb-sub {
          font-size: clamp(15px, 1.4vw, 17px);
          color: #78716C;
          line-height: 1.65;
          text-align: center;
          max-width: 620px;
          margin: 0 auto 54px;
        }

        /* entrance */
        .sb-root .sb-eyebrow,
        .sb-root .sb-heading,
        .sb-root .sb-sub,
        .sb-root .sb-panel {
          opacity: 0;
          transform: translateY(16px);
          filter: blur(2px);
          transition:
            opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1),
            transform 1.2s cubic-bezier(0.16, 1, 0.3, 1),
            filter 0.9s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sb-root.is-in-view .sb-eyebrow,
        .sb-root.is-in-view .sb-heading,
        .sb-root.is-in-view .sb-sub,
        .sb-root.is-in-view .sb-panel {
          opacity: 1; transform: none; filter: blur(0);
        }
        .sb-root.is-in-view .sb-eyebrow { transition-delay: 0.06s; }
        .sb-root.is-in-view .sb-heading { transition-delay: 0.16s; }
        .sb-root.is-in-view .sb-sub     { transition-delay: 0.26s; }
        .sb-root.is-in-view .sb-panel   { transition-delay: calc(0.36s + var(--i, 0) * 0.12s); }

        .sb-grid {
          display: grid;
          grid-template-columns: 1.35fr 1fr;
          gap: 22px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .sb-root { padding: 80px 20px 92px; }
          .sb-grid { grid-template-columns: 1fr; }
        }

        .sb-panel {
          background: linear-gradient(180deg, #FFFFFF 0%, #FDFCF9 100%);
          border: 1px solid rgba(231, 229, 224, 0.85);
          border-radius: 22px;
          padding: 30px 26px 26px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 18px 50px -34px rgba(15, 23, 42, 0.18);
        }
        .sb-panel h3 {
          font-size: 19px;
          font-weight: 700;
          letter-spacing: -0.015em;
          color: #1C1917;
          margin: 0 0 6px;
        }
        .sb-panel .sb-panel-sub {
          font-size: 13px;
          color: #8C8681;
          line-height: 1.6;
          margin: 0 0 22px;
        }

        /* add-on table */
        .sb-tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .sb-tbl {
          width: 100%;
          min-width: 440px;
          border-collapse: collapse;
          font-size: 13px;
        }
        .sb-tbl th {
          padding: 0 12px 12px;
          text-align: center;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #A8A29E;
          border-bottom: 1px solid rgba(231, 229, 224, 0.95);
          white-space: nowrap;
        }
        .sb-tbl th:first-child { text-align: left; padding-left: 0; }
        .sb-tbl td {
          padding: 13px 12px;
          border-bottom: 1px solid rgba(231, 229, 224, 0.55);
          text-align: center;
          font-size: 12.5px;
          font-weight: 500;
          color: #44403C;
          white-space: nowrap;
        }
        .sb-tbl td:first-child {
          text-align: left;
          padding-left: 0;
          font-weight: 400;
          color: #57534E;
          white-space: normal;
          line-height: 1.5;
        }
        .sb-tbl td.na { color: #D6D1CA; font-weight: 700; }
        .sb-tbl td.inc { color: #3F7BAB; font-weight: 600; }
        .sb-tbl tbody tr:last-child td { border-bottom: none; }
        .sb-tbl tbody tr:hover td { background: rgba(244, 241, 235, 0.45); }

        /* billing definition list */
        .sb-dl { display: flex; flex-direction: column; gap: 0; }
        .sb-dl-row {
          display: grid;
          grid-template-columns: 118px 1fr;
          gap: 14px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(231, 229, 224, 0.55);
        }
        .sb-dl-row:last-child { border-bottom: none; }
        .sb-dl dt {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #4D92C4;
          padding-top: 2px;
        }
        .sb-dl dd {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.6;
          color: #57534E;
        }
        .sb-dl dd strong { color: #1C1917; font-weight: 700; }

        @media (max-width: 520px) {
          .sb-dl-row { grid-template-columns: 1fr; gap: 4px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sb-root *, .sb-root *::before, .sb-root *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .sb-root .sb-eyebrow, .sb-root .sb-heading, .sb-root .sb-sub, .sb-root .sb-panel {
            opacity: 1 !important; transform: none !important; filter: none !important;
          }
        }
      `}</style>

      <section
        ref={sectionRef}
        className={`sb-root${inView ? ' is-in-view' : ''}`}
        aria-label="Scale and billing"
        id="billing"
      >
        <div className="sb-inner">
          <p className="sb-eyebrow">Scale &amp; billing</p>
          <h2 className="sb-heading">
            You only pay for <em>what you monitor</em>
          </h2>
          <p className="sb-sub">
            Every plan extends along the four dimensions that actually grow with your portfolio:
            users, products, regulations and evaluation runs.
          </p>

          <div className="sb-grid">
            <div className="sb-panel" style={{ ['--i' as string]: 0 } as React.CSSProperties}>
              <h3>Add-ons</h3>
              <p className="sb-panel-sub">
                Added at any time, prorated to your current billing period.
              </p>
              <div className="sb-tbl-wrap">
                <table className="sb-tbl">
                  <thead>
                    <tr>
                      <th scope="col">Add-on</th>
                      <th scope="col">Starter</th>
                      <th scope="col">Professional</th>
                      <th scope="col">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addOns.map((addOn) => (
                      <tr key={addOn.label}>
                        <td>{addOn.label}</td>
                        <AddOnCell value={addOn.starter} />
                        <AddOnCell value={addOn.professional} />
                        <AddOnCell value={addOn.enterprise} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sb-panel" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
              <h3>Billing</h3>
              <p className="sb-panel-sub">All prices in EUR. Invoices issued in EUR.</p>
              <dl className="sb-dl">
                {billingTerms.map((item) => (
                  <div className="sb-dl-row" key={item.term}>
                    <dt>{item.term}</dt>
                    <dd>{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function AddOnCell({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <td className="na">
        <span aria-label="not available">—</span>
      </td>
    );
  }
  return <td className={value === 'Included' ? 'inc' : undefined}>{value}</td>;
}
