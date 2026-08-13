import { describe, expect, it, vi } from 'vitest';
import {
  findVerticalScrollContainer,
  getRootZoom,
  normalizeRectForRootZoom,
  parseCssZoom,
  scrollIntoContainer,
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
