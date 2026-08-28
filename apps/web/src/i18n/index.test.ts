// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('i18n 文档语言同步', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.lang = 'zh-CN';
  });

  it('首次加载英文偏好时同步 i18n 与 html lang', async () => {
    localStorage.setItem('preferences', JSON.stringify({ lang: 'en-US' }));

    const { default: i18n, prepareInitialLocale } = await import('@/i18n');
    await prepareInitialLocale();

    expect(i18n.global.locale.value).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('运行时切换语言时同步 html lang', async () => {
    const { setLocale } = await import('@/i18n');

    await setLocale('en-US');
    expect(document.documentElement.lang).toBe('en-US');

    await setLocale('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
