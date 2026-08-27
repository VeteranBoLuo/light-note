import { nextTick, type Ref } from 'vue';
import { getRootZoom } from '@/utils/zoom';

export type CommunityChatViewportIntent = 'follow-latest' | 'preserve-position';

export interface CommunityChatViewportMetrics {
  scrollTop: number;
  distanceFromBottom: number;
}

export interface CommunityChatViewportScrollState extends CommunityChatViewportMetrics {
  scrollingUp: boolean;
  scrollingDown: boolean;
}

interface CommunityChatViewportGeometry {
  element: HTMLElement;
  top: number;
  height: number;
}

interface UseCommunityChatViewportControllerOptions {
  element: Ref<HTMLElement | null>;
  contentElement?: Ref<HTMLElement | null>;
  isLatestWindow: () => boolean;
  onMetrics?: (metrics: CommunityChatViewportMetrics) => void;
}

interface ReconcileGeometryOptions {
  immediateFollow?: boolean;
}

interface SetScrollTopOptions {
  intent?: CommunityChatViewportIntent;
}

const STRICT_BOTTOM_EPSILON_PX = 4;
const NEAR_BOTTOM_THRESHOLD_PX = 96;
const GEOMETRY_EPSILON_PX = 0.5;

/**
 * 聊天消息视口的唯一滚动意图控制器。
 *
 * `follow-latest` 表示用户正在阅读最新消息，输入区、置顶栏或软键盘造成的几何变化应继续贴底；
 * `preserve-position` 表示用户正在浏览历史或定位消息，任何自动布局变化都不能抢走当前位置。
 * 输入框 focus/blur 不是滚动意图，因此不进入这套状态转换。
 */
