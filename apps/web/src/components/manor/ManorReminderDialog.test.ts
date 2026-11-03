import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';

const user = reactive({ id: 'owner', role: 'user', adminContext: null, preferences: {} as Record<string, unknown> });
const save = vi.hoisted(() => vi.fn());
vi.mock('@/store', () => ({
  useUserStore: () => user,
  bookmarkStore: () => ({ isMobile: false, isMobileDevice: false }),
}));
vi.mock('@/api/userApi.ts', () => ({ default: { updateUserInfo: save } }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn(async () => ({ status: 200 })) }));
vi.mock('@/i18n', () => ({ setLocale: vi.fn() }));
import ManorReminderDialog from './ManorReminderDialog.vue';

let app: App | undefined,
  owner = 0;
const open = ref(true);
const closed = vi.fn(() => {
  open.value = false;
});
const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(ManorReminderDialog, { open: open.value, onClose: closed }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
};
const toggle = (key: 'notifyManor' | 'notifyManorDigest' | 'notifyManorWater') =>
  document.querySelector<HTMLElement>(`[role="switch"][aria-label="${zh.settings[key]}"]`)!;
beforeEach(() => {
  user.id = `game-reminders-${++owner}`;
  user.preferences = {};
  open.value = true;
  save.mockReset().mockResolvedValue({ status: 200 });
  closed.mockClear();
  localStorage.clear();
});
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});

describe('庄园游戏提醒弹窗', () => {
  it('保存中仍可回到庄园；关闭后继续保存，重新打开保留内容选择', async () => {
    let finish!: (value: { status: number }) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    toggle('notifyManor').click();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(toggle('notifyManorWater').getAttribute('aria-disabled')).toBe('true');
    const back = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === zh.manor.reminders.return,
    )!;
    back.click();
    await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    finish({ status: 200 });
    open.value = true;
    await nextTick();
    await vi.waitFor(() => expect(toggle('notifyManorWater').getAttribute('aria-disabled')).toBeNull());
    expect(toggle('notifyManor').getAttribute('aria-checked')).toBe('true');
    expect(toggle('notifyManorDigest').getAttribute('aria-checked')).toBe('true');
    expect(user.preferences.notifyManor).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });
  it('站内通知关闭时说明接收条件，并保留可独立调整的通知选择', async () => {
    user.preferences = { notifyManor: true, notificationsInApp: false };
    mount();
    expect(document.querySelector('[role="status"]')?.textContent).toBe(zh.manor.reminders.inAppOff);
    expect(toggle('notifyManorWater').getAttribute('aria-disabled')).toBeNull();
    toggle('notifyManor').click();
    await nextTick();
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(toggle('notifyManorWater')).toBeNull();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  });
});
