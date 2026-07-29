import { describe, expect, it } from 'vitest';
import { wrapAndroidColorMixFallbacks } from './androidColorMixFallback';

describe('wrapAndroidColorMixFallbacks', () => {
  it('uses a transparent fallback for low-opacity backgrounds', () => {
    const value = 'color-mix(in srgb, var(--primary-color) 20%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'background-color')).toBe(
      `var(--ln-android-color-mix-transparent, ${value})`,
    );
  });

  it('uses the semantic border fallback for borders', () => {
    const value = 'color-mix(in srgb, var(--card-border-color) 70%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'border-color')).toBe(`var(--ln-android-color-mix-border, ${value})`);
  });

  it('treats neutral primary button backgrounds as backgrounds', () => {
    const base = 'color-mix(in srgb, var(--primary-btn-bg-color) 72%, transparent)';
    const hover = 'color-mix(in srgb, var(--primary-btn-h-bg-color) 82%, transparent)';

    expect(wrapAndroidColorMixFallbacks(base, '--auth-input-bg')).toBe(
      `var(--ln-android-color-mix-background, ${base})`,
    );
    expect(wrapAndroidColorMixFallbacks(hover, '--auth-input-hover')).toBe(
      `var(--ln-android-color-mix-background, ${hover})`,
    );
  });

  it('wraps every color-mix occurrence without breaking nested functions', () => {
    const first = 'color-mix(in srgb, var(--primary-color), transparent 30%)';
    const second = 'color-mix(in srgb, var(--danger-color) 80%, transparent)';
    const value = `linear-gradient(${first}, ${second})`;

    expect(wrapAndroidColorMixFallbacks(value, 'background-image')).toBe(
      'linear-gradient(' +
        `var(--ln-android-color-mix-primary, ${first}), ` +
        `var(--ln-android-color-mix-danger, ${second})` +
        ')',
    );
  });

  it('leaves values without color-mix unchanged', () => {
    const value = 'var(--card-background)';

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(value);
  });

  it('does not wrap an existing Android compatibility fallback twice', () => {
    const value = 'var(--ln-android-color-mix-primary, color-mix(in srgb, var(--primary-color), transparent))';

    expect(wrapAndroidColorMixFallbacks(value, 'color')).toBe(value);
  });
});
