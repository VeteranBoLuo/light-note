import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOBILE_OVERLAY_HISTORY_STATE_KEY,
  registerMobileOverlayHistory,
  releaseMobileOverlayHistory,
  requestMobileOverlayHistoryClose,
  resetMobileOverlayHistoryForTests,
  waitForCurrentMobileOverlayHistoryRelease,
} from './mobileOverlayHistory';

describe('mobileOverlayHistory', () => {
  beforeEach(() => {
    resetMobileOverlayHistoryForTests();
    window.history.replaceState({}, '', '/');
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    resetMobileOverlayHistoryForTests();
    vi.restoreAllMocks();
  });

  it('按返回时只关闭最上层浮层', () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const first = registerMobileOverlayHistory(closeFirst)!;
    const firstState = { ...window.history.state };
    registerMobileOverlayHistory(closeSecond);

    window.dispatchEvent(new PopStateEvent('popstate', { state: firstState }));

    expect(closeSecond).toHaveBeenCalledOnce();
    expect(closeFirst).not.toHaveBeenCalled();
    expect(firstState[MOBILE_OVERLAY_HISTORY_STATE_KEY]).toBe(first.id);
  });

  it('主动关闭先消费占位，再通过同一个回调关闭界面', () => {
    const close = vi.fn();
    const handle = registerMobileOverlayHistory(close)!;

    expect(requestMobileOverlayHistoryClose(handle)).toBe(true);
    expect(window.history.back).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('外部状态关闭只清理历史占位，不重复触发关闭逻辑', () => {
    const close = vi.fn();
    const handle = registerMobileOverlayHistory(close)!;

    releaseMobileOverlayHistory(handle);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

    expect(window.history.back).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it('外部关闭浮层后才允许继续执行路由跳转', async () => {
    const handle = registerMobileOverlayHistory(vi.fn())!;
    const navigate = vi.fn();
    const released = waitForCurrentMobileOverlayHistoryRelease().then(navigate);

    releaseMobileOverlayHistory(handle);
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await released;
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('当前没有浮层占位时不阻塞后续操作', async () => {
    const navigate = vi.fn();

    await waitForCurrentMobileOverlayHistoryRelease();
    navigate();

    expect(navigate).toHaveBeenCalledOnce();
    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('弹出其他自管历史层并落回当前占位时，不误关底层浮层', () => {
    const close = vi.fn();
    const legacyOverlayClose = vi.fn();
    const handle = registerMobileOverlayHistory(close)!;
    const currentState = { ...window.history.state };
    window.addEventListener('popstate', legacyOverlayClose);

    window.dispatchEvent(new PopStateEvent('popstate', { state: currentState }));

    expect(currentState[MOBILE_OVERLAY_HISTORY_STATE_KEY]).toBe(handle.id);
    expect(close).not.toHaveBeenCalled();
    expect(legacyOverlayClose).toHaveBeenCalledOnce();
    window.removeEventListener('popstate', legacyOverlayClose);
  });

  it('关闭统一管理的顶层浮层时，不让旧监听器连带关闭下层浮层', () => {
    const legacyOverlayClose = vi.fn();
    window.addEventListener('popstate', legacyOverlayClose);
    registerMobileOverlayHistory(vi.fn());

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

    expect(legacyOverlayClose).not.toHaveBeenCalled();
    window.removeEventListener('popstate', legacyOverlayClose);
  });
});