export function useCommunityChatViewportController(options: UseCommunityChatViewportControllerOptions) {
  let intent: CommunityChatViewportIntent = 'follow-latest';
  let lastScrollTop = 0;
  let geometry: CommunityChatViewportGeometry | null = null;
  let followGeneration = 0;
  let followFrame: number | undefined;
  let userScrollIntentFrame: number | undefined;
  let userScrollIntentPending = false;
  let resizeObserver: ResizeObserver | null = null;
  let started = false;

  function readMetrics(): CommunityChatViewportMetrics {
    const element = options.element.value;
    if (!element) return { scrollTop: 0, distanceFromBottom: 0 };
    return {
      scrollTop: element.scrollTop,
      distanceFromBottom: Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight),
    };
  }

  function commitMetrics() {
    const metrics = readMetrics();
    lastScrollTop = metrics.scrollTop;
    options.onMetrics?.(metrics);
    return metrics;
  }

  function cancelScheduledFollow() {
    followGeneration += 1;
    if (followFrame === undefined) return;
    window.cancelAnimationFrame(followFrame);
    followFrame = undefined;
  }

  function clearUserScrollIntent() {
    userScrollIntentPending = false;
    if (userScrollIntentFrame === undefined) return;
    window.cancelAnimationFrame(userScrollIntentFrame);
    userScrollIntentFrame = undefined;
  }

  function setIntent(nextIntent: CommunityChatViewportIntent) {
    if (intent === nextIntent) {
      if (nextIntent === 'preserve-position') cancelScheduledFollow();
      return;
    }
    cancelScheduledFollow();
    intent = nextIntent;
  }

  function followLatest() {
    clearUserScrollIntent();
    cancelScheduledFollow();
    intent = 'follow-latest';
  }

  function preservePosition() {
    clearUserScrollIntent();
    cancelScheduledFollow();
    intent = 'preserve-position';
  }

  function shouldFollowLatest() {
    return intent === 'follow-latest' && !userScrollIntentPending && options.isLatestWindow();
  }

  function isNearBottom(threshold = NEAR_BOTTOM_THRESHOLD_PX) {
    return readMetrics().distanceFromBottom < threshold;
  }

  function isAtBottom(epsilon = STRICT_BOTTOM_EPSILON_PX) {
    return readMetrics().distanceFromBottom <= epsilon;
  }

  function writeLatestPosition(generation: number) {
    if (generation !== followGeneration || userScrollIntentPending || !shouldFollowLatest()) return false;
    const element = options.element.value;
    if (!element) return false;
    // 浏览器会把 scrollHeight 自动夹紧到合法的最大 scrollTop；直接写最终边界可避免中间动画帧。
    element.scrollTop = element.scrollHeight;
    commitMetrics();
    return true;
  }

  function requestFollowLatest() {
    if (!shouldFollowLatest() || userScrollIntentPending || followFrame !== undefined) return;
    const generation = followGeneration;
    followFrame = window.requestAnimationFrame(() => {
      followFrame = undefined;
      writeLatestPosition(generation);
    });
  }

  async function scrollToLatest() {
    followLatest();
    const generation = followGeneration;
    await nextTick();
    return writeLatestPosition(generation);
  }

  function applyScrollTop(scrollTop: number, setOptions: SetScrollTopOptions = {}) {
    if (setOptions.intent === 'follow-latest') followLatest();
    else if (setOptions.intent === 'preserve-position') preservePosition();
    const element = options.element.value;
    if (!element) return;
    element.scrollTop = scrollTop;
    commitMetrics();
  }

  function adjustScrollTop(delta: number, setOptions: SetScrollTopOptions = {}) {
    const element = options.element.value;
    if (!element || !Number.isFinite(delta) || Math.abs(delta) <= GEOMETRY_EPSILON_PX) {
      if (setOptions.intent === 'follow-latest') followLatest();
      else if (setOptions.intent === 'preserve-position') preservePosition();
      commitMetrics();
      return;
    }
    applyScrollTop(element.scrollTop + delta, setOptions);
  }

  function syncPosition(setOptions: SetScrollTopOptions = {}) {
    if (setOptions.intent === 'follow-latest') followLatest();
    else if (setOptions.intent === 'preserve-position') preservePosition();
    return commitMetrics();
  }

  function readGeometry(): CommunityChatViewportGeometry | null {
    const element = options.element.value;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { element, top: rect.top, height: rect.height };
  }

  function reconcileGeometry(reconcileOptions: ReconcileGeometryOptions = {}) {
    const nextGeometry = readGeometry();
    if (!nextGeometry) return;
    const previousGeometry = geometry;
    geometry = nextGeometry;

    if (previousGeometry && previousGeometry.element === nextGeometry.element && intent === 'preserve-position') {
      const heightChanged = Math.abs(nextGeometry.height - previousGeometry.height) > GEOMETRY_EPSILON_PX;
      const visualTopDelta = nextGeometry.top - previousGeometry.top;
      // 置顶栏等上方布局会同时移动并压缩消息区。历史浏览态补偿同等 scrollTop，
      // 让屏幕中的同一条消息保持原位；单纯底边/输入区变化则保留原 scrollTop 即可。
      if (heightChanged && Math.abs(visualTopDelta) > GEOMETRY_EPSILON_PX) {
        adjustScrollTop(visualTopDelta / getRootZoom(), { intent: 'preserve-position' });
        return;
      }
    }

    if (shouldFollowLatest()) {
      if (reconcileOptions.immediateFollow) writeLatestPosition(followGeneration);
      else requestFollowLatest();
      return;
    }
    commitMetrics();
  }

  function handleUserScrollIntent() {
    cancelScheduledFollow();
    userScrollIntentPending = true;
    if (userScrollIntentFrame !== undefined) window.cancelAnimationFrame(userScrollIntentFrame);
    // wheel/touchmove 在边界处可能不会产生 scroll；只暂时阻止同一帧的自动贴底，不能永久改变意图。
    userScrollIntentFrame = window.requestAnimationFrame(() => {
      userScrollIntentFrame = undefined;
      userScrollIntentPending = false;
      // 边界处的 wheel/touchmove 可能没有任何 scroll 事件。若同一帧恰好发生输入区或内容变化，
      // 该变化的自动贴底会被手势暂时压住；手势结束且意图仍是跟随时补做一次最终底部写入。
      requestFollowLatest();
    });
  }

  function handleScroll({ programmatic = false } = {}): CommunityChatViewportScrollState {
    const metrics = readMetrics();
    const scrollDelta = metrics.scrollTop - lastScrollTop;
    const scrollingUp = scrollDelta < -GEOMETRY_EPSILON_PX;
    const scrollingDown = scrollDelta > GEOMETRY_EPSILON_PX;
    clearUserScrollIntent();

    if (!programmatic && (scrollingUp || scrollingDown)) {
      const atLatestBottom = options.isLatestWindow() && metrics.distanceFromBottom <= STRICT_BOTTOM_EPSILON_PX;
      // 输入区或键盘收起时，浏览器可能先把旧 scrollTop 向上夹紧到新的最大值，再派发 scroll。
      // 原本就在跟随态时仍应保持跟随；历史态被内容收缩夹到末尾时则不能借此恢复跟随，
      // 只有用户实际向下滚到严格底部才获得该资格。
      if (atLatestBottom && (intent === 'follow-latest' || scrollingDown)) {
        setIntent('follow-latest');
      } else {
        setIntent('preserve-position');
      }
    }

    lastScrollTop = metrics.scrollTop;
    options.onMetrics?.(metrics);
    return { ...metrics, scrollingUp, scrollingDown };
  }

  function reset(nextIntent: CommunityChatViewportIntent = 'follow-latest') {
    cancelScheduledFollow();
    clearUserScrollIntent();
    intent = nextIntent;
    geometry = null;
    commitMetrics();
  }

  function handleViewportResize() {
    reconcileGeometry();
  }

  function start() {
    if (started) return;
    started = true;
    geometry = readGeometry();
    commitMetrics();
    const ResizeObserverConstructor = globalThis.ResizeObserver;
    if (typeof ResizeObserverConstructor === 'function' && options.element.value) {
      resizeObserver = new ResizeObserverConstructor(() => reconcileGeometry());
      resizeObserver.observe(options.element.value);
      if (options.contentElement?.value && options.contentElement.value !== options.element.value) {
        resizeObserver.observe(options.contentElement.value);
      }
    }
    window.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);
  }

  function stop() {
    if (!started) return;
    started = false;
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener('resize', handleViewportResize);
    window.visualViewport?.removeEventListener('resize', handleViewportResize);
    cancelScheduledFollow();
    clearUserScrollIntent();
    geometry = null;
  }

  return {
    adjustScrollTop,
    applyScrollTop,
    followLatest,
    getIntent: () => intent,
    handleScroll,
    handleUserScrollIntent,
    isAtBottom,
    isNearBottom,
    preservePosition,
    reconcileGeometry,
    requestFollowLatest,
    reset,
    scrollToLatest,
    shouldFollowLatest,
    start,
    stop,
    syncPosition,
  };
}
