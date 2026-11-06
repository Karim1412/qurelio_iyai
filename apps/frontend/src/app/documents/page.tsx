import { redirect } from 'next/navigation';

function toQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else q.set(k, v);
  }
  return q.toString();
}

/** @deprecated use `/docs`: kept for bookmarks and old links. */
export default async function DocumentsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = toQueryString(await searchParams);
  redirect(s ? `/docs?${s}` : '/docs');
}
