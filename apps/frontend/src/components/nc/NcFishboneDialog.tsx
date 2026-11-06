'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Network, Sparkles } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_BRANCHES = [
  { key: 'man', label: 'Man (People)', shortLabel: 'Man', hint: 'Training, staffing, communication' },
  { key: 'machine', label: 'Machine', shortLabel: 'Machine', hint: 'Tools, software, equipment' },
  { key: 'material', label: 'Material', shortLabel: 'Material', hint: 'Inputs, documents, data quality' },
  { key: 'method', label: 'Method', shortLabel: 'Method', hint: 'Procedures, work instructions' },
  { key: 'measurement', label: 'Measurement', shortLabel: 'Measurement', hint: 'Metrics, calibration, inspection' },
  { key: 'environment', label: 'Environment', shortLabel: 'Environment', hint: 'Workspace, suppliers, context' },
] as const;

export type IshikawaBranchKey = (typeof DEFAULT_BRANCHES)[number]['key'];

const LAYOUT = {
  marginX: 40,
  marginY: 36,
  titleH: 40,
  colGap: 24,
  rowGapFromSpine: 44,
  boxW: 248,
  labelH: 22,
  padY: 10,
  padX: 12,
  lineH: 13,
  fontSize: 10.5,
  charsPerLine: 36,
  headW: 152,
  headH: 56,
  spineEndPad: 24,
} as const;

function seedFromNc(title: string, description: string) {
  const t = `${title} ${description}`.replace(/\s+/g, ' ').trim().slice(0, 200);
  return {
    man: t ? `People factors linked to: ${t.slice(0, 80)}…` : 'People / competence / workload',
    machine: t ? `Tools & systems involved in ${t.slice(0, 60)}…` : 'Equipment or tooling limitations',
    material: 'Specifications, documents, or raw inputs',
    method: 'Procedure clarity and sequence of operations',
    measurement: 'How conformity was checked and recorded',
    environment: 'Organizational context, suppliers, or site conditions',
  };
}

/** Word-wrap without truncating: full branch text visible in the diagram. */
function wrapBranchTextFull(raw: string, maxCharsPerLine: number): string[] {
  const clean = raw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return ['-'];
  const words = clean.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharsPerLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['-'];
}

type BoneRender = {
  key: IshikawaBranchKey;
  label: string;
  side: 'top' | 'bottom';
  col: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  spineX: number;
  lines: string[];
};

type DiagramLayout = {
  w: number;
  h: number;
  spineY: number;
  spineX1: number;
  spineX2: number;
  headX: number;
  headY: number;
  bones: BoneRender[];
};

function computeFishboneLayout(branches: Record<string, string>): DiagramLayout {
  const meta = DEFAULT_BRANCHES;
  const topMeta = meta.slice(0, 3);
  const bottomMeta = meta.slice(3);

  const topSizes = topMeta.map((m) => {
    const lines = wrapBranchTextFull(branches[m.key] ?? '', LAYOUT.charsPerLine);
    const boxH = LAYOUT.labelH + LAYOUT.padY + lines.length * LAYOUT.lineH + LAYOUT.padY;
    return { key: m.key, label: m.shortLabel, lines, boxH };
  });
  const bottomSizes = bottomMeta.map((m) => {
    const lines = wrapBranchTextFull(branches[m.key] ?? '', LAYOUT.charsPerLine);
    const boxH = LAYOUT.labelH + LAYOUT.padY + lines.length * LAYOUT.lineH + LAYOUT.padY;
    return { key: m.key, label: m.shortLabel, lines, boxH };
  });

  const maxTopH = Math.max(...topSizes.map((b) => b.boxH), LAYOUT.labelH + 40);
  const maxBottomH = Math.max(...bottomSizes.map((b) => b.boxH), LAYOUT.labelH + 40);

  const topRowY = LAYOUT.marginY + LAYOUT.titleH;
  const spineY = topRowY + maxTopH + LAYOUT.rowGapFromSpine;
  const bottomRowY = spineY + LAYOUT.rowGapFromSpine;

  const gridW = 3 * LAYOUT.boxW + 2 * LAYOUT.colGap;
  const w = Math.max(960, LAYOUT.marginX * 2 + gridW + LAYOUT.headW + LAYOUT.spineEndPad + 40);

  const h =
    bottomRowY +
    maxBottomH +
    LAYOUT.marginY;

  const spineX1 = LAYOUT.marginX;
  const spineX2 = w - LAYOUT.marginX - LAYOUT.headW - LAYOUT.spineEndPad;
  const headX = spineX2 + LAYOUT.spineEndPad;
  const headY = spineY - LAYOUT.headH / 2;

  const bones: BoneRender[] = [];

  topSizes.forEach((b, col) => {
    const boxX = LAYOUT.marginX + col * (LAYOUT.boxW + LAYOUT.colGap);
    bones.push({
      key: b.key as IshikawaBranchKey,
      label: b.label,
      side: 'top',
      col,
      boxX,
      boxY: topRowY,
      boxW: LAYOUT.boxW,
      boxH: maxTopH,
      spineX: boxX + LAYOUT.boxW / 2,
      lines: b.lines,
    });
  });

  bottomSizes.forEach((b, col) => {
    const boxX = LAYOUT.marginX + col * (LAYOUT.boxW + LAYOUT.colGap);
    bones.push({
      key: b.key as IshikawaBranchKey,
      label: b.label,
      side: 'bottom',
      col,
      boxX,
      boxY: bottomRowY,
      boxW: LAYOUT.boxW,
      boxH: maxBottomH,
      spineX: boxX + LAYOUT.boxW / 2,
      lines: b.lines,
    });
  });

  return {
    w,
    h,
    spineY,
    spineX1,
    spineX2,
    headX,
    headY,
    bones,
  };
}

