'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from '@/components/icons';

type QA = { q: string; a: React.ReactNode };

const faqs: QA[] = [
  {
    q: 'Is the regulatory content safe to use in a regulated environment?',
    a: (
      <p>
        Qurelio ingests only <strong>public, freely reusable legal texts</strong>. Every regulation in
        your workspace displays its source URL and its legal status, so you can verify it yourself at
        any time. Licensed standards — ISO, IEC and equivalents — are automatically detected on upload
        and are never stored, never embedded, and never sent to an AI model. That is enforced by the
        platform&rsquo;s architecture, not by policy. Where a standard you need is licensed, Qurelio
        tells you which one to acquire and lets you work from your own copy.
      </p>
    ),
  },
  {
    q: 'How does Qurelio handle AI outputs in a regulated environment?',
    a: (
      <>
        <p>
          Every AI output carries a visible AI disclosure and is created in{' '}
          <strong>Quarantine</strong>. Nothing an AI produces becomes executable until your Quality
          Manager reviews it and accepts it — with edit, accept and reject controls and a full
          transition history of who accepted what, and when. Qurelio never makes an autonomous
          compliance decision, and every finding cites the passage of the source text it came from.
        </p>
        <p>
          The AI helps you work faster. You remain responsible. That is exactly what your auditors
          expect.
        </p>
      </>
    ),
  },
  {
    q: 'What happens to our compliance data?',
    a: (
      <p>
        Your data is isolated in a dedicated tenant environment — no other Qurelio client can reach
        your products, regulatory profiles, gap analyses or audit records. We sign a Data Processing
        Agreement before any data enters the system, and the audit trail is append-only. Your
        documents are never used to train a model.
      </p>
    ),
  },
  {
    q: 'Why is the compliance engine included in every plan?',
    a: (
      <p>
        Because it is the reason to use Qurelio. Plans differ by how much you run through it — how
        many products, regulations and evaluation runs — not by whether you get it at all. A Starter
        customer analyses two regulations against three products; an Enterprise customer runs an
        entire multi-site portfolio. Same engine, same guardrails, same audit trail.
      </p>
    ),
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: (
      <p>
        Yes. Upgrade at any time — the difference is prorated from your current billing period.
        Downgrades take effect at the next renewal date. Enterprise clients should speak to their
        Customer Success Manager directly.
      </p>
    ),
  },
  {
    q: 'Is there a free trial, and do you charge for onboarding?',
    a: (
      <>
        <p>
          Starter and Professional include a 14-day free trial, no credit card required. Enterprise
          clients receive a 30-day proof of concept built around their own regulatory context and
          product portfolio.
        </p>
        <p>
          Onboarding is included in every plan at no extra charge — we assist every client personally,
          regardless of plan. We do not charge implementation fees.
        </p>
      </>
    ),
  },
  {
    q: 'What is the Early Access Pilot programme?',
    a: (
      <p>
        An early-access programme open worldwide — the first five manufacturers to join, from any
        country. Pilot clients get the <strong>complete Professional plan</strong> at €6,000 / year,
        with priority for adding their national regulatory sources to the monitored registry — each
        source subject to legal clearance before it goes live. The interface is FR/EN today; Arabic is
        on the roadmap. Standard Professional pricing applies from client 6 onward. After the pilot,
        scope can be customised — users, modules, and regulations adapted to your exact quality
        system. Write to contact@qurelio.com to apply.
      </p>
    ),
  },
  {
    q: 'Can the plan be customised after the pilot?',
    a: (
      <p>
        Yes — and that is the point of the pilot. After your onboarding period, Early Access clients
        and Enterprise clients can adjust scope with us: the number of users, the modules active in
        their workspace, the regulatory sources being monitored, and the add-on dimensions (products,
        regulations, evaluation runs). We scope the arrangement to your actual quality system — not to
        a fixed tier. Contact your onboarding contact or write to contact@qurelio.com to discuss.
      </p>
    ),
  },
];

