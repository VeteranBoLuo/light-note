import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import BrowserPushPrompt from './BrowserPushPrompt.vue';
const mocks = vi.hoisted(() => ({ user: null as any, push: null as any }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/utils/authStorage', () => ({ isAdminLoginPreview: () => false }));
vi.mock('@/composables/useBrowserPush', () => ({ useBrowserPush: () => mocks.push }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } }) }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
let app: ReturnType<typeof createApp>, host: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('Notification', { permission: 'default' });
  mocks.user = reactive({ id: 'u1', role: 'user', adminContext: null });
  mocks.push = {
    state: ref('pending'),
    busy: ref(false),
    enabled: ref(false),
    preferred: ref(true),
    refresh: vi.fn(),
    setEnabled: vi.fn(async () => {
      mocks.push.state.value = 'on';
      mocks.push.enabled.value = true;
    }),
  };
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});
function mount() {
  app = createApp(BrowserPushPrompt);
  app.mount(host);
}
it('requests permission only after clicking allow, then disappears on success', async () => {
  mount();
  expect(mocks.push.setEnabled).not.toHaveBeenCalled();
  host.querySelector('button')!.click();
  await nextTick();
  await nextTick();
  expect(mocks.push.setEnabled).toHaveBeenCalledWith(true, 'zh-CN');
  expect(host.querySelector('aside')).toBeNull();
});
it('dismissal is remembered per account without disabling notifications', async () => {
  mount();
  host.querySelectorAll('button')[1].click();
  await nextTick();
  expect(localStorage.getItem('light-note:push-prompt-dismissed:u1')).toBe('true');
  expect(mocks.push.preferred.value).toBe(true);
  expect(host.querySelector('aside')).toBeNull();
  mocks.user.id = 'u2';
  await nextTick();
  expect(host.querySelector('aside')).not.toBeNull();
});
it.each(['denied', 'on', 'unavailable', 'unsupported', 'off'])('does not prompt in %s state', (state) => {
  mocks.push.state.value = state;
  mount();
  expect(host.querySelector('aside')).toBeNull();
});
it('does not prompt users who disabled push or administrators', async () => {
  mocks.push.preferred.value = false;
  mount();
  expect(host.querySelector('aside')).toBeNull();
  mocks.push.preferred.value = true;
  mocks.user.adminContext = {};
  await nextTick();
  expect(host.querySelector('aside')).toBeNull();
});
it('shows a retry after subscription failure', async () => {
  mocks.push.setEnabled.mockImplementation(async () => {
    mocks.push.state.value = 'error';
  });
  mount();
  host.querySelector('button')!.click();
  await nextTick();
  await nextTick();
  expect(host.textContent).toContain('browserPush.state.error');
  expect(host.querySelector('aside')).not.toBeNull();
});
