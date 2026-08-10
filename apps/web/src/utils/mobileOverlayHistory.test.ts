import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeCurrentMobileOverlayThen,
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

  it('统一入口会先关闭并释放浮层，再执行后续导航', async () => {
    const handle = registerMobileOverlayHistory(vi.fn())!;
    const close = vi.fn(() => releaseMobileOverlayHistory(handle));
    const navigate = vi.fn();
    const task = closeCurrentMobileOverlayThen(close, navigate);

    expect(close).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await task;
    expect(navigate).toHaveBeenCalledOnce();
  });

  /**
   * 浮层 → 浮层的交接：快速添加抽屉里点「完善详情」，要关掉外壳并打开待办详情抽屉。
   *
   * 若在同一事件轮里关外壳、开详情，外壳释放占位调用的 `history.back()` 是异步的、
   * 详情压栈是同步的，back() 最终弹掉的是详情刚压入的那一格，详情抽屉一打开就被关掉。
   * 交接必须走 closeCurrentMobileOverlayThen，等外壳占位真正出栈再注册下一层。
   */
  it('浮层交接时先等上层占位出栈，再注册新浮层，新浮层不会被上一次返回弹掉', async () => {
    const shellBack = vi.fn();
    const shell = registerMobileOverlayHistory(shellBack)!;
    const drawerBack = vi.fn();
    let drawer: ReturnType<typeof registerMobileOverlayHistory> = null;

    const task = closeCurrentMobileOverlayThen(
      () => releaseMobileOverlayHistory(shell),
      () => {
        drawer = registerMobileOverlayHistory(drawerBack);
      },
    );

    // 外壳占位尚未出栈前，新浮层不能抢先注册
    expect(drawer).toBeNull();

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await task;

    expect(drawer).not.toBeNull();
    // 外壳的释放不触发它自己的关闭回调，新浮层也没有被连带关闭
    expect(shellBack).not.toHaveBeenCalled();
    expect(drawerBack).not.toHaveBeenCalled();

    // 新浮层此时是唯一占位：按一次返回只关它
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { [MOBILE_OVERLAY_HISTORY_STATE_KEY]: undefined } }),
    );
    expect(drawerBack).toHaveBeenCalledOnce();
    expect(shellBack).not.toHaveBeenCalled();
  });

  it('业务层未显式等待时也会统一排队浮层交接，旧 back 不会弹掉新浮层', () => {
    const shellBack = vi.fn();
    const shell = registerMobileOverlayHistory(shellBack)!;
    const drawerBack = vi.fn();

    releaseMobileOverlayHistory(shell);
    const drawer = registerMobileOverlayHistory(drawerBack)!;

    // 旧浮层仍在等待 popstate，新浮层只登记、尚未抢先 pushState。
    expect(window.history.state[MOBILE_OVERLAY_HISTORY_STATE_KEY]).toBe(shell.id);

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

    // 旧占位完成释放后，协调器才为新浮层压入自己的占位。
    expect(window.history.state[MOBILE_OVERLAY_HISTORY_STATE_KEY]).toBe(drawer.id);
    expect(shellBack).not.toHaveBeenCalled();
    expect(drawerBack).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    expect(drawerBack).toHaveBeenCalledOnce();
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
