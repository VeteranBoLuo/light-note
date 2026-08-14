import { apiBasePost } from '@/http/request';

interface DrawingPreviewItem {
  id: string;
  revision: number;
  preview: unknown;
}

interface PendingPreview {
  id: string;
  key: string;
  resolve: (content: string) => void;
  promise: Promise<string>;
}

const BATCH_LIMIT = 12;
const CACHE_LIMIT = 64;
const CACHE_TTL_MS = 5 * 60_000;
const EMPTY_CACHE_TTL_MS = 30_000;
const pending = new Map<string, PendingPreview>();
const cache = new Map<string, { content: string; expiresAt: number }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const cacheKey = (id: string, revision?: number | null) => `${id}:${Number(revision || 0)}`;

function remember(key: string, content: string) {
  cache.delete(key);
  cache.set(key, { content, expiresAt: Date.now() + (content ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS) });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

function scheduleFlush() {
  if (flushTimer) return;
  // IntersectionObserver 会在同一帧汇报多张卡片；短暂合并即可避免逐卡请求。
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, 16);
}

async function flushPending() {
  const batch = [...pending.values()].slice(0, BATCH_LIMIT);
  batch.forEach((request) => pending.delete(request.key));
  if (!batch.length) return;
  try {
    const response = await apiBasePost(
      '/api/note/queryDrawingPreviews',
      { ids: [...new Set(batch.map((request) => request.id))] },
      { silent: true },
    );
    const items = Array.isArray(response?.data?.items) ? (response.data.items as DrawingPreviewItem[]) : [];
    const previews = new Map(
      items.map((item) => {
        try {
          return [String(item.id), JSON.stringify(item.preview)] as const;
        } catch {
          return [String(item.id), ''] as const;
        }
      }),
    );
    batch.forEach((request) => {
      const content = previews.get(request.id) || '';
      remember(request.key, content);
      request.resolve(content);
    });
  } catch {
    batch.forEach((request) => {
      remember(request.key, '');
      request.resolve('');
    });
  } finally {
    if (pending.size) scheduleFlush();
  }
}

export function loadDrawingPreview(id: string, revision?: number | null) {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return Promise.resolve('');
  const key = cacheKey(normalizedId, revision);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.content);
  if (cached) cache.delete(key);
  const existing = pending.get(key);
  if (existing) return existing.promise;

  let resolvePromise = (_content: string) => {};
  const promise = new Promise<string>((resolve) => {
    resolvePromise = resolve;
  });
  pending.set(key, { id: normalizedId, key, resolve: resolvePromise, promise });
  scheduleFlush();
  return promise;
}

export function invalidateDrawingPreview(id: string) {
  const prefix = `${String(id || '').trim()}:`;
  if (!prefix || prefix === ':') return;
  [...cache.keys()].forEach((key) => {
    if (key.startsWith(prefix)) cache.delete(key);
  });
}

export function resetDrawingPreviewCacheForTests() {
  cache.clear();
  pending.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
