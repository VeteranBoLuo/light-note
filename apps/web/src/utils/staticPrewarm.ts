import { activeRequestCount, subscribeRequestActivity } from '@/http/requestActivity';

export interface PrewarmManifest {
  version: 1;
  entries: string[];
  assets: Record<string, number>;
  groups: Record<string, string[]>;
  manorScene?: Array<{ url: string; width: number }>;
}
export interface PrewarmSelection {
  urls?: readonly string[];
  groups?: readonly string[];
  priority: number;
}
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
const MiB = 1024 * 1024;
const manifestLimit = 256 * 1024;

export function prewarmBudget(mobile: boolean, effectiveType?: string) {
  return (effectiveType === '4g' ? (mobile ? 2 : 12) : mobile ? 0.5 : 4) * MiB;
}

export function validatePrewarmManifest(value: unknown, entryUrl: string): PrewarmManifest {
  const data = value as PrewarmManifest;
  const entry = new URL(entryUrl, location.origin);
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    !data.entries.includes(entry.pathname) ||
    !data.assets ||
    !data.groups ||
    typeof data.assets !== 'object' ||
    typeof data.groups !== 'object' ||
    Object.keys(data.assets).length > 3000 ||
    Object.keys(data.groups).length > 100
  )
    throw Error('prewarm manifest');
  for (const [path, bytes] of Object.entries(data.assets)) {
    const url = new URL(path, location.origin);
    if (
      url.origin !== location.origin ||
      url.pathname + url.search !== path ||
      url.hash ||
      !/^\/(?:assets|manor)\/[\w./-]+\.(?:js|mjs|css|webp|png|jpg|jpeg|svg|woff2?|ttf)(?:\?v=[a-f0-9]{16})?$/.test(
        path,
      ) ||
      path.includes('..') ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > 4 * MiB
    )
      throw Error('prewarm asset');
  }
  for (const urls of Object.values(data.groups)) {
    if (
      !Array.isArray(urls) ||
      urls.length > 500 ||
      urls.some((url) => typeof url !== 'string' || !Object.hasOwn(data.assets, url))
    )
      throw Error('prewarm group');
  }
  if (
    data.manorScene &&
    (!Array.isArray(data.manorScene) ||
      data.manorScene.length > 8 ||
      data.manorScene.some(
        (item, index) =>
          !item ||
          !Object.hasOwn(data.assets, item.url) ||
          !Number.isFinite(item.width) ||
          item.width <= 0 ||
          (index > 0 && item.width <= data.manorScene![index - 1].width),
      ))
  )
    throw Error('prewarm scene');
  return data;
}

function foregroundReady() {
  return (
    activeRequestCount() === 0 &&
    document.readyState === 'complete' &&
    document.fonts?.status !== 'loading' &&
    [...document.images].every((image) => {
      if (image.complete) return true;
      const rect = image.getBoundingClientRect();
      return (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      );
    })
  );
}

