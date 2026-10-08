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

  it('服务器词典在进入模块时加载，之后切换语言仍保留基础词典与回退', async () => {
    localStorage.setItem('preferences', JSON.stringify({ lang: 'zh-CN' }));
    const { default: i18n, prepareServerManagementLocale, setLocale } = await import('@/i18n');
    expect(i18n.global.getLocaleMessage('zh-CN')).not.toHaveProperty('serverManagement');
    await Promise.all([prepareServerManagementLocale(), prepareServerManagementLocale()]);
    const zh = (await import('./locales/zh-CN')).default;
    expect(i18n.global.getLocaleMessage('zh-CN')).toEqual(zh);
    await setLocale('en-US');
    expect(i18n.global.getLocaleMessage('en-US')).toEqual((await import('./locales/en-US')).default);
    expect(i18n.global.getLocaleMessage('zh-CN')).toEqual(zh);
  });

  it('英文直接进入服务器模块与首次语言准备并行时不丢失基础或模块文案', async () => {
    localStorage.setItem('preferences', JSON.stringify({ lang: 'en-US' }));
    const { default: i18n, prepareServerManagementLocale, prepareInitialLocale } = await import('@/i18n');
    await Promise.all([prepareServerManagementLocale(), prepareInitialLocale()]);
    expect(i18n.global.getLocaleMessage('en-US')).toEqual((await import('./locales/en-US')).default);
    expect(i18n.global.getLocaleMessage('zh-CN')).toEqual((await import('./locales/zh-CN')).default);
  });
});
