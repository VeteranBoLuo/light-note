/**
 * 移动端浮层的返回手势协调器。
 *
 * 每打开一层浮层就在当前 URL 上压入一个 history 占位。Android WebView
 * 返回键、iOS/浏览器边缘返回手势弹出该占位时，只关闭最上层浮层，不后退
 * 业务路由。所有接入方共用同一栈，确保“确认框 → 弹框 → 抽屉”按层关闭。
 */

export const MOBILE_OVERLAY_HISTORY_STATE_KEY = '__lnMobileOverlayId';

export interface MobileOverlayHistoryHandle {
  readonly id: string;
}

interface MobileOverlayHistoryEntry extends MobileOverlayHistoryHandle {
  onBack: () => void;
  state: 'active' | 'closing' | 'released';
  fallbackTimer: number | null;
  releaseWaiters: Set<() => void>;
}

const entries: MobileOverlayHistoryEntry[] = [];
let sequence = 0;
let listening = false;

function readOverlayId(state: unknown = window.history.state): string {
  if (!state || typeof state !== 'object') return '';
  const value = (state as Record<string, unknown>)[MOBILE_OVERLAY_HISTORY_STATE_KEY];
  return typeof value === 'string' ? value : '';
}

function clearFallback(entry: MobileOverlayHistoryEntry) {
  if (entry.fallbackTimer === null) return;
  window.clearTimeout(entry.fallbackTimer);
  entry.fallbackTimer = null;
}

function resolveReleaseWaiters(entry: MobileOverlayHistoryEntry) {
  if (!entry.releaseWaiters.size) return;
  const waiters = [...entry.releaseWaiters];
  entry.releaseWaiters.clear();
  waiters.forEach((resolve) => resolve());
}

function syncListener() {
  if (typeof window === 'undefined') return;
  if (entries.length && !listening) {
    // capture 阶段先于仍在迁移期的旧浮层监听器执行。当前管理器确实消费了
    // 一层时会阻止旧监听器重复关闭下层浮层；若只是弹出了旧浮层，则继续放行。
    window.addEventListener('popstate', handlePopState, true);
    listening = true;
  } else if (!entries.length && listening) {
    window.removeEventListener('popstate', handlePopState, true);
    listening = false;
  }
}

function invokeEntry(entry: MobileOverlayHistoryEntry) {
  clearFallback(entry);
  if (entry.state === 'released') {
    resolveReleaseWaiters(entry);
    return;
  }
  entry.state = 'released';
  try {
    entry.onBack();
  } finally {
    resolveReleaseWaiters(entry);
  }
}

function removeEntry(entry: MobileOverlayHistoryEntry, invoke: boolean) {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) entries.splice(index, 1);
  clearFallback(entry);
  try {
    if (invoke && entry.state !== 'released') {
      entry.state = 'released';
      entry.onBack();
    }
  } finally {
    resolveReleaseWaiters(entry);
  }
  syncListener();
}

function handlePopState(event: PopStateEvent) {
  const currentId = readOverlayId(event.state);
  let poppedEntries: MobileOverlayHistoryEntry[] = [];

  if (currentId) {
    const currentIndex = entries.findIndex((entry) => entry.id === currentId);
    // 落回某个仍打开的浮层占位时，只关闭它上面的层。未知 ID 是已经
    // 主动释放的旧占位，不应误关当前仍然活跃的浮层。
    if (currentIndex < 0) return;
    poppedEntries = entries.splice(currentIndex + 1);
  } else {
    // 当前 history 已经回到业务页面，说明所有仍登记的浮层占位都已出栈。
    poppedEntries = entries.splice(0);
  }

  if (poppedEntries.length) event.stopImmediatePropagation();
  [...poppedEntries].reverse().forEach(invokeEntry);
  syncListener();
}

function scheduleFallback(entry: MobileOverlayHistoryEntry, invoke: boolean) {
  clearFallback(entry);
  entry.fallbackTimer = window.setTimeout(() => {
    // 正常浏览器/WebView 都会派发 popstate；这里只为极端内核兜底，避免浮层
    // 因返回事件丢失而永远无法关闭。
    removeEntry(entry, invoke);
  }, 400);
}

