'use client';

import React, { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  Layers,
  Package,
  Lock,
  AlertTriangle,
  ArrowRight,
  Upload,
  FileText,
  Check,
  Sparkles,
  Shield,
} from '@/components/icons';
import catalogData from '@/data/regulatory_reference_catalog.json';

/* ── Types (structurally compatible with the page's ScanRow) ─────────────── */
interface ScanItem {
  name: string;
  current: string;
  latest: string;
  outdated: boolean;
}
interface ScanRow {
  projectId: string;
  name: string;
  reference: string;
  items: ScanItem[];
}

/* ── Catalog lookup for enrichment (category, legal status) ──────────────── */
interface CatalogLite {
  reference?: string;
  short_code?: string;
  title?: string;
  category?: string;
  legal_status?: string;
}
const CAT: CatalogLite[] = (catalogData as { catalog: CatalogLite[] }).catalog;
const CAT_BY_NAME = new Map<string, CatalogLite>();
CAT.forEach((e) => {
  if (e.short_code) CAT_BY_NAME.set(e.short_code, e);
  if (e.reference) CAT_BY_NAME.set(e.reference, e);
});

/* ── Illustrative benchmark content (DEMO) ───────────────────────────────── */
const BENCH_METRICS: { from?: string; to: string; label: string }[] = [
  { from: '114', to: '93', label: 'Annex A controls' },
  { from: '14', to: '4', label: 'Domains → themes' },
  { to: '11', label: 'New controls' },
  { from: '57', to: '24', label: 'Merged controls' },
  { to: '23', label: 'Renamed' },
];

const BENCH_IMPACT: { num: string; cls: string; label: React.ReactNode }[] = [
  { num: '69', cls: 'ok', label: <>controls auto-mapped<br />(unchanged / merged)</> },
  { num: '20', cls: 'warn', label: <>controls to review<br />(renamed / modified)</> },
  { num: '4', cls: 'bad', label: <>new controls<br />with no evidence yet</> },
  { num: '7', cls: '', label: <>new controls<br />partially covered</> },
];

type ChangeKind = 'new' | 'merged' | 'modified' | 'renamed';
type Coverage = 'covered' | 'partial' | 'missing';

const BENCH_ROWS: {
  prev: React.ReactNode;
  prevName: string;
  next: React.ReactNode;
  nextName: string;
  changes: { kind: ChangeKind; label: string }[];
  impact: React.ReactNode;
  coverage: Coverage;
  coverageLabel: string;
}[] = [
  { prev: <span className="cl-none">no equivalent</span>, prevName: '', next: <span className="cl-ref">A.5.7</span>, nextName: 'Threat intelligence', changes: [{ kind: 'new', label: 'New' }], impact: 'Brand-new obligation. No policy or evidence on file, which creates a gap for the connected-device risk profile.', coverage: 'missing', coverageLabel: 'Missing' },
  { prev: <span className="cl-none">no equivalent</span>, prevName: '', next: <span className="cl-ref">A.5.23</span>, nextName: 'Information security for use of cloud services', changes: [{ kind: 'new', label: 'New' }], impact: <>Partially met by cloud-hosting policy <span className="cited">DOC-114</span>; supplier-side controls not yet evidenced.</>, coverage: 'partial', coverageLabel: 'Partial' },
  { prev: <span className="cl-none">no equivalent</span>, prevName: '', next: <span className="cl-ref">A.8.28</span>, nextName: 'Secure coding', changes: [{ kind: 'new', label: 'New' }], impact: 'Directly relevant to device firmware. Ties to IEC 62304 software-lifecycle evidence, with no dedicated secure-coding record yet.', coverage: 'missing', coverageLabel: 'Missing' },
  { prev: <span className="cl-none">no equivalent</span>, prevName: '', next: <span className="cl-ref">A.8.12</span>, nextName: 'Data leakage prevention', changes: [{ kind: 'new', label: 'New' }], impact: 'New obligation for therapy-log data paths. No DLP control documented.', coverage: 'missing', coverageLabel: 'Missing' },
  { prev: <><span className="cl-ref">A.5.1.1</span> + <span className="cl-ref">A.5.1.2</span></>, prevName: 'Policies for information security', next: <span className="cl-ref">A.5.1</span>, nextName: 'Policies for information security', changes: [{ kind: 'merged', label: 'Merged' }], impact: 'Two controls consolidated into one. Existing policy evidence maps across automatically. Review scope only.', coverage: 'covered', coverageLabel: 'Covered' },
  { prev: <><span className="cl-ref">A.9.1.1</span> + <span className="cl-ref">A.9.1.2</span></>, prevName: 'Access control policy / network access', next: <span className="cl-ref">A.5.15</span>, nextName: 'Access control', changes: [{ kind: 'merged', label: 'Merged' }, { kind: 'renamed', label: 'Renamed' }], impact: 'Moved to the Organizational theme and merged. Current access-control evidence re-maps; confirm the new control reference.', coverage: 'covered', coverageLabel: 'Covered' },
  { prev: <span className="cl-ref">A.12.4</span>, prevName: 'Logging and monitoring', next: <><span className="cl-ref">A.8.15</span> / <span className="cl-ref">A.8.16</span></>, nextName: 'Logging / Monitoring activities', changes: [{ kind: 'modified', label: 'Modified' }], impact: 'Split and expanded; A.8.16 adds anomaly-monitoring expectations. Existing logging evidence covers part of the new scope.', coverage: 'partial', coverageLabel: 'Partial' },
  { prev: <span className="cl-ref">A.17.1</span>, prevName: 'Information security continuity', next: <span className="cl-ref">A.5.30</span>, nextName: 'ICT readiness for business continuity', changes: [{ kind: 'new', label: 'New' }, { kind: 'modified', label: 'Reframed' }], impact: 'Reframed toward ICT readiness. Business-continuity plan exists but lacks the ICT-readiness testing the new control expects.', coverage: 'partial', coverageLabel: 'Partial' },
];

