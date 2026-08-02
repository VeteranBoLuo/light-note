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
  if (entry.state === 'released') return;
  entry.state = 'released';
  entry.onBack();
}

function removeEntry(entry: MobileOverlayHistoryEntry, invoke: boolean) {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) entries.splice(index, 1);
  clearFallback(entry);
  if (invoke && entry.state !== 'released') {
    entry.state = 'released';
    entry.onBack();
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
  entries.splice(0).forEach(clearFallback);
  if (typeof window !== 'undefined' && listening) window.removeEventListener('popstate', handlePopState, true);
  listening = false;
  sequence = 0;
}
