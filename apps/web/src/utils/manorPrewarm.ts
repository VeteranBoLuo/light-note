import { activeRequestCount, subscribeRequestActivity } from '@/http/requestActivity';

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
type Manifest = { desktop: string[]; mobile: string[] };
const warmed = new Set<string>();
let manifest: Manifest | null = null;

/** Static HTTP cache only: never mounts the scene, decodes images or calls a manor API. */
export function scheduleManorPrewarm(mobile: boolean) {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  let disposed = false,
    finished = false,
    fetching = false,
    lastActivity = Date.now();
  let timer: number | undefined,
    idle: number | undefined,
    controller: AbortController | null = null;
  let usedBytes = 0;
  const allowed = () =>
    !disposed &&
    !finished &&
    navigator.onLine !== false &&
    document.visibilityState === 'visible' &&
    !connection?.saveData &&
    !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
  const foregroundReady = () =>
    activeRequestCount() === 0 &&
    document.readyState === 'complete' &&
    document.fonts?.status !== 'loading' &&
    [...document.images].every((image) => {
      if (image.complete) return true;
      if (image.loading !== 'lazy') return false;
      const rect = image.getBoundingClientRect();
      return (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      );
    });
  function pause() {
    lastActivity = Date.now();
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    idle = undefined;
    controller?.abort();
  }
  function queue() {
    clearTimeout(timer);
    if (!allowed() || fetching) return;
    timer = window.setTimeout(
      () => {
        if (!allowed()) return;
        if (!foregroundReady()) {
          lastActivity = Date.now();
          queue();
          return;
        }
        if (window.requestIdleCallback)
          idle = window.requestIdleCallback((deadline) => {
            idle = undefined;
            if (deadline.timeRemaining() >= 8) void next();
            else queue();
          });
        else void next();
      },
      Math.max(50, 8_000 - (Date.now() - lastActivity)),
    );
  }
  async function next() {
    if (!allowed() || !foregroundReady() || fetching) return;
    const request = new AbortController();
    controller = request;
    fetching = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 15_000);
    try {
      if (!manifest) {
        const response = await fetch('/manor/preload.json', {
          signal: request.signal,
          credentials: 'same-origin',
          cache: 'no-cache',
          priority: 'low',
        });
        if (!response.ok) throw Error('prewarm manifest');
        const data = await response.json();
        if (
          !Array.isArray(data.desktop) ||
          !Array.isArray(data.mobile) ||
          data.desktop.length > 96 ||
          data.mobile.length > 96
        )
          throw Error('prewarm manifest');
        // Never follow an unexpected manifest into API or cross-origin requests.
        const sources = data.desktopScene;
        if (sources !== undefined && (
          !Array.isArray(sources) || !sources.length || sources.length > 8 ||
          sources.some((source: { width: number; url: string }, index: number) =>
            !source || !Number.isFinite(source.width) || source.width <= 0 ||
            typeof source.url !== 'string' || (index > 0 && source.width <= sources[index - 1].width),
          ) || !data.desktop.includes(sources[sources.length - 1].url)
        )) throw Error('prewarm image variants');
        for (const path of [...data.desktop, ...data.mobile, ...(sources || []).map((source: { url: string }) => source.url)]) {
          if (typeof path !== 'string') throw Error('prewarm URL');
          const url = new URL(path, location.origin);
          if (url.origin !== location.origin || !url.pathname.startsWith('/manor/')) throw Error('prewarm URL');
        }
        if (!request.signal.aborted) {
          // Warm the same pixel density that <img srcset> will choose, not every
          // resolution or the full painting hidden behind the responsive one.
          const pixels = window.innerWidth * (window.devicePixelRatio || 1);
          const selected = sources?.find((source: { width: number }) => source.width >= pixels) || sources?.[sources.length - 1];
          const original = sources?.[sources.length - 1].url;
          manifest = {
            desktop: data.desktop.map((path: string) => path === original ? selected.url : path),
            mobile: data.mobile,
          };
        }
      } else {
        const path = manifest[mobile ? 'mobile' : 'desktop'].find((url) => !warmed.has(url));
        if (!path) {
          finished = true;
          return;
        }
        const response = await fetch(path, {
          signal: request.signal,
          credentials: 'same-origin',
          cache: 'force-cache',
          priority: 'low',
        });
        if (!response.ok || Number(response.headers.get('Content-Length')) > 4 * 1024 * 1024)
          throw Error('prewarm asset');
        const body = await response.arrayBuffer();
        usedBytes += body.byteLength;
        if (usedBytes > 20 * 1024 * 1024) {
          finished = true;
          return;
        }
        if (!request.signal.aborted) warmed.add(path);
      }
    } catch {
      // Interruptions resume after foreground work; real errors end this quiet attempt.
      if (timedOut || !request.signal.aborted) finished = true;
    } finally {
      clearTimeout(timeout);
      controller = null;
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
  // Lazy route/editor downloads count as foreground activity too.
  const resources =
    typeof PerformanceObserver === 'undefined'
      ? null
      : new PerformanceObserver((list) => {
          if (list.getEntries().some((entry) => !new URL(entry.name, location.origin).pathname.startsWith('/manor/')))
            activity();
        });
  try {
    resources?.observe({ entryTypes: ['resource'] });
  } catch {
    resources?.disconnect();
  }
  queue();
  return () => {
    disposed = true;
    pause();
    unsubscribe();
    resources?.disconnect();
    for (const event of inputEvents) window.removeEventListener(event, activity, true);
    for (const event of ['online', 'offline', 'load']) window.removeEventListener(event, activity);
    document.removeEventListener('visibilitychange', activity);
    connection?.removeEventListener('change', activity);
  };
}
