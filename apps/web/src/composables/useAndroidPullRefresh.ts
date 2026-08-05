import { computed, onBeforeUnmount, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';
import i18n from '@/i18n';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import { isLightNoteAndroidApp } from '@/utils/androidBridge';
import { hasOpenMobileOverlay } from '@/utils/mobileOverlayHistory';

/**
 * Android App 列表页的统一下拉刷新手势。
 *
 * 只有一份手势实现：页面负责说清「刷新什么」和「什么状态下不该刷新」，
 * 阈值、阻尼、方向锁、顶部判定、浮层拦截、竞态与失败提示都在这里收口。
 *
 * 为什么仅限 Android App：浏览器与 PWA 自带页面级下拉刷新，再叠一层
 * preventDefault 会和原生 overscroll 打架，且 iOS/Standalone 行为各不相同。
 * 想扩到 PWA 需要单独一轮验证（见落地方案第 10 节）。
 *
 * 坐标口径提醒：下拉距离取自 touch.clientY（视觉坐标），顶部判定取 scrollTop
 * （布局坐标）。移动布局运行时强制标准缩放，两者比例一致，所以当前无需换算；
 * 若将来在可能存在 <html> CSS zoom 的形态下启用，必须先按 utils/zoom.ts 的
 * getRootZoom() 归一，否则手指位移与下拉距离不成比例。
 */

/** 与「今日」原实现一致的手感参数，各页面不要各自改，保证全 App 一致。 */
const DEFAULT_THRESHOLD = 72;
const DEFAULT_MAX_DISTANCE = 96;
const DEFAULT_RESISTANCE = 0.48;
/** 判定手势方向前允许的位移；小于它时还看不出用户想横滑还是下拉。 */
const DEFAULT_DIRECTION_LOCK_THRESHOLD = 8;
/** 刷新进行中指示器停留的位置。 */
const REFRESHING_DISTANCE = 52;

/**
 * 全局总开关。真机手势若出问题，这里改一处即可全站停用，
 * 不必逐页回滚代码。
 */
export const ANDROID_PULL_REFRESH_ENABLED = true;

type GestureStage = 'idle' | 'tracking' | 'pulling';

export interface UseAndroidPullRefreshOptions {
  /** 页面自身的启用条件（批量模式、初次加载中等一律传 false）。 */
  enabled: MaybeRefOrGetter<boolean>;
  /**
   * 页面已有的忙碌状态（首屏 loading、加载更多、批量提交中……）。
   *
   * 特意不叫 refreshing：多个页面本来就有自己的 refreshing（如笔记库的软刷新态），
   * 与本 composable 返回的 refreshing 同名会混淆两种语义。
   */
  externalBusy?: MaybeRefOrGetter<boolean>;
  /** 返回真正发生滚动的容器。卡片/列表两种视图切换时，返回当前激活的那个。 */
  getScrollContainer: () => HTMLElement | null;
  /** 页面级即时判断（左滑卡片已展开、上传中、重命名中……）。 */
  canStart?: () => boolean;
  /** 刷新动作。reject 视为失败：保留旧数据并提示，不清空列表。 */
  onRefresh: () => Promise<unknown>;
  /** 自定义失败处理（如云空间的「部分数据刷新失败」）。提供后不再弹默认提示。 */
  onError?: (error: unknown) => void;
  threshold?: number;
  maxDistance?: number;
  resistance?: number;
  directionLockThreshold?: number;
}

export interface UseAndroidPullRefreshResult {
  /** 指示器当前应下移的距离（已含阻尼）。 */
  pullDistance: Readonly<Ref<number>>;
  refreshing: Readonly<Ref<boolean>>;
  /** 已达阈值，松手即刷新。 */
  ready: ComputedRef<boolean>;
  /** 是否需要渲染指示器（正在下拉或正在刷新）。 */
  visible: ComputedRef<boolean>;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: () => Promise<void>;
  onTouchCancel: () => void;
  reset: () => void;
}

export function useAndroidPullRefresh(options: UseAndroidPullRefreshOptions): UseAndroidPullRefreshResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxDistance = options.maxDistance ?? DEFAULT_MAX_DISTANCE;
  const resistance = options.resistance ?? DEFAULT_RESISTANCE;
  const directionLockThreshold = options.directionLockThreshold ?? DEFAULT_DIRECTION_LOCK_THRESHOLD;

  const pullDistance = ref(0);
  const refreshing = ref(false);
  const ready = computed(() => pullDistance.value >= threshold);
  const visible = computed(() => pullDistance.value > 0 || refreshing.value);

  const isAndroidApp = isLightNoteAndroidApp();
  let stage: GestureStage = 'idle';
  let startX = 0;
  let startY = 0;
  let activeContainer: HTMLElement | null = null;

  function endGesture() {
    stage = 'idle';
    activeContainer = null;
  }

  function reset() {
    endGesture();
    pullDistance.value = 0;
    refreshing.value = false;
  }

  /** 手势能否开始。任何一项不满足都不进入跟踪，连方向都不判。 */
  function canBeginGesture(): boolean {
    if (!ANDROID_PULL_REFRESH_ENABLED || !isAndroidApp) return false;
    if (refreshing.value) return false;
    if (!toValue(options.enabled)) return false;
    if (toValue(options.externalBusy ?? false)) return false;
    // 浮层打开时不响应:判断收口在 mobileOverlayHistory,各页面不必罗列自己的 visible 变量
    if (hasOpenMobileOverlay()) return false;
    if (options.canStart && !options.canStart()) return false;
    return true;
  }

  function onTouchStart(event: TouchEvent) {
    endGesture();
    // 多指手势(缩放/双指滚动)不参与下拉
    if (event.touches.length !== 1) return;
    if (!canBeginGesture()) return;
    const container = options.getScrollContainer();
    // 必须已在顶部：否则这一拉是正常滚动
    if (!container || container.scrollTop > 0) return;
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    activeContainer = container;
    stage = 'tracking';
  }

  function onTouchMove(event: TouchEvent) {
    if (stage === 'idle') return;
    // 过程中变成多指：放弃本次手势
    if (event.touches.length !== 1) {
      cancelPull();
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    // 跟踪期间容器又滚起来了(惯性未停)，说明这不是从顶部开始的下拉
    if (activeContainer && activeContainer.scrollTop > 0) {
      cancelPull();
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (stage === 'tracking') {
      // 方向锁：位移还看不出意图时继续观察，不拦截浏览器/系统的默认行为
      if (Math.abs(deltaX) < directionLockThreshold && Math.abs(deltaY) < directionLockThreshold) return;
      // 横向优先或上滑 → 让给左滑卡片、横向筛选条、系统边缘返回
      if (Math.abs(deltaX) >= Math.abs(deltaY) || deltaY <= 0) {
        cancelPull();
        return;
      }
      stage = 'pulling';
    }

    if (deltaY <= 0) {
      // 已进入下拉后又收回到起点之上：距离归零但保留手势，用户可能继续下拉
      pullDistance.value = 0;
      return;
    }
    // 只有确认是纵向下拉后才阻止默认行为，早拦会破坏横滑与系统返回手势
    if (event.cancelable) event.preventDefault();
    pullDistance.value = Math.min(maxDistance, deltaY * resistance);
  }

  function cancelPull() {
    endGesture();
    if (!refreshing.value) pullDistance.value = 0;
  }

  async function onTouchEnd() {
    if (stage === 'idle') return;
    const shouldRefresh = stage === 'pulling' && ready.value;
    endGesture();
    if (!shouldRefresh) {
      if (!refreshing.value) pullDistance.value = 0;
      return;
    }
    // 松手到请求返回之间再次下拉不能重复发请求
    refreshing.value = true;
    pullDistance.value = REFRESHING_DISTANCE;
    try {
      await options.onRefresh();
    } catch (error) {
      if (options.onError) options.onError(error);
      else message.error(i18n.global.t('common.refreshFailed'));
    } finally {
      refreshing.value = false;
      pullDistance.value = 0;
    }
  }

  function onTouchCancel() {
    cancelPull();
  }

  // 页面卸载时清状态，避免刷新态残留到下次进入
  onBeforeUnmount(reset);

  return {
    pullDistance,
    refreshing,
    ready,
    visible,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    reset,
  };
}
