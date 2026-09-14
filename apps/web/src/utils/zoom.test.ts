import { describe, expect, it, vi } from 'vitest';
import {
  findVerticalScrollContainer,
  getRootZoom,
  normalizeRectForRootZoom,
  normalizeMouseEventOffsetsForRootZoom,
  parseCssZoom,
  scrollCenterIntoContainer,
  scrollIntoContainer,
  scrollNearestIntoContainer,
} from './zoom';

describe('parseCssZoom', () => {
  it.each([
    ['1', 1],
    ['0.9', 0.9],
    ['100%', 1],
    ['90%', 0.9],
    ['110%', 1.1],
  ])('把 %s 解析为 %s 倍', (value, expected) => {
    expect(parseCssZoom(value)).toBe(expected);
  });

  it.each([undefined, null, '', 'normal', 'invalid', '0', '-1'])('非法或默认值 %s 回退为 1', (value) => {
    expect(parseCssZoom(value)).toBe(1);
  });
});

describe('normalizeRectForRootZoom', () => {
  const rect = { top: 288, right: 225, bottom: 333, left: 18, width: 207, height: 45 };

  it('把缩放后的视觉坐标还原为 fixed 定位使用的布局坐标', () => {
    expect(normalizeRectForRootZoom(rect, 0.9)).toEqual({
      top: 320,
      right: 250,
      bottom: 370,
      left: 20,
      width: 230,
      height: 50,
    });
  });

  it('非法缩放值回退为 1', () => {
    expect(normalizeRectForRootZoom(rect, 0)).toEqual(rect);
  });
});

describe('getRootZoom', () => {
  it('没有显式界面缩放时固定返回 1，不读取厂商 WebView 的计算样式', () => {
    document.documentElement.style.zoom = '';
    expect(getRootZoom()).toBe(1);
  });

  it('读取轻笺显式设置在 html 上的界面缩放', () => {
    document.documentElement.style.zoom = '1.1';
    expect(getRootZoom()).toBe(1.1);
    document.documentElement.style.zoom = '';
  });
});

describe('scrollIntoContainer', () => {
  it('默认平滑滚动，也允许聊天消息导航选择一次到位', () => {
    const container = document.createElement('div');
    const target = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperties(container, {
      scrollTop: { configurable: true, writable: true, value: 120 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect);

    scrollIntoContainer(container, target, 40);
    scrollIntoContainer(container, target, 40, 'auto');

    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 280, behavior: 'smooth' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 280, behavior: 'auto' });
  });
});

describe('scrollCenterIntoContainer', () => {
  it('把目标中心对齐到容器中心，并限制在合法滚动范围内', () => {
    const container = document.createElement('div');
    const target = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperties(container, {
      scrollTop: { configurable: true, writable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 300 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 300 } as DOMRect);
    const targetRect = vi.spyOn(target, 'getBoundingClientRect');

    targetRect.mockReturnValue({ top: 400, height: 200 } as DOMRect);
    scrollCenterIntoContainer(container, target);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 350, behavior: 'auto' });

    targetRect.mockReturnValue({ top: 1200, height: 300 } as DOMRect);
    scrollCenterIntoContainer(container, target, 'smooth');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 700, behavior: 'smooth' });
  });
});

describe('scrollNearestIntoContainer', () => {
  it('目标不可见时只滚动指定容器到最近边缘，已经可见时不滚动', () => {
    const container = document.createElement('div');
    const target = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperties(container, {
      scrollTop: { configurable: true, writable: true, value: 100 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300 } as DOMRect);
    const targetRect = vi.spyOn(target, 'getBoundingClientRect');

    targetRect.mockReturnValue({ top: 260, bottom: 340 } as DOMRect);
    scrollNearestIntoContainer(container, target);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 140, behavior: 'auto' });

    targetRect.mockReturnValue({ top: 60, bottom: 90 } as DOMRect);
    scrollNearestIntoContainer(container, target);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 60, behavior: 'auto' });

    targetRect.mockReturnValue({ top: 120, bottom: 180 } as DOMRect);
    scrollNearestIntoContainer(container, target);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});

describe('findVerticalScrollContainer', () => {
  function setScrollMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number) {
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, value: scrollHeight },
      clientHeight: { configurable: true, value: clientHeight },
    });
  }

  it('桌面端优先使用最近的实际滚动内容区', () => {
    const page = document.createElement('div');
    const table = document.createElement('div');
    const target = document.createElement('div');
    page.style.overflowY = 'hidden';
    table.style.overflowY = 'auto';
    setScrollMetrics(page, 900, 900);
    setScrollMetrics(table, 1600, 500);
    page.appendChild(table);
    table.appendChild(target);
    document.body.appendChild(page);

    expect(findVerticalScrollContainer(target, table)).toBe(table);
    page.remove();
  });

  it('移动端内容区展开后跳过它，选择真正滚动的页面外壳', () => {
    const page = document.createElement('div');
    const table = document.createElement('div');
    const target = document.createElement('div');
    page.style.overflowY = 'auto';
    table.style.overflowY = 'visible';
    setScrollMetrics(page, 4600, 840);
    setScrollMetrics(table, 4500, 4500);
    page.appendChild(table);
    table.appendChild(target);
    document.body.appendChild(page);

    expect(findVerticalScrollContainer(target, table)).toBe(page);
    page.remove();
  });
});

describe('normalizeMouseEventOffsetsForRootZoom', () => {
  it.each([0.9, 1.1])('以 %s 缩放适配当前事件，并让冒泡阶段的拖选读取相同坐标', (zoom) => {
    const target = document.createElement('div');
    document.body.append(target);
    document.documentElement.style.zoom = String(zoom);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 40 * zoom, top: 60 * zoom } as DOMRect);
    Object.defineProperties(target, { clientLeft: { value: 2 }, clientTop: { value: 3 } });
    const receive = vi.fn((event: MouseEvent) => [event.offsetX, event.offsetY]);
    target.addEventListener('mousemove', normalizeMouseEventOffsetsForRootZoom, true);
    window.addEventListener('mousemove', receive);
    try {
      const event = new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 742 * zoom,
        clientY: 313 * zoom,
      });
      // 即使浏览器已换算 offset，也必须得到相同结果，不能再次除以 zoom。
      Object.defineProperty(event, 'offsetX', { configurable: true, value: 700 });
      target.dispatchEvent(event);
      expect(receive.mock.results[0].value[0]).toBeCloseTo(700);
      expect(receive.mock.results[0].value[1]).toBeCloseTo(250);
      expect(event.clientX).toBe(742 * zoom);
      expect(event.clientY).toBe(313 * zoom);
      normalizeMouseEventOffsetsForRootZoom(event);
      expect(event.offsetX).toBeCloseTo(700);
    } finally {
      window.removeEventListener('mousemove', receive);
      target.remove();
      document.documentElement.style.zoom = '';
      vi.restoreAllMocks();
    }
  });

  it('标准缩放和没有元素目标的事件保持原样', () => {
    const event = new MouseEvent('mousedown', { clientX: 123, clientY: 45 });
    normalizeMouseEventOffsetsForRootZoom(event);
    expect(Object.hasOwn(event, 'offsetX')).toBe(false);
    document.documentElement.style.zoom = '0.9';
    try {
      normalizeMouseEventOffsetsForRootZoom(event);
      expect(Object.hasOwn(event, 'offsetX')).toBe(false);
    } finally {
      document.documentElement.style.zoom = '';
    }
  });
});
