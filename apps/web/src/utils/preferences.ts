import { isMobileViewport } from '@/config/responsive.ts';

export type ThemePreference = 'day' | 'night' | 'system';
export type LanguagePreference = 'zh-CN' | 'en-US';
export type HomePagePreference = 'landing' | 'workbench' | 'resourceCenter' | 'bookmark' | 'noteLibrary' | 'cloudSpace';
export type ApplicationHomePreference = Exclude<HomePagePreference, 'landing'>;
// 移动端「今日」已是底部一级入口，因此 workbench 也可以作为移动默认首页；
// resourceCenter 仍不可以——它在移动端是二级页面。
export type MobileHomePreference = Extract<
  HomePagePreference,
  'workbench' | 'bookmark' | 'noteLibrary' | 'cloudSpace'
>;
// '/manage/tagMg' 不作为可选默认首页,仅作为移动端「回到最近资料页签」的合法落点。
export type AppHomePath = '/workbenches' | '/search' | '/home' | '/noteLibrary' | '/cloudSpace' | '/manage/tagMg';
export type MobileHomePath = Extract<AppHomePath, '/workbenches' | '/home' | '/noteLibrary' | '/cloudSpace'>;

export interface UserPreferences {
  theme?: ThemePreference | string;
  noteViewMode?: 'card' | 'list';
  resourceView?: 'card' | 'list';
  todoView?: 'list' | 'agenda' | 'calendar';
  tagView?: 'card' | 'graph';
  lang?: LanguagePreference;
  homePage?: HomePagePreference;
  uiScale?: 'small' | 'medium' | 'large';
  openBookmarkIn?: 'newTab' | 'current';
  notificationsInApp?: boolean;
  notificationsEmail?: boolean;
  notificationsBrowser?: boolean;
  notificationsDnd?: boolean;
  notificationsDndStart?: string;
  notificationsDndEnd?: string;
  notificationsTimezoneOffset?: number;
}

export const DEFAULT_HOME_PAGE: ApplicationHomePreference = 'bookmark';
// 移动端默认进入「今日」——它是每天打开轻笺后处理事情的第一站
export const DEFAULT_MOBILE_HOME_PAGE: MobileHomePreference = 'workbench';

/**
 * `landing` 只作为历史账号可能返回的旧值保留，不再属于应用默认首页。
 * 官网入口由根路径 `/` 自己负责，任何应用入口都必须解析到应用内部页面。
 */
export function getHomePagePreference(preferences?: UserPreferences | null): ApplicationHomePreference {
  const homePage = preferences?.homePage;
  if (
    homePage === 'workbench' ||
    homePage === 'resourceCenter' ||
    homePage === 'bookmark' ||
    homePage === 'noteLibrary' ||
    homePage === 'cloudSpace'
  ) {
    return homePage;
  }
  return DEFAULT_HOME_PAGE;
}

export function getDesktopHomePath(preferences?: UserPreferences | null): AppHomePath {
  const homePage = getHomePagePreference(preferences);
  if (homePage === 'resourceCenter') {
    return '/search';
  }
  if (homePage === 'bookmark') {
    return '/home';
  }
  if (homePage === 'noteLibrary') {
    return '/noteLibrary';
  }
  if (homePage === 'cloudSpace') {
    return '/cloudSpace';
  }
  return '/workbenches';
}

/**
 * 直接读原始偏好，不经过 `getHomePagePreference` 的桌面兜底——
 * 后者会把「没设置过」归一成书签，导致移动端默认值永远用不上。
 * 未设置、历史 `landing` 和移动端不支持的 `resourceCenter` 都落到今日。
 */
export function getMobileHomePreference(preferences?: UserPreferences | null): MobileHomePreference {
  const homePage = preferences?.homePage;
  if (
    homePage === 'workbench' ||
    homePage === 'bookmark' ||
    homePage === 'noteLibrary' ||
    homePage === 'cloudSpace'
  ) {
    return homePage;
  }
  return DEFAULT_MOBILE_HOME_PAGE;
}

export function getMobileHomePath(preferences?: UserPreferences | null): MobileHomePath {
  const homePage = getMobileHomePreference(preferences);
  if (homePage === 'workbench') {
    return '/workbenches';
  }
  if (homePage === 'noteLibrary') {
    return '/noteLibrary';
  }
  if (homePage === 'cloudSpace') {
    return '/cloudSpace';
  }
  return '/home';
}

export function isMobileHomeRoute(routeName: unknown, preferences?: UserPreferences | null): boolean {
  const name = String(routeName || '');
  const homePage = getMobileHomePreference(preferences);
  if (homePage === 'workbench') {
    return name === 'workbenches';
  }
  if (homePage === 'bookmark') {
    return name === 'home' || name.startsWith('home:');
  }
  if (homePage === 'noteLibrary') {
    return name === 'noteLibrary';
  }
  return name === 'cloudSpace';
}

export function getAppHomePath(preferences?: UserPreferences | null, isMobile = false): AppHomePath {
  if (isMobile) {
    return getMobileHomePath(preferences);
  }
  return getDesktopHomePath(preferences);
}

/**
 * `/app` 是稳定应用入口：手机进入资源模块，平板沿用书签首屏，
 * 桌面端按账号偏好进入。缺失或历史 `landing` 值会归一为书签，
 * 绝不能让应用入口重新返回公开官网。
 */
export function getApplicationEntryPath(
  preferences: UserPreferences | null | undefined,
  viewportWidth: number,
): AppHomePath {
  if (isMobileViewport(viewportWidth)) {
    return getMobileHomePath(preferences);
  }
  if (viewportWidth < 1024) {
    return '/home';
  }
  return getDesktopHomePath(preferences);
}
