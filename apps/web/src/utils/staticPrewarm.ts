import { subscribeAndroidPrewarmNetwork } from './androidBridge';
import { requestActivitySnapshot, subscribeRequestActivity } from '@/http/requestActivity';
import { observePrewarmImages } from './prewarmImages';
import { PREWARM_MANIFEST_LIMIT } from '@/config/staticPrewarmGroups';

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
  /** Static diagnostic name only; never a URL or account value. */
  label?: string;
}
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string; type?: string };
const MiB = 1024 * 1024;
const manifestLimit = PREWARM_MANIFEST_LIMIT;

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
  /** Bounded override for shared-bandwidth acceptance fixtures. */
  concurrency?: 1 | 2 | 4;
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
  type PauseReason = 'foreground' | 'incremental' | 'incremental-capacity' | 'restricted' | 'selection' | 'disposed';
  const aborts: Record<PauseReason, number> = {
    foreground: 0,
    incremental: 0,
    'incremental-capacity': 0,
    restricted: 0,
    selection: 0,
    disposed: 0,
  };
  let manifest: PrewarmManifest | undefined;
  let disposed = false,
    disabled = false,
    acquiring = false,
    started = false;
  let readBytes = 0,
    settleAt = 0,
    lockRetryAt = 0,
    peakConcurrency = 0;
  let initialReadyAt: number | undefined;
  let hardBlocked = false,
    restricted = false,
    locksUnavailable = false,
    pageSuspended = false;
  let nativeUnmetered: boolean | undefined;
  let timer: number | undefined,
    timerAt = Infinity;
  type Transfer = { controller: AbortController; abortReason?: PauseReason; received: number; bytes: number };
  const transfers = new Map<string, Transfer>();
  let poolHeld = false,
    releasePool: (() => void) | undefined;
  const durationMs: Record<string, number> = {};
  let phase = 'idle',
    phaseSince = performance.now();
  const completedAt = new Map<string, number>();
  const transferTiming = { attempts: 0, responses: 0, completed: 0, responseWaitMs: 0, bodyReadMs: 0 };
  const concurrency = () =>
    mode() === 'full' && !locksUnavailable && navigator.locks?.request ? (options.concurrency ?? 4) : 1;
  function timing(nextPhase = phase) {
    const now = performance.now();
    if (!['idle', 'complete', 'core-complete', 'complete-with-errors', 'disposed', 'disabled'].includes(phase))
      durationMs[phase] = (durationMs[phase] || 0) + now - phaseSince;
    phaseSince = now;
    phase = nextPhase;
    return Object.values(durationMs).reduce((sum, value) => sum + value, 0);
  }
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
    clearTimeout(timer);
    timer = undefined;
    timerAt = Infinity;
  }
  function pause(reason: PauseReason, onlyUrl?: string) {
    for (const [url, transfer] of transfers) {
      if ((!onlyUrl || onlyUrl === url) && !transfer.controller.signal.aborted) {
        transfer.abortReason = reason;
        aborts[reason]++;
        transfer.controller.abort();
      }
    }
  }
  // The origin lock covers one active pool, including response-body cancellation.
  // Never retain it while waiting for foreground work, backoff or another page.
  function releaseIdlePool(keep = false) {
    if (poolHeld && transfers.size === 0 && !keep) {
      poolHeld = false;
      const release = releasePool;
      releasePool = undefined;
      release?.();
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
  function schedule(delay: number) {
    const at = Date.now() + Math.max(0, delay);
    // Coalesce notifications; a completion must not keep postponing a runnable task.
    if (timer !== undefined && timerAt <= at) return;
    cancelScheduled();
    timerAt = at;
    timer = window.setTimeout(
      () => {
        timer = undefined;
        timerAt = Infinity;
        queue(true);
      },
      Math.max(0, delay),
    );
  }
  const waiting = () => pending().filter((item) => !transfers.has(item.url));
  function queue(dispatch = false) {
    try {
      if (!allowed()) {
        restricted = true;
        if (!started) initialReadyAt = undefined;
        pause(disposed ? 'disposed' : 'restricted');
        trackImages(false);
        cancelScheduled();
        return;
      }
      if (restricted) {
        restricted = false;
        if (started) settleAt = Math.max(settleAt, Date.now() + 500);
      }
      if (manifest) {
        const needed = new Set(selected().map((item) => item.url));
        for (const url of transfers.keys()) if (!needed.has(url)) pause('selection', url);
      }
      if (!pending().length) {
        trackImages(false);
        cancelScheduled();
        return;
      }
      trackImages(true);
      const state = requestActivitySnapshot();
      if (state.foreground > 0 || !ready() || slowIncremental(state)) {
        hardBlocked = true;
        if (!started) initialReadyAt = undefined;
        pause(state.foreground > 0 || !ready() ? 'foreground' : 'incremental');
        schedule(250);
        return;
      }
      if (hardBlocked) {
        hardBlocked = false;
        settleAt = Math.max(settleAt, Date.now() + 500);
      }
      if (state.incremental > 0) {
        // Keeping the whole pool competes with short pagination on shared links.
        // Retain the most complete file; aborted bodies finish cleanup independently.
        const active = [...transfers]
          .filter(([, item]) => !item.controller.signal.aborted)
          .sort((a, b) => b[1].received / b[1].bytes - a[1].received / a[1].bytes);
        for (const [url] of active.slice(1)) pause('incremental-capacity', url);
        if (!started) initialReadyAt = undefined;
        schedule(state.oldestIncrementalAt! + 1000 - Date.now());
        return;
      }
      if (!started) initialReadyAt ??= Date.now() + initialDelay;
      if (transfers.size >= concurrency() || (acquiring && !poolHeld)) return;
      const items = waiting();
      if (!items.length) return;
      const nextAt = Math.max(
        initialReadyAt || 0,
        settleAt,
        lockRetryAt,
        Math.min(...items.map((item) => retryAt.get(item.url) || 0)),
      );
      if (nextAt > Date.now() || !dispatch) schedule(nextAt - Date.now());
      else if (poolHeld || locksUnavailable || !navigator.locks?.request) fillPool();
      else void acquirePool();
    } finally {
      releaseIdlePool(canStart() && waiting().some((item) => (retryAt.get(item.url) || 0) <= Date.now()));
      updateDiagnostics();
    }
  }
  function canStart() {
    const state = requestActivitySnapshot();
    return (
      allowed() &&
      ready() &&
      state.foreground === 0 &&
      state.incremental === 0 &&
      Date.now() >= Math.max(initialReadyAt ?? Infinity, settleAt, lockRetryAt)
    );
  }
  function fillPool() {
    // At most four launches per task. Even hot-cache completions yield to the event loop.
    const candidates = waiting().filter((item) => (retryAt.get(item.url) || 0) <= Date.now());
    for (const item of candidates.slice(0, Math.max(0, concurrency() - transfers.size))) {
      if (!canStart()) break;
      void download(item);
    }
    updateDiagnostics();
  }
  async function acquirePool() {
    if (acquiring) return;
    acquiring = true;
    let entered = false;
    try {
      await navigator.locks.request('lightnote:static-prewarm', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          lockRetryAt = Date.now() + 500;
          return;
        }
        entered = true;
        if (!canStart()) return;
        poolHeld = true;
        await new Promise<void>((resolve) => {
          releasePool = resolve;
          fillPool();
          releaseIdlePool();
        });
      });
    } catch {
      if (!entered) locksUnavailable = true;
    } finally {
      acquiring = false;
      queue();
    }
  }
  async function download(item: { url: string; bytes: number }) {
    const request = new AbortController();
    const transfer: Transfer = { controller: request, received: 0, bytes: item.bytes };
    transfers.set(item.url, transfer);
    peakConcurrency = Math.max(peakConcurrency, transfers.size);
    const isManifest = !manifest;
    const beganAt = performance.now();
    let headersAt: number | undefined;
    transferTiming.attempts++;
    started = true;
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
        cache: isManifest ? 'no-cache' : 'force-cache',
        priority: 'low',
      });
      headersAt = performance.now();
      transferTiming.responses++;
      transferTiming.responseWaitMs += headersAt - beganAt;
      if (!response.ok) {
        terminal = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
        throw Error('prewarm status');
      }
      if (
        !response.body ||
        Number(response.headers.get('Content-Length')) > item.bytes ||
        (isManifest ? /^(?!application\/json)/i : /text\/html/i).test(response.headers.get('Content-Type') || '')
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
          transfer.received = received;
          readBytes += value.byteLength;
          if (received > item.bytes) {
            terminal = true;
            throw Error('prewarm size');
          }
          if (isManifest) parts.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (request.signal.aborted) throw Error('prewarm aborted');
      if (isManifest) {
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
      } else markComplete(item.url);
      transferTiming.completed++;
      retryAt.delete(item.url);
      interruptions.delete(item.url);
    } catch {
      if (!terminal && request.signal.aborted && !timedOut) {
        if (['foreground', 'incremental', 'incremental-capacity'].includes(transfer.abortReason || '')) {
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
      if (headersAt !== undefined) transferTiming.bodyReadMs += performance.now() - headersAt;
      if (transfers.get(item.url) === transfer) transfers.delete(item.url);
      queue();
    }
  }
  function markLoaded(resource: PerformanceResourceTiming) {
    if (resource.decodedBodySize <= 0) return false;
    const url = new URL(resource.name, location.origin);
    const path = url.pathname + url.search;
    // Full decoded bytes only: canceled/partial responses cannot claim completion.
    if (url.origin !== location.origin || manifest?.assets[path] !== resource.decodedBodySize || completed.has(path))
      return false;
    markComplete(path);
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
  function reason() {
    const state = requestActivitySnapshot();
    if (disposed) return 'disposed';
    if (disabled) return 'disabled';
    if (!scopes.size) return 'idle';
    // Completion wins over visibility restrictions; it is not a paused download.
    if (manifest && !pending().length && !transfers.size)
      return selected().some((item) => failed.has(item.url))
        ? 'complete-with-errors'
        : selected(true).length > selected().length
          ? 'core-complete'
          : 'complete';
    if (pageSuspended || document.visibilityState !== 'visible') return 'hidden';
    if (navigator.onLine === false) return 'offline';
    if (mode() === 'paused') return 'network-restricted';
    if (state.foreground > 0 || !ready()) return 'foreground';
    if (slowIncremental(state)) return 'incremental-slow';
    if (state.incremental > 0) return 'incremental';
    if (transfers.size) return 'fetching';
    if (!started && (initialReadyAt === undefined || Date.now() < initialReadyAt)) return 'startup';
    if (Date.now() < settleAt) return 'settling';
    if (Date.now() < lockRetryAt || (acquiring && !poolHeld)) return 'other-tab';
    if (!waiting().some((item) => (retryAt.get(item.url) || 0) <= Date.now())) return 'retry-wait';
    return 'dispatch';
  }
  function markComplete(url: string) {
    if (completed.has(url)) return;
    completed.add(url);
    completedAt.set(url, timing());
  }
  function updateDiagnostics() {
    timing(reason());
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
      updateDiagnostics();
      const items = selected(),
        remaining = pending(),
        candidates = waiting(),
        state = requestActivitySnapshot();
      const elapsedMs = Object.values(durationMs).reduce((sum, value) => sum + value, 0);
      return {
        mode: mode(),
        readBytes,
        fetching: transfers.size > 0,
        inFlight: transfers.size,
        concurrency: concurrency(),
        peakConcurrency,
        selected: items.length,
        completed: items.filter((item) => completed.has(item.url)).length,
        failed: items.filter((item) => failed.has(item.url)).length,
        pending: manifest ? remaining.length : 0,
        deferred: selected(true).length - items.length,
        disabled,
        activities: state,
        aborts: { ...aborts },
        nextStartAt:
          candidates.length &&
          allowed() &&
          ready() &&
          transfers.size < concurrency() &&
          !state.foreground &&
          !state.incremental
            ? Math.max(
                Date.now(),
                initialReadyAt ?? 0,
                settleAt,
                lockRetryAt,
                Math.min(...candidates.map((item) => retryAt.get(item.url) || 0)),
              )
            : null,
        reason: reason(),
        // Mutually exclusive wall time; request timings below overlap under concurrency.
        timings: {
          elapsedMs,
          eligibleMs: ['fetching', 'dispatch', 'other-tab', 'retry-wait'].reduce(
            (sum, key) => sum + (durationMs[key] || 0),
            0,
          ),
          durationMs: { ...durationMs },
          transfers: { ...transferTiming },
        },
        groups: [...scopes.values()].flatMap((selection) => {
          const groups = selection.label
            ? [{ name: selection.label, selection }]
            : (selection.groups || []).map((name) => ({ name, selection: { ...selection, urls: [], groups: [name] } }));
          return groups.map(({ name, selection }) => {
            const members = urls(selection).filter((url) => manifest?.assets[url]);
            const done = members.filter((url) => completed.has(url));
            return {
              name,
              selected: members.length,
              completed: done.length,
              readyAtMs:
                members.length && members.length === done.length
                  ? Math.max(...members.map((url) => completedAt.get(url) || 0))
                  : null,
            };
          });
        }),
      };
    },
    dispose() {
      disposed = true;
      cancelScheduled();
      pause('disposed');
      releaseIdlePool();
      timing('disposed');
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
