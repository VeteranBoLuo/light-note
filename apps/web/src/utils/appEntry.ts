import { isMobileViewport } from '@/config/responsive.ts';
import { MOBILE_TODAY_PATH } from '@/config/mobileNavigation.ts';
import { getAppHomePath, getDesktopHomePath, type AppHomePath, type UserPreferences } from '@/utils/preferences.ts';
import { resolveLightNoteRuntime, type LightNoteRuntime } from '@/utils/appRuntime.ts';

export interface RuntimeApplicationEntryOptions {
  runtime?: LightNoteRuntime;
  isMobileLayout?: boolean;
}

/**
 * 普通登录和官网“进入轻笺”后的应用落点。
 * 移动布局与 APK 统一进入「今日」；桌面浏览器和桌面 PWA 沿用账号偏好。
 */
export function getRuntimeApplicationHomePath(
  preferences: UserPreferences | null | undefined,
  isMobileLayout: boolean,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (isMobileLayout || runtime === 'android-app') {
    return MOBILE_TODAY_PATH;
  }
  return getAppHomePath(preferences, false);
}

/**
 * 新账号注册完成后的落点。
 * 移动端与其它入口一致进入「今日」；桌面端固定书签首页，
 * 不继承设备最近资料路径或账号默认首页，避免新账号被上一个账号的本地记录带走。
 */
export function getRuntimePostRegistrationPath(
  isMobileLayout = false,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (isMobileLayout || runtime === 'android-app') {
    return MOBILE_TODAY_PATH;
  }
  return '/home';
}

/**
 * `/app` 的运行时分发。移动布局与 APK 统一进入「今日」，平板保留书签首屏，
 * 普通桌面浏览器与桌面 PWA 按偏好进入；APK 不受视口宽度影响。
 */
export function getRuntimeApplicationEntryPath(
  preferences: UserPreferences | null | undefined,
  viewportWidth: number,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (runtime === 'android-app' || isMobileViewport(viewportWidth)) {
    return MOBILE_TODAY_PATH;
  }
  // 平板沿用书签首屏，桌面按账号偏好
  if (viewportWidth < 1024) return '/home';
  return getDesktopHomePath(preferences);
}

/**
 * 桌面浏览器与桌面 PWA 退出或会话失效后回官网；APK 与移动 PWA 留在应用内的「今日」。
 */
export function getRuntimeGuestEntryPath(
  preferences: UserPreferences | null | undefined,
  options: RuntimeApplicationEntryOptions = {},
): '/' | AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (runtime === 'android-app' || (runtime === 'pwa-standalone' && options.isMobileLayout)) {
    return MOBILE_TODAY_PATH;
  }
  return '/';
}
