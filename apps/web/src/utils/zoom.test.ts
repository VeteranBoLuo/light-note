import { describe, expect, it } from 'vitest';
import { normalizeRectForRootZoom } from './zoom';

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
