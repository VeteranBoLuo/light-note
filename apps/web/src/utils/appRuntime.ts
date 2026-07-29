import { isAndroidWebViewRuntime, isLightNoteAndroidApp } from '@/utils/androidBridge.ts';
import { isPwaStandaloneMode } from '@/utils/common.ts';

export type LightNoteRuntime = 'android-app' | 'pwa-standalone' | 'browser';

export interface LightNoteRuntimeSignals {
  androidApp?: boolean;
  androidWebView?: boolean;
  pwaStandalone?: boolean;
}

export interface LandingEntryPolicy {
  runtime: LightNoteRuntime;
  isMobileLayout: boolean;
  isAuthenticated: boolean;
}

/**
 * WebView 本身仍是浏览器内核，因此应用身份只认轻笺显式注入的 UA/桥接标记。
 * 通用 Android `wv` 标记不能证明这是轻笺 APK，不能参与入口分流。
 */
export function resolveLightNoteRuntime(signals: LightNoteRuntimeSignals = {}): LightNoteRuntime {
  const androidApp = signals.androidApp ?? isLightNoteAndroidApp();
  if (androidApp) return 'android-app';

  // 第三方 Android WebView 可能把 display-mode 报成 standalone；它不是轻笺 PWA，
  // 必须继续按普通浏览器处理。轻笺 APK 已在上一步由专属 UA/桥接优先识别。
  const androidWebView = signals.androidWebView ?? isAndroidWebViewRuntime();
  if (androidWebView) return 'browser';

  const pwaStandalone = signals.pwaStandalone ?? isPwaStandaloneMode();
  if (pwaStandalone) return 'pwa-standalone';

  return 'browser';
}

export function isInstalledApplicationRuntime(runtime = resolveLightNoteRuntime()): boolean {
  return runtime === 'android-app' || runtime === 'pwa-standalone';
}

/**
 * APK/PWA 不展示官网；普通浏览器只有“手机布局 + 已确认登录”才从根官网进入应用。
 * 匿名移动浏览器始终保留官网，确保移动优先索引抓到完整营销内容。
 */
export function shouldRedirectLandingToApplication(policy: LandingEntryPolicy): boolean {
  return (
    isInstalledApplicationRuntime(policy.runtime) ||
    (policy.runtime === 'browser' && policy.isMobileLayout && policy.isAuthenticated)
  );
}
