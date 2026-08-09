import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatNotificationSettings: mocks.getSettings,
  updateCommunityChatNotificationSettings: mocks.updateSettings,
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: mocks.error },
}));

const { default: CommunityChatNotificationSettingsPanel } =
  await import('./CommunityChatNotificationSettingsPanel.vue');

let cleanup: (() => void) | undefined;

const settings = (enabled: boolean) => ({
  enabled,
  level: 'mentions',
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

async function mountPanel() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(CommunityChatNotificationSettingsPanel);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
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
  mocks.updateSettings.mockImplementation(async (payload) => ({ data: settings(payload.enabled) }));
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('CommunityChatNotificationSettingsPanel', () => {
  it('首次进入默认开启管理员与提及档的站内提醒', async () => {
    const host = await mountPanel();

    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain(zhCN.communityChat.notifications.levelMentions);
    expect(host.textContent).toContain(zhCN.communityChat.notifications.levelMentionsDescription);
    expect(host.querySelector('.community-notification-settings__channels span')?.classList.contains('is-active')).toBe(
      true,
    );
  });

  it('关闭时明确说明不生成任何提醒，但仍保留聊天室未读角标', async () => {
    mocks.getSettings.mockResolvedValueOnce({ data: settings(false) });
    const host = await mountPanel();

    expect(host.textContent).toContain(zhCN.communityChat.notifications.disabledLabel);
    expect(host.textContent).toContain('管理员消息、提及你的消息、回复和普通消息都不会生成提醒');
    expect(host.textContent).toContain('未读角标只表示有新消息');
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
    expect(host.textContent).toContain(zhCN.communityChat.notifications.disabledLabel);
    expect(host.querySelector('.community-notification-settings__channels span')?.classList.contains('is-active')).toBe(
      false,
    );
  });
});
