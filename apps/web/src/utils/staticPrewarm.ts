import { subscribeAndroidPrewarmNetwork } from './androidBridge';
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
  /** Expanded packs wait for an unrestricted network; core artwork remains eligible. */
  optional?: boolean;
}
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string; type?: string };
const MiB = 1024 * 1024;
const manifestLimit = 256 * 1024;

/** Network policy is independent of layout width (including docked DevTools). */
export function isConstrainedPrewarmDevice() {
  if (typeof window.matchMedia !== 'function') return true;
  return Boolean(
    window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches,
  );
}

/** Missing browser network information is not evidence of a slow desktop connection. */
export function prewarmNetworkMode(
  mobile: boolean,
  connection?: Pick<Connection, 'saveData' | 'effectiveType' | 'type'>,
  nativeUnmetered?: boolean,
) {
  if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '')) return 'paused';
  if (nativeUnmetered !== undefined) return nativeUnmetered ? 'full' : 'core';
  return !mobile && connection?.type !== 'cellular' ? 'full' : 'core';
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

/** One finite, byte-only queue. Native HTTP cache owns storage and version reuse. */
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
  const completed = new Set<string>(),
    failed = new Set<string>(),
    ownRequests = new Set<string>();
  const failures = new Map<string, number>(),
    interruptions = new Map<string, number>();
  const retryAt = new Map<string, number>();
  let manifest: PrewarmManifest | undefined;
  let disposed = false,
    disabled = false,
    fetching = false,
    readBytes = 0;
  let nativeUnmetered: boolean | undefined;
  let lastActivity = Date.now(),
    settleAt = 0;
  let timer: number | undefined, idle: number | undefined;
  let controller: AbortController | undefined, activeUrl: string | undefined;
  const mode = () => prewarmNetworkMode(options.mobile(), connection, nativeUnmetered);
  const allowed = () =>
    !disposed &&
    !disabled &&
    scopes.size > 0 &&
    navigator.onLine !== false &&
    document.visibilityState === 'visible' &&
    mode() !== 'paused';
  function cancelScheduled() {
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    idle = undefined;
  }
  function pause(resetQuiet = true) {
    if (resetQuiet) lastActivity = Date.now();
    cancelScheduled();
    controller?.abort();
  }
  function urls(selection: PrewarmSelection) {
    const result = [
      ...(selection.urls || []),
      ...(selection.groups || []).flatMap((group) => manifest?.groups[group] || []),
    ];
    if (selection.groups?.some((group) => group.startsWith('manor.')) && manifest?.manorScene?.length) {
      const scenes = manifest.manorScene;
      const selected =
        scenes.find((scene) => scene.width >= innerWidth * (devicePixelRatio || 1)) || scenes[scenes.length - 1];
      return result.map((url) => (url === scenes[scenes.length - 1].url ? selected.url : url));
    }
    return result;
  }
  function selected(includeOptional = mode() === 'full') {
    const unique = new Map<string, { url: string; bytes: number }>();
    for (const selection of [...scopes.values()].sort((a, b) => a.priority - b.priority)) {
      if (selection.optional && !includeOptional) continue;
      for (const url of urls(selection)) {
        const bytes = manifest?.assets[url];
        if (bytes && !unique.has(url)) unique.set(url, { url, bytes });
      }
    }
    return [...unique.values()];
  }
  function pending() {
    return manifest
      ? selected().filter((item) => !completed.has(item.url) && !failed.has(item.url))
      : [{ url: '/static-prewarm.json', bytes: manifestLimit }];
  }
  const availableAt = (url: string) =>
    Math.max(
      retryAt.get(url) || 0,
      lastActivity + ((interruptions.get(url) || 0) >= 2 ? Math.max(delay, 30000) : delay),
    );
  function queue(minDelay = 50) {
    cancelScheduled();
    if (!allowed() || fetching || activeRequestCount() > 0) return;
    const items = pending();
    if (!items.length) return;
    const nextAt = Math.min(...items.map((item) => availableAt(item.url)));
    timer = window.setTimeout(
      () => {
        if (!allowed()) return;
        if (!ready()) {
          queue(500);
          return;
        }
        if (window.requestIdleCallback) {
          idle = window.requestIdleCallback(
            (deadline) => {
              idle = undefined;
              if (deadline.didTimeout || deadline.timeRemaining() >= 1) void next();
              else queue(100);
            },
            { timeout: 1000 },
          );
        } else void next();
      },
      Math.max(minDelay, nextAt - Date.now(), settleAt - Date.now()),
    );
  }
  async function next() {
    if (!allowed() || fetching) return;
    if (!ready()) {
      queue(500);
      return;
    }
    const item = pending().find((item) => availableAt(item.url) <= Date.now());
    if (!item || Date.now() < settleAt) {
      queue();
      return;
    }
    const request = new AbortController();
    controller = request;
    activeUrl = item.url;
    ownRequests.add(new URL(item.url, location.origin).href);
    fetching = true;
    let timedOut = false,
      terminal = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 30000);
    try {
      const response = await fetcher(item.url, {
        signal: request.signal,
        credentials: 'same-origin',
        redirect: 'error',
        cache: manifest ? 'force-cache' : 'no-cache',
        priority: 'low',
      });
      if (!response.ok) {
        terminal = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
        throw Error('prewarm status');
      }
      if (
        !response.body ||
        Number(response.headers.get('Content-Length')) > item.bytes ||
        (manifest ? /text\/html/i : /^(?!application\/json)/i).test(response.headers.get('Content-Type') || '')
      ) {
        terminal = true;
        throw Error('prewarm response');
      }
      const reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let received = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (request.signal.aborted) throw Error('prewarm aborted');
          if (done) break;
          received += value.byteLength;
          readBytes += value.byteLength;
          if (received > item.bytes) {
            terminal = true;
            throw Error('prewarm size');
          }
          if (!manifest) parts.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (request.signal.aborted) throw Error('prewarm aborted');
      if (!manifest) {
        const body = new Uint8Array(received);
        let offset = 0;
        for (const part of parts) {
          body.set(part, offset);
          offset += part.byteLength;
        }
        terminal = true;
        manifest = validatePrewarmManifest(JSON.parse(new TextDecoder().decode(body)), options.entryUrl);
        for (const resource of performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          markLoaded(resource);
      } else if (received !== item.bytes) {
        terminal = true;
        throw Error('prewarm incomplete');
      } else completed.add(item.url);
      retryAt.delete(item.url);
      interruptions.delete(item.url);
    } catch {
      if (!terminal && request.signal.aborted && !timedOut) {
        const count = (interruptions.get(item.url) || 0) + 1;
        interruptions.set(item.url, count);
        // A busy user must not blacklist an asset. Repeated half-downloads get a longer rest.
        if (count >= 2) retryAt.set(item.url, Date.now() + Math.min(120000, 30000 * 2 ** Math.min(count - 2, 2)));
      } else {
        const count = (failures.get(item.url) || 0) + 1;
        failures.set(item.url, count);
        if (terminal || count >= 3) {
          failed.add(item.url);
          if (!manifest) disabled = true;
        } else retryAt.set(item.url, Date.now() + 5000 * count);
      }
      // Rejected headers/status must not leave an unread response downloading in the background.
      request.abort();
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      activeUrl = undefined;
      fetching = false;
      queue();
    }
  }
  const isOwnResource = (entry: PerformanceEntry) =>
    (entry as PerformanceResourceTiming).initiatorType === 'fetch' && ownRequests.has(entry.name);
  function markLoaded(resource: PerformanceResourceTiming) {
    if (resource.decodedBodySize <= 0 || isOwnResource(resource)) return;
    const url = new URL(resource.name, location.origin);
    if (url.origin === location.origin && manifest?.assets[url.pathname + url.search])
      completed.add(url.pathname + url.search);
  }
  const activity = () => {
    pause();
    queue();
  };
  const unsubscribe = subscribeRequestActivity((_count, kind) => {
    pause(kind === 'foreground');
    settleAt = Date.now() + 250;
    queue();
  });
  const unsubscribeNetwork = subscribeAndroidPrewarmNetwork((value) => {
    nativeUnmetered = value;
    activity();
  });
  const inputEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
  for (const event of inputEvents) window.addEventListener(event, activity, { passive: true, capture: true });
  for (const event of ['online', 'offline', 'load', 'resize']) window.addEventListener(event, activity);
  document.addEventListener('visibilitychange', activity);
  connection?.addEventListener('change', activity);
  const observer =
    typeof PerformanceObserver === 'undefined'
      ? undefined
      : new PerformanceObserver((list) => {
          const external = list.getEntries().filter((entry) => !isOwnResource(entry));
          for (const entry of external) markLoaded(entry as PerformanceResourceTiming);
          if (external.length) {
            // Resource completion is not a new user action; polling cannot restart the quiet window forever.
            pause(false);
            settleAt = Date.now() + 250;
            queue();
          }
        });
  try {
    observer?.observe({ entryTypes: ['resource'] });
  } catch {
    observer?.disconnect();
  }
  function remove(scope: object) {
    scopes.delete(scope);
    if (!scopes.size || (activeUrl && manifest && !selected().some((item) => item.url === activeUrl))) pause(false);
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
    snapshot: () => {
      const items = selected(),
        remaining = pending();
      return {
        mode: mode(),
        readBytes,
        fetching,
        selected: items.length,
        completed: items.filter((item) => completed.has(item.url)).length,
        failed: items.filter((item) => failed.has(item.url)).length,
        pending: manifest ? remaining.length : 0,
        deferred: selected(true).length - items.length,
        disabled,
        reason: disposed
          ? 'disposed'
          : disabled
            ? 'disabled'
            : !allowed()
              ? 'restricted'
              : !ready()
                ? 'foreground'
                : fetching
                  ? 'fetching'
                  : Date.now() < lastActivity + delay
                    ? 'quiet-period'
                    : !manifest
                      ? 'manifest'
                      : !remaining.length
                        ? items.some((item) => failed.has(item.url))
                          ? 'complete-with-errors'
                          : selected(true).length > items.length
                            ? 'core-complete'
                            : 'complete'
                        : !remaining.some((item) => availableAt(item.url) <= Date.now())
                          ? 'retry-wait'
                          : 'idle',
      };
    },
    dispose() {
      disposed = true;
      pause();
      scopes.clear();
      unsubscribe();
      unsubscribeNetwork();
      observer?.disconnect();
      for (const event of inputEvents) window.removeEventListener(event, activity, true);
      for (const event of ['online', 'offline', 'load', 'resize']) window.removeEventListener(event, activity);
      document.removeEventListener('visibilitychange', activity);
      connection?.removeEventListener('change', activity);
    },
  };
}

let entryUrl = '';
let scheduler: ReturnType<typeof createStaticPrewarmScheduler> | undefined;
export function configureStaticPrewarmEntry(url: string) {
  entryUrl = url;
  Object.defineProperty(window, '__LIGHTNOTE_PREWARM__', {
    configurable: true,
    value: Object.freeze({ snapshot: () => scheduler?.snapshot() ?? { reason: 'not-started' } }),
  });
}
export function scheduleStaticPrewarm(selection: PrewarmSelection) {
  if (!entryUrl || !import.meta.env.PROD || (window as any).__PRERENDER__ || navigator.webdriver) return () => {};
  scheduler ||= createStaticPrewarmScheduler({ entryUrl, mobile: isConstrainedPrewarmDevice });
  return scheduler.submit(selection);
}
export function disposeStaticPrewarm() {
  scheduler?.dispose();
  scheduler = undefined;
}
