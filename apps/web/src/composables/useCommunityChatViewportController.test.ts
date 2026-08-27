import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useCommunityChatViewportController } from './useCommunityChatViewportController';

interface ViewportFixture {
  element: HTMLElement;
  setClientHeight: (value: number) => void;
  setRect: (top: number, height: number) => void;
  setScrollHeight: (value: number) => void;
  setScrollTop: (value: number) => void;
  getScrollTop: () => number;
}

function createViewportFixture(): ViewportFixture {
  const element = document.createElement('div');
  let clientHeight = 400;
  let rectTop = 100;
  let rectHeight = 400;
  let scrollHeight = 1000;
  let scrollTop = 600;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => clientHeight },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
  });
  element.getBoundingClientRect = vi.fn(
    () =>
      ({
        x: 0,
        y: rectTop,
        top: rectTop,
        right: 800,
        bottom: rectTop + rectHeight,
        left: 0,
        width: 800,
        height: rectHeight,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  return {
    element,
    setClientHeight: (value) => {
      clientHeight = value;
    },
    setRect: (top, height) => {
      rectTop = top;
      rectHeight = height;
    },
    setScrollHeight: (value) => {
      scrollHeight = value;
    },
    setScrollTop: (value) => {
      scrollTop = value;
    },
    getScrollTop: () => scrollTop,
  };
}

function installResizeObserver() {
  let callback: ResizeObserverCallback | null = null;
  const observed: Element[] = [];
  class ViewportResizeObserver {
    constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
    }

    observe(target: Element) {
      observed.push(target);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ViewportResizeObserver);
  return {
    notify: () => callback?.([], {} as ResizeObserver),
    observed,
  };
}

async function flushAnimationFrame() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await Promise.resolve();
}

afterEach(() => {
  document.documentElement.style.zoom = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCommunityChatViewportController', () => {
  it('PC 与移动端共用容器尺寸观察，跟随最新时在输入区增高后保持真正底部', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    const contentElement = document.createElement('div');
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      contentElement: ref(contentElement),
      isLatestWindow: () => true,
    });
    controller.start();
    expect(resizeObserver.observed).toEqual([fixture.element, contentElement]);

    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    await flushAnimationFrame();

    expect(fixture.getScrollTop()).toBe(1000);
    fixture.setScrollHeight(1200);
    resizeObserver.notify();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(1200);
    expect(controller.getIntent()).toBe('follow-latest');
    controller.stop();
  });

  it('用户浏览历史后，输入区底边变化保持原 scrollTop', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => true,
    });
    controller.start();

    controller.handleUserScrollIntent();
    fixture.setScrollTop(260);
    controller.handleScroll();
    fixture.setClientHeight(320);
    fixture.setRect(100, 320);
    resizeObserver.notify();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(260);
    expect(controller.getIntent()).toBe('preserve-position');
    controller.stop();
  });

  it.each([
    ['0.9', 18],
    ['1', 20],
    ['1.1', 22],
  ])('根缩放为 %s 时，置顶栏顶部位移按布局像素补偿同一条历史消息', async (zoom, visualDelta) => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    document.documentElement.style.zoom = zoom;
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => true,
    });
    controller.start();
    controller.preservePosition();
    fixture.setScrollTop(260);
    controller.syncPosition();

    fixture.setClientHeight(380);
    fixture.setRect(100 + visualDelta, 380);
    resizeObserver.notify();
    await flushAnimationFrame();

    expect(fixture.getScrollTop()).toBe(280);
    controller.stop();
  });

  it('用户手势和消息导航会取消已经排队的自动贴底，过期帧不能覆盖更新意图', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => true,
    });
    controller.start();

    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    controller.handleUserScrollIntent();
    fixture.setScrollTop(240);
    controller.handleScroll();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(240);

    controller.followLatest();
    resizeObserver.notify();
    controller.preservePosition();
    fixture.setScrollTop(180);
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(180);
    controller.stop();
  });

  it('底部边界手势没有产生位移时，只压住同帧写入并在几何变化后继续跟随', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => true,
    });
    controller.start();

    controller.handleUserScrollIntent();
    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    await flushAnimationFrame();
    await flushAnimationFrame();

    expect(fixture.getScrollTop()).toBe(1000);
    expect(controller.getIntent()).toBe('follow-latest');
    controller.stop();
  });

  it('只有手动到达最新窗口的严格底部才恢复跟随，96px 附近不再误抢历史位置', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => true,
    });
    controller.start();
    controller.preservePosition();

    fixture.setScrollTop(550);
    controller.handleScroll();
    expect(controller.getIntent()).toBe('preserve-position');
    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(550);

    fixture.setClientHeight(400);
    fixture.setScrollTop(600);
    controller.handleScroll();
    expect(controller.getIntent()).toBe('follow-latest');
    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(1000);
    controller.stop();
  });

  it('输入区收起导致浏览器向上夹紧时只延续既有跟随，不把历史态误升级为跟随', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => true,
    });
    controller.start();

    // 模拟输入区收起：可用高度增大，浏览器先把原来的底部 scrollTop 向上夹到新最大值。
    fixture.setScrollTop(520);
    fixture.setScrollHeight(920);
    controller.handleScroll();
    expect(controller.getIntent()).toBe('follow-latest');

    // 后续再次增高输入区时，既有跟随资格仍会把视口写到最终底部。
    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(920);

    controller.preservePosition();
    controller.syncPosition();
    // 历史态因内容收缩被向上夹到列表末尾，不能被这次系统位移升级为跟随。
    fixture.setScrollHeight(900);
    fixture.setClientHeight(400);
    fixture.setRect(100, 400);
    fixture.setScrollTop(500);
    controller.handleScroll();
    expect(controller.getIntent()).toBe('preserve-position');
    controller.stop();
  });

  it('历史消息窗口即使滚到当前列表底部也不获得跟随最新资格', async () => {
    const resizeObserver = installResizeObserver();
    const fixture = createViewportFixture();
    let latestWindow = false;
    const controller = useCommunityChatViewportController({
      element: ref(fixture.element),
      isLatestWindow: () => latestWindow,
    });
    controller.start();
    controller.preservePosition();
    fixture.setScrollTop(600);
    controller.handleScroll();
    fixture.setClientHeight(300);
    fixture.setRect(100, 300);
    resizeObserver.notify();
    await flushAnimationFrame();
    expect(fixture.getScrollTop()).toBe(600);

    latestWindow = true;
    expect(controller.getIntent()).toBe('preserve-position');
    controller.stop();
  });
});
