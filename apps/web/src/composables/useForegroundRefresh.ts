import { onBeforeUnmount, onMounted, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

/**
 * 回到前台时的静默刷新。
 *
 * 为什么需要它：本项目没有使用 keep-alive，路由切换会重建页面，数据天然是新的；
 * 真正会拿到陈旧数据的只有一种情况 —— 页面一直在，但用户离开了：
 * Android App 被切到后台后再回来、PC 上切走标签页很久再切回。
 * 这时页面不会重新挂载，任何 onMounted / onActivated 都不会触发。
 *
 * 与下拉刷新的分工：下拉是用户主动要最新数据，有明确的手势反馈；
 * 这里是被动补偿，必须完全静默 —— 不进 loading、不闪骨架屏、不弹提示，
 * 也不再驱动全局顶部进度条；刷新期间继续展示旧数据，失败则原样保留。
 *
 * 判定用「距上次成功加载的时长」而不是「离开的时长」：用户离开 10 秒但
 * 数据已经 10 分钟没更新过，同样值得刷一次；反过来离开很久却刚刷过则不必。
 */

/** 全局总开关。前台恢复刷新若造成异常请求量，这里改一处即可全站停用。 */
export const FOREGROUND_REFRESH_ENABLED = true;

/** 默认陈旧阈值。5 分钟内切回来认为数据还新鲜，不额外发请求。 */
const DEFAULT_STALE_MS = 5 * 60 * 1000;

/**
 * visibilitychange 与 focus 在部分环境下会连着触发（尤其 Android WebView），
 * 这段窗口内的重复唤醒只算一次。
 */
const WAKE_DEDUPE_MS = 800;

export interface UseForegroundRefreshOptions {
  /** 静默刷新动作。内部会吞掉异常：静默刷新失败不该打扰用户。 */
  refresh: () => Promise<unknown>;
  /** 数据被认为过期的时长，默认 5 分钟。 */
  staleMs?: number;
  /**
   * 页面级即时判断（批量选择中、编辑器打开、上传中……）。
   * 返回 false 时跳过本次刷新，并且不更新时间戳 —— 下次回到前台还会再试。
   */
  canRefresh?: () => boolean;
  /** 关掉整页的前台刷新（例如某些页面只在移动端需要）。 */
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface UseForegroundRefreshResult {
  /** 是否正在静默刷新。只供调用方防并发或诊断，不用于控制全局视觉反馈。 */
  refreshing: Readonly<Ref<boolean>>;
  /** 页面自己完成一次加载后调用，重置陈旧计时。 */
  markLoaded: () => void;
  /** 手动触发一次「过期才刷」，供页面在特殊时机复用。 */
  refreshIfStale: () => Promise<void>;
}

export function useForegroundRefresh(options: UseForegroundRefreshOptions): UseForegroundRefreshResult {
  const refreshing = ref(false);
  /**
   * 初值取创建时刻：页面刚挂载完就有一次首屏加载，
   * 若初值为 0 会被判成「已过期」，切回前台立刻多打一次请求。
   */
  let lastLoadedAt = Date.now();
  let lastWakeAt = 0;

  function markLoaded() {
    lastLoadedAt = Date.now();
  }

  async function refreshIfStale() {
    if (!FOREGROUND_REFRESH_ENABLED) return;
    if (options.enabled !== undefined && !toValue(options.enabled)) return;
    // 已经在刷了就别叠一次:后一次不会更新,只会多打一个请求。
    if (refreshing.value) return;
    if (Date.now() - lastLoadedAt < (options.staleMs ?? DEFAULT_STALE_MS)) return;
    if (options.canRefresh && !options.canRefresh()) return;

    refreshing.value = true;
    try {
      await options.refresh();
      markLoaded();
    } catch {
      // 静默刷新失败保留旧数据,不提示、不清列表。时间戳也不更新,
      // 这样下次回到前台还会重试。
    } finally {
      refreshing.value = false;
    }
  }

  function handleWake() {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastWakeAt < WAKE_DEDUPE_MS) return;
    lastWakeAt = now;
    void refreshIfStale();
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleWake);
    // WebView 里 visibilitychange 偶有不触发的机型,focus 作为兜底。
    window.addEventListener('focus', handleWake);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleWake);
    window.removeEventListener('focus', handleWake);
  });

  return { refreshing, markLoaded, refreshIfStale };
}
