import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import { isAdminLoginPreview } from '@/utils/authStorage.ts';

export const recordOperation = async function (params: { module: string; operation: string }) {
  if (isAdminLoginPreview()) {
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

// 渐进式抓取书签图标:只抓无图标的,限并发逐个请求,每个抓到立即 applyIcon 回填(不必等最慢站一起返回)。
// 替代"整批一次请求 + 后端 Promise.all 等最慢",解决书签多时首屏卡十几秒且一次性才出图;并顺带给后端限流。
export async function loadBookmarkIconsProgressively(
  items: Array<{ url: string; id: string; iconUrl?: string }>,
  applyIcon: (id: string, iconUrl: string) => void,
  concurrency = 6,
): Promise<void> {
  const targets = (items || []).filter((it) => it && it.url && it.id && !it.iconUrl);
  if (!targets.length) return;
  let idx = 0;
  const worker = async () => {
    while (idx < targets.length) {
      const it = targets[idx++];
      try {
        const res = await apiBasePost('/api/common/analyzeImgUrl', [{ url: it.url, id: it.id, noCache: true }]);
        const icon = Array.isArray(res?.data) ? res.data[0]?.iconUrl : '';
        if (res?.status === 200 && icon) applyIcon(it.id, icon);
      } catch {
        /* 单个失败忽略,不影响其余书签 */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
}
