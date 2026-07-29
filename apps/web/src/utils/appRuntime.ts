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
  isReturningVisitor?: boolean;
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
 * APK 与移动 PWA 不展示官网；桌面 PWA 与桌面浏览器保留官网。
 * 普通移动浏览器仅在已经展示过一次官网（或存在兼容使用记录）后进入应用。
 */
export function shouldRedirectLandingToApplication(policy: LandingEntryPolicy): boolean {
  return (
    policy.runtime === 'android-app' ||
    (policy.runtime === 'pwa-standalone' && policy.isMobileLayout) ||
    (policy.runtime === 'browser' && policy.isMobileLayout && Boolean(policy.isReturningVisitor))
  );
}
