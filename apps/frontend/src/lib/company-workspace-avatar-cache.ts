/**
 * In-memory cache for tenant company logo blob URLs so navigation does not
 * refetch / revoke on every route change (fixes flicker/lag in the top bar).
 */
const objectUrlByAvatarKey = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

export function getCachedCompanyAvatarObjectUrl(avatarKey: string): string | null {
  return objectUrlByAvatarKey.get(avatarKey) ?? null;
}

function setCached(avatarKey: string, url: string) {
  const prev = objectUrlByAvatarKey.get(avatarKey);
  if (prev && prev !== url) URL.revokeObjectURL(prev);
  objectUrlByAvatarKey.set(avatarKey, url);
}

export function clearCompanyWorkspaceAvatarCache() {
  Array.from(objectUrlByAvatarKey.values()).forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  });
  objectUrlByAvatarKey.clear();
  inFlight.clear();
}

export async function ensureCompanyWorkspaceAvatarUrl(
  avatarKey: string,
  token: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const hit = getCachedCompanyAvatarObjectUrl(avatarKey);
  if (hit) return hit;

  let p = inFlight.get(avatarKey);
  if (!p) {
    p = (async () => {
      const path = `/api/company/avatar/image?v=${encodeURIComponent(avatarKey)}`;
      const res = await fetch(path, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      setCached(avatarKey, u);
      return u;
    })();
    inFlight.set(avatarKey, p);
    void p.finally(() => inFlight.delete(avatarKey));
  }
  return p;
}
