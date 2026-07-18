import { reactive } from 'vue';

export interface BookmarkIconRuntimeState {
  refreshing: boolean;
  iconUrl: string;
  hasIconOverride: boolean;
  hidePreviousIcon: boolean;
  previousIconUrl: string;
  requestToken: number;
}

const bookmarkIconStates = reactive<Record<string, BookmarkIconRuntimeState>>({});
let nextRequestToken = 0;

function normalizeBookmarkId(id?: string) {
  return String(id || '').trim();
}

function ensureBookmarkIconState(id: string) {
  if (!bookmarkIconStates[id]) {
    bookmarkIconStates[id] = {
      refreshing: false,
      iconUrl: '',
      hasIconOverride: false,
      hidePreviousIcon: false,
      previousIconUrl: '',
      requestToken: 0,
    };
  }
  return bookmarkIconStates[id];
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
  if (iconUrl) {
    state.iconUrl = iconUrl;
    state.hasIconOverride = true;
    state.hidePreviousIcon = false;
  }
  state.refreshing = false;
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
  Object.keys(bookmarkIconStates).forEach((id) => delete bookmarkIconStates[id]);
}