function boneAnchor(box: BoneRender) {
  const cx = box.boxX + box.boxW / 2;
  const cy = box.side === 'top' ? box.boxY + box.boxH : box.boxY;
  return { cx, cy };
}

export function NcFishboneDialog({
  open,
  onOpenChange,
  ncTitle,
  ncDescription,
  fetchAiBranches,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ncTitle: string;
  ncDescription: string;
  fetchAiBranches?: () => Promise<{ branches: Partial<Record<IshikawaBranchKey, string>>; model?: string | null } | null>;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const seeds = useMemo(() => seedFromNc(ncTitle, ncDescription), [ncTitle, ncDescription]);
  const [branches, setBranches] = useState<Record<string, string>>(() => ({ ...seeds }));
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const diagram = useMemo(() => computeFishboneLayout(branches), [branches]);

  const loadAi = useCallback(async () => {
    if (!fetchAiBranches) return;
    setAiLoading(true);
    try {
      const pack = await fetchAiBranches();
      if (pack?.branches) {
        setBranches((prev) => ({
          man: pack.branches.man ?? prev.man,
          machine: pack.branches.machine ?? prev.machine,
          material: pack.branches.material ?? prev.material,
          method: pack.branches.method ?? prev.method,
          measurement: pack.branches.measurement ?? prev.measurement,
          environment: pack.branches.environment ?? prev.environment,
        }));
      }
      setAiModel(pack?.model ?? null);
    } finally {
      setAiLoading(false);
    }
  }, [fetchAiBranches]);

  useEffect(() => {
    if (!open) return;
    setBranches({ ...seeds });
    setAiModel(null);
    if (!fetchAiBranches) return;
    let cancelled = false;
    setAiLoading(true);
    fetchAiBranches()
      .then((pack) => {
        if (cancelled || !pack?.branches) return;
        setBranches((prev) => ({
          man: pack.branches.man ?? prev.man,
          machine: pack.branches.machine ?? prev.machine,
          material: pack.branches.material ?? prev.material,
          method: pack.branches.method ?? prev.method,
          measurement: pack.branches.measurement ?? prev.measurement,
          environment: pack.branches.environment ?? prev.environment,
        }));
        setAiModel(pack.model ?? null);
      })
      .catch(() => {
        /* keep local seed text */
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, seeds, fetchAiBranches]);

  const exportPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 1.25;
      const canvas = document.createElement('canvas');
      canvas.width = diagram.w * scale;
      canvas.height = diagram.h * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((png) => {
        URL.revokeObjectURL(url);
        if (!png) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(png);
        a.download = `ishikawa-${ncTitle.replace(/[^\w\-]+/g, '-').slice(0, 40) || 'nc'}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [ncTitle, diagram.w, diagram.h]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[min(96vw,80rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-[var(--brand-primary)]" />
            Ishikawa (fishbone)
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted)]">
          Branches are pre-filled with AI.
          Edit any text, then export PNG for audit evidence.
        </p>
        {fetchAiBranches && (
          <div className="flex flex-wrap items-center gap-2 py-1">
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void loadAi()} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Regenerate AI branches
            </Button>
            {aiModel && (
              <span className="text-[11px] text-[var(--muted)]">
                Source: <span className="font-mono">{aiModel}</span>
              </span>
            )}
          </div>
        )}
        <div className="grid gap-3 py-2 sm:grid-cols-2">
          {DEFAULT_BRANCHES.map((b) => (
            <div key={b.key}>
              <Label className="text-xs font-semibold">{b.label}</Label>
              <p className="mb-1 text-[10px] text-[var(--muted)]">{b.hint}</p>
              <Textarea
                rows={4}
                value={branches[b.key] ?? ''}
                onChange={(e) => setBranches((p) => ({ ...p, [b.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="overflow-auto rounded-xl border border-[var(--border)] bg-gradient-to-b from-slate-50 to-white p-3 shadow-inner">
          <svg
            ref={svgRef}
            width={diagram.w}
            height={diagram.h}
            viewBox={`0 0 ${diagram.w} ${diagram.h}`}
            className="mx-auto block min-w-[min(100%,960px)]"
            style={{ minHeight: 320, maxWidth: '100%', height: 'auto' }}
            role="img"
            aria-label="Ishikawa fishbone diagram"
          >
            <defs>
              <filter id="fb-shadow" x="-8%" y="-8%" width="116%" height="116%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.12" />
              </filter>
            </defs>
            <rect width={diagram.w} height={diagram.h} fill="#f8fafc" rx="8" />
            <text x={LAYOUT.marginX} y={LAYOUT.marginY + 16} fontSize="14" fontWeight="700" fill="#0f172a">
              {ncTitle.trim() || 'Non-conformance'}
            </text>
            <line
              x1={diagram.spineX1}
              y1={diagram.spineY}
              x2={diagram.spineX2}
              y2={diagram.spineY}
              stroke="#1565c0"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <polygon
              points={`${diagram.spineX2},${diagram.spineY} ${diagram.spineX2 + 28},${diagram.spineY - 10} ${diagram.spineX2 + 28},${diagram.spineY + 10}`}
              fill="#1565c0"
            />
            <rect
              x={diagram.headX}
              y={diagram.headY}
              width={LAYOUT.headW}
              height={LAYOUT.headH}
              rx="10"
              fill="#e3f2fd"
              stroke="#1565c0"
              strokeWidth="1.5"
            />
            <text
              x={diagram.headX + LAYOUT.headW / 2}
              y={diagram.headY + LAYOUT.headH / 2 + 5}
              fontSize="12"
              textAnchor="middle"
              fill="#0d47a1"
              fontWeight="700"
            >
              Effect / NC
            </text>
            {diagram.bones.map((b) => {
              const anchor = boneAnchor(b);
              const textStartY = b.boxY + LAYOUT.labelH + LAYOUT.padY + 10;
              return (
                <g key={b.key}>
                  <line
                    x1={b.spineX}
                    y1={diagram.spineY}
                    x2={anchor.cx}
                    y2={anchor.cy}
                    stroke="#64748b"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <rect
                    x={b.boxX}
                    y={b.boxY}
                    width={b.boxW}
                    height={b.boxH}
                    rx="8"
                    fill="#ffffff"
                    stroke="#cbd5e1"
                    strokeWidth="1.25"
                    filter="url(#fb-shadow)"
                  />
                  <rect
                    x={b.boxX}
                    y={b.boxY}
                    width={b.boxW}
                    height={LAYOUT.labelH}
                    rx="8"
                    fill={b.side === 'top' ? '#e0f2fe' : '#f1f5f9'}
                  />
                  <rect
                    x={b.boxX}
                    y={b.boxY + LAYOUT.labelH - 4}
                    width={b.boxW}
                    height={4}
                    fill={b.side === 'top' ? '#e0f2fe' : '#f1f5f9'}
                  />
                  <text
                    x={b.boxX + b.boxW / 2}
                    y={b.boxY + 15}
                    fontSize="11"
                    textAnchor="middle"
                    fill="#0369a1"
                    fontWeight="700"
                  >
                    {b.label}
                  </text>
                  <text
                    x={b.boxX + LAYOUT.padX}
                    y={textStartY}
                    fontSize={LAYOUT.fontSize}
                    fill="#334155"
                  >
                    {b.lines.map((line, i) => (
                      <tspan key={i} x={b.boxX + LAYOUT.padX} dy={i === 0 ? 0 : LAYOUT.lineH}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" className="gap-2" onClick={exportPng}>
            Export PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
