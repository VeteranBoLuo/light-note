import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';

const user = reactive({
  id: 'owner',
  role: 'user',
  adminContext: null as unknown,
  preferences: {} as Record<string, unknown>,
});
const growth = ref({ features: { manor: true } });
const save = vi.hoisted(() => vi.fn());
vi.mock('@/store', () => ({ useUserStore: () => user, bookmarkStore: () => ({ isMobileDevice: true }) }));
vi.mock('@/composables/useGrowth', () => ({ useGrowth: () => ({ growth }) }));
vi.mock('@/utils/browserPushPlatform', () => ({ useBrowserPushDesktop: () => ref(false) }));
vi.mock('@/api/userApi.ts', () => ({ default: { updateUserInfo: save } }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn(async () => ({ status: 200 })) }));
vi.mock('@/i18n', () => ({ setLocale: vi.fn() }));
vi.mock('@/components/notification/NativeNotificationStatus.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/notification/BrowserPushSettings.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/notification/BrowserPushQuietHoursSettings.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/communityChat/CommunityChatNotificationSettingsPanel.vue', () => ({
  default: { render: () => null },
}));
import SettingsNotificationSection from './SettingsNotificationSection.vue';
import ManorReminderPreferences from '@/components/manor/ManorReminderPreferences.vue';
let app: App | undefined,
  root: HTMLElement,
  owner = 0;
const mount = (locale = 'zh-CN', mirror = false) => {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp({
    render: () =>
      h('div', [
        h(SettingsNotificationSection),
        mirror ? h('div', { 'data-testid': 'inside-manor' }, [h(ManorReminderPreferences, { appearance: 'game' })]) : null,
      ]),
  });
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
  app.mount(root);
};
const toggle = (key: 'notifyManor' | 'notifyManorDigest' | 'notifyManorWater' | 'manorEntryDot', locale = 'zh-CN') =>
  root.querySelector<HTMLElement>(`[role="switch"][aria-label="${(locale === 'en-US' ? en : zh).settings[key]}"]`)!;
const click = async (element: HTMLElement) => {
  element.click();
  await nextTick();
  await vi.waitFor(() => expect(save).toHaveBeenCalled());
};
beforeEach(() => {
  user.id = `owner-${++owner}`;
  user.role = 'user';
  user.adminContext = null;
  user.preferences = { lang: 'zh-CN', theme: 'night' };
  growth.value = { features: { manor: true } };
  save.mockReset();
  save.mockResolvedValue({ status: 200 });
  localStorage.clear();
});
afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.unstubAllGlobals();
});

