import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_EXTENSION_LANDING_PATH,
  CHROME_WEB_STORE_EXTENSION_ID,
  CHROME_WEB_STORE_URL,
  openChromeWebStore,
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
