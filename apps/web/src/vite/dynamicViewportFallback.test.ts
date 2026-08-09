import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import dynamicViewportFallback from './dynamicViewportFallback';

describe('dynamicViewportFallback', () => {
  it('给动态视口单位生成位于前面的 vh 回退', async () => {
    const result = await postcss([dynamicViewportFallback()]).process(
      '.drawer { height: min(76dvh, 640px); min-height: 100svh; }',
      { from: undefined },
    );

    expect(result.css).toContain('height: min(76vh, 640px); height: min(76dvh, 640px)');
    expect(result.css).toContain('min-height: 100vh; min-height: 100svh');
  });

  it('普通声明保持原样，已有紧邻回退不重复生成', async () => {
    const result = await postcss([dynamicViewportFallback()]).process(
      '.panel { height: 100vh; height: 100dvh; width: 320px; }',
      { from: undefined },
    );

    expect(result.css.match(/height: 100vh/g)).toHaveLength(1);
    expect(result.css).toContain('width: 320px');
  });
});
