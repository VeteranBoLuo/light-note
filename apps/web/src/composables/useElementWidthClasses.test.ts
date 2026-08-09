import { describe, expect, it } from 'vitest';
import { resolveElementWidthClasses } from './useElementWidthClasses';

const rules = [
  { className: 'is-narrow-840', maxWidth: 840 },
  { className: 'is-narrow-680', maxWidth: 680 },
] as const;

describe('resolveElementWidthClasses', () => {
  it('按真实容器宽度返回可叠加的窄容器类', () => {
    expect(resolveElementWidthClasses(900, rules)).toEqual([]);
    expect(resolveElementWidthClasses(800, rules)).toEqual(['is-narrow-840']);
    expect(resolveElementWidthClasses(620, rules)).toEqual(['is-narrow-840', 'is-narrow-680']);
  });

  it('忽略未布局和非法宽度，避免隐藏容器被误判为窄屏', () => {
    expect(resolveElementWidthClasses(0, rules)).toEqual([]);
    expect(resolveElementWidthClasses(Number.NaN, rules)).toEqual([]);
  });
});
