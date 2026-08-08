import { describe, expect, it } from 'vitest';
import { wrapAndroidColorMixFallbacks } from './androidColorMixFallback';

describe('wrapAndroidColorMixFallbacks', () => {
  it('keeps the browser color-mix while giving Android a soft primary background', () => {
    const value = 'color-mix(in srgb, var(--primary-color) 20%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'background-color')).toBe(
      `var(--ln-android-color-mix-primary-soft-background, ${value})`,
    );
  });

  it.each([
    ['bookmark', 'var(--resource-bookmark-color)'],
    ['note', 'var(--resource-note-color)'],
    ['file', 'var(--resource-file-color)'],
    ['tag', 'var(--resource-tag-color)'],
  ])('uses the %s soft background for resource pills', (category, color) => {
    const value = `color-mix(in srgb, ${color} 14%, transparent)`;

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(
      `var(--ln-android-color-mix-${category}-soft-background, ${value})`,
    );
  });

  it('treats muted background aliases as backgrounds instead of muted text colors', () => {
    const value = 'color-mix(in srgb, var(--resource-tag-color) 9%, var(--mobile-tag-muted-bg))';

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(
      `var(--ln-android-color-mix-tag-soft-background, ${value})`,
    );
  });

  it('keeps a semantic tint when it is mixed into a solid surface', () => {
    const todo = 'color-mix(in srgb, var(--todo-accent-color) 10%, var(--card-background))';
    const primary = 'color-mix(in srgb, var(--primary-color) 8%, var(--background-color))';

    expect(wrapAndroidColorMixFallbacks(todo, 'background')).toBe(
      `var(--ln-android-color-mix-todo-soft-background, ${todo})`,
    );
    expect(wrapAndroidColorMixFallbacks(primary, 'background-color')).toBe(
      `var(--ln-android-color-mix-primary-soft-background, ${primary})`,
    );
  });

  it('keeps non-semantic low-opacity backgrounds transparent in Android', () => {
    const value = 'color-mix(in srgb, var(--text-color) 4%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(
      `var(--ln-android-color-mix-transparent, ${value})`,
    );
  });

  /*
   * 中性弱底色曾经一律回退成透明,导致分段控件的灰槽、统计块的浅底在 APK 里整片消失
   * (Web 正常)。20% 是分界:再弱的底纹保持透明,够强的换成稳定 RGBA。
   */
  it('keeps mid-weight neutral backgrounds visible in Android', () => {
    const value = 'color-mix(in srgb, var(--card-border-color) 42%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(
      `var(--ln-android-color-mix-border-soft-background, ${value})`,
    );
  });

  it('still drops the faintest neutral backgrounds to transparent', () => {
    const value = 'color-mix(in srgb, var(--card-border-color) 14%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(
      `var(--ln-android-color-mix-transparent, ${value})`,
    );
  });

  it('keeps mid-weight muted backgrounds visible in Android', () => {
    const value = 'color-mix(in srgb, var(--desc-color) 30%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'background')).toBe(
      `var(--ln-android-color-mix-muted-soft-background, ${value})`,
    );
  });

  it('uses the semantic border fallback for borders', () => {
    const value = 'color-mix(in srgb, var(--card-border-color) 70%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'border-color')).toBe(`var(--ln-android-color-mix-border, ${value})`);
  });

  /**
   * `--surface-border-color` 的名字里同时含 "surface"，按变量名会被归成 background。
   * 若真按 background 回退，Android WebView 上边框会与底色同色、整条边消失
   * （待办日历「今天」的高亮就只剩一个小圆点）。边框声明必须回退到边框色。
   */
  it('边框声明不会回退成背景色，即使混色操作数是 surface / background 变量', () => {
    const surfaceBorder =
      'color-mix(in srgb, var(--primary-color) 36%, var(--surface-border-color, var(--card-border-color)))';
    const pageBackground = 'color-mix(in srgb, var(--primary-color) 30%, var(--background-color))';

    expect(wrapAndroidColorMixFallbacks(surfaceBorder, 'border-color')).toBe(
      `var(--ln-android-color-mix-border, ${surfaceBorder})`,
    );
    expect(wrapAndroidColorMixFallbacks(pageBackground, 'border-color')).toBe(
      `var(--ln-android-color-mix-border, ${pageBackground})`,
    );
    // 同一个表达式用在背景声明上应保留淡主色，不再退化成纯页面底色
    expect(wrapAndroidColorMixFallbacks(pageBackground, 'background')).toBe(
      `var(--ln-android-color-mix-primary-soft-background, ${pageBackground})`,
    );
  });

  /** 阴影里的混色一律回退成 transparent（阴影直接消失），因此层级不能只靠混色阴影表达。 */
  it('阴影中的混色回退为透明', () => {
    const value = '0 2px 8px color-mix(in srgb, var(--primary-color) 20%, transparent)';

    expect(wrapAndroidColorMixFallbacks(value, 'box-shadow')).toBe(
      '0 2px 8px var(--ln-android-color-mix-transparent, color-mix(in srgb, var(--primary-color) 20%, transparent))',
    );
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
