import { describe, expect, it } from 'vitest';
import { resolveChipScrollLeft } from './horizontalChipScroll';

describe('horizontalChipScroll', () => {
  const base = { maxScroll: 300, viewportWidth: 360 };

  it('中间条目滚动到容器居中', () => {
    expect(
      resolveChipScrollLeft({ ...base, targetOffsetLeft: 400, targetWidth: 80 }),
    ).toBe(400 - (360 - 80) / 2);
  });

  it('首条目夹取到 0,不出现负滚动', () => {
    expect(resolveChipScrollLeft({ ...base, targetOffsetLeft: 0, targetWidth: 90 })).toBe(0);
  });

  it('尾条目夹取到最大滚动距离', () => {
    expect(resolveChipScrollLeft({ ...base, targetOffsetLeft: 620, targetWidth: 70 })).toBe(300);
  });

  it('内容不足一屏时保持在起点', () => {
    expect(resolveChipScrollLeft({ maxScroll: -20, viewportWidth: 360, targetOffsetLeft: 120, targetWidth: 60 })).toBe(
      0,
    );
  });
});
