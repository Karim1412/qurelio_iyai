'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  Lock,
  AlertTriangle,
  Check,
  Info,
  FileText,
  Package,
  Shield,
  Sparkles,
  Grid3x3,
  Network,
  ExternalLink,
} from '@/components/icons';
import { productApi, regulatoryMonitoringApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { DECISION_LABEL, type ApplicabilityDecision, type CreateApplicabilityAssessment, type SavedApplicabilityAssessment } from './applicability-assessment';
import {
  buildDetail,
  type ApplicabilityProduct,
  type ApplicabilityDetail,
  type VerdictTone,
} from './applicability-detail';

/* ── Scoped stylesheet: faithful to the mockup, prefixed under .qar ───────── */
const STYLES = `
.qar-overlay{position:fixed;inset:0;z-index:60;background:rgba(11,22,32,.42);backdrop-filter:blur(2px)}
.qar{
  --ink:#0b1620;--ink-2:#16242f;--slate:#5b6b78;--slate-2:#8595a1;
  --line:#e6ebef;--line-2:#d0d9e0;--bg:#ffffff;--bg-soft:#f6f9fa;
  --teal:#0fa493;--teal-deep:#0a7d70;--teal-soft:#e6f6f3;--teal-mid:#d0eeea;
  --gold:#e0a32e;--gold-soft:#fef4e0;--gold-mid:#f5dfa0;
  --danger:#d8553f;--danger-soft:#fdf0ee;--danger-mid:#f5c4bb;
  --success:#27a665;--success-soft:#e8f8f1;--success-mid:#a8e4c8;
  --violet:#6c5ce7;--violet-soft:#eeeafd;--violet-mid:#d6ccfa;
  --blue:#3b5bdb;--blue-soft:#eef3ff;--blue-mid:#c7d4f7;
  --orange:#e07b2e;
  --radius:14px;--radius-sm:9px;--radius-xs:6px;
  --shadow-xl:0 20px 60px rgba(11,22,32,.28);
  --ease:cubic-bezier(.22,.61,.36,1);
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:61;
  width:96vw;max-width:1000px;max-height:92vh;display:flex;flex-direction:column;
  background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:var(--shadow-xl);overflow:hidden;line-height:1.6;
  font-family:inherit;animation:qarpop .32s var(--ease)}
@keyframes qarpop{from{opacity:0;transform:translate(-50%,-50%) scale(.985)}to{opacity:1;transform:translate(-50%,-50%)}}
.qar *,.qar *::before,.qar *::after{box-sizing:border-box}
.qar h2,.qar p,.qar ul{margin:0}

.qar .assessment-flag{font-size:.7rem;font-weight:700;color:var(--gold);background:var(--gold-soft);
  border:1px solid var(--gold-mid);padding:2px 8px;border-radius:100px;white-space:nowrap}
.qar .tier{font-size:.66rem;font-weight:700;padding:2px 8px;border-radius:var(--radius-xs);
  text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.qar .tier svg{width:11px;height:11px}
.qar .t-ing{background:var(--teal-soft);color:var(--teal-deep);border:1px solid var(--teal-mid)}
.qar .t-ref{background:var(--gold-soft);color:#8a610f;border:1px solid var(--gold-mid)}
.qar .t-usr{background:var(--blue-soft);color:var(--blue);border:1px solid var(--blue-mid)}
.qar .impact-p{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.qar .ip-critical{color:var(--danger)} .qar .ip-high{color:var(--orange)}
.qar .ip-medium{color:var(--gold)} .qar .ip-low{color:var(--slate)}

/* header */
.qar .m-head{padding:19px 24px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:16px;
  background:linear-gradient(180deg,var(--bg-soft),var(--bg))}
.qar .m-head.must{background:linear-gradient(180deg,var(--danger-soft),var(--bg))}
.qar .m-eyebrow{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--teal-deep);
  display:flex;align-items:center;gap:7px}
.qar .m-eyebrow.must{color:var(--danger)}
.qar .m-eyebrow.mute{color:var(--slate)}
.qar .m-eyebrow svg{width:14px;height:14px}
.qar .m-title{font-weight:800;font-size:1.34rem;letter-spacing:-.02em;margin:4px 0 3px;color:var(--ink)}
.qar .m-subtitle{font-size:.84rem;color:var(--slate);margin-bottom:9px;max-width:640px}
.qar .m-context{display:flex;flex-wrap:wrap;align-items:center;gap:7px}
.qar .ctx-chip{display:inline-flex;align-items:center;gap:6px;font-size:.74rem;font-weight:600;color:var(--slate);
  background:var(--bg);border:1px solid var(--line);padding:4px 10px;border-radius:100px}
.qar .ctx-chip svg{width:13px;height:13px;color:var(--teal);flex-shrink:0}
.qar .m-head-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-shrink:0}
.qar .m-close{width:34px;height:34px;border-radius:var(--radius-sm);border:1px solid var(--line-2);background:var(--bg);
  cursor:pointer;display:grid;place-items:center;color:var(--slate);transition:.18s var(--ease)}
.qar .m-close:hover{background:var(--danger-soft);color:var(--danger);border-color:var(--danger-mid)}
.qar .m-close svg{width:17px;height:17px}

.qar .m-body{padding:20px 24px;overflow-y:auto}
.qar .sec-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--slate);
  margin:0 0 11px;display:flex;align-items:center;gap:8px}
.qar .sec-label .num{width:18px;height:18px;border-radius:5px;background:var(--teal-soft);color:var(--teal-deep);
  font-size:.68rem;display:grid;place-items:center;font-weight:800}
.qar .sec-label.must .num{background:var(--danger-soft);color:var(--danger)}
.qar .sec-gap{margin-top:24px}

/* instrument switcher: a label can cite several instruments */
.qar .cswitch{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;align-items:center}
.qar .cs-hint{font-size:.73rem;color:var(--slate);margin-right:2px}
.qar .cs-chip{font-family:inherit;font-size:.75rem;font-weight:600;padding:6px 12px;border-radius:100px;
  border:1px solid var(--line-2);background:var(--bg);color:var(--slate);cursor:pointer;
  transition:.15s var(--ease);display:inline-flex;align-items:center;gap:6px}
.qar .cs-chip:hover{border-color:var(--slate)}
.qar .cs-chip.active{background:var(--teal-soft);color:var(--teal-deep);border-color:var(--teal-mid)}

/* verdict band */
.qar .vband{display:grid;grid-template-columns:1fr 240px;gap:16px;align-items:center;padding:15px 17px;
  border-radius:var(--radius-sm);border:1px solid;margin-bottom:6px}
.qar .vb-applicable{background:var(--teal-soft);border-color:var(--teal-mid)}
.qar .vb-conditional{background:var(--gold-soft);border-color:var(--gold-mid)}
.qar .vb-must{background:var(--danger-soft);border-color:var(--danger-mid)}
.qar .vb-review{background:var(--gold-soft);border-color:var(--gold-mid)}
.qar .vb-na{background:var(--bg-soft);border-color:var(--line-2)}
.qar .vb-neutral{background:var(--bg-soft);border-color:var(--line-2)}
.qar .vb-verdict{font-weight:800;font-size:1.02rem;display:flex;align-items:center;gap:9px;margin-bottom:5px}
.qar .vb-verdict svg{width:19px;height:19px;flex-shrink:0}
.qar .vb-applicable .vb-verdict{color:var(--teal-deep)} .qar .vb-applicable .vb-verdict svg{color:var(--teal)}
.qar .vb-conditional .vb-verdict,.qar .vb-review .vb-verdict{color:#8a610f}
.qar .vb-conditional .vb-verdict svg,.qar .vb-review .vb-verdict svg{color:var(--gold)}
.qar .vb-must .vb-verdict{color:var(--danger)} .qar .vb-must .vb-verdict svg{color:var(--danger)}
.qar .vb-na .vb-verdict,.qar .vb-neutral .vb-verdict{color:var(--slate)}
.qar .vb-na .vb-verdict svg,.qar .vb-neutral .vb-verdict svg{color:var(--slate-2)}
.qar .vb-text{font-size:.84rem;color:var(--ink-2)}
.qar .scores{display:flex;flex-direction:column;gap:9px}
.qar .srow{display:flex;align-items:center;gap:9px}
.qar .s-label{font-size:.7rem;color:var(--slate);font-weight:600;width:76px;text-transform:uppercase;letter-spacing:.03em}
.qar .s-bar{flex:1;height:7px;border-radius:100px;background:rgba(11,22,32,.09);overflow:hidden}
.qar .s-fill{height:100%;border-radius:100px;background:var(--teal)}
.qar .s-fill.warn{background:var(--gold)} .qar .s-fill.bad{background:var(--danger)} .qar .s-fill.mute{background:var(--slate-2)}
.qar .s-val{font-size:.78rem;font-weight:800;font-variant-numeric:tabular-nums;width:38px;text-align:right;color:var(--ink-2)}
.qar .vb-note{font-size:.76rem;color:var(--slate);margin:0 0 8px}

/* metadata grid */
.qar .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid var(--line);
  border-radius:var(--radius-sm);overflow:hidden}
.qar .mg{padding:12px 15px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--bg)}
.qar .mg:nth-child(3n){border-right:none}
.qar .mg-l{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--slate);margin-bottom:4px}
.qar .mg-v{font-size:.83rem;color:var(--ink-2);font-weight:600;word-break:break-word}
.qar .mg-v.small{font-size:.78rem;font-weight:500}
.qar .mg-v.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem}
.qar .mg-v.warn{color:#8a610f} .qar .mg-v.bad{color:var(--danger)}

/* signals + reason */
.qar .signals{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.qar .sig{display:inline-flex;align-items:center;gap:7px;background:var(--bg);border:1px solid var(--teal-mid);
  border-radius:100px;padding:5px 12px;font-size:.77rem;max-width:100%}
.qar .sig svg{width:12px;height:12px;color:var(--teal);flex-shrink:0}
.qar .sig-k{color:var(--slate);font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.qar .sig-v{color:var(--ink-2);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px}
.qar .reason{font-size:.87rem;color:var(--ink-2);background:var(--bg-soft);border-left:3px solid var(--teal);
  padding:13px 16px;border-radius:0 var(--radius-sm) var(--radius-sm) 0;margin-bottom:16px}
.qar .reason.must{border-left-color:var(--danger);background:var(--danger-soft)}
.qar .reason.warn{border-left-color:var(--gold);background:var(--gold-soft)}
.qar .reason.na{border-left-color:var(--slate-2)}

/* evidence */
.qar .ev{display:flex;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--radius-sm);
  background:var(--bg);margin-bottom:8px}
.qar .ev-ic{width:30px;height:30px;border-radius:8px;background:var(--teal-soft);display:grid;place-items:center;flex-shrink:0}
.qar .ev-ic svg{width:15px;height:15px;color:var(--teal-deep)}
.qar .ev-ic.attr{background:var(--violet-soft)} .qar .ev-ic.attr svg{color:var(--violet)}
.qar .ev-ic.ext{background:var(--blue-soft)} .qar .ev-ic.ext svg{color:var(--blue)}
.qar .ev-doc{font-size:.79rem;font-weight:700;color:var(--ink-2)}
.qar .ev-quote{font-size:.79rem;color:var(--slate);margin-top:3px}
.qar .empty{font-size:.81rem;color:var(--slate);border:1px dashed var(--line-2);border-radius:var(--radius-sm);
  padding:13px 16px;background:var(--bg-soft)}

/* obligations */
.qar .obl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius-sm)}
.qar .obl{width:100%;min-width:520px;border-collapse:separate;border-spacing:0;font-size:.82rem}
.qar .obl th{text-align:left;font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--slate);
  font-weight:700;padding:9px 14px;background:var(--bg-soft);border-bottom:1px solid var(--line)}
.qar .obl td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.qar .obl tr:last-child td{border-bottom:none}
.qar .obl-ref{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;font-weight:700;
  color:var(--ink-2);white-space:nowrap}

/* linked ids */
.qar .idlist{display:flex;flex-wrap:wrap;gap:7px}
.qar .idchip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.73rem;font-weight:600;
  padding:4px 10px;border-radius:100px;background:var(--danger-soft);color:var(--danger);border:1px solid var(--danger-mid)}
.qar .idchip.chg{background:var(--violet-soft);color:var(--violet);border-color:var(--violet-mid)}

/* boxes */
.qar .legal{display:flex;gap:13px;padding:13px 16px;border-radius:var(--radius-sm);
  background:var(--gold-soft);border:1px solid var(--gold-mid);margin-top:16px}
.qar .legal.usr{background:var(--blue-soft);border-color:var(--blue-mid)}
.qar .legal svg{width:18px;height:18px;color:var(--gold);flex-shrink:0;margin-top:2px}
.qar .legal.usr svg{color:var(--blue)}
.qar .legal-txt{font-size:.8rem;color:var(--ink-2)}
.qar .legal-txt b{color:#8a610f}
.qar .legal.usr .legal-txt b{color:var(--blue)}
.qar .airec{border:1px solid var(--violet-mid);border-radius:var(--radius-sm);background:var(--violet-soft);
  padding:15px 17px;margin-top:22px}
.qar .airec-head{display:flex;align-items:center;gap:9px;margin-bottom:8px;flex-wrap:wrap}
.qar .airec-head svg{width:17px;height:17px;color:var(--violet)}
.qar .airec-title{font-weight:700;font-size:.9rem;color:var(--ink)}
.qar .q-badge{margin-left:auto;font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  color:#8a610f;background:var(--gold-soft);border:1px solid var(--gold-mid);padding:3px 9px;border-radius:100px;
  display:inline-flex;align-items:center;gap:5px}
.qar .q-badge svg{width:12px;height:12px;color:var(--gold)}
.qar .airec p{font-size:.82rem;color:var(--ink-2)}

/* buttons + footer */
.qar .btn{font-family:inherit;font-size:.82rem;font-weight:600;padding:10px 16px;border-radius:var(--radius-sm);
  border:1px solid transparent;cursor:pointer;display:inline-flex;align-items:center;gap:7px;
  transition:.18s var(--ease);white-space:nowrap}
.qar .btn svg{width:15px;height:15px}
.qar .btn-primary{background:var(--teal);color:#fff;box-shadow:0 4px 14px rgba(15,164,147,.28)}
.qar .btn-primary:hover{background:var(--teal-deep);transform:translateY(-1px)}
.qar .btn-danger{background:var(--danger);color:#fff;box-shadow:0 4px 14px rgba(216,85,63,.26)}
.qar .btn-danger:hover{background:#b8412d;transform:translateY(-1px)}
.qar .btn-ghost{background:var(--bg);color:var(--ink);border-color:var(--line-2)}
.qar .btn-ghost:hover{border-color:var(--ink);background:var(--bg-soft)}
.qar .m-foot{padding:14px 24px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;
  background:var(--bg-soft);flex-wrap:wrap}
.qar .hitl-note{font-size:.75rem;color:var(--slate-2);margin-right:auto;display:flex;align-items:center;gap:7px;max-width:430px}
.qar .hitl-note svg{width:14px;height:14px;color:var(--gold);flex-shrink:0}


.qar .review-history{border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden;margin:12px 0}
.qar .review-history-head{background:var(--bg-soft);padding:10px 13px;font-size:.72rem;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.04em}
.qar .review-item{padding:12px 14px;border-top:1px solid var(--line)}
.qar .review-item:first-of-type{border-top:none}
.qar .review-item-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.78rem;font-weight:700;color:var(--ink-2)}
.qar .review-decision{border-radius:100px;padding:3px 8px;font-size:.68rem;font-weight:800;border:1px solid var(--line-2);background:var(--bg-soft)}
.qar .review-decision.ap{background:var(--teal-soft);color:var(--teal-deep);border-color:var(--teal-mid)}
.qar .review-decision.na{background:var(--bg-soft);color:var(--slate);border-color:var(--line-2)}
.qar .review-decision.conditional,.qar .review-decision.review{background:var(--gold-soft);color:#8a610f;border-color:var(--gold-mid)}
.qar .review-rationale{font-size:.82rem;color:var(--ink-2);margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere}
.qar .review-meta{font-size:.7rem;color:var(--slate);margin-top:6px}
.qar .review-toggle{font-family:inherit;font-size:.82rem;font-weight:700;border:1px solid var(--teal-mid);border-radius:var(--radius-sm);background:var(--teal-soft);color:var(--teal-deep);padding:9px 13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
.qar .review-form{border:1px solid var(--line-2);border-radius:var(--radius-sm);padding:16px;background:var(--bg-soft);margin-top:12px}
.qar .review-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.qar .review-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.qar .review-field.full{grid-column:1/-1}
.qar .review-field label{font-size:.72rem;font-weight:800;color:var(--slate)}
.qar .review-field input,.qar .review-field textarea,.qar .review-field select{width:100%;border:1px solid var(--line-2);border-radius:8px;background:white;color:var(--ink-2);font:inherit;font-size:.8rem;padding:9px 10px;outline-offset:2px}
.qar .review-field textarea{min-height:78px;resize:vertical}
.qar .review-field small{font-size:.69rem;color:var(--slate)}
.qar .review-form-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}
.qar .review-help{font-size:.75rem;color:var(--slate);margin-top:8px;line-height:1.5}
@media(max-width:620px){.qar .review-form-grid{grid-template-columns:1fr}.qar .review-field.full{grid-column:auto}}

@media(max-width:900px){
  .qar .meta-grid{grid-template-columns:1fr 1fr}
  .qar .mg:nth-child(3n){border-right:1px solid var(--line)}
  .qar .mg:nth-child(2n){border-right:none}
  .qar .vband{grid-template-columns:1fr}
}
`;

const TIER_CLASS: Record<string, string> = {
  INGESTIBLE: 't-ing',
  REFERENCE_ONLY: 't-ref',
  USER_UPLOAD: 't-usr',
};

function meterClass(v: number): string {
  return v >= 0.85 ? '' : v >= 0.6 ? 'warn' : 'bad';
}

function verdictIcon(tone: VerdictTone) {
  if (tone === 'must') return <AlertTriangle />;
  if (tone === 'conditional' || tone === 'review') return <Info />;
  if (tone === 'na' || tone === 'neutral') return <X />;
  return <Check />;
}

function reasonClass(d: ApplicabilityDetail): string {
  if (d.verdictTone === 'must') return 'reason must';
  if (d.verdictTone === 'conditional' || d.verdictTone === 'review') return 'reason warn';
  if (d.verdictTone === 'na' || d.verdictTone === 'neutral') return 'reason na';
  return 'reason';
}

interface MonitoredSourceOption {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  regulatoryDomain: string;
  officialUrl: string;
  checkIntervalHours: number;
  enabled: boolean;
  verificationStatus: string;
}

interface Props {
  product: ApplicabilityProduct | null;
  /** The compliance label clicked in the results table. */
  label: string | null;
  /** Optional initial focus for a certificate chip vs. a regulatory reference chip. */
  initialFocusId?: string;
  savedAssessments: SavedApplicabilityAssessment[];
  onAssessmentSaved: (productId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function ApplicabilityReasonModal({
  product, label, initialFocusId, savedAssessments, onAssessmentSaved, onOpenChange,
}: Props) {
  const [focusId, setFocusId] = useState<string | undefined>(initialFocusId);

  // Reset the instrument focus whenever a different chip opens the modal.
  const openKey = `${product?.id ?? ''}::${label ?? ''}::${initialFocusId ?? ''}`;
  const [lastKey, setLastKey] = useState(openKey);
  if (openKey !== lastKey) {
    setLastKey(openKey);
    setFocusId(initialFocusId);
  }

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [decision, setDecision] = useState<ApplicabilityDecision>('NEEDS_REVIEW');
  const [rationale, setRationale] = useState('');
  const [conditions, setConditions] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [sourceVersion, setSourceVersion] = useState('');
  const [sourceUrlText, setSourceUrlText] = useState('');
  const [monitoredSources, setMonitoredSources] = useState<MonitoredSourceOption[]>([]);
  const [monitoredSourcesLoading, setMonitoredSourcesLoading] = useState(false);
  const [monitoredSourcesError, setMonitoredSourcesError] = useState(false);
  const [sourceRegistrySearch, setSourceRegistrySearch] = useState('');
  const [selectedMonitoredSourceId, setSelectedMonitoredSourceId] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);

  useEffect(() => {
    setShowReviewForm(false);
    setDecision('NEEDS_REVIEW');
    setRationale('');
    setConditions('');
    setEvidenceText('');
    setSourceVersion('');
    setSourceUrlText('');
    setSelectedMonitoredSourceId('');
    setSourceRegistrySearch('');
    setMonitoredSourcesError(false);
  }, [openKey]);

  const detail = useMemo(
    () => (product && label ? buildDetail(product, label, focusId) : null),
    [product, label, focusId],
  );

  useEffect(() => {
    setSourceUrlText(detail?.sourceUrl ?? '');
    setSelectedMonitoredSourceId('');
  }, [openKey, detail?.sourceUrl]);

  useEffect(() => {
    let active = true;
    setMonitoredSourcesLoading(true);
    setMonitoredSourcesError(false);
    void regulatoryMonitoringApi.sources({ limit: 250 })
      .then((response) => {
        if (!active) return;
        const rows = Array.isArray(response.data?.data) ? response.data.data : [];
        setMonitoredSources(rows.filter((source: MonitoredSourceOption) => source.enabled));
      })
      .catch(() => {
        if (active) {
          setMonitoredSources([]);
          setMonitoredSourcesError(true);
        }
      })
      .finally(() => { if (active) setMonitoredSourcesLoading(false); });
    return () => { active = false; };
  }, [openKey]);

  if (!product || !label || !detail) return null;

  const d = detail;
  const licensed = d.tier === 'REFERENCE_ONLY' || d.tier === 'USER_UPLOAD';
  const normalizedReference = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const relatedAssessments = savedAssessments.filter((assessment) => {
    if (d.regulationId && assessment.regulationId) return assessment.regulationId === d.regulationId;
    return normalizedReference(assessment.reference) === normalizedReference(d.reference);
  });
  const latestAssessment = relatedAssessments[0];
  const filteredMonitoredSources = monitoredSources.filter((source) => {
    const q = sourceRegistrySearch.trim().toLocaleLowerCase();
    if (!q) return true;
    return [source.sourceId, source.sourceName, source.jurisdiction, source.regulatoryDomain, source.officialUrl]
      .some((value) => String(value || '').toLocaleLowerCase().includes(q));
  });
  const selectedMonitoredSource = monitoredSources.find((source) => source.sourceId === selectedMonitoredSourceId);
  const displayedVerdict = latestAssessment ? DECISION_LABEL[latestAssessment.decision] : d.verdict;
  const displayedTone: VerdictTone = latestAssessment
    ? latestAssessment.decision === 'APPLICABLE' ? 'applicable'
      : latestAssessment.decision === 'NOT_APPLICABLE' ? 'na'
        : latestAssessment.decision === 'CONDITIONAL' ? 'conditional' : 'review'
    : d.verdictTone;
  const displayedVerdictText = latestAssessment
    ? `${latestAssessment.rationale}${latestAssessment.conditions ? ` Conditions: ${latestAssessment.conditions}` : ''}`
    : d.verdictText;
  const must = displayedTone === 'must';

  const saveDecision = async () => {
    if (!product) return;
    if (rationale.trim().length < 20) {
      toast.error('Add a clear rationale of at least 20 characters.');
      return;
    }
    if (decision === 'CONDITIONAL' && !conditions.trim()) {
      toast.error('Describe the conditions for this decision.');
      return;
    }
    if (sourceUrlText.trim()) {
      try {
        const parsedSourceUrl = new URL(sourceUrlText.trim());
        if (parsedSourceUrl.protocol !== 'https:') throw new Error('HTTPS required');
      } catch {
        toast.error('Enter a valid HTTPS source URL.');
        return;
      }
    }
    const payload: CreateApplicabilityAssessment = {
      ...(d.regulationId ? { regulationId: d.regulationId } : {}),
      reference: d.reference,
      ...(d.title ? { title: d.title } : {}),
      decision,
      rationale: rationale.trim(),
      ...(conditions.trim() ? { conditions: conditions.trim() } : {}),
      evidenceReferences: evidenceText.split('\n').map((item: string) => item.trim()).filter(Boolean),
      ...(sourceUrlText.trim() ? { sourceUrl: sourceUrlText.trim() } : {}),
      ...(selectedMonitoredSourceId ? { monitoredSourceId: selectedMonitoredSourceId } : {}),
      ...(sourceVersion.trim() ? { sourceVersion: sourceVersion.trim() } : {}),
    };
    setSavingDecision(true);
    try {
      await productApi.createApplicabilityAssessment(product.id, payload);
      toast.success('Applicability review decision saved.');
      setShowReviewForm(false);
      setRationale('');
      setConditions('');
      setEvidenceText('');
      setSourceVersion('');
      try {
        await onAssessmentSaved(product.id);
      } catch {
        toast.error('The decision was saved, but the review table could not refresh. Reopen the review workspace to reload it.');
      }
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string | string[] } } };
      const message = apiError?.response?.data?.message;
      toast.error(Array.isArray(message) ? message.join(' ') : message || 'Could not save the decision. Confirm that you are a Quality Manager or Director and try again.');
    } finally {
      setSavingDecision(false);
    }
  };

  let step = 0;
  const N = () => ++step;

  return (
    <DialogPrimitive.Root open onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <style>{STYLES}</style>
        <DialogPrimitive.Overlay className="qar-overlay" />
        <DialogPrimitive.Content className="qar" aria-describedby={undefined}>
          {/* Header */}
          <div className={'m-head' + (must ? ' must' : '')}>
            <div>
              <div
                className={
                  'm-eyebrow' +
                  (must ? ' must' : d.verdictTone === 'na' || d.verdictTone === 'neutral' ? ' mute' : '')
                }
              >
                {verdictIcon(d.verdictTone)}
                {latestAssessment
                  ? 'Reviewer decision · human-entered'
                  : d.kind === 'CERTIFICATE'
                    ? 'Product record · certificate metadata'
                    : d.kind === 'CATALOG_ONLY'
                      ? 'Reference catalog · not yet reviewed'
                      : 'Unresolved reference · needs review'}
              </div>
              <DialogPrimitive.Title asChild>
                <h2 className="m-title">{d.reference}</h2>
              </DialogPrimitive.Title>
              {d.title && <p className="m-subtitle">{d.title}</p>}
              <div className="m-context">
                <span className="ctx-chip">
                  <Package />
                  {product.name}
                </span>
                {(product.reference || product.sku) && (
                  <span className="ctx-chip">
                    <Grid3x3 />
                    {product.reference || product.sku}
                  </span>
                )}
                {d.tier && (
                  <span className={'tier ' + (TIER_CLASS[d.tier] ?? 't-ing')}>
                    {licensed && <Lock />}
                    {d.tierLabel}
                  </span>
                )}
                {d.impact && (
                  <span className={'impact-p ip-' + d.impact.toLowerCase()}>{d.impact} impact</span>
                )}
              </div>
            </div>
            <div className="m-head-right">
              <span className="assessment-flag">
                {latestAssessment
                  ? `${DECISION_LABEL[latestAssessment.decision].toUpperCase()} · REVIEWER-RECORDED`
                  : d.kind === 'CERTIFICATE' ? 'RECORD ONLY · NOT VERIFIED' : d.kind === 'CATALOG_ONLY' ? 'CATALOG MATCH · NOT ASSESSED' : 'NO MATCH · NOT ASSESSED'}
              </span>
              <DialogPrimitive.Close className="m-close" aria-label="Close">
                <X />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body */}
          <div className="m-body">
            {/* The clicked label may cite several instruments, let the reviewer switch. */}
            {d.alternates.length > 1 && (
              <div className="cswitch">
                <span className="cs-hint">This entry cites several instruments:</span>
                {d.alternates.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className={'cs-chip' + (a.key === d.key ? ' active' : '')}
                    onClick={() => setFocusId(a.key)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* 1 · Verdict */}
            <div className={'sec-label' + (must ? ' must' : '')}>
              <span className="num">{N()}</span>Assessment status
            </div>
            <div className={'vband vb-' + displayedTone}>
              <div>
                <div className="vb-verdict">
                  {verdictIcon(displayedTone)}
                  {displayedVerdict}
                </div>
                <div className="vb-text">{displayedVerdictText}</div>
              </div>
              <div className="scores">
                {d.applicabilityScore !== undefined && (
                  <div className="srow">
                    <span className="s-label">Applicability</span>
                    <div className="s-bar">
                      <div
                        className={'s-fill ' + meterClass(d.applicabilityScore)}
                        style={{ width: `${d.applicabilityScore * 100}%` }}
                      />
                    </div>
                    <span className="s-val">{d.applicabilityScore.toFixed(2)}</span>
                  </div>
                )}
                {d.confidenceScore !== undefined && (
                  <div className="srow">
                    <span className="s-label">Confidence</span>
                    <div className="s-bar">
                      <div
                        className={'s-fill ' + meterClass(d.confidenceScore)}
                        style={{ width: `${d.confidenceScore * 100}%` }}
                      />
                    </div>
                    <span className="s-val">{d.confidenceScore.toFixed(2)}</span>
                  </div>
                )}
                {d.applicabilityScore === undefined && d.confidenceScore === undefined && (
                  <div className="srow">
                    <span className="s-label">Decision</span>
                    <span className="vb-note" style={{ margin: 0 }}>
                      {latestAssessment
                        ? 'A human-reviewed decision is recorded below. No automatic applicability score is generated by this page.'
                        : 'No reviewer decision is saved for this reference. Record a reviewed decision below; the catalog match by itself is not a legal conclusion.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Persisted human-reviewed applicability decisions */}
            {d.kind !== 'CERTIFICATE' && (
              <section className="sec-gap">
                <div className="sec-label">
                  <span className="num">R</span>Reviewer decision and history
                </div>
                {latestAssessment ? (
                  <div className="review-history">
                    <div className="review-history-head">Latest saved decision</div>
                    <div className="review-item">
                      <div className="review-item-top">
                        <span className={`review-decision ${latestAssessment.decision === 'APPLICABLE' ? 'ap' : latestAssessment.decision === 'NOT_APPLICABLE' ? 'na' : latestAssessment.decision === 'CONDITIONAL' ? 'conditional' : 'review'}`}>
                          {DECISION_LABEL[latestAssessment.decision]}
                        </span>
                        <span>{latestAssessment.reviewerRole.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="review-rationale">{latestAssessment.rationale}</p>
                      {latestAssessment.conditions && <p className="review-help"><b>Conditions:</b> {latestAssessment.conditions}</p>}
                      {latestAssessment.sourceVersion && <p className="review-help"><b>Source version reviewed:</b> {latestAssessment.sourceVersion}</p>}
                      {latestAssessment.sourceUrl && <p className="review-help"><a href={latestAssessment.sourceUrl} target="_blank" rel="noopener noreferrer">Open source used for this decision ↗</a></p>}
                      {latestAssessment.evidenceReferences?.length > 0 && (
                        <p className="review-help"><b>Evidence references:</b> {latestAssessment.evidenceReferences.join(' · ')}</p>
                      )}
                      {latestAssessment.sourceFreshness && latestAssessment.sourceFreshness !== 'CURRENT' && (
                        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${['SOURCE_CHANGED', 'CHECK_UNAVAILABLE', 'CHECK_OVERDUE', 'UNVERIFIED'].includes(latestAssessment.sourceFreshness) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`} role="status">
                          <b>{latestAssessment.sourceFreshness === 'SOURCE_CHANGED' ? 'Source changed after this review.' :
                            latestAssessment.sourceFreshness === 'CHECK_UNAVAILABLE' ? 'Source monitoring check failed.' :
                              latestAssessment.sourceFreshness === 'CHECK_OVERDUE' ? 'Source verification is overdue.' :
                                latestAssessment.sourceFreshness === 'UNVERIFIED' ? 'Source snapshot has not been verified.' : latestAssessment.sourceFreshness === 'MONITORING_DISABLED' ? 'Monitoring is disabled for this source.' : 'This decision is not linked to a monitored source.'}</b>{' '}
                          {latestAssessment.sourceFreshness === 'SOURCE_CHANGED' ? 'Re-open the official source and record a new decision if the change affects this product.' : 'Do not treat this decision as freshly verified until the source status is checked.'}
                        </div>
                      )}
                      <p className="review-meta">Recorded {new Date(latestAssessment.reviewedAt).toLocaleString()} · history retained</p>
                    </div>
                    {relatedAssessments.length > 1 && relatedAssessments.slice(1, 4).map((item) => (
                      <div className="review-item" key={item.id}>
                        <div className="review-item-top">
                          <span className={`review-decision ${item.decision === 'APPLICABLE' ? 'ap' : item.decision === 'NOT_APPLICABLE' ? 'na' : item.decision === 'CONDITIONAL' ? 'conditional' : 'review'}`}>{DECISION_LABEL[item.decision]}</span>
                          <span>{new Date(item.reviewedAt).toLocaleDateString()}</span>
                        </div>
                        <p className="review-rationale">{item.rationale}</p>
                        {item.sourceVersion && <p className="review-help"><b>Source version:</b> {item.sourceVersion}</p>}
                        {item.sourceUrl && <p className="review-help"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Open source ↗</a></p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">No human-reviewed applicability decision is saved for this reference yet. A catalog match alone does not determine whether it applies.</div>
                )}

                <button type="button" className="review-toggle" onClick={() => setShowReviewForm((open) => !open)}>
                  {showReviewForm ? <X /> : <Shield />}
                  {showReviewForm ? 'Cancel decision entry' : latestAssessment ? 'Record a new review decision' : 'Record review decision'}
                </button>
                {showReviewForm && (
                  <div className="review-form">
                    <p className="review-help" style={{ marginTop: 0, marginBottom: 12 }}>
                      This form records a human decision; it does not calculate legal applicability automatically. Only Quality Managers and Directors can save decisions. Each submission is retained in the review history.
                    </p>
                    <div className="review-form-grid">
                      <div className="review-field">
                        <label htmlFor="applicability-decision">Decision *</label>
                        <select id="applicability-decision" value={decision} onChange={(event) => setDecision(event.target.value as ApplicabilityDecision)}>
                          <option value="APPLICABLE">Applicable</option>
                          <option value="CONDITIONAL">Conditionally applicable</option>
                          <option value="NOT_APPLICABLE">Not applicable</option>
                          <option value="NEEDS_REVIEW">Needs further review</option>
                        </select>
                      </div>
                      <div className="review-field">
                        <label htmlFor="applicability-source-version">Source version / edition</label>
                        <input id="applicability-source-version" value={sourceVersion} onChange={(event) => setSourceVersion(event.target.value)} placeholder="e.g. revision or consolidated version" />
                      </div>
                      <div className="review-field full">
                        <label htmlFor="applicability-source-search">Link to a monitored source (recommended)</label>
                        <input id="applicability-source-search" type="search" value={sourceRegistrySearch} onChange={(event) => setSourceRegistrySearch(event.target.value)} placeholder="Search the source registry by name, country, domain or ID…" />
                        <select
                          id="applicability-monitored-source"
                          value={selectedMonitoredSourceId}
                          onChange={(event) => {
                            const id = event.target.value;
                            setSelectedMonitoredSourceId(id);
                            const source = monitoredSources.find((item) => item.sourceId === id);
                            if (source) setSourceUrlText(source.officialUrl);
                          }}
                        >
                          <option value="">No registry source selected</option>
                          {filteredMonitoredSources.map((source) => (
                            <option key={source.sourceId} value={source.sourceId}>
                              {source.sourceId} · {source.jurisdiction} · {source.sourceName} · every {source.checkIntervalHours}h
                            </option>
                          ))}
                        </select>
                        <small>{monitoredSourcesLoading ? 'Loading registered sources…' : monitoredSourcesError ? 'Could not load the registry. You may enter a URL, but it will be linked only if it matches a registered monitored source.' : selectedMonitoredSource ? `Linked to ${selectedMonitoredSource.sourceId}. ${selectedMonitoredSource.verificationStatus}` : 'Selecting a source stores its stable registry ID so future source changes can mark this decision for re-review. Only enabled sources are listed.'}</small>
                      </div>
                      <div className="review-field full">
                        <label htmlFor="applicability-source-url">Regulatory source URL</label>
                        <input id="applicability-source-url" type="url" inputMode="url" value={sourceUrlText} onChange={(event) => { setSourceUrlText(event.target.value); setSelectedMonitoredSourceId(''); }} placeholder="https://official-authority.example/regulation" />
                        <small>Prefer the regulator or official publisher. HTTPS URLs only. Registry entries marked for verification are not yet confirmed as authoritative. If a registry source is selected, keep the URL within that source's registered path.</small>
                      </div>
                      <div className="review-field full">
                        <label htmlFor="applicability-rationale">Rationale *</label>
                        <textarea id="applicability-rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain the product scope, market, criteria and reasoning behind the decision…" maxLength={5000} />
                        <small>{rationale.trim().length}/5000 characters · at least 20 required</small>
                      </div>
                      {decision === 'CONDITIONAL' && (
                        <div className="review-field full">
                          <label htmlFor="applicability-conditions">Conditions *</label>
                          <textarea id="applicability-conditions" value={conditions} onChange={(event) => setConditions(event.target.value)} placeholder="Specify the conditions or limitations…" maxLength={5000} />
                        </div>
                      )}
                      <div className="review-field full">
                        <label htmlFor="applicability-evidence">Evidence references</label>
                        <textarea id="applicability-evidence" value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} placeholder="One document ID, filename or source reference per line" />
                        <small>References are recorded for traceability; they are not automatically verified or linked to a document.</small>
                      </div>
                    </div>
                    <div className="review-form-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowReviewForm(false)} disabled={savingDecision}>Cancel</button>
                      <button type="button" className="btn btn-primary" onClick={saveDecision} disabled={savingDecision}>
                        {savingDecision ? 'Saving…' : 'Save reviewed decision'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {d.assessedAt && (
              <p className="vb-note">
                Last applicability run for this product · {d.assessedAt}
                {d.versionNote ? ` · ${d.versionNote}` : ''}
              </p>
            )}

            {/* 2 · Metadata */}
            <div className="sec-label sec-gap">
              <span className="num">{N()}</span>
              {d.kind === 'CERTIFICATE' ? 'Certificate on the product record' : 'Reference metadata'}
            </div>
            <div className="meta-grid">
              {d.meta.map((c) => (
                <div className="mg" key={c.label}>
                  <div className="mg-l">{c.label}</div>
                  <div
                    className={
                      'mg-v' +
                      (c.mono ? ' mono' : '') +
                      (c.value.length > 46 ? ' small' : '') +
                      (c.tone === 'warn' ? ' warn' : c.tone === 'bad' ? ' bad' : '')
                    }
                  >
                    {c.value}
                  </div>
                </div>
              ))}
            </div>

            {/* 3 · Product context (not treated as assessment evidence) */}
            <div className="sec-label sec-gap">
              <span className="num">{N()}</span>
              Product context available for review
            </div>
            {d.signals.length > 0 && (
              <div className="signals">
                {d.signals.map((s) => (
                  <span className="sig" key={s.k} title={`${s.k}: ${s.v}`}>
                    <Info />
                    <span className="sig-k">{s.k}</span>
                    <span className="sig-v">{s.v}</span>
                  </span>
                ))}
              </div>
            )}
            <div className={reasonClass(d)}>
              {latestAssessment
                ? 'Catalog context only: the product attributes above provide context for the saved reviewer decision. Confirm that the rationale, source version and evidence remain current before relying on it.'
                : d.reason}
            </div>
            {d.condition && (
              <div className="reason warn">
                <b>Condition attached to this verdict.</b> {d.condition}
              </div>
            )}

            {/* 4 · Evidence */}
            <div className="sec-label sec-gap">
              <span className="num">{N()}</span>Supporting evidence on record
            </div>
            {d.evidence.length > 0 ? (
              d.evidence.map((e, i) => (
                <div className="ev" key={`${e.label}-${i}`}>
                  <div
                    className={
                      'ev-ic' + (e.kind === 'attribute' ? ' attr' : e.kind === 'external' ? ' ext' : '')
                    }
                  >
                    {e.kind === 'attribute' ? <Grid3x3 /> : e.kind === 'external' ? <Network /> : <FileText />}
                  </div>
                  <div>
                    <div className="ev-doc">{e.label}</div>
                    {e.detail && <div className="ev-quote">{e.detail}</div>}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">
                No supporting documents are linked to this reference from the product record. The product attributes above are context only; they have not been evaluated here and do not establish that this regulation applies.
              </div>
            )}

            {/* 5 · Obligations */}
            <div className="sec-label sec-gap">
              <span className="num">{N()}</span>Regulatory obligations
            </div>
            {d.obligations.length > 0 ? (
              <div className="obl-wrap">
                <table className="obl">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Clause</th>
                      <th>Obligation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.obligations.map((o, i) => (
                      <tr key={`${o.clause}-${i}`}>
                        <td className="obl-ref">{o.clause}</td>
                        <td>{o.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                No structured obligations are linked to this catalog record. Confirm the applicable obligations in the authoritative source; do not interpret this empty list as meaning that no obligations exist.
              </div>
            )}

            {/* 6 · Linked gaps / change events */}
            {(d.gapIds.length > 0 || d.changeEventIds.length > 0) && (
              <>
                <div className="sec-label sec-gap">
                  <span className="num">{N()}</span>Linked to
                </div>
                <div className="idlist">
                  {d.gapIds.map((g) => (
                    <span className="idchip" key={g}>
                      {g}
                    </span>
                  ))}
                  {d.changeEventIds.map((c) => (
                    <span className="idchip chg" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Legal boundary */}
            {licensed && (
              <div className={'legal' + (d.tier === 'USER_UPLOAD' ? ' usr' : '')}>
                <Lock />
                <div className="legal-txt">
                  <b>Reference handling must be confirmed before analysis.</b> The local catalog labels this item as “{d.tierLabel}”. Verify the authoritative source, your organization's license, and the permitted processing rules before uploading or analyzing any full text.
                </div>
              </div>
            )}

            {/* Engine note */}
            {d.engineNote && (
              <div className="airec">
                <div className="airec-head">
                  <Sparkles />
                  <span className="airec-title">Engine note</span>
                  <span className="q-badge">
                    <Lock />
                    AI-generated · pending QM review
                  </span>
                </div>
                <p>{d.engineNote}</p>
              </div>
            )}
          </div>

          {/* Footer: only expose actions that are actually implemented. */}
          <div className="m-foot">
            <span className="hitl-note">
              <Shield />
              Catalog details are reference context. Decisions saved here are reviewer-entered; verify the current authoritative source and retain supporting evidence.
            </span>
            {d.sourceUrl && (
              <a className="btn btn-ghost" href={d.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open source website
              </a>
            )}
            <button className="btn btn-primary" type="button" onClick={() => onOpenChange(false)}>
              Close
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