const FILTERS = ['All changes', 'New (11)', 'Merged (24)', 'Modified (20)', 'Impacts you (11)'];

/* ── Scoped stylesheet: faithful to the mockup, prefixed under .qvb ──────── */
const STYLES = `
.qvb-overlay{position:fixed;inset:0;z-index:60;background:rgba(11,22,32,.42);backdrop-filter:blur(2px)}
.qvb{
  --ink:#0b1620;--ink-2:#16242f;--slate:#5b6b78;--slate-2:#8595a1;
  --line:#e6ebef;--line-2:#d0d9e0;--bg:#ffffff;--bg-soft:#f6f9fa;
  --teal:#0fa493;--teal-deep:#0a7d70;--teal-soft:#e6f6f3;--teal-mid:#d0eeea;
  --gold:#e0a32e;--gold-soft:#fef4e0;--gold-mid:#f5dfa0;
  --danger:#d8553f;--danger-soft:#fdf0ee;--danger-mid:#f5c4bb;
  --success:#27a665;--success-soft:#e8f8f1;--success-mid:#a8e4c8;
  --violet:#6c5ce7;--violet-soft:#eeeafd;--violet-mid:#d6ccfa;
  --blue:#3b5bdb;--blue-soft:#eef3ff;--blue-mid:#c7d4f7;
  --radius:14px;--radius-sm:9px;--radius-xs:6px;
  --shadow-xl:0 20px 60px rgba(11,22,32,.28);
  --ease:cubic-bezier(.22,.61,.36,1);
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:61;
  width:96vw;max-width:1060px;max-height:92vh;display:flex;flex-direction:column;
  background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow-xl);overflow:hidden;line-height:1.6;
  font-family:inherit;animation:qvbpop .32s var(--ease)}
@keyframes qvbpop{from{opacity:0;transform:translate(-50%,-50%) scale(.985)}to{opacity:1;transform:translate(-50%,-50%)}}
.qvb *,.qvb *::before,.qvb *::after{box-sizing:border-box}
.qvb h2,.qvb p,.qvb ul{margin:0}

.qvb .badge{display:inline-flex;align-items:center;gap:5px;font-size:.7rem;font-weight:700;
  padding:3px 9px;border-radius:100px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.qvb .badge .bdot{width:6px;height:6px;border-radius:50%}
.qvb .b-outdated{background:var(--danger-soft);color:var(--danger)} .qvb .b-outdated .bdot{background:var(--danger)}
.qvb .b-current{background:var(--success-soft);color:var(--success)} .qvb .b-current .bdot{background:var(--success)}
.qvb .b-ref{background:var(--gold-soft);color:#a5751a;border:1px solid var(--gold-mid)}
.qvb .cov{font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:100px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.qvb .cov-covered{background:var(--success-soft);color:var(--success)}
.qvb .cov-partial{background:var(--gold-soft);color:#a5751a}
.qvb .cov-missing{background:var(--danger-soft);color:var(--danger)}
.qvb .ct{font-size:.66rem;font-weight:700;padding:2px 8px;border-radius:var(--radius-xs);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.qvb .ct-new{background:var(--violet-soft);color:var(--violet);border:1px solid var(--violet-mid)}
.qvb .ct-merged{background:var(--blue-soft);color:var(--blue);border:1px solid var(--blue-mid)}
.qvb .ct-modified{background:var(--gold-soft);color:#a5751a;border:1px solid var(--gold-mid)}
.qvb .ct-renamed{background:#eef1f3;color:var(--slate);border:1px solid var(--line-2)}
.qvb .demo-flag{font-size:.7rem;font-weight:700;color:var(--gold);background:var(--gold-soft);
  border:1px solid var(--gold-mid);padding:2px 8px;border-radius:100px;white-space:nowrap}

.qvb .btn{font-family:inherit;font-size:.82rem;font-weight:600;padding:10px 16px;border-radius:var(--radius-sm);
  border:1px solid transparent;cursor:pointer;display:inline-flex;align-items:center;gap:7px;
  transition:.18s var(--ease);white-space:nowrap}
.qvb .btn svg{width:15px;height:15px}
.qvb .btn-primary{background:var(--teal);color:#fff;box-shadow:0 4px 14px rgba(15,164,147,.28)}
.qvb .btn-primary:hover{background:var(--teal-deep);transform:translateY(-1px)}
.qvb .btn-ghost{background:var(--bg);color:var(--ink);border-color:var(--line-2)}
.qvb .btn-ghost:hover{border-color:var(--ink);background:var(--bg-soft)}
.qvb .btn-danger{background:var(--danger-soft);color:var(--danger);border-color:var(--danger-mid)}
.qvb .btn-danger:hover{background:var(--danger);color:#fff}
.qvb .btn-sm{padding:6px 11px;font-size:.75rem}

.qvb .m-head{padding:20px 24px;border-bottom:1px solid var(--line);
  display:flex;align-items:flex-start;gap:16px;background:linear-gradient(180deg,var(--bg-soft),var(--bg))}
.qvb .m-eyebrow{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--teal-deep);
  display:flex;align-items:center;gap:7px}
.qvb .m-eyebrow svg{width:14px;height:14px}
.qvb .m-title{font-weight:800;font-size:1.5rem;letter-spacing:-.02em;margin:4px 0 8px;color:var(--ink)}
.qvb .m-context{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.qvb .ctx-chip{display:inline-flex;align-items:center;gap:6px;font-size:.75rem;font-weight:600;color:var(--slate);
  background:var(--bg);border:1px solid var(--line);padding:4px 10px;border-radius:100px}
.qvb .ctx-chip svg{width:13px;height:13px;color:var(--teal)}
.qvb .m-head-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-shrink:0}
.qvb .m-close{width:34px;height:34px;border-radius:var(--radius-sm);border:1px solid var(--line-2);background:var(--bg);
  cursor:pointer;display:grid;place-items:center;color:var(--slate);transition:.18s var(--ease)}
.qvb .m-close:hover{background:var(--danger-soft);color:var(--danger);border-color:var(--danger-mid)}
.qvb .m-close svg{width:17px;height:17px}

.qvb .m-body{padding:22px 24px;overflow-y:auto}
.qvb .sec-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--slate);
  margin:0 0 11px;display:flex;align-items:center;gap:8px}
.qvb .sec-label .num{width:18px;height:18px;border-radius:5px;background:var(--teal-soft);color:var(--teal-deep);
  font-size:.68rem;display:grid;place-items:center;font-weight:800}

.qvb .cswitch{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.qvb .cs-chip{font-size:.75rem;font-weight:600;padding:6px 12px;border-radius:100px;border:1px solid var(--line-2);
  background:var(--bg);color:var(--slate);cursor:pointer;transition:.15s var(--ease);display:inline-flex;align-items:center;gap:6px}
.qvb .cs-chip:hover{border-color:var(--slate)}
.qvb .cs-chip.active{background:var(--teal-soft);color:var(--teal-deep);border-color:var(--teal-mid)}
.qvb .cs-chip .dot{width:6px;height:6px;border-radius:50%;background:var(--success)}
.qvb .cs-chip .dot.warn{background:var(--danger)}

.qvb .vband{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:stretch;margin-bottom:14px}
.qvb .vcard{border:1px solid var(--line);border-radius:var(--radius-sm);padding:15px 16px;background:var(--bg-soft)}
.qvb .vcard.prev{border-color:var(--danger-mid);background:var(--danger-soft)}
.qvb .vcard.next{border-color:var(--success-mid);background:var(--success-soft)}
.qvb .vc-role{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--slate);margin-bottom:7px}
.qvb .vc-ref{font-size:1.15rem;font-weight:800;letter-spacing:-.01em;margin-bottom:9px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.qvb .vc-meta{font-size:.76rem;color:var(--slate);display:flex;flex-direction:column;gap:3px}
.qvb .vc-meta b{color:var(--ink-2);font-weight:600}
.qvb .vband-arrow{display:grid;place-items:center;color:var(--slate-2)}
.qvb .vband-arrow svg{width:26px;height:26px}
.qvb .verdict{display:flex;align-items:center;gap:11px;padding:12px 15px;border-radius:var(--radius-sm);
  background:var(--danger-soft);border:1px solid var(--danger-mid);margin-bottom:22px}
.qvb .verdict svg{width:20px;height:20px;color:var(--danger);flex-shrink:0}
.qvb .verdict b{color:var(--danger)}
.qvb .verdict span{font-size:.83rem;color:var(--ink-2)}

.qvb .metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:22px}
.qvb .mtile{border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 14px;background:var(--bg);text-align:center}
.qvb .mt-val{font-weight:800;font-size:1.25rem;letter-spacing:-.02em;color:var(--ink)}
.qvb .mt-val .arr{color:var(--slate-2);font-weight:600;margin:0 3px}
.qvb .mt-val .to{color:var(--teal-deep)}
.qvb .mt-label{font-size:.68rem;color:var(--slate);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-top:3px}

.qvb .legal{display:flex;gap:13px;padding:14px 16px;border-radius:var(--radius-sm);
  background:var(--gold-soft);border:1px solid var(--gold-mid);margin-bottom:22px}
.qvb .legal svg{width:19px;height:19px;color:var(--gold);flex-shrink:0;margin-top:1px}
.qvb .legal-txt{font-size:.81rem;color:var(--ink-2)}
.qvb .legal-txt b{color:#8a610f}
.qvb .legal .btn{margin-top:9px}

.qvb .impact{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:center;
  border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px 18px;background:var(--bg-soft);margin-bottom:24px}
.qvb .score-delta{display:flex;align-items:baseline;gap:9px}
.qvb .score-old{font-size:1.35rem;font-weight:700;color:var(--slate-2);text-decoration:line-through;text-decoration-thickness:2px}
.qvb .score-arrow{color:var(--slate-2)}
.qvb .score-new{font-size:1.9rem;font-weight:800;color:var(--gold)}
.qvb .score-cap{font-size:.72rem;color:var(--slate);margin-top:3px}
.qvb .impact-break{display:flex;gap:22px;flex-wrap:wrap}
.qvb .ib{display:flex;flex-direction:column;gap:2px}
.qvb .ib-num{font-weight:800;font-size:1.15rem}
.qvb .ib-num.ok{color:var(--success)} .qvb .ib-num.warn{color:var(--gold)} .qvb .ib-num.bad{color:var(--danger)}
.qvb .ib-label{font-size:.73rem;color:var(--slate)}

.qvb .bench-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:11px;flex-wrap:wrap}
.qvb .filters{display:flex;gap:6px;flex-wrap:wrap}
.qvb .fchip{font-size:.73rem;font-weight:600;padding:5px 11px;border-radius:100px;border:1px solid var(--line-2);
  background:var(--bg);color:var(--slate);cursor:pointer;transition:.15s var(--ease)}
.qvb .fchip:hover{border-color:var(--slate)}
.qvb .fchip.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.qvb .bench-note{margin-left:auto;font-size:.74rem;color:var(--slate)}
.qvb .bench-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius-sm)}
.qvb .bench{width:100%;min-width:720px;border-collapse:separate;border-spacing:0;font-size:.82rem}
.qvb .bench th{text-align:left;font-size:.67rem;text-transform:uppercase;letter-spacing:.05em;color:var(--slate);
  font-weight:700;padding:10px 14px;background:var(--bg-soft);border-bottom:1px solid var(--line);white-space:nowrap}
.qvb .bench td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.qvb .bench tr:last-child td{border-bottom:none}
.qvb .bench tr:hover td{background:var(--bg-soft)}
.qvb .cl-ref{font-weight:700;font-size:.78rem;color:var(--ink-2);white-space:nowrap}
.qvb .cl-name{font-size:.8rem;color:var(--ink)}
.qvb .cl-none{color:var(--slate-2);font-style:italic;font-size:.78rem}
.qvb .impact-cell{font-size:.78rem;color:var(--slate)}
.qvb .ct-stack{display:flex;flex-wrap:wrap;gap:4px}

.qvb .airec{border:1px solid var(--violet-mid);border-radius:var(--radius-sm);background:var(--violet-soft);padding:16px 18px;margin-top:24px}
.qvb .airec-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.qvb .airec-head svg{width:17px;height:17px;color:var(--violet)}
.qvb .airec-title{font-weight:700;font-size:.92rem;color:var(--ink)}
.qvb .q-badge{margin-left:auto;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  color:#8a610f;background:var(--gold-soft);border:1px solid var(--gold-mid);padding:3px 9px;border-radius:100px;
  display:inline-flex;align-items:center;gap:5px}
.qvb .q-badge svg{width:12px;height:12px;color:var(--gold)}
.qvb .airec p{font-size:.83rem;color:var(--ink-2);margin-bottom:8px}
.qvb .airec ul{margin:0 0 2px 18px;font-size:.82rem;color:var(--ink-2);list-style:disc}
.qvb .airec li{margin-bottom:4px}
.qvb .airec .cited{color:var(--violet);font-weight:600}

.qvb .m-foot{padding:15px 24px;border-top:1px solid var(--line);display:flex;align-items:center;gap:11px;
  background:var(--bg-soft);flex-wrap:wrap}
.qvb .hitl-note{font-size:.75rem;color:var(--slate-2);margin-right:auto;display:flex;align-items:center;gap:7px}
.qvb .hitl-note svg{width:14px;height:14px;color:var(--gold)}

@media(max-width:900px){
  .qvb .metrics{grid-template-columns:repeat(2,1fr)}
  .qvb .vband{grid-template-columns:1fr}.qvb .vband-arrow{transform:rotate(90deg)}
  .qvb .impact{grid-template-columns:1fr}
}
`;

