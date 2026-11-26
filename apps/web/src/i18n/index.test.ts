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

  it('按路由加载服务器和后台词典，之后切换语言仍保留基础词典与回退', async () => {
    localStorage.setItem('preferences', JSON.stringify({ lang: 'zh-CN' }));
    const { default: i18n, prepareRouteLocale, setLocale } = await import('@/i18n');
    expect(i18n.global.getLocaleMessage('zh-CN')).not.toHaveProperty('serverManagement');
    expect(i18n.global.getLocaleMessage('zh-CN')).not.toHaveProperty('adminOverview');
    await Promise.all([prepareRouteLocale('serverManagement'), prepareRouteLocale('serverManagement')]);
    expect(i18n.global.getLocaleMessage('zh-CN')).toHaveProperty('serverManagement');
    expect(i18n.global.getLocaleMessage('zh-CN')).not.toHaveProperty('adminOverview');
    await prepareRouteLocale('admin');
    const zh = (await import('./locales/zh-CN')).default;
    expect(i18n.global.getLocaleMessage('zh-CN')).toEqual(zh);
    await setLocale('en-US');
    expect(i18n.global.getLocaleMessage('en-US')).toEqual((await import('./locales/en-US')).default);
    expect(i18n.global.getLocaleMessage('zh-CN')).toEqual(zh);
  });

  it('英文直达后台或服务器与首次语言准备并行时保留基础和模块文案', async () => {
    localStorage.setItem('preferences', JSON.stringify({ lang: 'en-US' }));
    const { default: i18n, prepareRouteLocale, prepareInitialLocale } = await import('@/i18n');
    await Promise.all([prepareRouteLocale('admin'), prepareRouteLocale('serverManagement'), prepareInitialLocale()]);
    expect(i18n.global.getLocaleMessage('en-US')).toEqual((await import('./locales/en-US')).default);
    expect(i18n.global.getLocaleMessage('zh-CN')).toEqual((await import('./locales/zh-CN')).default);
  });
});
