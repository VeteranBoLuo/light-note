import { describe, expect, it } from 'vitest';
import { resolveGraphViewportSize } from './shared';

describe('标签知识图谱视口布局', () => {
  it('以移动容器真实宽度计算中心点，不套用桌面最小宽度', () => {
    expect(resolveGraphViewportSize(328, 470)).toMatchObject({
      width: 328,
      height: 470,
      centerX: 164,
      centerY: 235,
      narrow: true,
    });
  });

  it('容器尚未测量时才使用稳定回退尺寸', () => {
    expect(resolveGraphViewportSize(0, 0)).toMatchObject({
      width: 900,
      height: 420,
      centerX: 450,
      centerY: 210,
      narrow: false,
    });
    expect(resolveGraphViewportSize(0, 0, true).height).toBe(320);
  });
});
