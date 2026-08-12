import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import { isAdminLoginPreview } from '@/utils/authStorage.ts';
import useUserStore from '@/store/useUser.ts';
import { beginBookmarkIconRefresh, finishBookmarkIconRefresh } from '@/composables/bookmarkIconRuntime.ts';

const isReadOnlyAdminPreview = () => isAdminLoginPreview() && !useUserStore().visitorWorkspace;
const BOOKMARK_ICON_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const BOOKMARK_ICON_RETRY_MS = 24 * 60 * 60 * 1000;

type BookmarkIconItem = {
  url: string;
  id: string;
  iconUrl?: string;
  iconCheckedAt?: string;
};

const bookmarkIconAfterSaveRequests = new Map<string, Promise<string>>();

function bookmarkIconAfterSaveRequestKey(item: Pick<BookmarkIconItem, 'id' | 'url'>) {
  return `${String(item.id || '').trim()}:${String(item.url || '')}`;
}

export function resetBookmarkIconRefreshRequests() {
  bookmarkIconAfterSaveRequests.clear();
}

export function needsBookmarkIconRefresh(item: BookmarkIconItem, now = Date.now()) {
  if (!item?.url || !item?.id) return false;
  const checkedAt = item.iconCheckedAt ? Date.parse(String(item.iconCheckedAt).replace(' ', 'T')) : Number.NaN;
  // 旧版本接口没有该字段时不批量刷新已有图标；迁移会为历史图标统一回填检查时间。
  if (!Number.isFinite(checkedAt)) return !item.iconUrl;
  return now - checkedAt >= (item.iconUrl ? BOOKMARK_ICON_REFRESH_MS : BOOKMARK_ICON_RETRY_MS);
}

export const recordOperation = async function (params: { module: string; operation: string }) {
  if (isReadOnlyAdminPreview()) {
    return;
  }
  if (!params?.module || !params?.operation) {
    return;
  }
  try {
    await apiBasePost('/api/common/recordOperationLogs', params, { silent: true, feedback: false });
  } catch (error) {
    console.warn('record operation failed:', error);
  }
};

export const getNoticeSummary = async function () {
  return apiBaseGet('/api/common/noticeSummary', undefined, { silent: true, feedback: false });
};

export const getAdminActionCenter = async function (params: { limit?: number; source?: string } = {}) {
  return apiBasePost('/api/common/getAdminActionCenter', params, { silent: true });
};

export const getAdminTodoReminderDiagnostic = async function (params: { id: string }) {
  return apiBasePost('/api/common/getAdminTodoReminderDiagnostic', params, { silent: true });
};

export const retryAdminAsyncJob = async function (params: {
  source: string;
  id: string;
  reason: string;
  confirmed: true;
  confirmText: '确认重试任务';
}) {
  return apiBasePost('/api/common/retryAdminAsyncJob', params, { silent: true });
};

export const dismissAdminAsyncJob = async function (params: {
  source: string;
  id: string;
  reason: string;
  confirmed: true;
}) {
  return apiBasePost('/api/common/dismissAdminAsyncJob', params, { silent: true });
};

export const getAdminOperationAudits = async function (params: {
  action?: string;
  outcome?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  currentPage?: number;
  pageSize?: number;
}) {
  return apiBasePost('/api/common/getAdminOperationAudits', params, { silent: true });
};

export const getAdminProductInsights = async function (params: { periodDays: 7 | 30 | 90; cohortWeeks: 8 | 12 | 16 }) {
  return apiBasePost('/api/common/getAdminProductInsights', params, { silent: true });
};

export const getAdminGovernance = async function () {
  return apiBasePost('/api/common/getAdminGovernance', {}, { silent: true });
};

