/**
 * 底部一级模块。
 *
 * 「搜索」不再占底部位置——它已升级为覆盖全部模块的顶栏全局搜索；
 * 腾出的位置给「今日」，也就是每天打开轻笺的第一站。
 */
export type MobileShellSection = 'today' | 'resources' | 'todo' | 'ai' | 'profile';
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
    | 'mobileNavigation.today'
    | 'mobileNavigation.resources'
    | 'mobileNavigation.todo'
    | 'mobileNavigation.ai'
    | 'mobileNavigation.profile';
  path?: '/workbenches' | '/inbox' | '/ai' | '/personCenter';
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

// AI 保持中间强调位；今日在首位，因为它是每天进入轻笺后处理事情的第一站
export const MOBILE_BOTTOM_NAVIGATION: readonly MobileBottomNavigationItem[] = [
  { key: 'today', labelKey: 'mobileNavigation.today', path: '/workbenches' },
  { key: 'resources', labelKey: 'mobileNavigation.resources' },
  { key: 'ai', labelKey: 'mobileNavigation.ai', path: '/ai' },
  { key: 'todo', labelKey: 'mobileNavigation.todo', path: '/inbox' },
  { key: 'profile', labelKey: 'mobileNavigation.profile', path: '/personCenter' },
] as const;

/** 今日路径：移动端所有默认落点与底部第一个入口共用 */
export const MOBILE_TODAY_PATH = '/workbenches' as const;

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
