import { describe, expect, it } from 'vitest';
import { standardDensitySource } from './standardDensitySource';

describe('standard density source contracts', () => {
  it('resolves the actual standard value in styles and template props', () => {
    expect(standardDensitySource('height="var(--ui-control-34, 34px)"; gap:var(--ui-space-12, 12px)'))
      .toBe('height="34px"; gap:12px');
  });
  it('rejects missing tokens or a fallback that masks a different standard value', () => {
    expect(() => standardDensitySource('var(--ui-layout-9999, 9999px)')).toThrow();
    expect(() => standardDensitySource('var(--ui-space-12, 14px)')).toThrow();
  });
  it('does not alter unrelated CSS or layout expressions', () => {
    const source = 'border-radius:8px; color:var(--text-color); width:dimension(48, "icon")';
    expect(standardDensitySource(source)).toBe(source);
  });
});
