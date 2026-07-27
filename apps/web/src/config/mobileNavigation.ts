export type MobileShellSection = 'resources' | 'inbox' | 'ai' | 'search' | 'profile';
export type MobileResourcePath = '/home' | '/noteLibrary' | '/cloudSpace';

export interface MobileResourceNavigationItem {
  key: 'bookmark' | 'note' | 'cloud';
  path: MobileResourcePath;
  labelKey: 'navigation.bookmark' | 'mobileNavigation.noteLibrary' | 'navigation.cloudSpace';
  routeNames: readonly string[];
}

export interface MobileBottomNavigationItem {
  key: MobileShellSection;
  labelKey:
    | 'mobileNavigation.resources'
    | 'navigation.inbox'
    | 'mobileNavigation.ai'
    | 'mobileNavigation.search'
    | 'mobileNavigation.profile';
  path?: '/inbox' | '/ai' | '/search' | '/personCenter';
}

export const MOBILE_RESOURCE_NAVIGATION: readonly MobileResourceNavigationItem[] = [
  {
    key: 'bookmark',
    path: '/home',
    labelKey: 'navigation.bookmark',
    routeNames: ['home', 'home:id', 'home:search'],
  },
  {
    key: 'note',
    path: '/noteLibrary',
    labelKey: 'mobileNavigation.noteLibrary',
    routeNames: ['noteLibrary'],
  },
  {
    key: 'cloud',
    path: '/cloudSpace',
    labelKey: 'navigation.cloudSpace',
    routeNames: ['cloudSpace'],
  },
] as const;

export const MOBILE_BOTTOM_NAVIGATION: readonly MobileBottomNavigationItem[] = [
  { key: 'resources', labelKey: 'mobileNavigation.resources' },
  { key: 'inbox', labelKey: 'navigation.inbox', path: '/inbox' },
  { key: 'ai', labelKey: 'mobileNavigation.ai', path: '/ai' },
  { key: 'search', labelKey: 'mobileNavigation.search', path: '/search' },
  { key: 'profile', labelKey: 'mobileNavigation.profile', path: '/personCenter' },
] as const;

export function getMobileResourcePath(routeName: unknown): MobileResourcePath | null {
  const normalizedName = String(routeName || '');
  return MOBILE_RESOURCE_NAVIGATION.find((item) => item.routeNames.includes(normalizedName))?.path || null;
}

export function isMobileResourcePath(path: unknown): path is MobileResourcePath {
  return MOBILE_RESOURCE_NAVIGATION.some((item) => item.path === path);
}
