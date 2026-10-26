import { subscribeAndroidPrewarmNetwork } from './androidBridge';
import { requestActivitySnapshot, subscribeRequestActivity } from '@/http/requestActivity';
import { observePrewarmImages } from './prewarmImages';

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
  return document.readyState !== 'loading' && document.fonts?.status !== 'loading';
}

/** One finite byte-only queue; browser HTTP cache owns storage and version reuse. */
export function createStaticPrewarmScheduler(options: {
  entryUrl: string;
  mobile: () => boolean;
  delayMs?: number;
  fetcher?: typeof fetch;
  ready?: () => boolean;
}) {
  const fetcher = options.fetcher || fetch;
  const ready = options.ready || foregroundReady;
  const initialDelay = options.delayMs ?? 1000;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const scopes = new Map<object, PrewarmSelection>();
  const completed = new Set<string>(),
    failed = new Set<string>();
  const failures = new Map<string, number>(),
    interruptions = new Map<string, number>();
  const retryAt = new Map<string, number>();
  type PauseReason = 'foreground' | 'incremental' | 'restricted' | 'selection' | 'disposed';
  const aborts: Record<PauseReason, number> = {
    foreground: 0,
    incremental: 0,
    restricted: 0,
    selection: 0,
    disposed: 0,
  };
  let manifest: PrewarmManifest | undefined;
  let disposed = false,
    disabled = false,
    fetching = false,
    acquiring = false,
    started = false;
  let readBytes = 0,
    settleAt = 0,
    lockRetryAt = 0,
    nextFileAt = 0,
    revision = 0;
  let initialReadyAt: number | undefined;
  let hardBlocked = false,
    restricted = false,
    locksUnavailable = false,
    pageSuspended = false;
  let nativeUnmetered: boolean | undefined;
  let timer: number | undefined, idle: number | undefined;
  let controller: AbortController | undefined, activeUrl: string | undefined, abortReason: PauseReason | undefined;
  let watchingImages = false,
    stopImages: (() => void) | undefined;
  const mode = () => prewarmNetworkMode(options.mobile(), connection, nativeUnmetered);
  const allowed = () =>
    !disposed &&
    !disabled &&
    !pageSuspended &&
    scopes.size > 0 &&
    navigator.onLine !== false &&
    document.visibilityState === 'visible' &&
    mode() !== 'paused';
  function cancelScheduled() {
    revision++;
    clearTimeout(timer);
    timer = undefined;
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    idle = undefined;
  }
  function pause(reason: PauseReason) {
    if (controller && !controller.signal.aborted) {
      abortReason = reason;
      aborts[reason]++;
      controller.abort();
    }
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
  const pending = () =>
    manifest
      ? selected().filter((item) => !completed.has(item.url) && !failed.has(item.url))
      : [{ url: '/static-prewarm.json', bytes: manifestLimit }];
  const slowIncremental = (state = requestActivitySnapshot()) =>
    state.oldestIncrementalAt !== null && Date.now() >= state.oldestIncrementalAt + 1000;
  function trackImages(enabled: boolean) {
    if (watchingImages === enabled) return;
    watchingImages = enabled;
    if (enabled) stopImages = observePrewarmImages();
    else {
      const stop = stopImages;
      stopImages = undefined;
      stop?.();
    }
  }
  function schedule(delay: number, useIdle = false) {
    const current = revision;
    timer = window.setTimeout(
      () => {
        timer = undefined;
        if (current !== revision || disposed) return;
        if (!useIdle) {
          queue();
          return;
        }
        if (window.requestIdleCallback)
          idle = window.requestIdleCallback(
            (deadline) => {
              idle = undefined;
              if (current !== revision) return;
              if (deadline.didTimeout || deadline.timeRemaining() >= 1) void next();
              else queue(100);
            },
            { timeout: 1000 },
          );
        else void next();
      },
      Math.max(0, delay),
    );
  }
  function queue(minDelay = 0) {
    cancelScheduled();
    if (!allowed()) {
      restricted = true;
      if (!started) initialReadyAt = undefined;
      pause(disposed ? 'disposed' : 'restricted');
      trackImages(false);
      return;
    }
    if (restricted) {
      restricted = false;
      if (started) settleAt = Math.max(settleAt, Date.now() + 500);
    }
    if (activeUrl && manifest && !selected().some((item) => item.url === activeUrl)) pause('selection');
    const items = pending();
    if (!items.length) {
      trackImages(false);
      return;
    }
    trackImages(true);
    const state = requestActivitySnapshot();
    const hard = state.foreground > 0 || !ready() || slowIncremental(state);
    if (hard) {
      hardBlocked = true;
      if (!started) initialReadyAt = undefined;
      pause(state.foreground > 0 || !ready() ? 'foreground' : 'incremental');
      // Covers DOM/font readiness; request/image lifecycle events also wake immediately.
      schedule(250);
      return;
    }
    if (hardBlocked) {
      hardBlocked = false;
      settleAt = Math.max(settleAt, Date.now() + 500);
    }
    if (state.incremental > 0) {
      if (!started) initialReadyAt = undefined;
      schedule(state.oldestIncrementalAt! + 1000 - Date.now());
      return;
    }
    if (!started) initialReadyAt ??= Date.now() + initialDelay;
    if (fetching || acquiring) return;
    const nextAt = Math.max(
      initialReadyAt || 0,
      settleAt,
      lockRetryAt,
      nextFileAt,
      Math.min(...items.map((item) => retryAt.get(item.url) || 0)),
    );
    schedule(Math.max(minDelay, nextAt - Date.now()), true);
  }
  function canStart() {
    const state = requestActivitySnapshot();
    return (
      allowed() &&
      !fetching &&
      ready() &&
      state.foreground === 0 &&
      state.incremental === 0 &&
      Date.now() >= Math.max(initialReadyAt ?? Infinity, settleAt, lockRetryAt, nextFileAt)
    );
  }
  async function next() {
    if (!canStart() || acquiring) {
      queue();
      return;
    }
    acquiring = true;
    let entered = false;
    const run = async () => {
      entered = true;
      if (!canStart()) return;
      const item = pending().find((item) => (retryAt.get(item.url) || 0) <= Date.now());
      if (item) await download(item);
    };
    try {
      const locks = !locksUnavailable && navigator.locks;
      if (locks?.request)
        await locks.request('lightnote:static-prewarm', { ifAvailable: true }, async (lock) => {
          if (lock) await run();
          else lockRetryAt = Date.now() + 500;
        });
      else await run();
    } catch {
      // Denied/unavailable lock API falls back once; never repeat an entered transfer.
      if (!entered) {
        locksUnavailable = true;
        await run();
      }
    } finally {
      acquiring = false;
      queue();
    }
  }
  async function download(item: { url: string; bytes: number }) {
    const request = new AbortController();
    controller = request;
    activeUrl = item.url;
    abortReason = undefined;
    fetching = started = true;
    initialReadyAt = 0;
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
        if (abortReason === 'foreground' || abortReason === 'incremental') {
          const count = (interruptions.get(item.url) || 0) + 1;
          interruptions.set(item.url, count);
          if (count >= 2) retryAt.set(item.url, Date.now() + Math.min(30000, 5000 * 2 ** Math.min(count - 2, 3)));
        }
      } else {
        const count = (failures.get(item.url) || 0) + 1;
        failures.set(item.url, count);
        if (terminal || count >= 3) {
          failed.add(item.url);
          if (!manifest) disabled = true;
        } else retryAt.set(item.url, Date.now() + 5000 * count);
      }
      request.abort();
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      activeUrl = undefined;
      fetching = false;
      nextFileAt = Date.now() + 50;
    }
  }
  function markLoaded(resource: PerformanceResourceTiming) {
    if (resource.decodedBodySize <= 0) return false;
    const url = new URL(resource.name, location.origin);
    const path = url.pathname + url.search;
    // Full decoded bytes only: canceled/partial responses cannot claim completion.
    if (url.origin !== location.origin || manifest?.assets[path] !== resource.decodedBodySize || completed.has(path))
      return false;
    completed.add(path);
    return true;
  }
  const unsubscribe = subscribeRequestActivity((_state, kind, phase) => {
    if (kind === 'background') return;
    if (phase === 'end') settleAt = Math.max(settleAt, Date.now() + (kind === 'foreground' ? 500 : 100));
    queue();
  });
  const activity = () => queue();
  const unsubscribeNetwork = subscribeAndroidPrewarmNetwork((value) => {
    nativeUnmetered = value;
    queue();
  });
  for (const event of ['online', 'offline', 'load', 'resize']) window.addEventListener(event, activity);
  const pagehide = () => {
    pageSuspended = true;
    queue();
  };
  const pageshow = () => {
    pageSuspended = false;
    queue();
  };
  window.addEventListener('pageshow', pageshow);
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', activity);
  document.fonts?.addEventListener('loading', activity);
  document.fonts?.addEventListener('loadingdone', activity);
  document.fonts?.addEventListener('loadingerror', activity);
  connection?.addEventListener('change', activity);
  const observer =
    typeof PerformanceObserver === 'undefined'
      ? undefined
      : new PerformanceObserver((list) => {
          let changed = false;
          for (const resource of list.getEntries())
            changed = markLoaded(resource as PerformanceResourceTiming) || changed;
          // Unrelated polling completions must not postpone scheduled work.
          if (changed) queue();
        });
  try {
    observer?.observe({ entryTypes: ['resource'] });
  } catch {
    observer?.disconnect();
  }
  return {
    submit(selection: PrewarmSelection) {
      const scope = {};
      scopes.set(scope, selection);
      queue();
      return () => {
        scopes.delete(scope);
        if (!scopes.size) pause('selection');
        queue();
      };
    },
    activity,
    snapshot: () => {
      const items = selected(),
        remaining = pending(),
        state = requestActivitySnapshot();
      const nextStartAt =
        remaining.length && allowed() && ready() && !fetching && !state.foreground && !state.incremental
          ? Math.max(
              Date.now(),
              initialReadyAt ?? 0,
              settleAt,
              lockRetryAt,
              nextFileAt,
              Math.min(...remaining.map((item) => retryAt.get(item.url) || 0)),
            )
          : null;
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
        activities: state,
        aborts: { ...aborts },
        nextStartAt,
        reason: disposed
          ? 'disposed'
          : disabled
            ? 'disabled'
            : !allowed()
              ? 'restricted'
              : state.foreground > 0 || !ready()
                ? 'foreground'
                : slowIncremental(state)
                  ? 'incremental-slow'
                  : state.incremental > 0
                    ? 'incremental'
                    : fetching
                      ? 'fetching'
                      : !remaining.length
                        ? items.some((item) => failed.has(item.url))
                          ? 'complete-with-errors'
                          : selected(true).length > items.length
                            ? 'core-complete'
                            : 'complete'
                        : !started && (initialReadyAt === undefined || Date.now() < initialReadyAt)
                          ? 'startup'
                          : Date.now() < settleAt
                            ? 'settling'
                            : Date.now() < lockRetryAt
                              ? 'other-tab'
                              : !remaining.some((item) => (retryAt.get(item.url) || 0) <= Date.now())
                                ? 'retry-wait'
                                : !manifest
                                  ? 'manifest'
                                  : 'idle',
      };
    },
    dispose() {
      disposed = true;
      cancelScheduled();
      pause('disposed');
      unsubscribe();
      trackImages(false);
      scopes.clear();
      unsubscribeNetwork();
      observer?.disconnect();
      for (const event of ['online', 'offline', 'load', 'resize']) window.removeEventListener(event, activity);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
      document.removeEventListener('visibilitychange', activity);
      document.fonts?.removeEventListener('loading', activity);
      document.fonts?.removeEventListener('loadingdone', activity);
      document.fonts?.removeEventListener('loadingerror', activity);
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
