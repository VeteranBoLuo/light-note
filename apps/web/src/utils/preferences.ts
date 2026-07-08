export type ThemePreference = 'day' | 'night' | 'system';
export type LanguagePreference = 'zh-CN' | 'en-US';
export type HomePagePreference = 'landing' | 'workbench' | 'resourceCenter' | 'bookmark' | 'noteLibrary' | 'cloudSpace';

export interface UserPreferences {
  theme?: ThemePreference | string;
  noteViewMode?: 'card' | 'list';
  resourceView?: 'card' | 'list';
  tagView?: 'card' | 'graph';
  lang?: LanguagePreference;
  homePage?: HomePagePreference;
}

export const DEFAULT_HOME_PAGE: HomePagePreference = 'landing';

export function getHomePagePreference(preferences?: UserPreferences | null): HomePagePreference {
  const homePage = preferences?.homePage;
  if (homePage === 'landing' || homePage === 'workbench' || homePage === 'resourceCenter' || homePage === 'bookmark' || homePage === 'noteLibrary' || homePage === 'cloudSpace') {
    return homePage;
  }
  return DEFAULT_HOME_PAGE;
}

export function getDesktopHomePath(
  preferences?: UserPreferences | null,
): '/landing' | '/workbenches' | '/search' | '/home' | '/noteLibrary' | '/cloudSpace' {
  const homePage = getHomePagePreference(preferences);
  if (homePage === 'landing') {
    return '/landing';
  }
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

export function getAppHomePath(
  preferences?: UserPreferences | null,
  isMobile = false,
): '/landing' | '/workbenches' | '/search' | '/home' | '/noteLibrary' | '/cloudSpace' {
  if (isMobile) {
    return '/home';
  }
  return getDesktopHomePath(preferences);
}
