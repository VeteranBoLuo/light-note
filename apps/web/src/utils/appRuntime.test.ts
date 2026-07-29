import { describe, expect, it } from 'vitest';
import {
  isInstalledApplicationRuntime,
  resolveLightNoteRuntime,
  shouldRedirectLandingToApplication,
} from './appRuntime';

describe('轻笺运行环境与官网入口策略', () => {
  it('显式区分 APK、PWA 与普通浏览器', () => {
    expect(resolveLightNoteRuntime({ androidApp: true, androidWebView: true, pwaStandalone: false })).toBe(
      'android-app',
    );
    expect(resolveLightNoteRuntime({ androidApp: false, androidWebView: false, pwaStandalone: true })).toBe(
      'pwa-standalone',
    );
    expect(resolveLightNoteRuntime({ androidApp: false, androidWebView: false, pwaStandalone: false })).toBe('browser');
    expect(isInstalledApplicationRuntime('android-app')).toBe(true);
    expect(isInstalledApplicationRuntime('pwa-standalone')).toBe(true);
    expect(isInstalledApplicationRuntime('browser')).toBe(false);
  });

  it('普通 Android WebView 即使报告 standalone 也不冒充轻笺 PWA', () => {
    expect(resolveLightNoteRuntime({ androidApp: false, androidWebView: true, pwaStandalone: true })).toBe('browser');
  });

  it.each(['android-app', 'pwa-standalone'] as const)('%s 即使未登录也不展示官网', (runtime) => {
    expect(
      shouldRedirectLandingToApplication({
        runtime,
        isMobileLayout: false,
        isAuthenticated: false,
      }),
    ).toBe(true);
  });

  it('普通移动浏览器只有确认登录后才进入应用', () => {
    expect(
      shouldRedirectLandingToApplication({
        runtime: 'browser',
        isMobileLayout: true,
        isAuthenticated: false,
      }),
    ).toBe(false);
    expect(
      shouldRedirectLandingToApplication({
        runtime: 'browser',
        isMobileLayout: true,
        isAuthenticated: true,
      }),
    ).toBe(true);
  });

  it('普通桌面浏览器即使登录也保留官网根路径', () => {
    expect(
      shouldRedirectLandingToApplication({
        runtime: 'browser',
        isMobileLayout: false,
        isAuthenticated: true,
      }),
    ).toBe(false);
  });
});
