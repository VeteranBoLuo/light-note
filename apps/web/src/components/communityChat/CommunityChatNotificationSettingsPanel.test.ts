import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  refreshUnread: vi.fn(),
  refreshCommunityUnread: vi.fn(),
  resetCommunityUnread: vi.fn(),
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatNotificationSettings: mocks.getSettings,
  updateCommunityChatNotificationSettings: mocks.updateSettings,
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: mocks.error },
}));

vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ refreshUnread: mocks.refreshUnread }),
}));

vi.mock('@/composables/useCommunityChatUnread', () => ({
  useCommunityChatUnread: () => ({
    refresh: mocks.refreshCommunityUnread,
    reset: mocks.resetCommunityUnread,
  }),
}));

const { default: CommunityChatNotificationSettingsPanel } =
  await import('./CommunityChatNotificationSettingsPanel.vue');

let cleanup: (() => void) | undefined;

const settings = (enabled: boolean, level = 'mentions') => ({
  enabled,
  level,
  defaultEnabled: true,
  replyCountsAsMention: true,
  channels: {
    inApp: { available: true, enabled },
    browser: { available: false, enabled: false },
    android: { available: false, enabled: false },
  },
});

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

async function mountPanel(compact = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(CommunityChatNotificationSettingsPanel, { compact });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.component('OriginalIcon', { template: '<span aria-hidden="true" />' });
  app.mount(host);
  await flushAsync();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSettings.mockResolvedValue({ data: settings(true) });
  mocks.updateSettings.mockImplementation(async (payload) => ({ data: settings(payload.enabled, payload.level) }));
  mocks.refreshUnread.mockResolvedValue(undefined);
  mocks.refreshCommunityUnread.mockResolvedValue(null);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('CommunityChatNotificationSettingsPanel', () => {
  it('首次进入默认开启管理员和提及档的站内提醒', async () => {
    const host = await mountPanel();

    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain(zhCN.communityChat.notifications.levelMentions);
    expect(host.textContent).toContain(zhCN.communityChat.notifications.levelMentionsDescription);
    expect(host.querySelector('.community-notification-settings__thumb')).toBeNull();
    expect(host.textContent).toContain(zhCN.communityChat.notifications.levelMentionsOnly);
    expect(host.querySelectorAll('.community-notification-settings__dot')).toHaveLength(4);
    expect(host.querySelectorAll('.community-notification-settings__option.is-current')).toHaveLength(1);
    expect(host.querySelector('.community-notification-settings__channels span')?.classList.contains('is-active')).toBe(
      true,
    );
  });

  it('关闭时明确说明聊天室角标与定向通知都不显示，但仍可主动查看聊天历史', async () => {
    mocks.getSettings.mockResolvedValueOnce({ data: settings(false) });
    const host = await mountPanel();

    expect(host.textContent).toContain(zhCN.communityChat.notifications.disabledLabel);
    expect(host.textContent).toContain('聊天室角标和回复 / 提及通知都会关闭');
    expect(host.textContent).toContain('公共聊天历史仍可在聊天室内主动查看');
    expect(host.textContent).toContain('PC / 移动端通知中心：不发送');
    expect(host.textContent).not.toContain('PC / 移动端通知中心：回复或提及');
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('.community-notification-settings__channels span')?.classList.contains('is-active')).toBe(
      false,
    );
  });

  it('用户主动关闭后保存选择并立即展示关闭语义', async () => {
    const host = await mountPanel();

    (host.querySelector('[role="switch"]') as HTMLElement | null)?.click();
    await flushAsync();

    expect(mocks.updateSettings).toHaveBeenCalledWith({ enabled: false, level: 'mentions' });
    expect(mocks.refreshUnread).toHaveBeenCalledTimes(1);
    expect(mocks.refreshCommunityUnread).toHaveBeenCalledTimes(1);
    expect(mocks.resetCommunityUnread).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(zhCN.communityChat.notifications.disabledLabel);
    expect(host.querySelector('.community-notification-settings__channels span')?.classList.contains('is-active')).toBe(
      false,
    );
  });

  it('可单独选择仅提及档并提交新的四档枚举值', async () => {
    const host = await mountPanel();
    const mentionsOnly = Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]')).find((item) =>
      item.textContent?.includes(zhCN.communityChat.notifications.levelMentionsOnly),
    );
    mentionsOnly?.click();
    await flushAsync();

    expect(mocks.updateSettings).toHaveBeenCalledWith({ enabled: true, level: 'mentions_only' });
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      zhCN.communityChat.notifications.levelMentionsOnly,
    );
  });

  it('选择全部消息时明确区分角标范围与通知中心投递范围', async () => {
    mocks.getSettings.mockResolvedValueOnce({ data: settings(true, 'all') });
    const host = await mountPanel(true);

    expect(host.textContent).toContain('先选择聊天室角标范围');
    expect(host.textContent).toContain('普通聊天不会进入通知中心');
    expect(host.textContent).toContain('全部消息角标');
    expect(host.textContent).toContain('角标：任何新消息');
    expect(host.textContent).toContain('通知中心：只接收该档允许的回复或提及');
    expect(host.textContent).toContain('系统通知：不发送');
  });

  it('紧凑模式把角标、通知中心与系统通知合并为一条提醒结果栏', async () => {
    const host = await mountPanel(true);

    expect(host.querySelector('.community-notification-settings')?.classList.contains('is-compact')).toBe(true);
    expect(host.querySelector('.community-notification-settings__compact-results')).not.toBeNull();
    expect(host.querySelectorAll('.community-notification-settings__compact-result')).toHaveLength(3);
    expect(host.querySelector('.community-notification-settings__compact-summary')).toBeNull();
    expect(host.querySelector('.community-notification-settings__compact-meta')).toBeNull();
    expect(host.querySelector('.community-notification-settings__explanation')).toBeNull();
    expect(host.querySelector('.community-notification-settings__channels')).toBeNull();
    expect(host.querySelector('.community-notification-settings__hint')).toBeNull();
    expect(host.textContent).toContain(zhCN.communityChat.notifications.compactDescription);
    expect(host.textContent).toContain(zhCN.communityChat.notifications.levelMentionsDescription);
  });

  it('紧凑模式关闭总开关后明确显示通知中心不发送', async () => {
    mocks.getSettings.mockResolvedValueOnce({ data: settings(false) });
    const host = await mountPanel(true);

    expect(host.textContent).toContain('角标：已关闭');
    expect(host.textContent).toContain('通知中心：不发送');
    expect(host.textContent).not.toContain('通知中心：只接收该档允许的回复或提及');
  });
});