export function PricingFAQ() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

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
        .faq-root {
          font-family: "Poppins", -apple-system, system-ui, sans-serif;
          position: relative;
          overflow: hidden;
          padding: 96px 40px 110px;
          box-sizing: border-box;
          background:
            radial-gradient(ellipse 60% 40% at 50% 0%, rgba(77, 146, 196, 0.05), transparent 70%),
            linear-gradient(180deg, #FFFFFF 0%, #FBFAF7 100%);
        }
        .faq-inner { position: relative; max-width: 860px; margin: 0 auto; }

        .faq-eyebrow {
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--brand-accent, #4D92C4);
          font-weight: 600;
          margin: 0 0 18px;
        }
        .faq-heading {
          font-size: clamp(30px, 4.2vw, 46px);
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #1C1917;
          text-align: center;
          line-height: 1.12;
          margin: 0 auto 48px;
        }
        .faq-heading em {
          font-style: normal;
          background: linear-gradient(90deg, #4D92C4 0%, #3F7BAB 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .faq-root .faq-eyebrow,
        .faq-root .faq-heading,
        .faq-root .faq-item {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(2px);
          transition:
            opacity 1.1s cubic-bezier(0.16, 1, 0.3, 1),
            transform 1.1s cubic-bezier(0.16, 1, 0.3, 1),
            filter 0.85s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .faq-root.is-in-view .faq-eyebrow,
        .faq-root.is-in-view .faq-heading,
        .faq-root.is-in-view .faq-item {
          opacity: 1; transform: none; filter: blur(0);
        }
        .faq-root.is-in-view .faq-eyebrow { transition-delay: 0.06s; }
        .faq-root.is-in-view .faq-heading { transition-delay: 0.16s; }
        .faq-root.is-in-view .faq-item {
          transition-delay: calc(0.28s + var(--i, 0) * 0.07s);
        }

        .faq-list { display: flex; flex-direction: column; gap: 10px; }

        .faq-item {
          background: linear-gradient(180deg, #FFFFFF 0%, #FDFCF9 100%);
          border: 1px solid rgba(231, 229, 224, 0.85);
          border-radius: 16px;
          overflow: hidden;
          transition:
            border-color 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 1.1s cubic-bezier(0.16, 1, 0.3, 1),
            transform 1.1s cubic-bezier(0.16, 1, 0.3, 1),
            filter 0.85s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .faq-item:hover { border-color: rgba(77, 146, 196, 0.35); }
        .faq-item.open {
          border-color: rgba(77, 146, 196, 0.42);
          box-shadow: 0 14px 40px -30px rgba(15, 23, 42, 0.35);
        }

        .faq-q {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          text-align: left;
          font-family: inherit;
          font-size: 14.5px;
          font-weight: 600;
          letter-spacing: -0.005em;
          color: #1C1917;
          line-height: 1.5;
          background: transparent;
          border: none;
          padding: 20px 22px;
          cursor: pointer;
          transition: color 0.3s ease;
        }
        .faq-item.open .faq-q { color: #3F7BAB; }
        .faq-q:focus-visible {
          outline: none;
          box-shadow: inset 0 0 0 2px rgba(77, 146, 196, 0.32);
        }
        .faq-chevron {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          color: #A8A29E;
          transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease;
        }
        .faq-item.open .faq-chevron { transform: rotate(180deg); color: #4D92C4; }

        .faq-a {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .faq-item.open .faq-a { grid-template-rows: 1fr; }
        .faq-a-inner { overflow: hidden; }
        .faq-a-inner > div { padding: 0 22px 22px; }
        .faq-a p {
          font-size: 13.5px;
          line-height: 1.75;
          color: #57534E;
          margin: 0 0 12px;
        }
        .faq-a p:last-child { margin-bottom: 0; }
        .faq-a strong { color: #1C1917; font-weight: 600; }

        @media (max-width: 900px) {
          .faq-root { padding: 80px 20px 92px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .faq-root *, .faq-root *::before, .faq-root *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .faq-root .faq-eyebrow, .faq-root .faq-heading, .faq-root .faq-item {
            opacity: 1 !important; transform: none !important; filter: none !important;
          }
        }
      `}</style>

      <section
        ref={sectionRef}
        className={`faq-root${inView ? ' is-in-view' : ''}`}
        aria-label="Pricing questions"
        id="pricing-faq"
      >
        <div className="faq-inner">
          <p className="faq-eyebrow">Questions</p>
          <h2 className="faq-heading">
            What RA &amp; QA teams <em>ask us first</em>
          </h2>

          <div className="faq-list">
            {faqs.map((faq, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={faq.q}
                  className={`faq-item${isOpen ? ' open' : ''}`}
                  style={{ ['--i' as string]: i } as React.CSSProperties}
                >
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-btn-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {faq.q}
                    <ChevronDown className="faq-chevron" aria-hidden />
                  </button>
                  <div
                    className="faq-a"
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-btn-${i}`}
                  >
                    <div className="faq-a-inner">
                      <div>{faq.a}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