interface Props {
  row: ScanRow | null;
  onOpenChange: (open: boolean) => void;
}

export function VersionBenchmarkModal({ row, onOpenChange }: Props) {
  // Which compliance within the project is being benchmarked.
  const defaultIdx = useMemo(() => {
    if (!row) return 0;
    const i = row.items.findIndex((it) => it.outdated);
    return i >= 0 ? i : 0;
  }, [row]);
  const [focusIdx, setFocusIdx] = useState(defaultIdx);
  const [filter, setFilter] = useState(0);

  // Reset focus when a new row opens.
  const rowKey = row?.projectId ?? '';
  const [lastKey, setLastKey] = useState(rowKey);
  if (rowKey !== lastKey) {
    setLastKey(rowKey);
    setFocusIdx(defaultIdx);
    setFilter(0);
  }

  if (!row) return null;
  const focus = row.items[focusIdx] ?? row.items[0];
  const entry = CAT_BY_NAME.get(focus.name);
  const category = entry?.category ?? 'Regulatory standard';
  const licensed = (entry?.legal_status ?? 'REFERENCE_ONLY') !== 'INGESTIBLE';

  return (
    <DialogPrimitive.Root open onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <style>{STYLES}</style>
        <DialogPrimitive.Overlay className="qvb-overlay" />
        <DialogPrimitive.Content className="qvb" aria-describedby={undefined}>
          {/* Header */}
          <div className="m-head">
            <div>
              <div className="m-eyebrow">
                <Layers />
                Version Benchmark
              </div>
              <DialogPrimitive.Title asChild>
                <h2 className="m-title">
                  {focus.name}: {focus.current} vs {focus.latest}
                </h2>
              </DialogPrimitive.Title>
              <div className="m-context">
                <span className="ctx-chip">
                  <Package />
                  {row.name}
                  {row.reference ? ` · ${row.reference}` : ''}
                </span>
                <span className="ctx-chip">
                  <Shield />
                  {category}
                </span>
                {licensed && (
                  <span className="badge b-ref">
                    <Lock style={{ width: 11, height: 11 }} />
                    Reference only · Licensed standard
                  </span>
                )}
              </div>
            </div>
            <div className="m-head-right">
              <span className="demo-flag">DEMO · illustrative scores</span>
              <DialogPrimitive.Close className="m-close" aria-label="Close">
                <X />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body */}
          <div className="m-body">
            {/* Compliance switcher: dynamic when a project has several standards */}
            {row.items.length > 1 && (
              <div className="cswitch">
                {row.items.map((it, i) => (
                  <button
                    key={it.name}
                    type="button"
                    className={'cs-chip' + (i === focusIdx ? ' active' : '')}
                    onClick={() => setFocusIdx(i)}
                  >
                    <span className={'dot' + (it.outdated ? ' warn' : '')} />
                    {it.name}
                  </button>
                ))}
              </div>
            )}

            {/* 1 · Version summary */}
            <div className="sec-label"><span className="num">1</span>Version summary</div>
            <div className="vband">
              <div className="vcard prev">
                <div className="vc-role">Currently applied</div>
                <div className="vc-ref">
                  {focus.current}
                  {focus.outdated && (
                    <span className="badge b-outdated"><span className="bdot" />Outdated</span>
                  )}
                </div>
                <div className="vc-meta">
                  <span>Applied reference on <b>{row.name}</b></span>
                  {focus.outdated ? (
                    <span>Superseded: <b>update required</b></span>
                  ) : (
                    <span>Matches the latest published edition</span>
                  )}
                </div>
              </div>
              <div className="vband-arrow"><ArrowRight /></div>
              <div className="vcard next">
                <div className="vc-role">Latest version</div>
                <div className="vc-ref">
                  {focus.latest}
                  <span className="badge b-current"><span className="bdot" />Current</span>
                </div>
                <div className="vc-meta">
                  <span>Latest edition tracked in the reference catalog</span>
                  <span>The edition auditors now certify against</span>
                </div>
              </div>
            </div>
            {focus.outdated && (
              <div className="verdict">
                <AlertTriangle />
                <span>
                  <b>Action required.</b> This product is assessed against a superseded edition of {focus.name}.
                  Migrate the applied reference to {focus.latest} and remap the affected controls to restore a
                  valid, monitorable compliance baseline.
                </span>
              </div>
            )}

            {/* 2 · What changed at a glance */}
            <div className="sec-label"><span className="num">2</span>What changed at a glance</div>
            <div className="metrics">
              {BENCH_METRICS.map((m) => (
                <div className="mtile" key={m.label}>
                  <div className="mt-val">
                    {m.from && <>{m.from}<span className="arr">→</span></>}
                    <span className="to">{m.to}</span>
                  </div>
                  <div className="mt-label">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Legal boundary */}
            {licensed && (
              <div className="legal">
                <Lock />
                <div className="legal-txt">
                  <b>{focus.name} is a copyrighted, licensed standard.</b> Qurelio compares only the{' '}
                  <b>publicly available structural changes</b> (control counts, restructure, control titles) and
                  maps them to <b>your own evidence</b>. It does not host or reproduce the normative clause text of
                  either edition. To review the full clause-by-clause wording side-by-side, upload your own licensed
                  copies of both editions.
                  <br />
                  <button className="btn btn-ghost btn-sm" type="button">
                    <Upload />Upload my licensed copies
                  </button>
                </div>
              </div>
            )}

            {/* 3 · Compliance impact */}
            <div className="sec-label"><span className="num">3</span>Impact on this product&apos;s compliance</div>
            <div className="impact">
              <div>
                <div className="score-delta">
                  <span className="score-old">82</span>
                  <span className="score-arrow">→</span>
                  <span className="score-new">71</span>
                </div>
                <div className="score-cap">
                  Projected {focus.name} score after re-baselining to the {focus.latest} control set (before remediation).
                </div>
              </div>
              <div className="impact-break">
                {BENCH_IMPACT.map((ib, i) => (
                  <div className="ib" key={i}>
                    <span className={'ib-num ' + ib.cls}>{ib.num}</span>
                    <span className="ib-label">{ib.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4 · Control-level benchmark */}
            <div className="sec-label"><span className="num">4</span>Control-level benchmark</div>
            <div className="bench-toolbar">
              <div className="filters">
                {FILTERS.map((f, i) => (
                  <span
                    key={f}
                    className={'fchip' + (i === filter ? ' active' : '')}
                    onClick={() => setFilter(i)}
                  >
                    {f}
                  </span>
                ))}
              </div>
              <span className="bench-note">Showing {BENCH_ROWS.length} of 93 · {focus.latest} controls</span>
            </div>
            <div className="bench-wrap">
              <table className="bench">
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>Previous (Annex A)</th>
                    <th style={{ width: '22%' }}>Latest (Annex A)</th>
                    <th style={{ width: '12%' }}>Change</th>
                    <th>Impact on {row.name}</th>
                    <th style={{ width: '12%' }}>Your coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {BENCH_ROWS.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.prev}
                        {r.prevName && <div className="cl-name">{r.prevName}</div>}
                      </td>
                      <td>
                        {r.next}
                        <div className="cl-name">{r.nextName}</div>
                      </td>
                      <td>
                        <div className="ct-stack">
                          {r.changes.map((c) => (
                            <span key={c.label} className={'ct ct-' + c.kind}>{c.label}</span>
                          ))}
                        </div>
                      </td>
                      <td className="impact-cell">{r.impact}</td>
                      <td><span className={'cov cov-' + r.coverage}>{r.coverageLabel}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI recommendation */}
            <div className="airec">
              <div className="airec-head">
                <Sparkles />
                <span className="airec-title">Qurelio&apos;s assessment &amp; recommendation</span>
                <span className="q-badge"><Lock />AI-generated · Pending QM review</span>
              </div>
              <p>
                {focus.latest} keeps every prior requirement but reorganises the control set and adds new controls,
                several of which land squarely on this product&apos;s connected, software-controlled profile
                (<span className="cited">A.5.7 threat intelligence</span>,{' '}
                <span className="cited">A.8.28 secure coding</span>,{' '}
                <span className="cited">A.8.12 data leakage prevention</span>). Staying on the superseded edition
                leaves this product mapped to a standard auditors no longer certify against.
              </p>
              <p style={{ fontWeight: 600, color: 'var(--ink)' }}>Recommended path:</p>
              <ul>
                <li>Adopt {focus.latest} as the applied reference and re-baseline the control set.</li>
                <li>Auto-map the 69 unchanged/merged controls; queue the 20 renamed/modified controls for a quick evidence review.</li>
                <li>Open a migration action plan for the <b>4 new uncovered controls</b> and 7 partially covered ones.</li>
              </ul>
              <p style={{ marginTop: 9, marginBottom: 0, fontSize: '.77rem', color: 'var(--slate)' }}>
                This benchmark is AI-generated and held in quarantine. It becomes an executable plan only after the
                Quality Manager approves it below.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="m-foot">
            <span className="hitl-note">
              <Check />
              Adopting the new version requires Quality Manager approval (HITL)
            </span>
            <button className="btn btn-danger" type="button">
              Keep {focus.current} <span style={{ opacity: 0.7 }}>(not recommended)</span>
            </button>
            <button className="btn btn-ghost" type="button">
              <FileText />Generate migration plan
            </button>
            <button className="btn btn-primary" type="button">
              <Check />Approve &amp; adopt {focus.latest}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
