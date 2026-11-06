'use client';

import { useAuthStore } from './auth-store';

export type AgentEvidenceExcerpt = {
  document_id: string;
  source_label?: string | null;
  excerpt: string;
  similarity_score: number;
};

export type AgentStreamEvent = {
  type: string;
  evaluation_id: string;
  ts: number;
  // Discriminated payload depending on `type`: typed loosely so the panel can render new event kinds without a code change.
  [key: string]: unknown;
};

export type StreamHandle = { close: () => void };

/**
 * Open an SSE stream to the evaluation activity feed and dispatch decoded events
 * to the supplied callback. Uses fetch + ReadableStream so we can attach the
 * Authorization header (EventSource cannot send custom headers).
 */
export function openEvaluationStream(
  evaluationId: string,
  onEvent: (ev: AgentStreamEvent) => void,
  onError?: (err: unknown) => void,
): StreamHandle {
  const controller = new AbortController();

  (async () => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/stream`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!res.ok || !res.body) {
        onError?.(new Error(`stream failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const ev = parseSseBlock(block);
          if (ev) onEvent(ev);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      onError?.(err);
    }
  })();

  return {
    close: () => controller.abort(),
  };
}

function parseSseBlock(block: string): AgentStreamEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    if (rawLine.startsWith('event:')) {
      event = rawLine.slice(6).trim();
    } else if (rawLine.startsWith('data:')) {
      dataLines.push(rawLine.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    return { ...parsed, type: event } as AgentStreamEvent;
  } catch {
    return null;
  }
}
