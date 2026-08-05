import { onScopeDispose, readonly, ref } from 'vue';
import { onAndroidDownloadProgress, type AndroidDownloadProgress } from '@/utils/androidBridge';

/**
 * 原生下载的界面进度。
 *
 * 系统 DownloadManager 只在通知栏显示进度，App 里看不到，用户只能看到「开始/完成」两个
 * Toast（见 WebViewSupport 的 download_started / download_completed）。这里收原生回传的
 * 进度快照，让界面能画出和上传一致的进度条。
 *
 * 状态放模块级：下载是全局的，切页面不该丢进度；组件只订阅、不各自持有一份。
 */

/** 终态后再留一会儿，让人看得到 100% 或失败，而不是「刚出现就消失」 */
const FINISHED_LINGER_MS = 2000;
/*
 * 失联兜底：原生轮询有 30 分钟上限（见 WebViewSupport.DOWNLOAD_PROGRESS_MAX_DURATION_MS），
 * 超时后就不再推任何状态了。没有这个兜底的话，极大文件配慢网会在界面上留下一条
 * 永远卡住的进度条 —— 那时下载其实还在跑，真实进度仍可从系统通知栏看到。
 * 取值比原生轮询间隔（500ms）大两个量级，正常下载不会被误清。
 */
const STALE_TIMEOUT_MS = 90_000;

const activeDownloads = ref<AndroidDownloadProgress[]>([]);
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let unsubscribe: (() => void) | null = null;
let subscriberCount = 0;

/** 每条进度都有一个移除定时器：终态是短暂停留，非终态是失联清理。每次更新都重置。 */
function scheduleRemoval(id: string, delay: number) {
  const existing = removalTimers.get(id);
  if (existing) clearTimeout(existing);
  removalTimers.set(
    id,
    setTimeout(() => {
      removalTimers.delete(id);
      activeDownloads.value = activeDownloads.value.filter((item) => item.id !== id);
    }, delay),
  );
}

function applyProgress(progress: AndroidDownloadProgress) {
  const index = activeDownloads.value.findIndex((item) => item.id === progress.id);
  if (index >= 0) {
    // 整数组替换而不是改元素属性：这样 readonly 暴露出去的引用也能触发更新
    const next = activeDownloads.value.slice();
    next[index] = progress;
    activeDownloads.value = next;
  } else {
    activeDownloads.value = [...activeDownloads.value, progress];
  }
  const finished = progress.status === 'success' || progress.status === 'failed';
  scheduleRemoval(progress.id, finished ? FINISHED_LINGER_MS : STALE_TIMEOUT_MS);
}

/**
 * 订阅下载进度。多个组件可以同时用，底层只挂一个原生回调；
 * 最后一个订阅者销毁时解绑，避免离开页面后仍在改状态。
 */
export function useAndroidDownloadProgress() {
  if (!unsubscribe) {
    unsubscribe = onAndroidDownloadProgress(applyProgress);
  }
  subscriberCount += 1;

  onScopeDispose(() => {
    subscriberCount -= 1;
    if (subscriberCount > 0) return;
    unsubscribe?.();
    unsubscribe = null;
    removalTimers.forEach((timer) => clearTimeout(timer));
    removalTimers.clear();
    activeDownloads.value = [];
  });

  return { downloads: readonly(activeDownloads) };
}

/** 仅供测试：重置模块级状态，避免用例之间互相污染 */
export function resetAndroidDownloadProgressForTest() {
  removalTimers.forEach((timer) => clearTimeout(timer));
  removalTimers.clear();
  activeDownloads.value = [];
  unsubscribe?.();
  unsubscribe = null;
  subscriberCount = 0;
}
