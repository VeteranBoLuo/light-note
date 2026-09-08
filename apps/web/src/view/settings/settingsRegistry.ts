/**
 * 设置分类的唯一事实表：桌面左侧目录与移动端设置目录共用。
 *
 * 从 Settings.vue 抽出后，分类顺序、图标、文案键与环境显隐都不再由两端各维护一份。
 * 这里出错的表现是入口消失、深链接打不开或分组顺序乱掉，所以必须可直接测试。
 */

export type SettingsSectionId =
  'appearance' | 'general' | 'notification' | 'ai' | 'points' | 'account' | 'install' | 'privacy';

/** 两端共用的一级分类；桌面独有的安装/快捷键等能力归入「通用」，不再自成目录项。 */
export type SettingsIndexSectionId = Exclude<SettingsSectionId, 'install'>;

export type SettingsSectionGroup = 'preferences' | 'account' | 'rules';

export type SettingsSectionMeta = {
  id: SettingsIndexSectionId;
  group: SettingsSectionGroup;
  /** icon.settings 下的键，由调用方按 SvgIcon 取值，避免本文件依赖图标模块 */
  iconKey: 'appearance' | 'general' | 'notification' | 'ai' | 'points' | 'account' | 'privacy';
  /** 桌面目录用的简短标题 */
  titleKey: string;
  /** 移动目录用的标题，可比桌面标题更完整 */
  mobileTitleKey: string;
  tone: 'purple' | 'green';
};

/**
 * 目录展示顺序即数组顺序：先「偏好设置」（用得最多、每天都可能改），
 * 再「账号与设备」，最后「规则与数据」（基本只读一次）。
 */
export const SETTINGS_SECTION_META: SettingsSectionMeta[] = [
  {
    id: 'appearance',
    group: 'preferences',
    iconKey: 'appearance',
    titleKey: 'settings.appearance',
    mobileTitleKey: 'settings.mobileIndex.appearance',
    tone: 'purple',
  },
  {
    id: 'general',
    group: 'preferences',
    iconKey: 'general',
    titleKey: 'settings.general',
    mobileTitleKey: 'settings.mobileIndex.general',
    tone: 'green',
  },
  {
    id: 'notification',
    group: 'preferences',
    iconKey: 'notification',
    titleKey: 'settings.notification',
    mobileTitleKey: 'settings.notification',
    tone: 'green',
  },
  {
    id: 'ai',
    group: 'preferences',
    iconKey: 'ai',
    titleKey: 'settings.ai.title',
    mobileTitleKey: 'settings.ai.title',
    tone: 'purple',
  },
  {
    id: 'points',
    group: 'account',
    iconKey: 'points',
    titleKey: 'growth.pointsUsagePageTitle',
    mobileTitleKey: 'growth.pointsUsagePageTitle',
    tone: 'purple',
  },
  {
    id: 'account',
    group: 'account',
    iconKey: 'account',
    titleKey: 'settings.accountSecurityTitle',
    mobileTitleKey: 'settings.accountSecurityTitle',
    tone: 'green',
  },
  {
    id: 'privacy',
    group: 'rules',
    iconKey: 'privacy',
    titleKey: 'settings.privacyTitle',
    mobileTitleKey: 'settings.privacyTitle',
    tone: 'green',
  },
];

export const SETTINGS_GROUP_ORDER: SettingsSectionGroup[] = ['preferences', 'account', 'rules'];

/**
 * 运行环境。显隐只由这个事实决定，不看 UA、不看视口。
 * （安装项已整条移出目录，所以这里不再需要 isAndroidApp。）
 */
export type SettingsEnv = {
  /** 游客没有账号，「账号与安全」整块无意义 */
  isGuest: boolean;
};

export function isSettingsSectionVisible(id: SettingsIndexSectionId, env: SettingsEnv): boolean {
  if (id === 'account' || id === 'ai' || id === 'points') return !env.isGuest;
  return true;
}

/** 当前环境下可进入的分类，顺序与目录一致 */
export function visibleSettingsSections(env: SettingsEnv): SettingsSectionMeta[] {
  return SETTINGS_SECTION_META.filter((meta) => isSettingsSectionVisible(meta.id, env));
}

/**
 * 解析 `?section=` 。
 * 非法值、不在目录里的分类（`install`）、以及当前环境下不可见的分类（游客深链接到 account）
 * 都当作「没有 section」→ 回落到目录页，而不是渲染一个空白子页。
 */
export function parseSettingsSection(raw: unknown, env: SettingsEnv): SettingsIndexSectionId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const meta = SETTINGS_SECTION_META.find((item) => item.id === value);
  if (!meta) return null;
  return isSettingsSectionVisible(meta.id, env) ? meta.id : null;
}

/** 按分组切成 [组, 该组分类[]]，空组不返回（游客环境下「账号与设备」可能只剩安装项） */
export function groupSettingsSections<T extends { group: SettingsSectionGroup }>(
  sections: T[],
): { group: SettingsSectionGroup; items: T[] }[] {
  return SETTINGS_GROUP_ORDER.map((group) => ({
    group,
    items: sections.filter((section) => section.group === group),
  })).filter((entry) => entry.items.length > 0);
}

/*
 * 通知开关清单。免打扰(notificationsDnd)故意不算在内：它开着是「少收通知」，
 * 混进「已开启 N 项」会把含义算反，所以单独作为后缀提示。
 * 每项默认值与 Settings.vue 模板里 BSwitch 的 :checked 口径保持一致
 * （多数默认开，浏览器通知默认关）；加通知开关时两处要一起改。
 */
export const NOTIFICATION_TOGGLE_KEYS: { key: string; defaultOn: boolean }[] = [
  { key: 'notificationsInApp', defaultOn: true },
  { key: 'notificationsOrganize', defaultOn: true },
  { key: 'notificationsEmail', defaultOn: true },
  { key: 'notificationsBrowser', defaultOn: false },
  { key: 'weeklyReport', defaultOn: true },
  { key: 'notifyLevelUp', defaultOn: true },
  { key: 'notifyOpinionReply', defaultOn: true },
  { key: 'notifyFeatureRequest', defaultOn: true },
  { key: 'notifyStreakRisk', defaultOn: true },
];

/** 已开启的通知项数。总数取自清单长度而不是写死，加减开关时摘要自动跟着变。 */
export function countEnabledNotifications(
  preferences: Record<string, unknown> | null | undefined,
  scope: { browserPush?: boolean; guest?: boolean } = {},
): {
  on: number;
  total: number;
} {
  const prefs = preferences || {};
  const visible = NOTIFICATION_TOGGLE_KEYS.filter(
    ({ key }) =>
      (scope.browserPush !== false || key !== 'notificationsBrowser') &&
      (!scope.guest || key !== 'notificationsOrganize'),
  );
  const on = visible.filter(({ key, defaultOn }) => (defaultOn ? prefs[key] !== false : prefs[key] === true)).length;
  return { on, total: visible.length };
}
