import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_EXTENSION_LANDING_PATH,
  CHROME_WEB_STORE_EXTENSION_ID,
  CHROME_WEB_STORE_URL,
  openChromeWebStore,
  canShowExtensionStoreEntry,
} from './browserExtension.ts';

describe('浏览器扩展公开入口配置', () => {
  it('长期商店地址只由正式扩展 ID 生成且不携带分享追踪参数', () => {
    expect(CHROME_WEB_STORE_EXTENSION_ID).toBe('hfdpgaiggloacopnkihfkloicjepldig');
    expect(CHROME_WEB_STORE_URL).toBe('https://chromewebstore.google.com/detail/hfdpgaiggloacopnkihfkloicjepldig');
    expect(CHROME_WEB_STORE_URL).not.toContain('utm_');
    expect(BROWSER_EXTENSION_LANDING_PATH).toBe('/browser-extension');
  });

  it('用隔离的新标签页打开商店', () => {
    const opener = vi.fn();
    expect(openChromeWebStore(opener)).toBe(true);
    expect(opener).toHaveBeenCalledWith(CHROME_WEB_STORE_URL, '_blank', 'noopener,noreferrer');
  });
});

describe('插件商店入口的浏览器范围', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
  it.each([chrome, chrome + ' Edg/140.0.0.0'])('桌面 Chrome / Edge 无品牌 API 时兼容 UA：%s', (userAgent) => {
    expect(canShowExtensionStoreEntry({ userAgent }, false)).toBe(true);
  });
  it.each(['Google Chrome', 'Microsoft Edge'])('接受明确品牌 %s', (brand) => {
    expect(canShowExtensionStoreEntry({ userAgent: chrome, userAgentData: { brands: [{ brand }] } }, false)).toBe(true);
  });
  it.each(['Chromium', 'Brave', 'Opera'])('不把其他品牌 %s 当作 Chrome', (brand) => {
    expect(canShowExtensionStoreEntry({ userAgent: chrome, userAgentData: { brands: [{ brand }] } }, false)).toBe(
      false,
    );
  });
  it.each([
    'Android',
    'iPhone',
    'iPad',
    'Mobile',
    'wv',
    'OPR/100',
    'Vivaldi',
    'SamsungBrowser',
    'YaBrowser',
    'Electron',
  ])('排除移动和其他浏览器标记 %s', (marker) => {
    expect(canShowExtensionStoreEntry({ userAgent: chrome + ' ' + marker }, false)).toBe(false);
  });
  it.each(['Mozilla/5.0 Firefox/140.0', 'Mozilla/5.0 Version/18 Safari/605.1.15', ''])(
    '隐藏不支持的 UA %s',
    (userAgent) => {
      expect(canShowExtensionStoreEntry({ userAgent }, false)).toBe(false);
    },
  );
  it('排除 App、移动品牌提示和 Brave 的 Chrome 兼容 UA', () => {
    expect(canShowExtensionStoreEntry({ userAgent: chrome }, true)).toBe(false);
    expect(canShowExtensionStoreEntry({ userAgent: chrome, userAgentData: { mobile: true } }, false)).toBe(false);
    expect(canShowExtensionStoreEntry({ userAgent: chrome, brave: {} }, false)).toBe(false);
  });
});
