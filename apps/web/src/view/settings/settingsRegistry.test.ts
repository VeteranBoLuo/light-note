import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TOGGLE_KEYS,
  SETTINGS_GROUP_ORDER,
  SETTINGS_SECTION_ANCHOR,
  countEnabledNotifications,
  groupSettingsSections,
  parseSettingsSection,
  visibleSettingsSections,
  type SettingsEnv,
} from './settingsRegistry';

const LOGGED_IN: SettingsEnv = { isGuest: false };
const GUEST: SettingsEnv = { isGuest: true };

describe('visibleSettingsSections', () => {
  it('登录用户能看到六个分类', () => {
    expect(visibleSettingsSections(LOGGED_IN).map((s) => s.id)).toEqual([
      'appearance',
      'general',
      'notification',
      'ai',
      'account',
      'privacy',
    ]);
  });

  it('目录里不含安装项:移动端「我的」已有安装入口,设置里不重复', () => {
    expect(visibleSettingsSections(LOGGED_IN).map((s) => String(s.id))).not.toContain('install');
    expect(visibleSettingsSections(GUEST).map((s) => String(s.id))).not.toContain('install');
  });

  it('游客不出现「账号与安全」，其他偏好照常可见', () => {
    const ids = visibleSettingsSections(GUEST).map((s) => s.id);
    expect(ids).not.toContain('account');
    expect(ids).toContain('appearance');
    expect(ids).toContain('privacy');
  });

  it('每个分类都有对应的 DOM 锚点 id，桌面锚点/滚动定位才不会指空', () => {
    for (const section of visibleSettingsSections(LOGGED_IN)) {
      expect(SETTINGS_SECTION_ANCHOR[section.id]).toMatch(/^set-/);
    }
  });
});

describe('parseSettingsSection', () => {
  it('合法 section 原样返回', () => {
    expect(parseSettingsSection('notification', LOGGED_IN)).toBe('notification');
  });

  it('未知值、空值、数组参数都回落到目录页', () => {
    expect(parseSettingsSection('shortcuts', LOGGED_IN)).toBeNull();
    expect(parseSettingsSection('', LOGGED_IN)).toBeNull();
    expect(parseSettingsSection(undefined, LOGGED_IN)).toBeNull();
    expect(parseSettingsSection(null, LOGGED_IN)).toBeNull();
    expect(parseSettingsSection(['ai', 'account'], LOGGED_IN)).toBe('ai');
  });

  it('不在目录里的 install 不能靠深链接进入移动端子页', () => {
    expect(parseSettingsSection('install', LOGGED_IN)).toBeNull();
  });

  it('当前环境不可见的分类不能靠深链接进入', () => {
    expect(parseSettingsSection('account', GUEST)).toBeNull();
  });
});

describe('groupSettingsSections', () => {
  it('按固定分组顺序切分', () => {
    const grouped = groupSettingsSections(visibleSettingsSections(LOGGED_IN));
    expect(grouped.map((g) => g.group)).toEqual(SETTINGS_GROUP_ORDER);
    expect(grouped[0].items.map((i) => i.id)).toEqual(['appearance', 'general', 'notification', 'ai']);
    expect(grouped[1].items.map((i) => i.id)).toEqual(['account']);
  });

  it('分组内所有项都不可见时整组不渲染', () => {
    // 游客：「账号与设备」只剩账号一项且被隐藏（安装项已不在目录），不该留一个空标题
    const grouped = groupSettingsSections(visibleSettingsSections(GUEST));
    expect(grouped.map((g) => g.group)).toEqual(['preferences', 'rules']);
  });
});

describe('countEnabledNotifications', () => {
  it('总数取自清单长度，不写死', () => {
    expect(countEnabledNotifications({}).total).toBe(NOTIFICATION_TOGGLE_KEYS.length);
  });

  it('空偏好按各项默认值计数（浏览器通知默认关）', () => {
    const { on, total } = countEnabledNotifications({});
    expect(on).toBe(total - 1);
  });

  it('显式关掉的项不计入', () => {
    expect(countEnabledNotifications({ notificationsEmail: false, weeklyReport: false }).on).toBe(
      NOTIFICATION_TOGGLE_KEYS.length - 3,
    );
  });

  it('打开浏览器通知后可以全开', () => {
    expect(countEnabledNotifications({ notificationsBrowser: true }).on).toBe(NOTIFICATION_TOGGLE_KEYS.length);
  });

  it('免打扰不参与计数：它开着是「少收通知」，混进来会把含义算反', () => {
    expect(countEnabledNotifications({ notificationsDnd: true })).toEqual(countEnabledNotifications({}));
  });

  it('偏好为空对象/undefined 时不抛错', () => {
    expect(() => countEnabledNotifications(undefined)).not.toThrow();
    expect(countEnabledNotifications(null).total).toBe(NOTIFICATION_TOGGLE_KEYS.length);
  });
});