// 渐进式抓取书签图标:缺图立即抓，已有图标过期后静默重验；按小批合并请求，批间限并发、逐批回填。
// 既不像"整批一次请求"那样被最慢站拖死首屏十几秒,也不像"逐个请求"那样几百个请求撞限流 429。
export async function loadBookmarkIconsProgressively(
  items: BookmarkIconItem[],
  applyIcon: (id: string, iconUrl: string) => void,
  { batchSize = 10, concurrency = 1 }: { batchSize?: number; concurrency?: number } = {},
): Promise<void> {
  // 普通用户的管理员预览是只读模式。图标补全会抓取文件并更新 bookmark.icon_url，
  // 因此不能把它当作列表查询的附带动作发出；游客维护工作区仍按后端白名单正常执行。
  if (isReadOnlyAdminPreview()) return;
  const targets = (items || []).filter((item) => needsBookmarkIconRefresh(item));
  if (!targets.length) return;

  // 新增/编辑页可能已先发起同一书签的保存后取图。列表加载时复用该请求，
  // 避免返回页面后再向同一站点重复抓取一次。
  const pendingAfterSave = targets.flatMap((item) => {
    const pending = bookmarkIconAfterSaveRequests.get(bookmarkIconAfterSaveRequestKey(item));
    return pending ? [{ item, pending }] : [];
  });
  const pendingIds = new Set(pendingAfterSave.map(({ item }) => item.id));
  const requestTargets = targets.filter((item) => !pendingIds.has(item.id));
  const pendingAfterSaveTask = Promise.all(
    pendingAfterSave.map(async ({ item, pending }) => {
      const iconUrl = await pending;
      if (!iconUrl) return;
      item.iconUrl = iconUrl;
      applyIcon(item.id, iconUrl);
    }),
  );

  if (!requestTargets.length) {
    await pendingAfterSaveTask;
    return;
  }

  const targetById = new Map(requestTargets.map((item) => [item.id, item]));
  const requestTokens = new Map(
    requestTargets.map((item) => [
      item.id,
      beginBookmarkIconRefresh(item.id, {
        clearExisting: !item.iconUrl,
        previousIconUrl: item.iconUrl || '',
      }),
    ]),
  );
  // 每批 batchSize 个书签合并成 1 个请求;总请求数 ≈ ceil(targets/batchSize),远低于限流阈值
  const batches: Array<typeof targets> = [];
  for (let i = 0; i < requestTargets.length; i += batchSize) {
    batches.push(requestTargets.slice(i, i + batchSize));
  }
  let bi = 0;
  const worker = async () => {
    while (bi < batches.length) {
      const batch = batches[bi++];
      const settledIds = new Set<string>();
      try {
        const res = await apiBasePost(
          '/api/common/analyzeImgUrl',
          batch.map((it) => ({ id: it.id, refreshMode: 'periodic' })),
          { silent: true },
        );
        if (res?.status === 200 && Array.isArray(res.data)) {
          for (const r of res.data) {
            const target = targetById.get(r?.id);
            if (target && r?.iconCheckedAt) target.iconCheckedAt = r.iconCheckedAt;
            // 失败时后端可能返回当前旧图，也可能返回空值；空值绝不覆盖仍可用的旧图标。
            if (r?.id && target) {
              if (r.iconUrl) {
                target.iconUrl = r.iconUrl;
                applyIcon(r.id, r.iconUrl); // 逐批到手即回填
              }
              finishBookmarkIconRefresh(r.id, requestTokens.get(r.id), r.iconUrl || '');
              settledIds.add(r.id);
            }
          }
        }
      } catch {
        /* 整批失败忽略,不影响其余批 */
      } finally {
        batch.forEach((item) => {
          if (!settledIds.has(item.id)) finishBookmarkIconRefresh(item.id, requestTokens.get(item.id));
        });
      }
    }
  };
  await Promise.all([
    pendingAfterSaveTask,
    ...Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()),
  ]);
}

export function refreshBookmarkIconAfterSave(
  item: BookmarkIconItem,
  { clearExisting = false }: { clearExisting?: boolean } = {},
): Promise<string> {
  const id = String(item?.id || '').trim();
  if (!id) return Promise.resolve('');
  const requestKey = bookmarkIconAfterSaveRequestKey({ id, url: item.url });
  const pendingRequest = bookmarkIconAfterSaveRequests.get(requestKey);
  if (pendingRequest) return pendingRequest;

  const requestToken = beginBookmarkIconRefresh(id, {
    clearExisting,
    previousIconUrl: item.iconUrl || '',
  });
  let request!: Promise<string>;
  request = (async () => {
    let iconUrl = '';
    try {
      const res = await apiBasePost('/api/common/analyzeImgUrl', [{ id, refreshMode: 'after_save' }], { silent: true });
      const result = Array.isArray(res?.data) ? res.data.find((entry) => entry?.id === id) : null;
      if (result?.iconCheckedAt) item.iconCheckedAt = result.iconCheckedAt;
      if (result?.iconUrl) {
        iconUrl = result.iconUrl;
        item.iconUrl = iconUrl;
      }
      return iconUrl;
    } catch {
      return '';
    } finally {
      finishBookmarkIconRefresh(id, requestToken, iconUrl);
      if (bookmarkIconAfterSaveRequests.get(requestKey) === request) {
        bookmarkIconAfterSaveRequests.delete(requestKey);
      }
    }
  })();
  bookmarkIconAfterSaveRequests.set(requestKey, request);
  return request;
}

// 日志白名单(自己人设备免记录 api/操作/转化):仅 root 可用
export const getLogExclude = () => apiBasePost('/api/common/getLogExclude', {});
export const addLogExclude = (fingerprint: string, deviceId?: string, note?: string) =>
  apiBasePost('/api/common/addLogExclude', { fingerprint, deviceId, note });
export const removeLogExclude = (fingerprint: string) => apiBasePost('/api/common/removeLogExclude', { fingerprint });
