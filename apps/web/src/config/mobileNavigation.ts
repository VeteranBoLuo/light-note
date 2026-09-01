/**
 * 底部一级模块。
 *
 * 「搜索」不再占底部位置——它已升级为覆盖全部模块的顶栏全局搜索；
 * 腾出的位置给「今日」，也就是每天打开轻笺的第一站。
 */
export type MobileShellSection = 'today' | 'resources' | 'toolbox' | 'todo' | 'community' | 'profile';
export type MobileBottomNavigationKey = MobileShellSection | 'create';
export type MobileCreateHubActionKey = 'bookmark' | 'note' | 'file' | 'todo' | 'toolbox';
export type MobileFormalCreateActionKey = 'note' | 'file';
export type MobileResourcePath = '/home' | '/noteLibrary' | '/cloudSpace' | '/manage/tagMg';
export type MobileResourceInboxTab = 'all' | 'bookmark' | 'note' | 'file';

export interface MobileResourceNavigationItem {
  key: 'bookmark' | 'note' | 'cloud' | 'tag';
  path: MobileResourcePath;
  labelKey: 'navigation.bookmark' | 'mobileNavigation.noteLibrary' | 'navigation.cloudSpace' | 'navigation.tag';
  routeNames: readonly string[];
}

export interface MobileBottomNavigationItem {
  key: MobileBottomNavigationKey;
  labelKey:
    | 'mobileNavigation.today'
    | 'mobileNavigation.resources'
    | 'mobileNavigation.toolbox'
    | 'mobileNavigation.create'
    | 'mobileNavigation.todo'
    | 'mobileNavigation.community'
    | 'mobileNavigation.profile';
  path?: '/workbenches' | '/toolbox' | '/inbox' | '/community-chat' | '/personCenter';
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

// 中间位置承载全局正式新建；「今日」继续负责快速收集到待整理。
// 知识工坊降级到新建面板与更多入口，不再冒充一级目的地。
export const MOBILE_BOTTOM_NAVIGATION: readonly MobileBottomNavigationItem[] = [
  { key: 'today', labelKey: 'mobileNavigation.today', path: '/workbenches' },
  { key: 'resources', labelKey: 'mobileNavigation.resources' },
  { key: 'create', labelKey: 'mobileNavigation.create' },
  { key: 'todo', labelKey: 'mobileNavigation.todo', path: '/inbox' },
  { key: 'community', labelKey: 'mobileNavigation.community', path: '/community-chat' },
] as const;

/** 今日路径：移动端所有默认落点与底部第一个入口共用 */
export const MOBILE_TODAY_PATH = '/workbenches' as const;

export const MOBILE_RESOURCE_INBOX_TABS: readonly MobileResourceInboxTab[] = ['all', 'bookmark', 'note', 'file'];
export const MOBILE_CREATE_HUB_ACTIONS: readonly MobileCreateHubActionKey[] = [
  'bookmark',
  'note',
  'file',
  'todo',
  'toolbox',
];
export const MOBILE_FORMAL_CREATE_ACTIONS: readonly MobileFormalCreateActionKey[] = ['note', 'file'];

export function isMobileResourceInboxTab(value: unknown): value is MobileResourceInboxTab {
  return MOBILE_RESOURCE_INBOX_TABS.includes(String(value || '') as MobileResourceInboxTab);
}

export function isMobileCreateHubActionKey(value: unknown): value is MobileCreateHubActionKey {
  return MOBILE_CREATE_HUB_ACTIONS.includes(String(value || '') as MobileCreateHubActionKey);
}

export function isMobileFormalCreateActionKey(value: unknown): value is MobileFormalCreateActionKey {
  return MOBILE_FORMAL_CREATE_ACTIONS.includes(String(value || '') as MobileFormalCreateActionKey);
}

export function getMobileResourcePath(routeName: unknown): MobileResourcePath | null {
  const normalizedName = String(routeName || '');
  return MOBILE_RESOURCE_NAVIGATION.find((item) => item.routeNames.includes(normalizedName))?.path || null;
}

export function isMobileResourcePath(path: unknown): path is MobileResourcePath {
  return MOBILE_RESOURCE_NAVIGATION.some((item) => item.path === path);
}
