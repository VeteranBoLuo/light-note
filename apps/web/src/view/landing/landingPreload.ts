export interface LandingPreloadConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: 'change', listener: EventListener) => void;
  removeEventListener?: (type: 'change', listener: EventListener) => void;
}

interface LandingPreloadNavigatorLike {
  onLine?: boolean;
  webdriver?: boolean;
  connection?: LandingPreloadConnectionLike | null;
}

interface LandingPreloadDocumentLike {
  visibilityState: DocumentVisibilityState | string;
  addEventListener: (type: 'visibilitychange', listener: EventListener) => void;
  removeEventListener: (type: 'visibilitychange', listener: EventListener) => void;
}

interface LandingPreloadWindowLike {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
  addEventListener: (type: 'online' | 'offline', listener: EventListener) => void;
  removeEventListener: (type: 'online' | 'offline', listener: EventListener) => void;
}

export interface LandingPreloadContext {
  online: boolean;
  visibilityState: DocumentVisibilityState | string;
  webdriver?: boolean;
  prerender?: boolean;
  connection?: LandingPreloadConnectionLike | null;
}

interface ScheduleLandingStartupPreloadOptions {
  preloadPrimary: () => Promise<unknown>;
  preloadSecondary?: () => Promise<unknown>;
  delayMs?: number;
  secondaryDelayMs?: number;
  idleTimeoutMs?: number;
  windowRef?: LandingPreloadWindowLike;
  documentRef?: LandingPreloadDocumentLike;
  navigatorRef?: LandingPreloadNavigatorLike;
  prerender?: boolean;
}

const CONSTRAINED_CONNECTIONS = new Set(['slow-2g', '2g', '3g']);

/** 官网预热只能使用首屏空闲带宽，省流、弱网、后台页和预渲染阶段一律不抢请求。 */
export function shouldPreloadLandingTarget(context: LandingPreloadContext) {
  if (!context.online || context.visibilityState !== 'visible' || context.webdriver || context.prerender) return false;
  if (context.connection?.saveData) return false;
  return !CONSTRAINED_CONNECTIONS.has(String(context.connection?.effectiveType || '').toLowerCase());
}

/**
 * 首屏稳定后先预热最可能点击的入口，再晚一拍预热次入口。
 * 这是体验加速层，任何失败都由正式点击时的加载反馈和既有 chunk 自愈链路接管。
 */
export function scheduleLandingStartupPreload(options: ScheduleLandingStartupPreloadOptions) {
  const windowRef = options.windowRef || window;
  const documentRef = options.documentRef || document;
  const navigatorRef: LandingPreloadNavigatorLike = options.navigatorRef || (navigator as LandingPreloadNavigatorLike);
  const delayMs = options.delayMs ?? 900;
  const secondaryDelayMs = options.secondaryDelayMs ?? 1_800;
  const idleTimeoutMs = options.idleTimeoutMs ?? 2_000;
  let delayTimer: number | null = null;
  let secondaryTimer: number | null = null;
  let idleHandle: number | null = null;
  let disposed = false;
  let started = false;

  function currentContext(): LandingPreloadContext {
    return {
      online: navigatorRef.onLine !== false,
      visibilityState: documentRef.visibilityState,
      webdriver: navigatorRef.webdriver,
      prerender: options.prerender,
      connection: navigatorRef.connection,
    };
  }

  function canStart() {
    return !disposed && !started && shouldPreloadLandingTarget(currentContext());
  }

  function cancelPending() {
    if (delayTimer !== null) {
      windowRef.clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (secondaryTimer !== null) {
      windowRef.clearTimeout(secondaryTimer);
      secondaryTimer = null;
    }
    if (idleHandle !== null && windowRef.cancelIdleCallback) {
      windowRef.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
  }

  function queueIdle(callback: () => void) {
    if (windowRef.requestIdleCallback) {
      idleHandle = windowRef.requestIdleCallback(
        () => {
          idleHandle = null;
          callback();
        },
        { timeout: idleTimeoutMs },
      );
      return;
    }
    callback();
  }

  async function warmTargets() {
    if (!canStart()) return;
    started = true;
    try {
      await options.preloadPrimary();
    } catch {
      // 静默降级：预热失败不是用户操作失败。
    }
    if (disposed || !options.preloadSecondary || !shouldPreloadLandingTarget(currentContext())) return;

    secondaryTimer = windowRef.setTimeout(() => {
      secondaryTimer = null;
      if (disposed || !shouldPreloadLandingTarget(currentContext())) return;
      queueIdle(() => {
        void options.preloadSecondary?.().catch(() => undefined);
      });
    }, secondaryDelayMs);
  }

  function schedule() {
    cancelPending();
    if (!canStart()) return;
    delayTimer = windowRef.setTimeout(() => {
      delayTimer = null;
      queueIdle(() => void warmTargets());
    }, delayMs);
  }

  const handleAvailabilityChange: EventListener = () => {
    if (disposed || started) return;
    if (!shouldPreloadLandingTarget(currentContext())) {
      cancelPending();
      return;
    }
    schedule();
  };

  documentRef.addEventListener('visibilitychange', handleAvailabilityChange);
  windowRef.addEventListener('online', handleAvailabilityChange);
  windowRef.addEventListener('offline', handleAvailabilityChange);
  navigatorRef.connection?.addEventListener?.('change', handleAvailabilityChange);
  schedule();

  return () => {
    disposed = true;
    cancelPending();
    documentRef.removeEventListener('visibilitychange', handleAvailabilityChange);
    windowRef.removeEventListener('online', handleAvailabilityChange);
    windowRef.removeEventListener('offline', handleAvailabilityChange);
    navigatorRef.connection?.removeEventListener?.('change', handleAvailabilityChange);
  };
}
