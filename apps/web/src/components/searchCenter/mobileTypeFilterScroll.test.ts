import { describe, expect, it } from 'vitest';
import { resolveMobileTypeFilterScrollLeft } from './mobileTypeFilterScroll';

const metrics = {
  maxScroll: 180,
  viewportWidth: 300,
  activeOffsetLeft: 220,
  activeWidth: 80,
};

describe('resolveMobileTypeFilterScrollLeft', () => {
  it('选择全部或书签时回到最左侧', () => {
    expect(resolveMobileTypeFilterScrollLeft('all', metrics)).toBe(0);
    expect(resolveMobileTypeFilterScrollLeft('bookmark', metrics)).toBe(0);
  });

  it('选择文件或标签时滚动到最右侧', () => {
    expect(resolveMobileTypeFilterScrollLeft('file', metrics)).toBe(180);
    expect(resolveMobileTypeFilterScrollLeft('tag', metrics)).toBe(180);
  });

  it('选择笔记时尽量居中并限制在可滚动范围内', () => {
    expect(resolveMobileTypeFilterScrollLeft('note', metrics)).toBe(110);
    expect(
      resolveMobileTypeFilterScrollLeft('note', {
        ...metrics,
        activeOffsetLeft: 500,
      }),
    ).toBe(180);
  });
});
