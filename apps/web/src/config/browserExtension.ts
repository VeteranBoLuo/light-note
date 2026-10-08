import { isLightNoteAndroidApp } from '@/utils/androidBridge.ts';

export const CHROME_WEB_STORE_EXTENSION_ID = 'hfdpgaiggloacopnkihfkloicjepldig';

/**
 * Chrome Web Store 的稳定详情地址。分享、官网和设置页统一使用不带跟踪参数的 canonical URL，
 * 避免以后复制商店分享链接时把临时 utm_source 一并写进产品代码。
 */
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_WEB_STORE_EXTENSION_ID}`;

export const BROWSER_EXTENSION_LANDING_PATH = '/browser-extension';
export const BROWSER_EXTENSION_PRIVACY_PATH = '/legal/browser-extension-privacy.html';
export const BROWSER_EXTENSION_SUPPORT_URL = 'https://github.com/VeteranBoLuo/light-note/issues';

type ExternalWindowOpener = (url: string, target: string, features: string) => unknown;

/** Chrome 与 Edge 都可从 Chrome Web Store 安装；返回 false 表示当前运行环境无法打开新页面。 */
export function openChromeWebStore(openWindow?: ExternalWindowOpener): boolean {
  const opener =
    openWindow ||
    (typeof window !== 'undefined'
      ? (url: string, target: string, features: string) => window.open(url, target, features)
      : null);
  if (!opener) return false;
  opener(CHROME_WEB_STORE_URL, '_blank', 'noopener,noreferrer');
  return true;
}

interface ExtensionStoreNavigator {
  userAgent: string;
  userAgentData?: { mobile?: boolean; brands?: readonly { brand: string }[] };
  brave?: unknown;
}

/** 仅决定安装入口的展示，不用于布局或权限判断。优先使用浏览器品牌信息。 */
export function canShowExtensionStoreEntry(
  browser: ExtensionStoreNavigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  androidApp = isLightNoteAndroidApp(),
): boolean {
  if (!browser || androidApp || browser.userAgentData?.mobile || browser.brave) return false;
  const ua = browser.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|\bwv\b/i.test(ua)) return false;
  if (/OPR\/|Opera|Vivaldi|SamsungBrowser|YaBrowser|UCBrowser|QQBrowser|Whale|Electron/i.test(ua)) return false;
  const brands = browser.userAgentData?.brands;
  if (brands?.length) return brands.some(({ brand }) => brand === 'Google Chrome' || brand === 'Microsoft Edge');
  return /(?:Chrome|Edg)\/\d+/.test(ua);
}
