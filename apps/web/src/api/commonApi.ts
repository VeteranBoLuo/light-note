import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import { isAdminLoginPreview } from '@/utils/authStorage.ts';
import useUserStore from '@/store/useUser.ts';

const isReadOnlyAdminPreview = () => isAdminLoginPreview() && !useUserStore().visitorWorkspace;

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

// 渐进式抓取书签图标:只抓无图标的,按小批合并请求(避开后端 120次/分 限流),批间限并发、逐批回填。
// 既不像"整批一次请求"那样被最慢站拖死首屏十几秒,也不像"逐个请求"那样几百个请求撞限流 429。
export async function loadBookmarkIconsProgressively(
  items: Array<{ url: string; id: string; iconUrl?: string }>,
  applyIcon: (id: string, iconUrl: string) => void,
  { batchSize = 20, concurrency = 2 }: { batchSize?: number; concurrency?: number } = {},
): Promise<void> {
  // 普通用户的管理员预览是只读模式。图标补全会抓取文件并更新 bookmark.icon_url，
  // 因此不能把它当作列表查询的附带动作发出；游客维护工作区仍按后端白名单正常执行。
  if (isReadOnlyAdminPreview()) return;
  const targets = (items || []).filter((it) => it && it.url && it.id && !it.iconUrl);
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

// 日志白名单(自己人设备免记录 api/操作/转化):仅 root 可用
export const getLogExclude = () => apiBasePost('/api/common/getLogExclude', {});
export const addLogExclude = (fingerprint: string, note?: string) =>
  apiBasePost('/api/common/addLogExclude', { fingerprint, note });
export const removeLogExclude = (fingerprint: string) =>
  apiBasePost('/api/common/removeLogExclude', { fingerprint });
