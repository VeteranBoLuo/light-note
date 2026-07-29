import { isMobileViewport } from '@/config/responsive.ts';
import { getMobileResourceEntryPath } from '@/composables/useMobileNavigationState.ts';
import {
  getApplicationEntryPath,
  getAppHomePath,
  type AppHomePath,
  type UserPreferences,
} from '@/utils/preferences.ts';
import { isInstalledApplicationRuntime, resolveLightNoteRuntime, type LightNoteRuntime } from '@/utils/appRuntime.ts';

export interface RuntimeApplicationEntryOptions {
  runtime?: LightNoteRuntime;
}

/**
 * 登录、注册和 OAuth 完成后的应用落点。
 * 手机布局、APK 与 PWA 都回到最近使用的资料模块；普通桌面浏览器沿用账号偏好。
 */
export function getRuntimeApplicationHomePath(
  preferences: UserPreferences | null | undefined,
  isMobileLayout: boolean,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (isMobileLayout || isInstalledApplicationRuntime(runtime)) {
    return getMobileResourceEntryPath(preferences);
  }
  return getAppHomePath(preferences, false);
}

/**
 * `/app` 的运行时分发。普通手机浏览器恢复最近资料，平板保留书签首屏，
 * 普通桌面浏览器按偏好进入；APK/PWA 不受视口宽度影响，始终进入资料。
 */
export function getRuntimeApplicationEntryPath(
  preferences: UserPreferences | null | undefined,
  viewportWidth: number,
  options: RuntimeApplicationEntryOptions = {},
): AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  if (isInstalledApplicationRuntime(runtime) || isMobileViewport(viewportWidth)) {
    return getMobileResourceEntryPath(preferences);
  }
  return getApplicationEntryPath(preferences, viewportWidth);
}

/**
 * 普通浏览器退出或会话失效后回官网；APK/PWA 留在应用资料区内完成重新登录。
 */
export function getRuntimeGuestEntryPath(
  preferences: UserPreferences | null | undefined,
  options: RuntimeApplicationEntryOptions = {},
): '/' | AppHomePath {
  const runtime = options.runtime ?? resolveLightNoteRuntime();
  return isInstalledApplicationRuntime(runtime) ? getMobileResourceEntryPath(preferences) : '/';
}
