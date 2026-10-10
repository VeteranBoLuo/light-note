import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import NativeNotificationStatus from './NativeNotificationStatus.vue';
import {
  updateNativeNotificationStatus,
  updateNativeNotificationOnline,
} from '@/composables/useNativeNotificationStatus';
import zh from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ user: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/utils/authStorage', () => ({ isAdminLoginPreview: () => false }));
let app: ReturnType<typeof createApp>, host: HTMLElement;
beforeEach(() => {
  mocks.user = reactive({ id: 'alice', role: 'user', preferences: {}, adminContext: null });
  window.LightNoteAndroid = { postMessage: vi.fn() };
  updateNativeNotificationStatus('connected', 'alice');
  updateNativeNotificationOnline(true);
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
  host.querySelector('button')!.click();
  expect(retry).toHaveBeenCalledOnce();
  updateNativeNotificationStatus('connected', 'alice');
  await nextTick();
  expect(host.querySelector('button')).toBeNull();
  window.removeEventListener('light-note:native-notification-retry', retry);
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
