import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import { isAdminLoginPreview } from '@/utils/authStorage.ts';
import useUserStore from '@/store/useUser.ts';

const isReadOnlyAdminPreview = () => isAdminLoginPreview() && !useUserStore().visitorWorkspace;
const BOOKMARK_ICON_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const BOOKMARK_ICON_RETRY_MS = 24 * 60 * 60 * 1000;

type BookmarkIconItem = {
  url: string;
  id: string;
  iconUrl?: string;
  iconCheckedAt?: string;
};

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
    await apiBasePost('/api/common/recordOperationLogs', params);
  } catch (error) {
    console.warn('record operation failed:', error);
  }
};

export const getNoticeSummary = async function () {
  return apiBaseGet('/api/common/noticeSummary');
};

// 渐进式抓取书签图标:缺图立即抓，已有图标过期后静默重验；按小批合并请求，批间限并发、逐批回填。
// 既不像"整批一次请求"那样被最慢站拖死首屏十几秒,也不像"逐个请求"那样几百个请求撞限流 429。
export async function loadBookmarkIconsProgressively(
  items: BookmarkIconItem[],
  applyIcon: (id: string, iconUrl: string) => void,
  { batchSize = 20, concurrency = 2 }: { batchSize?: number; concurrency?: number } = {},
): Promise<void> {
  // 普通用户的管理员预览是只读模式。图标补全会抓取文件并更新 bookmark.icon_url，
  // 因此不能把它当作列表查询的附带动作发出；游客维护工作区仍按后端白名单正常执行。
  if (isReadOnlyAdminPreview()) return;
  const targets = (items || []).filter((item) => needsBookmarkIconRefresh(item));
  if (!targets.length) return;
  // 每批 batchSize 个书签合并成 1 个请求;总请求数 ≈ ceil(targets/batchSize),远低于限流阈值
  const batches: Array<typeof targets> = [];
  for (let i = 0; i < targets.length; i += batchSize) {
    batches.push(targets.slice(i, i + batchSize));
  }
  let bi = 0;
  const worker = async () => {
    while (bi < batches.length) {
      const batch = batches[bi++];
      try {
        const res = await apiBasePost(
          '/api/common/analyzeImgUrl',
          batch.map((it) => ({ url: it.url, id: it.id, noCache: true })),
        );
        if (res?.status === 200 && Array.isArray(res.data)) {
          for (const r of res.data) {
            const target = targets.find((item) => item.id === r?.id);
            if (target && r?.iconCheckedAt) target.iconCheckedAt = r.iconCheckedAt;
            // 抓取失败时 iconUrl 为空：只更新时间，不覆盖当前仍可用的旧图标。
            if (r?.id && r?.iconUrl) applyIcon(r.id, r.iconUrl); // 逐批到手即回填
          }
        }
      } catch {
        /* 整批失败忽略,不影响其余批 */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
}

export async function refreshBookmarkIcon(item: BookmarkIconItem): Promise<string> {
  if (!item?.id) return '';
  try {
    const res = await apiBasePost('/api/common/analyzeImgUrl', [{ id: item.id, noCache: true }]);
    const result = Array.isArray(res?.data) ? res.data.find((entry) => entry?.id === item.id) : null;
    if (result?.iconCheckedAt) item.iconCheckedAt = result.iconCheckedAt;
    if (!result?.iconUrl) return '';
    item.iconUrl = result.iconUrl;
    return result.iconUrl;
  } catch {
    return '';
  }
}

// 日志白名单(自己人设备免记录 api/操作/转化):仅 root 可用
export const getLogExclude = () => apiBasePost('/api/common/getLogExclude', {});
export const addLogExclude = (fingerprint: string, deviceId?: string, note?: string) =>
  apiBasePost('/api/common/addLogExclude', { fingerprint, deviceId, note });
export const removeLogExclude = (fingerprint: string) =>
  apiBasePost('/api/common/removeLogExclude', { fingerprint });
