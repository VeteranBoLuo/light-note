import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, ref } from 'vue';
import { useNativeNotificationSync } from './useNativeNotificationSync';
import {
  nativeNotificationStatus,
  nativeNotificationOnline,
  retryNativeNotifications,
} from './useNativeNotificationStatus';
const mocks = vi.hoisted(() => ({ api: vi.fn(), bridge: vi.fn(), refresh: vi.fn(async () => {}) }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.api }));
vi.mock('./useNotification', () => ({ useNotification: () => ({ refreshUnread: mocks.refresh }) }));
vi.mock('@/utils/nativeNotificationSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/nativeNotificationSync')>()),
  nativeNotificationMessage: mocks.bridge,
}));
let app: ReturnType<typeof createApp>;
let host: HTMLElement;
const owner = ref<string | null>('alice');
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
function mount() {
  app = createApp({
    setup() {
      useNativeNotificationSync(owner, vi.fn());
      return () => null;
    },
  });
  app.mount(host);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  window.LightNoteAndroid = { postMessage: vi.fn() };
  owner.value = 'alice';
  host = document.createElement('div');
  document.body.append(host);
  mocks.bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: 'token' });
  mocks.api.mockImplementation(async (url: string) => ({
    status: 200,
    data: url.endsWith('/subscribe')
      ? { id: 'device', generation: 'g', userId: owner.value }
      : url.endsWith('/sync')
        ? { owner: owner.value, since: '', items: [], cursor: null }
        : null,
  }));
});
afterEach(() => {
  app?.unmount();
  host.remove();
  delete window.LightNoteAndroid;
  vi.useRealTimers();
});
describe('foreground notification connection scheduling', () => {
  it('picks up a delayed token within a second without accelerating notification API polling', async () => {
    mocks.bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: '' });
    mount();
    await flush();
    expect(nativeNotificationStatus.value.state).toBe('connecting');
    mocks.bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: 'token' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(nativeNotificationStatus.value.state).toBe('connected');
    expect(mocks.api.mock.calls.filter(([url]) => url.endsWith('/sync'))).toHaveLength(1);
    expect(mocks.api.mock.calls.filter(([url]) => url.endsWith('/subscribe'))).toHaveLength(1);
  });
  it('stops offline, reconnects immediately online, and cleans timers/listeners on unmount', async () => {
    mount();
    await flush();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    expect(nativeNotificationOnline.value).toBe(false);
    const count = mocks.api.mock.calls.length;
    await vi.advanceTimersByTimeAsync(65000);
    expect(mocks.api).toHaveBeenCalledTimes(count);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(nativeNotificationOnline.value).toBe(true);
    expect(nativeNotificationStatus.value.state).toBe('connected');
    expect(mocks.api.mock.calls.filter(([url]) => url.endsWith('/subscribe'))).toHaveLength(2);
    app.unmount();
    const after = mocks.api.mock.calls.length;
    window.dispatchEvent(new Event('online'));
    retryNativeNotifications();
    await vi.advanceTimersByTimeAsync(65000);
    expect(mocks.api).toHaveBeenCalledTimes(after);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not poll while hidden and rechecks on foreground without duplicating timers', async () => {
    mount();
    await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const count = mocks.api.mock.calls.length;
    await vi.advanceTimersByTimeAsync(65000);
    expect(mocks.api).toHaveBeenCalledTimes(count);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(mocks.api.mock.calls.filter(([url]) => url.endsWith('/subscribe'))).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('clears connection state and never retries a signed-out account', async () => {
    mount();
    await flush();
    owner.value = '';
    await flush();
    expect(nativeNotificationStatus.value).toEqual({ owner: '', state: 'idle' });
    const count = mocks.api.mock.calls.length;
    await vi.advanceTimersByTimeAsync(65000);
    expect(mocks.api).toHaveBeenCalledTimes(count);
  });
});
