'use client';

import { useMemo, useState } from 'react';

export type IsoTocSection = {
  clauseNumber?: string | null;
  heading: string;
  title?: string | null;
  content: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  requirements?: Array<Partial<IsoTocRequirement>>;
};

export type IsoTocRequirement = {
  id: string;
  clauseRef: string;
  clauseTitle: string;
  isAnnex: boolean;
  text: string;
  type: 'mandatory' | 'recommended' | 'informative' | 'conditional';
  modalVerb?: string | null;
  appliesIf?: string | null;
  crossReferences: string[];
  grounded: boolean | null;
  groundedInSection?: boolean | null;
  clauseMappingConfidence?: number | null;
};

type Filter = 'all' | 'mandatory' | 'recommended' | 'conditional' | 'review';
type Group = { index: number; ref: string; title: string; section?: IsoTocSection; rows: IsoTocRequirement[] };

const TYPE_STYLES: Record<string, string> = {
  mandatory: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  recommended: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  conditional: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
};
const TYPE_LABELS: Record<string, string> = { mandatory: 'Mandatory', recommended: 'Recommended', conditional: 'Conditional' };
const keyFor = (ref: string) => ref.trim().replace(/\s+/g, ' ').toLowerCase();
const needsReview = (r: IsoTocRequirement) => r.grounded === false || r.groundedInSection === false ||
  (typeof r.clauseMappingConfidence === 'number' && r.clauseMappingConfidence < 0.5) || !r.clauseRef || r.clauseRef.toUpperCase() === 'UNMAPPED';

