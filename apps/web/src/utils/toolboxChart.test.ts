import { describe, expect, it } from 'vitest';
import { buildToolboxChart } from './toolboxChart';

describe('shared chart image', () => {
  it('includes twenty rows and escapes dataset labels', () => {
    const svg = buildToolboxChart(
      Array.from({ length: 22 }, (_, i) => ({ label: `row-${i}`, value: i })),
      'horizontal',
      '<script>',
    );
    expect(svg).toContain('row-19');
    expect(svg).not.toContain('row-20');
    expect(svg).toContain('&lt;script&gt;');
  });
  it('uses signed positions and zero-length bars in both orientations', () => {
    const points = [
      { label: 'negative', value: -10 },
      { label: 'zero', value: 0 },
      { label: 'positive', value: 10 },
    ];
    const horizontal = buildToolboxChart(points, 'horizontal', 'test');
    const vertical = buildToolboxChart(points, 'vertical', 'test');
    expect(horizontal).toContain('width="0"');
    expect(vertical).toContain('height="0"');
    expect(horizontal).not.toContain('NaN');
    expect(horizontal).not.toBe(vertical);
    expect(horizontal).toContain('negative: -10');
  });
  it('omits invalid values instead of presenting them as zero', () => {
    const svg = buildToolboxChart(
      [
        { label: 'invalid', value: NaN },
        { label: 'infinite', value: Infinity },
        { label: 'real-zero', value: 0 },
      ],
      'vertical',
      'Empty values',
    );
    expect(svg).not.toContain('invalid');
    expect(svg).not.toContain('infinite');
    expect(svg).toContain('real-zero: 0');
    expect(svg).not.toContain('NaN');
    expect(buildToolboxChart([], 'horizontal', 'Empty')).not.toContain('NaN');
  });
});
