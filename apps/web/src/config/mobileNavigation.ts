/**
 * 底部一级模块。
 *
 * 「搜索」不再占底部位置——它已升级为覆盖全部模块的顶栏全局搜索；
 * 腾出的位置给「今日」，也就是每天打开轻笺的第一站。
 */
export type MobileShellSection = 'today' | 'resources' | 'capture' | 'todo' | 'community' | 'profile';
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
    | 'mobileNavigation.quickCapture'
    | 'mobileNavigation.todo'
    | 'mobileNavigation.community'
    | 'mobileNavigation.profile';
  path?: '/workbenches' | '/inbox' | '/community-chat' | '/personCenter';
}

export const MOBILE_RESOURCE_NAVIGATION: readonly MobileResourceNavigationItem[] = [
  {
    key: 'bookmark',
    path: '/home',
    labelKey: 'navigation.bookmark',
    routeNames: ['home', 'home:id', 'home:search', 'bookmarkMg'],
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
    routeNames: ['tagMg', 'tagDetail'],
  },
] as const;

// 中间强调位用于确定性的快速收集；模块 AI 只在对应业务页面出现，不再作为全局一级入口。
export const MOBILE_BOTTOM_NAVIGATION: readonly MobileBottomNavigationItem[] = [
  { key: 'today', labelKey: 'mobileNavigation.today', path: '/workbenches' },
  { key: 'resources', labelKey: 'mobileNavigation.resources' },
  { key: 'capture', labelKey: 'mobileNavigation.quickCapture' },
  { key: 'todo', labelKey: 'mobileNavigation.todo', path: '/inbox' },
  { key: 'community', labelKey: 'mobileNavigation.community', path: '/community-chat' },
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
