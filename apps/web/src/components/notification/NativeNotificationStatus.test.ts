import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import NativeNotificationStatus from './NativeNotificationStatus.vue';
import {
  updateNativeNotificationStatus,
  updateNativeNotificationOnline,
  updateNativeNotificationDevice,
} from '@/composables/useNativeNotificationStatus';
import zh from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ user: null as any, settings: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/utils/authStorage', () => ({ isAdminLoginPreview: () => false }));
vi.mock('@/utils/nativeNotificationSync', async (original) => ({
  ...(await original<typeof import('@/utils/nativeNotificationSync')>()),
  nativeNotificationMessage: mocks.settings,
}));
let app: ReturnType<typeof createApp>, host: HTMLElement;
beforeEach(() => {
  mocks.user = reactive({ id: 'alice', role: 'user', preferences: {}, adminContext: null });
  window.LightNoteAndroid = { postMessage: vi.fn() };
  updateNativeNotificationStatus('connected', 'alice');
  updateNativeNotificationOnline(true);
  updateNativeNotificationDevice(null, 'alice');
  mocks.settings.mockReset().mockResolvedValue({ ok: true });
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host.remove();
  delete window.LightNoteAndroid;
});
function mount() {
  app = createApp(NativeNotificationStatus);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
}
it.each([
  ['deviceLimit', '通知设备数量已满', '清理不再使用的设备'],
  ['accountRequired', '请重新确认登录', '重新登录后再检查'],
  ['serviceDisabled', '后台通知服务未开启', '联系管理员检查服务配置'],
  ['storageUnavailable', '通知连接信息无法保存', '检查存储空间后重试'],
] as const)('explains %s while keeping system permission independent', (state, title, description) => {
  updateNativeNotificationStatus(state, 'alice');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true }, 'alice');
  mount();
  expect(host.textContent).toContain(title);
  expect(host.textContent).toContain(description);
  expect(host.textContent).not.toContain('正在重新连接');
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  expect(host.querySelector('section')?.classList.contains('is-error')).toBe(true);
  expect(host.textContent).toContain('重新检查');
});
it('shows confirmed status, offline state and local notification preference independently', async () => {
  mount();
  expect(host.textContent).toContain('通知已连接');
  updateNativeNotificationOnline(false);
  await nextTick();
  expect(host.textContent).toContain('等待网络恢复');
  expect(host.textContent).not.toContain('通知已连接');
  mocks.user.preferences.notificationsInApp = false;
  await nextTick();
  expect(host.textContent).toContain('站内通知已关闭');
});
it('offers a real retry action after failures', async () => {
  const retry = vi.fn();
  window.addEventListener('light-note:native-notification-retry', retry);
  updateNativeNotificationStatus('retrying', 'alice');
  mount();
  retry.mockClear();
  host.querySelector('button')!.click();
  expect(retry).toHaveBeenCalledOnce();
  updateNativeNotificationStatus('connected', 'alice');
  await nextTick();
  expect(host.querySelector('button')).toBeNull();
  window.removeEventListener('light-note:native-notification-retry', retry);
});
it('uses system permission for the switch even when the connection is pending or offline', async () => {
  updateNativeNotificationStatus('connecting', 'alice');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true }, 'alice');
  mount();
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain('正在连接通知');
  updateNativeNotificationOnline(false);
  updateNativeNotificationDevice({ systemEnabled: false, settingsAvailable: true }, 'alice');
  await nextTick();
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
  expect(host.textContent).toContain('通知未开启');
  expect(host.textContent).not.toContain('等待网络恢复');
});
it('hides only explicitly unsupported devices and preserves retry for temporary or unknown failures', async () => {
  updateNativeNotificationStatus('unavailable', 'alice');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true, pushSupport: 'unsupported' }, 'alice');
  mount();
  expect(host.querySelector('section')).toBeNull();
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true, pushSupport: 'unknown' }, 'alice');
  await nextTick();
  expect(host.querySelector('section')).not.toBeNull();
  expect(host.querySelector('button')?.textContent).toContain('重新检查');
  updateNativeNotificationStatus('retrying', 'alice');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true, pushSupport: 'supported' }, 'alice');
  await nextTick();
  expect(host.querySelector('button')?.textContent).toContain('重新检查');
  updateNativeNotificationDevice({ systemEnabled: false, settingsAvailable: true, pushSupport: 'supported' }, 'alice');
  await nextTick();
  expect(host.querySelector('section')).not.toBeNull();
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
});
it('does not apply an unsupported capability from another account', () => {
  updateNativeNotificationDevice({ systemEnabled: false, settingsAvailable: true, pushSupport: 'unsupported' }, 'bob');
  mount();
  expect(host.querySelector('section')).not.toBeNull();
});
it('opens settings without optimistically changing the system switch, then reflects the next check', async () => {
  updateNativeNotificationStatus('disabled', 'alice');
  updateNativeNotificationDevice({ systemEnabled: false, settingsAvailable: true }, 'alice');
  let finish!: (reply: { ok: boolean }) => void;
  mocks.settings.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  const toggle = host.querySelector('[role="switch"]') as HTMLElement;
  toggle.click();
  toggle.click();
  expect(mocks.settings).toHaveBeenCalledOnce();
  expect(mocks.settings).toHaveBeenCalledWith({ action: 'settings', owner: 'alice' });
  await nextTick();
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(toggle.getAttribute('aria-disabled')).toBe('true');
  finish({ ok: true });
  await vi.waitFor(() => expect(toggle.getAttribute('aria-disabled')).toBeNull());
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true }, 'alice');
  updateNativeNotificationStatus('connected', 'alice');
  await nextTick();
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain('通知已连接');
});
it('provides manual instructions if opening settings fails and discards errors after an account switch', async () => {
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true }, 'alice');
  mocks.settings.mockResolvedValueOnce({ ok: false });
  mount();
  (host.querySelector('[role="switch"]') as HTMLElement).click();
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('暂时无法打开系统设置'));
  let finish!: (reply: { ok: boolean }) => void;
  mocks.settings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  (host.querySelector('[role="switch"]') as HTMLElement).click();
  mocks.user.id = 'bob';
  updateNativeNotificationStatus('connected', 'bob');
  updateNativeNotificationDevice({ systemEnabled: false, settingsAvailable: true }, 'bob');
  finish({ ok: false });
  await nextTick();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
});
it('keeps old shells and unknown permissions out of the system switch', async () => {
  updateNativeNotificationDevice({ systemEnabled: null, settingsAvailable: false }, 'alice');
  updateNativeNotificationStatus('disabled', 'alice');
  mount();
  expect(host.querySelector('[role="switch"]')).toBeNull();
  expect(host.querySelector('button')?.textContent).toContain('重新检查');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true }, 'bob');
  await nextTick();
  expect(host.querySelector('[role="switch"]')).toBeNull();
});
it('distinguishes system permission from the separate Debug-build consent', () => {
  updateNativeNotificationStatus('disabled', 'alice');
  updateNativeNotificationDevice({ systemEnabled: true, settingsAvailable: true }, 'alice');
  mount();
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain('手机已允许通知');
  expect(host.textContent).toContain('按轻笺提示确认');
});
it.each(['web', 'guest', 'admin', 'other-owner', 'pending-auth'])(
  'does not expose connection state in %s context',
  (mode) => {
    if (mode === 'web') delete window.LightNoteAndroid;
    if (mode === 'guest') mocks.user.role = 'visitor';
    if (mode === 'admin') mocks.user.adminContext = {};
    if (mode === 'other-owner') mocks.user.id = 'bob';
    if (mode === 'pending-auth') updateNativeNotificationStatus('idle', '');
    mount();
    expect(host.querySelector('section')).toBeNull();
  },
);
