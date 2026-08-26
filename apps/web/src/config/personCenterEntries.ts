import icon from '@/config/icon';

export type PersonCenterEntryTone = 'neutral' | 'growth' | 'store' | 'community' | 'support';

export interface PersonCenterEntry {
  name: string;
  labelKey: string;
  descriptionKey?: string;
  path: string;
  mobilePath?: string;
  icon: string;
  tone: PersonCenterEntryTone;
}

/**
 * 个人中心跨端入口的唯一语义目录。
 *
 * PC 使用紧凑双列菜单，移动端使用快捷宫格与分组列表；布局可以不同，
 * 但名称、路径、图标和语义色不能在两个组件里分别维护。
 */
export const PERSON_CENTER_ENTRIES = {
  growth: {
    name: 'growth',
    labelKey: 'growth.entry',
    path: '/growth',
    icon: icon.userCenter.menu.growth,
    tone: 'growth',
  },
  entitlementStore: {
    name: 'entitlementStore',
    labelKey: 'entitlementStore.entry',
    path: '/store',
    icon: icon.support.store,
    tone: 'store',
  },
  resourceCenter: {
    name: 'resourceCenter',
    labelKey: 'personCenter.resourceCenter',
    path: '/search',
    icon: icon.navigation.search,
    tone: 'neutral',
  },
  settings: {
    name: 'settings',
    labelKey: 'settings.title',
    path: '/settings',
    icon: icon.userCenter.menu.settings,
    tone: 'neutral',
  },
  trash: {
    name: 'trash',
    labelKey: 'trash.title',
    path: '/trash',
    mobilePath: '/ptrash',
    icon: icon.userCenter.menu.trash,
    tone: 'neutral',
  },
  coBuild: {
    name: 'coBuild',
    labelKey: 'personCenter.coBuild',
    descriptionKey: 'personCenter.coBuildDesc',
    path: '/co-build',
    icon: icon.userCenter.menu.coBuild,
    tone: 'community',
  },
  feedback: {
    name: 'feedback',
    labelKey: 'personCenter.feedback',
    descriptionKey: 'personCenter.feedbackDesc',
    path: '/opinions',
    icon: icon.userCenter.menu.feedback,
    tone: 'neutral',
  },
  help: {
    name: 'help',
    labelKey: 'personCenter.help',
    path: '/help',
    icon: icon.userCenter.menu.help,
    tone: 'neutral',
  },
  updateLogs: {
    name: 'updateLogs',
    labelKey: 'personCenter.changelog',
    path: '/updateLogs',
    icon: icon.noteDetail.history,
    tone: 'neutral',
  },
  support: {
    name: 'support',
    labelKey: 'support.entry',
    descriptionKey: 'support.entryDescription',
    path: '/support',
    icon: icon.support.heart,
    tone: 'support',
  },
} as const satisfies Record<string, PersonCenterEntry>;

export const DESKTOP_PERSON_CENTER_PRIMARY_ENTRIES = [
  PERSON_CENTER_ENTRIES.growth,
  PERSON_CENTER_ENTRIES.entitlementStore,
  PERSON_CENTER_ENTRIES.settings,
  PERSON_CENTER_ENTRIES.trash,
  PERSON_CENTER_ENTRIES.coBuild,
  PERSON_CENTER_ENTRIES.feedback,
  PERSON_CENTER_ENTRIES.help,
  PERSON_CENTER_ENTRIES.updateLogs,
] as const;

export const DESKTOP_PERSON_CENTER_SECONDARY_ENTRIES = [PERSON_CENTER_ENTRIES.support] as const;

export const MOBILE_PERSON_CENTER_QUICK_ENTRIES = [
  PERSON_CENTER_ENTRIES.growth,
  PERSON_CENTER_ENTRIES.entitlementStore,
  PERSON_CENTER_ENTRIES.resourceCenter,
  PERSON_CENTER_ENTRIES.trash,
] as const;

export const MOBILE_PERSON_CENTER_COMMUNICATION_ENTRIES = [
  PERSON_CENTER_ENTRIES.coBuild,
  PERSON_CENTER_ENTRIES.feedback,
  PERSON_CENTER_ENTRIES.help,
  PERSON_CENTER_ENTRIES.updateLogs,
  PERSON_CENTER_ENTRIES.support,
] as const;