describe('庄园通知复用真实设置字段与保存队列', () => {
  it('默认关闭，只显示总开关；主动开启后才展开两种提醒并保存到账号', async () => {
    mount();
    expect(toggle('notifyManor').getAttribute('aria-checked')).toBe('false');
    expect(toggle('manorEntryDot').getAttribute('aria-checked')).toBe('true');
    expect(toggle('notifyManorDigest')).toBeNull();
    expect(toggle('notifyManorWater')).toBeNull();
    await click(toggle('notifyManor'));
    await vi.waitFor(() => expect(toggle('notifyManorWater').getAttribute('aria-disabled')).toBeNull());
    expect(toggle('notifyManorDigest').getAttribute('aria-checked')).toBe('true');
    expect(toggle('notifyManorWater').getAttribute('aria-checked')).toBe('true');
    expect(user.preferences.notifyManor).toBe(true);
    const persisted = JSON.parse(save.mock.calls.at(-1)![0].preferences);
    expect(persisted).toMatchObject({ notifyManor: true, lang: 'zh-CN', theme: 'night' });
  });
  it('庄园内外共用账号偏好；红点关闭后仍可独立开启通知', async () => {
    mount('zh-CN', true);
    await click(toggle('manorEntryDot'));
    await vi.waitFor(() => expect(user.preferences.manorEntryDot).toBe(false));
    await vi.waitFor(() => expect(toggle('manorEntryDot').getAttribute('aria-disabled')).toBeNull());
    const inside = root.querySelector('[data-testid="inside-manor"]')!;
    expect(inside.querySelector(`[aria-label="${zh.settings.manorEntryDot}"]`)?.getAttribute('aria-checked')).toBe(
      'false',
    );
    save.mockClear();
    await click(toggle('notifyManor'));
    await vi.waitFor(() => expect(user.preferences.notifyManor).toBe(true));
    expect(inside.querySelector(`[aria-label="${zh.settings.notifyManorWater}"]`)?.getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(toggle('manorEntryDot').getAttribute('aria-checked')).toBe('false');
    expect(JSON.parse(save.mock.calls.at(-1)![0].preferences)).toMatchObject({
      manorEntryDot: false,
      notifyManor: true,
    });
    expect(save).toHaveBeenCalledOnce();
  });
  it('保留已明确开启的选择，关闭后收起子项，再开启恢复各自的值', async () => {
    user.preferences.notifyManor = true;
    mount();
    expect(toggle('notifyManor').getAttribute('aria-checked')).toBe('true');
    await click(toggle('notifyManorDigest'));
    await vi.waitFor(() => expect(user.preferences.notifyManorDigest).toBe(false));
    save.mockClear();
    await click(toggle('notifyManor'));
    expect(toggle('notifyManorDigest')).toBeNull();
    expect(toggle('notifyManorWater')).toBeNull();
    expect(user.preferences.notifyManorDigest).toBe(false);
    await vi.waitFor(() => expect(toggle('notifyManor').getAttribute('aria-disabled')).toBeNull());
    save.mockClear();
    await click(toggle('notifyManor'));
    await vi.waitFor(() => expect(toggle('notifyManorWater').getAttribute('aria-disabled')).toBeNull());
    expect(toggle('notifyManorDigest').getAttribute('aria-checked')).toBe('false');
    expect(toggle('notifyManorWater').getAttribute('aria-checked')).toBe('true');
    const persisted = JSON.parse(save.mock.calls.at(-1)![0].preferences);
    expect(persisted).toMatchObject({ notifyManor: true, notifyManorDigest: false, theme: 'night' });
  });
  it('开启保存中禁用子项，失败恢复关闭并收起子项，重试后展开', async () => {
    let reject!: (reason: Error) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    mount();
    toggle('notifyManor').click();
    await nextTick();
    expect(toggle('notifyManorDigest').getAttribute('aria-disabled')).toBe('true');
    await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
    reject(new Error('offline'));
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
    expect(toggle('notifyManor').getAttribute('aria-checked')).toBe('false');
    expect(toggle('notifyManorWater')).toBeNull();
    const retry = root.querySelector<HTMLButtonElement>('[role="alert"] button')!;
    retry.click();
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).toBeNull());
    expect(user.preferences.notifyManor).toBe(true);
    expect(toggle('notifyManorWater').getAttribute('aria-disabled')).toBeNull();
  });
  it('关闭保存失败时恢复开启和已保存的子项选择', async () => {
    user.preferences = { notifyManor: true, notifyManorDigest: false };
    save.mockRejectedValueOnce(new Error('offline'));
    mount();
    await click(toggle('notifyManor'));
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
    expect(toggle('notifyManor').getAttribute('aria-checked')).toBe('true');
    expect(toggle('notifyManorDigest').getAttribute('aria-checked')).toBe('false');
    expect(toggle('notifyManorWater').getAttribute('aria-checked')).toBe('true');
  });
  it('英文和不支持场景的浏览器仍可管理，关闭站内通知保留偏好', async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    user.preferences = { lang: 'en-US', notifyManor: true, notificationsInApp: false, notifyManorWater: false };
    mount('en-US');
    expect(toggle('notifyManor', 'en-US')).not.toBeNull();
    expect(toggle('notifyManorWater', 'en-US').getAttribute('aria-checked')).toBe('false');
    expect(toggle('notifyManorWater', 'en-US').getAttribute('aria-disabled')).toBeNull();
  });
  it.each(['guest', 'admin', 'closed'])('%s 不显示庄园卡', (state) => {
    if (state === 'guest') user.role = 'visitor';
    if (state === 'admin') user.adminContext = { id: 'preview' };
    if (state === 'closed') growth.value.features.manor = false;
    mount();
    expect(root.textContent).not.toContain(zh.settings.manorTitle);
  });
});
