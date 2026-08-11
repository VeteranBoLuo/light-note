import { preloadNoteEditorRuntime } from '@/components/noteLibrary/detail/editorRuntimeLoader';

export interface NoteEditorPreloadConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: 'change', listener: EventListener) => void;
  removeEventListener?: (type: 'change', listener: EventListener) => void;
}

interface NoteEditorPreloadNavigatorLike {
  onLine?: boolean;
  webdriver?: boolean;
  connection?: NoteEditorPreloadConnectionLike | null;
}

interface NoteEditorPreloadDocumentLike {
  visibilityState: DocumentVisibilityState | string;
  addEventListener: (type: 'visibilitychange', listener: EventListener) => void;
  removeEventListener: (type: 'visibilitychange', listener: EventListener) => void;
}

interface NoteEditorPreloadWindowLike {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
  addEventListener: (type: 'online' | 'offline', listener: EventListener) => void;
  removeEventListener: (type: 'online' | 'offline', listener: EventListener) => void;
}

export interface NoteEditorStartupPreloadContext {
  supportedPlatform: boolean;
  applicationRoute: boolean;
  online: boolean;
  visibilityState: DocumentVisibilityState | string;
  webdriver?: boolean;
  prerender?: boolean;
  connection?: NoteEditorPreloadConnectionLike | null;
}

interface ScheduleNoteEditorStartupPreloadOptions {
  supportedPlatform: boolean;
  applicationRoute: boolean;
  preloadRoute: () => Promise<unknown>;
  preloadEditor?: (type: 'html' | 'markdown') => Promise<unknown>;
  delayMs?: number;
  idleTimeoutMs?: number;
  windowRef?: NoteEditorPreloadWindowLike;
  documentRef?: NoteEditorPreloadDocumentLike;
  navigatorRef?: NoteEditorPreloadNavigatorLike;
  prerender?: boolean;
}

const CONSTRAINED_CONNECTIONS = new Set(['slow-2g', '2g', '3g']);

/**
 * 启动预热只依赖平台、页面和运行环境，不依赖登录状态。
 * 游客通常没有任何编辑器缓存，更需要提前消除第一次打开笔记的冷加载停顿。
 */
export function shouldPreloadNoteEditors(context: NoteEditorStartupPreloadContext) {
  if (!context.supportedPlatform || !context.applicationRoute || !context.online) return false;
  if (context.visibilityState !== 'visible' || context.webdriver || context.prerender) return false;
  if (context.connection?.saveData) return false;
  return !CONSTRAINED_CONNECTIONS.has(String(context.connection?.effectiveType || '').toLowerCase());
}

/**
 * 首屏稳定后按“详情路由 → HTML 与 Markdown 运行时”顺序预热。
 * 两套编辑器共同通过同一门禁并同时启动，避免用户第一次打开不同类型笔记时体验不一致。
 */
export function scheduleNoteEditorStartupPreload(options: ScheduleNoteEditorStartupPreloadOptions) {
  const windowRef: NoteEditorPreloadWindowLike = options.windowRef || window;
  const documentRef: NoteEditorPreloadDocumentLike = options.documentRef || document;
  const navigatorRef: NoteEditorPreloadNavigatorLike = options.navigatorRef || navigator;
  const preloadEditor = options.preloadEditor || preloadNoteEditorRuntime;
  const delayMs = options.delayMs ?? 2_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 3_000;
  let delayTimer: number | null = null;
  let idleHandle: number | null = null;
  let disposed = false;
  let started = false;

  function currentContext(): NoteEditorStartupPreloadContext {
    return {
      supportedPlatform: options.supportedPlatform,
      applicationRoute: options.applicationRoute,
      online: navigatorRef.onLine !== false,
      visibilityState: documentRef.visibilityState,
      webdriver: navigatorRef.webdriver,
      prerender: options.prerender,
      connection: navigatorRef.connection,
    };
  }

  function canStart() {
    return !disposed && !started && shouldPreloadNoteEditors(currentContext());
  }

  function cancelPending() {
    if (delayTimer !== null) {
      windowRef.clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (idleHandle !== null && windowRef.cancelIdleCallback) {
      windowRef.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
  }

  async function warmRuntimes() {
    idleHandle = null;
    if (!canStart()) return;
    started = true;
    try {
      await options.preloadRoute();
    } catch {
      // 预热是纯加速层；失败不弹错，正式导航仍走统一的 chunk 自愈流程。
    }
    if (disposed) return;
    if (!shouldPreloadNoteEditors(currentContext())) {
      // 路由下载期间切到后台或断网时，回到可用状态后允许重新调度两套编辑器。
      started = false;
      return;
    }
    const editorTasks = (['html', 'markdown'] as const).map((type) =>
      Promise.resolve().then(() => preloadEditor(type)),
    );
    await Promise.allSettled(editorTasks);
  }

  function queueIdleWarmup() {
    if (!canStart()) return;
    if (windowRef.requestIdleCallback) {
      idleHandle = windowRef.requestIdleCallback(() => void warmRuntimes(), { timeout: idleTimeoutMs });
      return;
    }
    void warmRuntimes();
  }

  function schedule() {
    cancelPending();
    if (!canStart()) return;
    delayTimer = windowRef.setTimeout(() => {
      delayTimer = null;
      queueIdleWarmup();
    }, delayMs);
  }

  const handleAvailabilityChange: EventListener = () => {
    if (started || disposed) return;
    if (!shouldPreloadNoteEditors(currentContext())) {
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