/** One page-wide, byte-only queue. No imports, image decoding, private data or persistent queue state. */
export function createStaticPrewarmScheduler(options: {
  entryUrl: string;
  mobile: () => boolean;
  delayMs?: number;
  fetcher?: typeof fetch;
  ready?: () => boolean;
}) {
  const fetcher = options.fetcher || fetch;
  const ready = options.ready || foregroundReady;
  const delay = options.delayMs ?? 8000;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const scopes = new Map<object, PrewarmSelection>();
  const completed = new Set<string>();
  const failed = new Set<string>();
  const attempts = new Map<string, number>();
  const ownRequests = new Set<string>();
  let manifest: PrewarmManifest | undefined;
  let disposed = false,
    disabled = false,
    fetching = false,
    usedBytes = 0;
  let lastActivity = Date.now(),
    timer: number | undefined,
    idle: number | undefined;
  let controller: AbortController | undefined, activeUrl: string | undefined;
  const allowed = () =>
    !disposed &&
    !disabled &&
    scopes.size > 0 &&
    navigator.onLine !== false &&
    document.visibilityState === 'visible' &&
    !connection?.saveData &&
    !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
  const budget = () => prewarmBudget(options.mobile(), connection?.effectiveType);
  function pause() {
    lastActivity = Date.now();
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    idle = undefined;
    controller?.abort();
  }
  function urls(selection: PrewarmSelection) {
    const result = [
      ...(selection.urls || []),
      ...(selection.groups || []).flatMap((group) => manifest?.groups[group] || []),
    ];
    if (selection.groups?.includes('manor.desktop') && manifest?.manorScene?.length) {
      const scenes = manifest.manorScene;
      const selected =
        scenes.find((scene) => scene.width >= innerWidth * (devicePixelRatio || 1)) || scenes[scenes.length - 1];
      return result.map((url) => (url === scenes[scenes.length - 1].url ? selected.url : url));
    }
    return result;
  }
  function candidate() {
    for (const selection of [...scopes.values()].sort((a, b) => a.priority - b.priority)) {
      for (const url of urls(selection)) {
        const bytes = manifest?.assets[url];
        if (
          bytes &&
          !completed.has(url) &&
          !failed.has(url) &&
          (attempts.get(url) || 0) < 2 &&
          usedBytes + bytes <= budget()
        )
          return { url, bytes };
      }
    }
  }
  function queue() {
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    idle = undefined;
    if (!allowed() || fetching || (manifest && !candidate())) return;
    timer = window.setTimeout(
      () => {
        if (!allowed()) return;
        if (!ready()) {
          lastActivity = Date.now();
          queue();
          return;
        }
        if (window.requestIdleCallback) {
          idle = window.requestIdleCallback((deadline) => {
            idle = undefined;
            if (deadline.timeRemaining() >= 8) void next();
            else {
              lastActivity = Date.now();
              queue();
            }
          });
        } else void next();
      },
      Math.max(50, delay - (Date.now() - lastActivity)),
    );
  }
  async function next() {
    if (!allowed() || !ready() || fetching) return;
    if (Date.now() - lastActivity < delay) {
      queue();
      return;
    }
    const item = manifest ? candidate() : { url: '/static-prewarm.json', bytes: manifestLimit };
    if (!item || usedBytes + item.bytes > budget()) return;
    // Reserve the whole request before sending. Aborted bytes are never refunded:
    // repeating a half-download cannot silently exceed this session's budget.
    usedBytes += item.bytes;
    attempts.set(item.url, (attempts.get(item.url) || 0) + 1);
    const request = new AbortController();
    controller = request;
    activeUrl = item.url;
    ownRequests.add(new URL(item.url, location.origin).href);
    fetching = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 15000);
    try {
      const response = await fetcher(item.url, {
        signal: request.signal,
        credentials: 'same-origin',
        redirect: 'error',
        cache: manifest ? 'force-cache' : 'no-cache',
        priority: 'low',
      });
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get('Content-Length')) > item.bytes ||
        (manifest ? /text\/html/i : /^(?!application\/json)/i).test(response.headers.get('Content-Type') || '')
      )
        throw Error('prewarm response');
      const reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let received = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (request.signal.aborted) throw Error('prewarm aborted');
          if (done) break;
          received += value.byteLength;
          if (received > item.bytes) {
            request.abort();
            throw Error('prewarm size');
          }
          if (!manifest) parts.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (request.signal.aborted) return;
      if (!manifest) {
        const body = new Uint8Array(received);
        let offset = 0;
        for (const part of parts) {
          body.set(part, offset);
          offset += part.byteLength;
        }
        manifest = validatePrewarmManifest(JSON.parse(new TextDecoder().decode(body)), options.entryUrl);
        for (const resource of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
          if (resource.decodedBodySize > 0) {
            const url = new URL(resource.name, location.origin);
            if (url.origin === location.origin && manifest.assets[url.pathname + url.search])
              completed.add(url.pathname + url.search);
          }
        }
        usedBytes -= item.bytes - received;
      } else if (received !== item.bytes) throw Error('prewarm incomplete');
      else completed.add(item.url);
    } catch {
      if (timedOut || !request.signal.aborted) failed.add(item.url);
      if (!manifest && (failed.has(item.url) || (attempts.get(item.url) || 0) >= 2)) disabled = true;
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      activeUrl = undefined;
      fetching = false;
      queue();
    }
  }
  const activity = () => {
    pause();
    queue();
  };
  const unsubscribe = subscribeRequestActivity(activity);
  const inputEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
  for (const event of inputEvents) window.addEventListener(event, activity, { passive: true, capture: true });
  for (const event of ['online', 'offline', 'load']) window.addEventListener(event, activity);
  document.addEventListener('visibilitychange', activity);
  connection?.addEventListener('change', activity);
  const observer =
    typeof PerformanceObserver === 'undefined'
      ? undefined
      : new PerformanceObserver((list) => {
          if (list.getEntries().some((entry) => !ownRequests.has(entry.name))) activity();
        });
  try {
    observer?.observe({ entryTypes: ['resource'] });
  } catch {
    observer?.disconnect();
  }
  function remove(scope: object) {
    scopes.delete(scope);
    if (activeUrl && manifest && ![...scopes.values()].some((selection) => urls(selection).includes(activeUrl!)))
      pause();
    if (!scopes.size) pause();
    queue();
  }
  return {
    submit(selection: PrewarmSelection) {
      const scope = {};
      scopes.set(scope, selection);
      queue();
      return () => remove(scope);
    },
    activity,
    snapshot: () => ({ usedBytes, budget: budget(), fetching, completed: completed.size, disabled }),
    dispose() {
      disposed = true;
      pause();
      scopes.clear();
      unsubscribe();
      observer?.disconnect();
      for (const event of inputEvents) window.removeEventListener(event, activity, true);
      for (const event of ['online', 'offline', 'load']) window.removeEventListener(event, activity);
      document.removeEventListener('visibilitychange', activity);
      connection?.removeEventListener('change', activity);
    },
  };
}

let entryUrl = '',
  mobile = true;
let scheduler: ReturnType<typeof createStaticPrewarmScheduler> | undefined;
export function configureStaticPrewarmEntry(url: string) {
  entryUrl = url;
}
export function setStaticPrewarmMobile(value: boolean) {
  mobile = value;
  scheduler?.activity();
}
export function scheduleStaticPrewarm(selection: PrewarmSelection) {
  if (!entryUrl || !import.meta.env.PROD || (window as any).__PRERENDER__ || navigator.webdriver) return () => {};
  scheduler ||= createStaticPrewarmScheduler({ entryUrl, mobile: () => mobile });
  return scheduler.submit(selection);
}
export function disposeStaticPrewarm() {
  scheduler?.dispose();
  scheduler = undefined;
}
