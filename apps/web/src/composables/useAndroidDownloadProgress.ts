import { onScopeDispose, readonly, ref } from 'vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import i18n from '@/i18n';
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

/*
 * 终态后的停留时间。落盘位置现在写在这张卡片里（不再另弹 toast），
 * 得留够时间让人读完「已完成 + 已保存到「下载」目录」，2 秒偏短。
 */
const FINISHED_LINGER_MS = 3600;
/*
 * 失联兜底：原生轮询有 30 分钟上限（见 WebViewSupport.DOWNLOAD_PROGRESS_MAX_DURATION_MS），
 * 超时后就不再推任何状态了。没有这个兜底的话，极大文件配慢网会在界面上留下一条
 * 永远卡住的进度条 —— 那时下载其实还在跑，真实进度仍可从系统通知栏看到。
 * 取值比原生轮询间隔（500ms）大两个量级，正常下载不会被误清。
 */
const STALE_TIMEOUT_MS = 90_000;

/*
 * 「已开始下载」的降级窗口。
 *
 * 有进度回传的 App 版本，进度条会在几十毫秒内出现，那就不该再弹一句「已开始下载」——
 * 同一件事说两遍。但正式版 1.0.0 不回传进度，什么都不说就变成点了没反应，
 * 所以这个窗口内没等到任何进度事件时才补提示。
 */
const START_FEEDBACK_GRACE_MS = 900;

const activeDownloads = ref<AndroidDownloadProgress[]>([]);
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** 最近一次收到原生进度的时刻，用来判断当前 App 版本会不会回传进度 */
let lastProgressAt = 0;
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

/**
 * 通知「刚发起了一次交给系统下载的动作」。
 *
 * 会回传进度的 App 版本什么都不用提示（进度条马上就出来了）；只有等不到进度事件时
 * 才补一句，兼容不回传进度的旧版本。调用方因此不必自己判断 App 版本。
 */
export function announceNativeDownloadStart() {
  const requestedAt = Date.now();
  setTimeout(() => {
    if (lastProgressAt >= requestedAt) return;
    message.success(i18n.global.t('common.downloadStarted'));
  }, START_FEEDBACK_GRACE_MS);
}

function applyProgress(progress: AndroidDownloadProgress) {
  lastProgressAt = Date.now();
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
  // 落盘结果(含保存位置)由进度卡片自己显示,这里不再弹 toast —— 移动端 toast 也贴底,
  // 两者会叠在一起,而且卡片已经写了「已完成」,再弹一条就是重复播报。
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
  lastProgressAt = 0;
  activeDownloads.value = [];
  unsubscribe?.();
  unsubscribe = null;
  subscriberCount = 0;
}
