import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function toQueryString(sp: Record<string, string | string[] | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  return q.toString();
}

/** @deprecated Use `/docs`: file library. */
export default async function ReportsToDocsRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Keep a `view=reports` marker so the sidebar can keep the Reports tab
  // highlighted (otherwise the bare /docs URL lights up "My File Library").
  if (sp.view === undefined) sp.view = 'reports';
  const s = toQueryString(sp);
  redirect(s ? `/docs?${s}` : '/docs?view=reports');
}