function RequirementRow({ req }: { req: IsoTocRequirement }) {
  const refs = Array.isArray(req.crossReferences) ? req.crossReferences : [];
  // A grouped list remains one source-grounded passage; line breaks only improve reading.
  const displayText = req.text.replace(/\s+(?=\([a-z]\)\s)/gi, '\n');
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TYPE_STYLES[req.type] || 'bg-slate-100 text-slate-700'}`}>
          {TYPE_LABELS[req.type] || 'Review'}
        </span>
        {needsReview(req) && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">Verify source</span>}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{displayText}</p>
      {req.appliesIf && <p className="mt-3 text-xs leading-5 text-[var(--muted)]"><span className="font-semibold">Applies when:</span> {req.appliesIf}</p>}
      {refs.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--muted)]"><span className="font-semibold">References:</span> {refs.join(', ')}</p>}
    </li>
  );
}

export function IsoStandardTocView({ sections, requirements = [], expandedIdx, onToggle }: {
  sections: IsoTocSection[];
  requirements?: IsoTocRequirement[];
  expandedIdx: number | null;
  onToggle: (idx: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const allRequirements = useMemo(() => {
    const fallback = sections.flatMap((section, sectionIndex) => (section.requirements || []).map((item, rowIndex) => ({
      ...item, id: item.id || `legacy-${sectionIndex}-${rowIndex}`,
      clauseRef: item.clauseRef || section.clauseNumber || 'UNMAPPED',
      clauseTitle: item.clauseTitle || section.title || section.heading || '',
      crossReferences: item.crossReferences || [], grounded: item.grounded ?? null,
    })));
    const source = requirements.length ? requirements : fallback;
    return source.filter((item) => item && typeof item.text === 'string' && item.text.trim() &&
      ['mandatory', 'recommended', 'conditional'].includes(String(item.type || '').toLowerCase()))
      .map((item) => ({ ...item, type: String(item.type).toLowerCase() })) as IsoTocRequirement[];
  }, [requirements, sections]);

  const groups = useMemo(() => {
    const byRef = new Map<string, Group>();
    sections.forEach((section, index) => {
      const ref = (section.clauseNumber || '').trim();
      if (ref && !byRef.has(keyFor(ref))) byRef.set(keyFor(ref), { index, ref, title: section.title || section.heading || ref, section, rows: [] });
    });
    let nextIndex = sections.length;
    for (const req of allRequirements) {
      const rawRef = (req.clauseRef || '').trim();
      const ref = !rawRef || rawRef.toUpperCase() === 'UNMAPPED' ? 'Unassigned' : rawRef;
      const key = keyFor(ref);
      if (!byRef.has(key)) byRef.set(key, { index: nextIndex++, ref, title: req.clauseTitle || (ref === 'Unassigned' ? 'Source location needs review' : 'Extracted requirements'), rows: [] });
      byRef.get(key)!.rows.push(req);
    }
    return Array.from(byRef.values()).filter((group) => group.rows.length > 0);
  }, [sections, allRequirements]);

  const counts = {
    all: allRequirements.length,
    mandatory: allRequirements.filter((r) => r.type === 'mandatory').length,
    recommended: allRequirements.filter((r) => r.type === 'recommended').length,
    conditional: allRequirements.filter((r) => r.type === 'conditional').length,
    review: allRequirements.filter(needsReview).length,
  };
  const needle = query.trim().toLowerCase();
  const visible = groups.map((group) => ({ ...group, rows: group.rows.filter((req) => {
    const matchesFilter = filter === 'all' || (filter === 'review' ? needsReview(req) : req.type === filter);
    return matchesFilter && (!needle || [group.ref, group.title, req.clauseTitle, req.text, req.appliesIf].some((value) => String(value || '').toLowerCase().includes(needle)));
  }) })).filter((group) => group.rows.length > 0);
  const visibleCount = visible.reduce((sum, group) => sum + group.rows.length, 0);
  const filters: Array<[Filter, string]> = [['all', 'All'], ['mandatory', 'Mandatory'], ['recommended', 'Recommended'], ['conditional', 'Conditional'], ['review', 'Verify']];

  return (
    <section className="space-y-4" aria-label="Extracted requirements">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">Requirements workspace</p>
            <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Extracted requirements</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--muted)]">Browse the obligations identified in this document by clause, article or annex. Verify the wording and context against the original.</p>
          </div>
          <div className="shrink-0 rounded-xl bg-[var(--brand-primary)]/[0.08] px-4 py-3 text-center"><p className="text-2xl font-bold text-[var(--brand-primary)]">{counts.all}</p><p className="text-xs text-[var(--muted)]">requirements found</p></div>
        </div>
        <label className="mt-4 block"><span className="sr-only">Search requirements</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a clause, article or requirement…" className="w-full rounded-lg border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" /></label>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter requirements">
          {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${filter === value ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand-primary)]'}`}>{label} <span className="ml-1 opacity-80">{counts[value]}</span></button>)}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]" role="status">Showing {visibleCount} of {counts.all} requirements in {visible.length} clause{visible.length === 1 ? '' : 's'}.</p>
      {visible.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">{counts.all ? 'No requirements match these filters. Try a different search or select All.' : 'No requirements have been identified yet. Check extraction progress and review the original document.'}</div> : (
        <div className="space-y-2">
          {visible.map((group) => {
            const open = expandedIdx === group.index || Boolean(needle);
            const start = group.section?.pageStart;
            const end = group.section?.pageEnd;
            const page = start ? (end && end !== start ? `Pages ${start}–${end}` : `Page ${start}`) : '';
            return <div key={`${group.ref}-${group.index}`} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <button type="button" onClick={() => onToggle(group.index)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--brand-primary)]/[0.04]">
                <span className="shrink-0 rounded-lg bg-[var(--brand-primary)]/10 px-2.5 py-1.5 text-xs font-bold text-[var(--brand-primary)]">{group.ref}</span>
                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-[var(--text-primary)]">{group.title}</span><span className="mt-1 block text-xs text-[var(--muted)]">{group.rows.length} requirement{group.rows.length === 1 ? '' : 's'}{page ? ` · ${page}` : ''}</span></span>
                <span className="shrink-0 text-xs font-semibold text-[var(--brand-primary)]">{open ? 'Hide' : 'View'}</span>
              </button>
              {open && <div className="border-t border-[var(--border)] bg-[var(--page-bg)]/60 p-3 sm:p-4">{group.ref === 'Unassigned' && <p className="mb-3 text-xs leading-5 text-amber-800 dark:text-amber-300">The source clause could not be assigned automatically. Verify it in the original document before using these results.</p>}<ul className="space-y-2">{group.rows.map((req, index) => <RequirementRow key={req.id || `${group.index}-${index}`} req={req} />)}</ul></div>}
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
