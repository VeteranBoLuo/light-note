export type MobileShellSection = 'resources' | 'todo' | 'ai' | 'search' | 'profile';
export type MobileResourcePath = '/home' | '/noteLibrary' | '/cloudSpace' | '/manage/tagMg';
export type MobileResourceInboxTab = 'all' | 'bookmark' | 'note' | 'file';

export interface MobileResourceNavigationItem {
  key: 'bookmark' | 'note' | 'cloud' | 'tag';
  path: MobileResourcePath;
  labelKey: 'navigation.bookmark' | 'mobileNavigation.noteLibrary' | 'navigation.cloudSpace' | 'navigation.tag';
  routeNames: readonly string[];
}

export interface MobileBottomNavigationItem {
  key: MobileShellSection;
  labelKey:
    | 'mobileNavigation.resources'
    | 'mobileNavigation.todo'
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
  {
    key: 'tag',
    path: '/manage/tagMg',
    labelKey: 'navigation.tag',
    routeNames: ['tagMg'],
  },
] as const;

export const MOBILE_BOTTOM_NAVIGATION: readonly MobileBottomNavigationItem[] = [
  { key: 'resources', labelKey: 'mobileNavigation.resources' },
  { key: 'todo', labelKey: 'mobileNavigation.todo', path: '/inbox' },
  { key: 'ai', labelKey: 'mobileNavigation.ai', path: '/ai' },
  { key: 'search', labelKey: 'mobileNavigation.search', path: '/search' },
  { key: 'profile', labelKey: 'mobileNavigation.profile', path: '/personCenter' },
] as const;

export const MOBILE_RESOURCE_INBOX_TABS: readonly MobileResourceInboxTab[] = ['all', 'bookmark', 'note', 'file'];

export function isMobileResourceInboxTab(value: unknown): value is MobileResourceInboxTab {
  return MOBILE_RESOURCE_INBOX_TABS.includes(String(value || '') as MobileResourceInboxTab);
}

export function getMobileResourcePath(routeName: unknown): MobileResourcePath | null {
  const normalizedName = String(routeName || '');
  return MOBILE_RESOURCE_NAVIGATION.find((item) => item.routeNames.includes(normalizedName))?.path || null;
}

export function isMobileResourcePath(path: unknown): path is MobileResourcePath {
  return MOBILE_RESOURCE_NAVIGATION.some((item) => item.path === path);
}
