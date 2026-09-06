import { beforeEach, describe, expect, it } from 'vitest';
import { applyDocumentTheme, normalizeResolvedTheme, shouldFreezeAnimationsForThemeSync } from '@/utils/theme';

describe('document theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    document.head.innerHTML = `
      <meta name="color-scheme" content="only light" />
      <meta name="theme-color" content="#ffffff" />
    `;
  });

  it('浅色主题禁止浏览器自动暗化', () => {
    expect(applyDocumentTheme('day')).toBe('day');
    expect(document.documentElement.dataset.theme).toBe('day');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('only light');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('only light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#ffffff');
  });

  it('深色主题同步浏览器原生配色', () => {
    expect(applyDocumentTheme('night')).toBe('night');
    expect(document.documentElement.dataset.theme).toBe('night');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#222222');
  });

  it('异常主题值安全回退到浅色', () => {
    expect(normalizeResolvedTheme('unexpected')).toBe('day');
    applyDocumentTheme('unexpected');
    expect(document.documentElement.dataset.theme).toBe('day');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('only light');
  });

  it('官网预渲染首屏同步主题时不重置持续动画', () => {
    expect(shouldFreezeAnimationsForThemeSync('landing')).toBe(false);
    expect(shouldFreezeAnimationsForThemeSync('workbench')).toBe(true);
    expect(shouldFreezeAnimationsForThemeSync(undefined)).toBe(true);
  });
});
