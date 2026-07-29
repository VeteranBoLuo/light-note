import { isMobileViewport } from '@/config/responsive.ts';
import { getMobileResourceEntryPath } from '@/composables/useMobileNavigationState.ts';
import {
  getApplicationEntryPath,
  getAppHomePath,
  type AppHomePath,
  type UserPreferences,
} from '@/utils/preferences.ts';
import { resolveLightNoteRuntime, type LightNoteRuntime } from '@/utils/appRuntime.ts';

export interface RuntimeApplicationEntryOptions {
  runtime?: LightNoteRuntime;
  isMobileLayout?: boolean;
}

/**
 * 普通登录和官网“进入轻笺”后的应用落点。
 * 手机布局与 APK 回到最近使用的资料模块；桌面浏览器和桌面 PWA 沿用账号偏好。
 */
export function getRuntimeApplicationHomePath(
  preferences: UserPreferences | null | undefined,
  isMobileLayout: boolean,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (isMobileLayout || runtime === 'android-app') {
    return getMobileResourceEntryPath(preferences);
  }
  return getAppHomePath(preferences, false);
}

/**
 * 新账号注册完成后的固定落点。
 * 所有运行环境统一进入书签首页 `/home`，不继承设备最近资料路径或账号默认首页，
 * 避免新账号被上一个账号的本地导航记录带到笔记库或云空间。
 */
export function getRuntimePostRegistrationPath(): AppHomePath {
  return '/home';
}

/**
 * `/app` 的运行时分发。普通手机浏览器恢复最近资料，平板保留书签首屏，
 * 普通桌面浏览器与桌面 PWA 按偏好进入；APK 不受视口宽度影响，始终进入资料。
 */
export function getRuntimeApplicationEntryPath(
  preferences: UserPreferences | null | undefined,
  viewportWidth: number,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (runtime === 'android-app' || isMobileViewport(viewportWidth)) {
    return getMobileResourceEntryPath(preferences);
  }
  return getApplicationEntryPath(preferences, viewportWidth);
}

/**
 * 桌面浏览器与桌面 PWA 退出或会话失效后回官网；APK 与移动 PWA 留在资料区。
 */
export function getRuntimeGuestEntryPath(
  preferences: UserPreferences | null | undefined,
  options: RuntimeApplicationEntryOptions = {},
): '/' | AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (runtime === 'android-app' || (runtime === 'pwa-standalone' && options.isMobileLayout)) {
    return getMobileResourceEntryPath(preferences);
  }
  return '/';
}
