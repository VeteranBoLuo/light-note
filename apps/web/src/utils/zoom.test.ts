import { describe, expect, it } from 'vitest';
import { getRootZoom, normalizeRectForRootZoom, parseCssZoom } from './zoom';

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