export function registerMobileOverlayHistory(onBack: () => void): MobileOverlayHistoryHandle | null {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') return null;

  const entry: MobileOverlayHistoryEntry = {
    id: `overlay-${Date.now().toString(36)}-${(++sequence).toString(36)}`,
    onBack,
    state: 'active',
    fallbackTimer: null,
    releaseWaiters: new Set(),
  };

  try {
    const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.pushState(
      { ...currentState, [MOBILE_OVERLAY_HISTORY_STATE_KEY]: entry.id },
      '',
      window.location.href,
    );
  } catch {
    return null;
  }

  entries.push(entry);
  syncListener();
  return { id: entry.id };
}

/**
 * 当前是否有统一管理的移动端浮层处于打开状态（弹框 / 抽屉 / 全屏预览）。
 *
 * 给需要「浮层打开时不响应手势」的能力用（如下拉刷新）：判断只有这一份，
 * 各页面不必再各自罗列自己有哪些 visible 变量 —— 那样每接入一个页面就多一份
 * 会漏项的清单。正在关闭中的浮层同样算打开，它的 history 占位还没出栈。
 */
export function hasOpenMobileOverlay(): boolean {
  return entries.some((entry) => entry.state !== 'released');
}

/**
 * 等待当前最上层浮层的 history 占位完成释放。
 *
 * 选择弹框内容后需要跳转路由时，应先取得这个 Promise，再把弹框的
 * v-model 设为 false，最后 await 后跳转。这样 BModal/BDrawer 触发的
 * history.back() 不会与 router.push() 竞争并把新页面弹回去。
 * 当前没有统一管理的浮层占位时会立即完成。
 */
export function waitForCurrentMobileOverlayHistoryRelease(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const currentId = readOverlayId();
  if (!currentId) return Promise.resolve();
  const entry = entries.find((candidate) => candidate.id === currentId);
  if (!entry) return Promise.resolve();
  return new Promise((resolve) => {
    entry.releaseWaiters.add(resolve);
  });
}

/**
 * 关闭当前移动端浮层，等待它的 history 占位真正出栈后再执行后续动作。
 *
 * 路由跳转、打开外部链接等会改变页面上下文的动作统一走这里，避免调用方
 * 把 `visible = false` 与 `router.push()` 写在同一轮事件中，导致前一次
 * history.back() 把刚打开的目标页再次弹回去。
 */
export async function closeCurrentMobileOverlayThen<T>(
  closeOverlay: () => void,
  next: () => T | Promise<T>,
): Promise<T> {
  const released = waitForCurrentMobileOverlayHistoryRelease();
  closeOverlay();
  await released;
  return await next();
}

/**
 * 用户主动关闭当前浮层。返回 true 表示已发起 history 回退，调用方应等待
 * 注册时的 onBack 回调再真正关闭 UI；返回 false 时调用方可立即关闭。
 */
export function requestMobileOverlayHistoryClose(handle: MobileOverlayHistoryHandle | null): boolean {
  if (!handle || typeof window === 'undefined') return false;
  const entry = entries.find((candidate) => candidate.id === handle.id);
  if (!entry) return false;
  if (entry.state === 'closing') return true;
  if (entry.state === 'released') return false;

  if (readOverlayId() !== entry.id) {
    removeEntry(entry, false);
    return false;
  }

  entry.state = 'closing';
  scheduleFallback(entry, true);
  window.history.back();
  return true;
}

/**
 * 浮层因保存成功、父组件卸载等外部状态变化而消失时释放占位，不触发关闭回调。
 */
export function releaseMobileOverlayHistory(handle: MobileOverlayHistoryHandle | null) {
  if (!handle || typeof window === 'undefined') return;
  const entry = entries.find((candidate) => candidate.id === handle.id);
  if (!entry) return;

  if (readOverlayId() !== entry.id) {
    entry.state = 'released';
    removeEntry(entry, false);
    return;
  }

  entry.state = 'released';
  scheduleFallback(entry, false);
  window.history.back();
}

/** 仅供单元测试清理模块级状态。 */
export function resetMobileOverlayHistoryForTests() {
  entries.splice(0).forEach((entry) => {
    clearFallback(entry);
    resolveReleaseWaiters(entry);
  });
  if (typeof window !== 'undefined' && listening) window.removeEventListener('popstate', handlePopState, true);
  listening = false;
  sequence = 0;
}
