import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

const isLightNoteAndroidApp = vi.fn(() => true);
const hasOpenMobileOverlay = vi.fn(() => false);
const messageError = vi.fn();

vi.mock('@/utils/androidBridge', () => ({
  isLightNoteAndroidApp: () => isLightNoteAndroidApp(),
}));

vi.mock('@/utils/mobileOverlayHistory', () => ({
  hasOpenMobileOverlay: () => hasOpenMobileOverlay(),
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { error: (content: string) => messageError(content) },
}));

vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string) => key } },
}));

import { useAndroidPullRefresh, type UseAndroidPullRefreshOptions } from './useAndroidPullRefresh';

/** 造一个可控 scrollTop 的容器，避免依赖 jsdom 的真实布局。 */
function createContainer(scrollTop = 0) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollTop', { value: scrollTop, writable: true, configurable: true });
  return element;
}

function touchEvent(type: string, touches: Array<{ clientX: number; clientY: number }>, cancelable = true) {
  const event = new Event(type, { cancelable, bubbles: true }) as TouchEvent & { preventDefault: () => void };
  Object.defineProperty(event, 'touches', { value: touches, configurable: true });
  return event;
}

/**
 * composable 用了 onBeforeUnmount，必须挂在组件上下文里才能注册。
 * 与项目其它 composable 测试一致：createApp 挂到 detached 节点。
 */
function setup(options: Partial<UseAndroidPullRefreshOptions> & Pick<UseAndroidPullRefreshOptions, 'onRefresh'>) {
  const container = options.getScrollContainer?.() ?? createContainer(0);
  let api!: ReturnType<typeof useAndroidPullRefresh>;
  const host = document.createElement('div');
  const app = createApp({
    setup() {
      api = useAndroidPullRefresh({
        enabled: options.enabled ?? true,
        externalBusy: options.externalBusy,
        getScrollContainer: options.getScrollContainer ?? (() => container),
        canStart: options.canStart,
        onRefresh: options.onRefresh,
        onError: options.onError,
        threshold: options.threshold,
        maxDistance: options.maxDistance,
        resistance: options.resistance,
        directionLockThreshold: options.directionLockThreshold,
      });
      return () => h('div');
    },
  });
  app.mount(host);
  return { api: api!, wrapper: { unmount: () => app.unmount() }, container };
}

/** 走完一次「从顶部下拉到超过阈值」的完整手势。 */
function pullDown(api: ReturnType<typeof useAndroidPullRefresh>, distance: number) {
  api.onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
  // 先跨过方向锁,再拉到目标距离
  api.onTouchMove(touchEvent('touchmove', [{ clientX: 100, clientY: 120 }]));
  api.onTouchMove(touchEvent('touchmove', [{ clientX: 100, clientY: 100 + distance }]));
}

