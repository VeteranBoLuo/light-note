import { isMobileViewport } from '@/config/responsive.ts';

export type ThemePreference = 'day' | 'night' | 'system';
export type LanguagePreference = 'zh-CN' | 'en-US';
export type HomePagePreference = 'landing' | 'workbench' | 'resourceCenter' | 'bookmark' | 'noteLibrary' | 'cloudSpace';
export type ApplicationHomePreference = Exclude<HomePagePreference, 'landing'>;
export type MobileHomePreference = Extract<HomePagePreference, 'bookmark' | 'noteLibrary' | 'cloudSpace'>;
export type AppHomePath = '/workbenches' | '/search' | '/home' | '/noteLibrary' | '/cloudSpace';
export type MobileHomePath = Extract<AppHomePath, '/home' | '/noteLibrary' | '/cloudSpace'>;

export interface UserPreferences {
  theme?: ThemePreference | string;
  noteViewMode?: 'card' | 'list';
  resourceView?: 'card' | 'list';
  tagView?: 'card' | 'graph';
  lang?: LanguagePreference;
  homePage?: HomePagePreference;
  uiScale?: 'small' | 'medium' | 'large';
  openBookmarkIn?: 'newTab' | 'current';
}

export const DEFAULT_HOME_PAGE: ApplicationHomePreference = 'workbench';
export const DEFAULT_MOBILE_HOME_PAGE: MobileHomePreference = 'bookmark';

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

export function getMobileHomePreference(preferences?: UserPreferences | null): MobileHomePreference {
  const homePage = getHomePagePreference(preferences);
  if (homePage === 'bookmark' || homePage === 'noteLibrary' || homePage === 'cloudSpace') {
    return homePage;
  }
  return DEFAULT_MOBILE_HOME_PAGE;
}

export function getMobileHomePath(preferences?: UserPreferences | null): MobileHomePath {
  const homePage = getMobileHomePreference(preferences);
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
 * `/app` 是稳定的应用入口：手机按移动端默认资源进入，平板保留既有书签首屏，
 * 桌面端按用户偏好进入。旧值 `landing` 会由 getHomePagePreference 迁移为工作台，
 * 避免应用入口再次回到公开官网形成循环。
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
