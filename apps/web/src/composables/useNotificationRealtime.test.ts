import { createApp, h, reactive, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ create: vi.fn(), stop: vi.fn(), refresh: vi.fn() }));
const user = reactive({ id: 'a', role: 'user' });
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('@/utils/authStorage', () => ({ getAdminContextToken: () => '' }));
vi.mock('@/utils/notificationRealtime', () => ({ createNotificationRealtime: state.create }));
vi.mock('@/composables/useNotification', () => ({ useNotification: () => ({ refreshUnread: state.refresh }) }));
import { useNotificationRealtime } from './useNotificationRealtime';

it('shares one connection and unread refresh across bells and cleans up on account switch', async () => {
  state.create.mockReturnValue(state.stop);
  const first = vi.fn(),
    second = vi.fn();
  const apps = [first, second].map((listener) => {
    const app = createApp({
      setup() {
        useNotificationRealtime(listener);
        return () => h('div');
      },
    });
    app.mount(document.createElement('div'));
    return app;
  });
  expect(state.create).toHaveBeenCalledOnce();
  state.create.mock.calls[0][0].onChange();
  expect(state.refresh).toHaveBeenCalledOnce();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  user.id = 'b';
  await nextTick();
  expect(state.stop).toHaveBeenCalledOnce();
  expect(state.create).toHaveBeenCalledTimes(2);
  apps[0].unmount();
  expect(state.stop).toHaveBeenCalledOnce();
  user.role = 'visitor';
  await nextTick();
  expect(state.stop).toHaveBeenCalledTimes(2);
  apps[1].unmount();
});