beforeEach(() => {
  isLightNoteAndroidApp.mockReturnValue(true);
  hasOpenMobileOverlay.mockReturnValue(false);
  messageError.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAndroidPullRefresh 手势判定', () => {
  it('从顶部纵向下拉超过阈值后松手触发一次刷新', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    pullDown(api, 200);
    expect(api.ready.value).toBe(true);
    expect(api.visible.value).toBe(true);

    await api.onTouchEnd();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // 结束后指示器归位
    expect(api.refreshing.value).toBe(false);
    expect(api.pullDistance.value).toBe(0);
    wrapper.unmount();
  });

  it('下拉未达阈值时回弹且不请求', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    // 72 阈值对应约 150px 手指位移(阻尼 0.48),这里只拉 40px
    pullDown(api, 40);
    expect(api.ready.value).toBe(false);

    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api.pullDistance.value).toBe(0);
    wrapper.unmount();
  });

  it('阻尼与上限与「今日」原手感一致', () => {
    const { api, wrapper } = setup({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    pullDown(api, 100);
    // 100 * 0.48
    expect(api.pullDistance.value).toBeCloseTo(48, 5);

    pullDown(api, 1000);
    // 封顶 96,再拉也不继续下移
    expect(api.pullDistance.value).toBe(96);
    wrapper.unmount();
  });

  it('横向手势不触发下拉，让位给左滑与横向筛选', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    api.onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    // 横向位移大于纵向
    api.onTouchMove(touchEvent('touchmove', [{ clientX: 40, clientY: 110 }]));
    api.onTouchMove(touchEvent('touchmove', [{ clientX: 40, clientY: 300 }]));

    expect(api.pullDistance.value).toBe(0);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('上滑不触发下拉', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    api.onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    api.onTouchMove(touchEvent('touchmove', [{ clientX: 100, clientY: 60 }]));

    expect(api.pullDistance.value).toBe(0);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('只有确认纵向下拉后才 preventDefault', () => {
    const { api, wrapper } = setup({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    api.onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));

    // 方向锁尚未跨过:不能拦默认行为,否则系统返回手势和横滑都会坏
    const undecided = touchEvent('touchmove', [{ clientX: 102, clientY: 103 }]);
    const undecidedSpy = vi.spyOn(undecided, 'preventDefault');
    api.onTouchMove(undecided);
    expect(undecidedSpy).not.toHaveBeenCalled();

    const pulling = touchEvent('touchmove', [{ clientX: 100, clientY: 200 }]);
    const pullingSpy = vi.spyOn(pulling, 'preventDefault');
    api.onTouchMove(pulling);
    expect(pullingSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('容器不在顶部时不进入手势', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const container = createContainer(120);
    const { api, wrapper } = setup({ onRefresh, getScrollContainer: () => container });

    pullDown(api, 300);
    expect(api.pullDistance.value).toBe(0);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('手势中途容器滚动起来则放弃本次下拉', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const container = createContainer(0);
    const { api, wrapper } = setup({ onRefresh, getScrollContainer: () => container });

    api.onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    (container as unknown as { scrollTop: number }).scrollTop = 50;
    api.onTouchMove(touchEvent('touchmove', [{ clientX: 100, clientY: 300 }]));

    expect(api.pullDistance.value).toBe(0);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('多指触摸不触发，过程中变多指则中止', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    // 起手就是双指
    api.onTouchStart(
      touchEvent('touchstart', [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ]),
    );
    api.onTouchMove(touchEvent('touchmove', [{ clientX: 100, clientY: 300 }]));
    expect(api.pullDistance.value).toBe(0);

    // 单指起手后中途加一根手指
    api.onTouchStart(touchEvent('touchstart', [{ clientX: 100, clientY: 100 }]));
    api.onTouchMove(touchEvent('touchmove', [{ clientX: 100, clientY: 200 }]));
    expect(api.pullDistance.value).toBeGreaterThan(0);
    api.onTouchMove(
      touchEvent('touchmove', [
        { clientX: 100, clientY: 260 },
        { clientX: 200, clientY: 260 },
      ]),
    );
    expect(api.pullDistance.value).toBe(0);

    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('useAndroidPullRefresh 禁用条件', () => {
  it('非 Android App 不启用', async () => {
    isLightNoteAndroidApp.mockReturnValue(false);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('浮层打开时不响应手势', async () => {
    hasOpenMobileOverlay.mockReturnValue(true);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { api, wrapper } = setup({ onRefresh });

    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('页面 enabled 为 false 或 externalBusy 时不响应', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const enabled = ref(false);
    const busy = ref(false);
    const { api, wrapper } = setup({ onRefresh, enabled, externalBusy: busy });

    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();

    enabled.value = true;
    busy.value = true;
    await nextTick();
    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();

    busy.value = false;
    await nextTick();
    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('canStart 返回 false 时不响应（左滑展开、上传中等页面级状态）', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    let allowed = false;
    const { api, wrapper } = setup({ onRefresh, canStart: () => allowed });

    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).not.toHaveBeenCalled();

    allowed = true;
    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('刷新进行中再次下拉不会重复发请求', async () => {
    let release!: () => void;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { api, wrapper } = setup({ onRefresh });

    pullDown(api, 300);
    const first = api.onTouchEnd();
    expect(api.refreshing.value).toBe(true);

    // 请求还没回来时又拉一次
    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(api.refreshing.value).toBe(false);
    wrapper.unmount();
  });
});

describe('useAndroidPullRefresh 失败与清理', () => {
  it('刷新失败时收起指示器并提示，不影响后续再次刷新', async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error('network'));
    const { api, wrapper } = setup({ onRefresh });

    pullDown(api, 300);
    await api.onTouchEnd();

    expect(messageError).toHaveBeenCalledWith('common.refreshFailed');
    expect(api.refreshing.value).toBe(false);
    expect(api.pullDistance.value).toBe(0);

    onRefresh.mockResolvedValueOnce(undefined);
    pullDown(api, 300);
    await api.onTouchEnd();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('提供 onError 时交给页面自行处理（如「部分数据刷新失败」）', async () => {
    const onError = vi.fn();
    const onRefresh = vi.fn().mockRejectedValue(new Error('partial'));
    const { api, wrapper } = setup({ onRefresh, onError });

    pullDown(api, 300);
    await api.onTouchEnd();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(messageError).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('reset 清空手势与刷新状态', () => {
    const { api, wrapper } = setup({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    pullDown(api, 300);
    expect(api.pullDistance.value).toBeGreaterThan(0);

    api.reset();
    expect(api.pullDistance.value).toBe(0);
    expect(api.refreshing.value).toBe(false);
    wrapper.unmount();
  });

  it('touchcancel 收起下拉', () => {
    const { api, wrapper } = setup({ onRefresh: vi.fn().mockResolvedValue(undefined) });

    pullDown(api, 300);
    api.onTouchCancel();
    expect(api.pullDistance.value).toBe(0);
    wrapper.unmount();
  });
});
