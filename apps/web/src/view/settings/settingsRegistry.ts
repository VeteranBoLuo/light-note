/**
 * 移动端设置目录的事实表：有哪些分类、归在哪一组、什么运行环境下可见。
 *
 * 从 Settings.vue 抽出来是为了能直接测：这里出错的表现是入口消失、
 * 深链接打不开或分组顺序乱掉，比样式更该被锁住。
 * 桌面端不读这张表 —— 它继续走 anchors + 长页，两套结构互不影响。
 */

export type SettingsSectionId = 'appearance' | 'general' | 'notification' | 'ai' | 'account' | 'install' | 'privacy';

/**
 * 进入移动端目录的分类。
 *
 * `install` 刻意排除：移动端「我的」里已经有一个安装入口（PersonCenterMobile 的 pwa.install，
 * 自带状态摘要和 App 内隐藏），设置里再放一行就是同一件事的第二个入口。
 * 桌面端没有这个入口，所以 Settings.vue 的 `#set-install` 区块只在桌面端继续渲染 ——
 * 删的是移动端的重复项，不是安装能力本身。
 */
export type SettingsIndexSectionId = Exclude<SettingsSectionId, 'install'>;

export type SettingsSectionGroup = 'preferences' | 'account' | 'rules';

/**
 * 分类 → 页面里的 DOM id。
 * 桌面锚点和 scrollspy 一直用 `set-xxx`，改名会连带动到桌面，所以只做映射不做重命名。
 * 只列目录内的分类：桌面独有的 `set-install` 锚点在 Settings.vue 自己拼，不从这里取。
 */
export const SETTINGS_SECTION_ANCHOR: Record<SettingsIndexSectionId, string> = {
  appearance: 'set-appearance',
  general: 'set-general',
  notification: 'set-notification',
  ai: 'set-ai',
  account: 'set-account',
  privacy: 'set-privacy',
};

export type SettingsSectionMeta = {
  id: SettingsIndexSectionId;
  group: SettingsSectionGroup;
  /** icon.ts 里的键路径，由调用方按 SvgIcon 取值注入，避免这里依赖 icon 模块 */
  iconKey: string;
  tone: 'purple' | 'green';
};

/**
 * 目录展示顺序即数组顺序：先「偏好设置」（用得最多、每天都可能改），
 * 再「账号与设备」，最后「规则与数据」（基本只读一次）。
 */
const SECTION_META: SettingsSectionMeta[] = [
  { id: 'appearance', group: 'preferences', iconKey: 'appearance', tone: 'purple' },
  { id: 'general', group: 'preferences', iconKey: 'general', tone: 'green' },
  { id: 'notification', group: 'preferences', iconKey: 'notification', tone: 'green' },
  { id: 'ai', group: 'preferences', iconKey: 'ai', tone: 'purple' },
  { id: 'account', group: 'account', iconKey: 'account', tone: 'green' },
  { id: 'privacy', group: 'rules', iconKey: 'privacy', tone: 'green' },
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
  if (id === 'account' || id === 'ai') return !env.isGuest;
  return true;
}

/** 当前环境下可进入的分类，顺序与目录一致 */
export function visibleSettingsSections(env: SettingsEnv): SettingsSectionMeta[] {
  return SECTION_META.filter((meta) => isSettingsSectionVisible(meta.id, env));
}

/**
 * 解析 `?section=` 。
 * 非法值、不在目录里的分类（`install`）、以及当前环境下不可见的分类（游客深链接到 account）
 * 都当作「没有 section」→ 回落到目录页，而不是渲染一个空白子页。
 */
export function parseSettingsSection(raw: unknown, env: SettingsEnv): SettingsIndexSectionId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const meta = SECTION_META.find((item) => item.id === value);
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
  { key: 'notificationsEmail', defaultOn: true },
  { key: 'notificationsBrowser', defaultOn: false },
  { key: 'weeklyReport', defaultOn: true },
  { key: 'notifyLevelUp', defaultOn: true },
  { key: 'notifyOpinionReply', defaultOn: true },
  { key: 'notifyFeatureRequest', defaultOn: true },
  { key: 'notifyStreakRisk', defaultOn: true },
];

/** 已开启的通知项数。总数取自清单长度而不是写死，加减开关时摘要自动跟着变。 */
export function countEnabledNotifications(preferences: Record<string, unknown> | null | undefined): {
  on: number;
  total: number;
} {
  const prefs = preferences || {};
  const on = NOTIFICATION_TOGGLE_KEYS.filter(({ key, defaultOn }) =>
    defaultOn ? prefs[key] !== false : prefs[key] === true,
  ).length;
  return { on, total: NOTIFICATION_TOGGLE_KEYS.length };
}
