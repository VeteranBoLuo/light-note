import { computed, ref, watch } from 'vue';
import { useUserStore } from '@/store';
import {
  registerMobileOverlayHistory,
  releaseMobileOverlayHistory,
  requestMobileOverlayHistoryClose,
  type MobileOverlayHistoryHandle,
} from '@/utils/mobileOverlayHistory';

const RECENT_LIMIT = 8;
const RECENT_KEY_PREFIX = 'light-note:global-search-recent:';

/**
 * 移动端全局搜索层的共享状态。
 *
 * 搜索层挂在移动端应用壳层，不由每个页面各自创建，
 * 因此 open / keyword / 最近搜索都保存在模块级单例中。
 */
const open = ref(false);
const keyword = ref('');
const recentKeywords = ref<string[]>([]);

let historyHandle: MobileOverlayHistoryHandle | null = null;
let pendingAfterClose: (() => void) | null = null;
let boundUserKey = '';

function recentStorageKey(userId: string) {
  return `${RECENT_KEY_PREFIX}${userId || 'guest'}`;
}

function loadRecent(userId: string) {
  try {
    const raw = window.localStorage.getItem(recentStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    recentKeywords.value = Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, RECENT_LIMIT)
      : [];
  } catch {
    recentKeywords.value = [];
  }
}

function persistRecent(userId: string) {
  try {
    window.localStorage.setItem(recentStorageKey(userId), JSON.stringify(recentKeywords.value));
  } catch {
    // 隐私模式或存储超限时静默降级：最近搜索是本机便利功能，不值得打断搜索
  }
}

function closeFromMobileHistory() {
  historyHandle = null;
  open.value = false;
  keyword.value = '';
  const afterClose = pendingAfterClose;
  pendingAfterClose = null;
  afterClose?.();
}

function pushSentinel() {
  if (historyHandle) return;
  historyHandle = registerMobileOverlayHistory(closeFromMobileHistory);
}

/**
 * 主动收起搜索层时撤销 sentinel。
 * 若带 afterClose（例如点击结果需要跳路由），必须等 sentinel 真正出栈后再执行，
 * 否则 history.back() 会把刚 push 的新路由一起弹掉。
 */
function popSentinel(afterClose?: () => void) {
  if (!historyHandle) {
    afterClose?.();
    return;
  }
  pendingAfterClose = afterClose || null;
  if (requestMobileOverlayHistoryClose(historyHandle)) return;
  historyHandle = null;
  closeFromMobileHistory();
}

export function useMobileGlobalSearch() {
  const user = useUserStore();

  // 按账号隔离最近搜索，切换账号不串号
  watch(
    () => user.id,
    (id) => {
      const key = String(id || '');
      if (boundUserKey === key) return;
      boundUserKey = key;
      loadRecent(key);
    },
    { immediate: true },
  );

  function openSearch(initialKeyword = '') {
    if (initialKeyword) keyword.value = initialKeyword;
    if (open.value) return;
    open.value = true;
    pushSentinel();
  }

  function closeSearch(afterClose?: () => void) {
    if (!open.value) {
      // 首次点击已经发起 history 回退时，后续重复点击不能越过尚未释放的
      // 占位提前跳路由；保留第一份后续动作即可。
      if (historyHandle) {
        if (!pendingAfterClose && afterClose) pendingAfterClose = afterClose;
        return;
      }
      afterClose?.();
      return;
    }
    open.value = false;
    // 每次重新打开都回到「最近搜索」空态；要接着上次搜索可以点最近搜索项
    keyword.value = '';
    popSentinel(afterClose);
  }

  /**
   * 只收起界面、不改 history。
   * 用于路由已经变化、sentinel 已经失效的兜底场景；此时再调 history.back()
   * 会把用户从新页面弹回搜索前的页面。
   */
  function dismiss() {
    if (historyHandle) {
      releaseMobileOverlayHistory(historyHandle);
      historyHandle = null;
    }
    pendingAfterClose = null;
    open.value = false;
    keyword.value = '';
  }

  function clearKeyword() {
    keyword.value = '';
  }

  function rememberKeyword(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    recentKeywords.value = [normalized, ...recentKeywords.value.filter((item) => item !== normalized)].slice(
      0,
      RECENT_LIMIT,
    );
    persistRecent(String(user.id || ''));
  }

  function clearRecentKeywords() {
    recentKeywords.value = [];
    persistRecent(String(user.id || ''));
  }

  return {
    open,
    keyword,
    recentKeywords: computed(() => recentKeywords.value),
    openSearch,
    closeSearch,
    dismiss,
    clearKeyword,
    rememberKeyword,
    clearRecentKeywords,
  };
}
