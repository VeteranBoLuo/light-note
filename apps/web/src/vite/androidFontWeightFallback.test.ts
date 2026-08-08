import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import androidFontWeightFallback, { wrapAndroidFontWeightFallback } from './androidFontWeightFallback';

describe('wrapAndroidFontWeightFallback', () => {
  it.each([
    ['400', 'regular'],
    ['450', 'regular'],
    ['500', 'medium'],
    ['550', 'medium'],
    ['600', 'medium'],
    ['650', 'medium'],
    ['700', 'bold'],
    ['750', 'bold'],
    ['900', 'bold'],
  ])('wraps numeric weight %s with the %s Android fallback', (weight, kind) => {
    expect(wrapAndroidFontWeightFallback(weight, 'font-weight')).toBe(
      `var(--ln-android-font-weight-${kind}, ${weight})`,
    );
  });

  it.each(['normal', 'bold', 'inherit', 'var(--title-weight)', 'calc(400 + 100)'])(
    'leaves non-numeric weight %s unchanged',
    (weight) => {
      expect(wrapAndroidFontWeightFallback(weight, 'font-weight')).toBe(weight);
    },
  );

  it('does not modify unrelated declarations or wrap an existing fallback twice', () => {
    expect(wrapAndroidFontWeightFallback('600', 'font-size')).toBe('600');
    const wrapped = 'var(--ln-android-font-weight-medium, 600)';
    expect(wrapAndroidFontWeightFallback(wrapped, 'font-weight')).toBe(wrapped);
  });

  it('keeps font-face descriptors intact while wrapping ordinary rules', async () => {
    const result = await postcss([androidFontWeightFallback()]).process(
      '@font-face { font-family: Demo; font-weight: 400 700; } .label { font-weight: 650; }',
      { from: undefined },
    );

    expect(result.css).toContain('font-weight: 400 700');
    expect(result.css).toContain('font-weight: var(--ln-android-font-weight-medium, 650)');
  });
});
