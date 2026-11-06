'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export type Lang = 'en' | 'fr' | 'es';

interface TranslationContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  isTranslating: boolean;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within <TranslationProvider>');
  }
  return ctx;
}

const STORAGE_KEY = 'qurelio.lang';
const CACHE_KEY = 'qurelio.translations.v1';

// Optional API key for libretranslate.com (https://portal.libretranslate.com)
const LIBRETRANSLATE_API_KEY =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_LIBRETRANSLATE_KEY) || '';

// MyMemory daily quota is per IP; appending a contact email raises it to 50k chars/day.
const MYMEMORY_EMAIL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MYMEMORY_EMAIL) || '';

// Session-level circuit breaker: once libretranslate returns 429 / 403,
// stop calling it for the rest of the session to keep the console clean.
let libreTranslateDisabled = !LIBRETRANSLATE_API_KEY;

async function tryLibreTranslate(q: string, target: Lang): Promise<string | null> {
  if (libreTranslateDisabled) return null;
  try {
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      body: JSON.stringify({
        q,
        source: 'auto',
        target,
        format: 'text',
        alternatives: 3,
        api_key: LIBRETRANSLATE_API_KEY,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 429 || res.status === 403) {
      libreTranslateDisabled = true;
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { translatedText?: string };
    return json?.translatedText || null;
  } catch {
    libreTranslateDisabled = true;
    return null;
  }
}

async function tryMyMemory(q: string, target: Lang): Promise<string | null> {
  try {
    let url =
      'https://api.mymemory.translated.net/get' +
      `?q=${encodeURIComponent(q)}` +
      `&langpair=${encodeURIComponent('Autodetect')}|${target}`;
    if (MYMEMORY_EMAIL) url += `&de=${encodeURIComponent(MYMEMORY_EMAIL)}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    };
    const status = Number(json?.responseStatus ?? 0);
    const t = json?.responseData?.translatedText;
    if (status !== 200 || !t || typeof t !== 'string') return null;

    const upper = t.toUpperCase();
    if (
      upper.startsWith('MYMEMORY WARNING') ||
      upper.startsWith('PLEASE SELECT') ||
      upper.startsWith('INVALID') ||
      upper.includes('QUERY LENGTH LIMIT')
    ) {
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

async function translateOne(q: string, target: Lang): Promise<string> {
  const trimmed = q.trim();
  if (!trimmed) return q;

  // 1) LibreTranslate (uses the user-provided API shape, auto source detect)
  const lt = await tryLibreTranslate(trimmed, target);
  if (lt) return lt;

  // 2) MyMemory fallback (works without key, generous CORS)
  const mm = await tryMyMemory(trimmed, target);
  if (mm) return mm;

  return q;
}

function loadDiskCache(): Record<string, Partial<Record<Lang, string>>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDiskCache(c: Record<string, Partial<Record<Lang, string>>>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore quota */
  }
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const txt = node.nodeValue;
      if (!txt || !txt.trim()) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT;
      let p: HTMLElement | null = parent;
      while (p) {
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [isTranslating, setIsTranslating] = useState(false);

  // Cache: original-text -> { fr, es }
  const cacheRef = useRef<Record<string, Partial<Record<Lang, string>>>>({});
  // Original text per node (so we always re-translate from baseline)
  const originalsRef = useRef<WeakMap<Text, string>>(new WeakMap());

  // Restore preference + disk cache on mount
  useEffect(() => {
    cacheRef.current = loadDiskCache();
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved && saved !== 'en') {
        setTimeout(() => applyLang(saved), 80);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyLang = useCallback(async (next: Lang) => {
    if (typeof document === 'undefined') return;
    const root =
      (document.querySelector('[data-translate-root]') as HTMLElement | null) ||
      document.body;

    const nodes = collectTextNodes(root);

    // Snapshot originals on first encounter
    nodes.forEach((node) => {
      if (!originalsRef.current.has(node)) {
        originalsRef.current.set(node, node.nodeValue || '');
      }
    });

    if (next === 'en') {
      nodes.forEach((node) => {
        const orig = originalsRef.current.get(node);
        if (orig != null) node.nodeValue = orig;
      });
      setLangState('en');
      try { localStorage.setItem(STORAGE_KEY, 'en'); } catch { /* ignore */ }
      return;
    }

    setIsTranslating(true);

    // Build set of unique original texts that still need translation
    const uniques = new Set<string>();
    nodes.forEach((node) => {
      const orig = originalsRef.current.get(node);
      if (!orig) return;
      const trimmed = orig.trim();
      if (!trimmed) return;
      if (cacheRef.current[orig]?.[next]) return;
      uniques.add(orig);
    });

    const list = Array.from(uniques);
    // Small parallel batches + a tiny gap between batches to be polite
    const BATCH = 2;
    for (let i = 0; i < list.length; i += BATCH) {
      const slice = list.slice(i, i + BATCH);
      const translated = await Promise.all(slice.map((s) => translateOne(s.trim(), next)));
      slice.forEach((src, k) => {
        if (!cacheRef.current[src]) cacheRef.current[src] = {};
        const leading = src.match(/^\s*/)?.[0] ?? '';
        const trailing = src.match(/\s*$/)?.[0] ?? '';
        cacheRef.current[src][next] = leading + translated[k] + trailing;
      });
      saveDiskCache(cacheRef.current);
      if (i + BATCH < list.length) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    nodes.forEach((node) => {
      const orig = originalsRef.current.get(node);
      if (!orig) return;
      const t = cacheRef.current[orig]?.[next];
      if (t != null) node.nodeValue = t;
    });

    setIsTranslating(false);
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const setLang = useCallback((next: Lang) => {
    if (next === lang || isTranslating) return;
    void applyLang(next);
  }, [lang, isTranslating, applyLang]);

  return (
    <TranslationContext.Provider value={{ lang, setLang, isTranslating }}>
      {children}
    </TranslationContext.Provider>
  );
}
