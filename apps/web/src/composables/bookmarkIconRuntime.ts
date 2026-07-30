import { reactive } from 'vue';

export const BOOKMARK_ICON_LOADING_TIMEOUT_MS = 30_000;

export interface BookmarkIconRuntimeState {
  refreshing: boolean;
  batchLoading: boolean;
  iconUrl: string;
  hasIconOverride: boolean;
  hidePreviousIcon: boolean;
  previousIconUrl: string;
  requestToken: number;
}

const bookmarkIconStates = reactive<Record<string, BookmarkIconRuntimeState>>({});
const refreshTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const batchTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
let nextRequestToken = 0;

function normalizeBookmarkId(id?: string) {
  return String(id || '').trim();
}

function ensureBookmarkIconState(id: string) {
  if (!bookmarkIconStates[id]) {
    bookmarkIconStates[id] = {
      refreshing: false,
      batchLoading: false,
      iconUrl: '',
      hasIconOverride: false,
      hidePreviousIcon: false,
      previousIconUrl: '',
      requestToken: 0,
    };
  }
  return bookmarkIconStates[id];
}

function clearLoadingTimeout(timeouts: Map<string, ReturnType<typeof setTimeout>>, id: string) {
  const timeout = timeouts.get(id);
  if (timeout !== undefined) clearTimeout(timeout);
  timeouts.delete(id);
}

function scheduleRefreshTimeout(id: string, requestToken: number) {
  clearLoadingTimeout(refreshTimeouts, id);
  refreshTimeouts.set(
    id,
    setTimeout(() => {
      refreshTimeouts.delete(id);
      const state = bookmarkIconStates[id];
      if (state?.requestToken === requestToken) state.refreshing = false;
    }, BOOKMARK_ICON_LOADING_TIMEOUT_MS),
  );
}

function scheduleBatchTimeout(id: string) {
  clearLoadingTimeout(batchTimeouts, id);
  batchTimeouts.set(
    id,
    setTimeout(() => {
      batchTimeouts.delete(id);
      const state = bookmarkIconStates[id];
      if (state) state.batchLoading = false;
    }, BOOKMARK_ICON_LOADING_TIMEOUT_MS),
  );
}

/**
 * 开始后台校验 favicon。
 * - 同站点刷新保留旧图标，避免保存后闪烁默认图标。
 * - 跨站点刷新隐藏旧图标，等待期间显示加载态。
 */
export function beginBookmarkIconRefresh(
  id?: string,
  { clearExisting = false, previousIconUrl = '' }: { clearExisting?: boolean; previousIconUrl?: string } = {},
) {
  const bookmarkId = normalizeBookmarkId(id);
  if (!bookmarkId) return 0;
  const state = ensureBookmarkIconState(bookmarkId);
  state.requestToken = ++nextRequestToken;
  state.refreshing = true;
  scheduleRefreshTimeout(bookmarkId, state.requestToken);
  if (clearExisting) {
    state.hasIconOverride = false;
    state.iconUrl = '';
    state.hidePreviousIcon = true;
    state.previousIconUrl = String(previousIconUrl || '');
  }
  return state.requestToken;
}

/** 只允许当前一轮请求收尾，防止较慢的旧请求覆盖后发请求。 */
export function finishBookmarkIconRefresh(id?: string, requestToken = 0, iconUrl = '') {
  const bookmarkId = normalizeBookmarkId(id);
  const state = bookmarkIconStates[bookmarkId];
  if (!state || (requestToken && state.requestToken !== requestToken)) return;
  clearLoadingTimeout(refreshTimeouts, bookmarkId);
  if (iconUrl) {
    state.iconUrl = iconUrl;
    state.hasIconOverride = true;
    state.hidePreviousIcon = false;
  }
  state.refreshing = false;
}

/**
 * 标记后台导入批次中仍在排队或处理的书签。
 * 与单条保存后刷新分开存储，任一链路仍在工作时卡片都应保持加载态。
 */
export function setBookmarkIconBatchLoading(id?: string, loading = true) {
  const bookmarkId = normalizeBookmarkId(id);
  if (!bookmarkId) return;
  if (!loading && !bookmarkIconStates[bookmarkId]) return;
  const state = ensureBookmarkIconState(bookmarkId);
  state.batchLoading = loading;
  if (loading) {
    scheduleBatchTimeout(bookmarkId);
  } else {
    clearLoadingTimeout(batchTimeouts, bookmarkId);
  }
}

export function getBookmarkIconRuntimeState(id?: string) {
  const bookmarkId = normalizeBookmarkId(id);
  return bookmarkId ? bookmarkIconStates[bookmarkId] : undefined;
}

export function resolveBookmarkIconSource(id?: string, source = '') {
  const state = getBookmarkIconRuntimeState(id);
  if (!state) return source;
  if (state.hasIconOverride) return state.iconUrl;
  if (state.hidePreviousIcon && source === state.previousIconUrl) return '';
  return source;
}

/** 供退出登录及单元测试清理页面级运行状态。 */
export function resetBookmarkIconRuntime() {
  refreshTimeouts.forEach((timeout) => clearTimeout(timeout));
  batchTimeouts.forEach((timeout) => clearTimeout(timeout));
  refreshTimeouts.clear();
  batchTimeouts.clear();
  Object.keys(bookmarkIconStates).forEach((id) => delete bookmarkIconStates[id]);
}
