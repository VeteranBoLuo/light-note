import { beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import Panel from './CommunitySettingsPanel.vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), operation: vi.fn(), write: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'a', role: 'user' }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/api/communityFeedApi', () => ({ feedGet: mocks.get, feedOperation: mocks.operation }));
vi.mock('./CommunityPreferencesPanel.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/communityChat/CommunityChatNotificationSettingsPanel.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BSwitch.vue', () => ({
  default: {
    props: ['checked', 'disabled'],
    emits: ['change'],
    template: `<button :disabled="disabled" :aria-pressed="checked" @click="$emit('change', !checked)">toggle</button>`,
  },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
const flush = async () => {
  for (let n = 0; n < 8; n++) await nextTick();
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (path: string) =>
    path.includes('capabilities')
      ? { feedEnabled: true }
      : { revision: 4, enabled: true, commentNotificationsEnabled: true, mentionNotificationsEnabled: true },
  );
  mocks.operation.mockReturnValue(mocks.write);
  mocks.write.mockResolvedValue({ revision: 5 });
});
it('saves only the changed private preference and advances revision', async () => {
  const host = document.createElement('div');
  const app = createApp(Panel);
  app.mount(host);
  await flush();
  host.querySelector('button')!.click();
  await flush();
  expect(mocks.operation).toHaveBeenCalledWith(
    'profiles/options/me',
    { expectedRevision: 4, commentNotificationsEnabled: false },
    'put',
  );
  expect(host.querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
  host.querySelectorAll('button')[1].click();
  await flush();
  expect(mocks.operation).toHaveBeenLastCalledWith(
    'profiles/options/me',
    { expectedRevision: 5, mentionNotificationsEnabled: false },
    'put',
  );
  app.unmount();
});
it('keeps the saved value and disables further writes after failure', async () => {
  mocks.write.mockRejectedValue(new Error('offline'));
  const host = document.createElement('div');
  const app = createApp(Panel);
  app.mount(host);
  await flush();
  host.querySelector('button')!.click();
  await flush();
  expect(host.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('button')!.disabled).toBe(true);
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  app.unmount();
});
