import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';
import { useNativeNotificationSync } from './useNativeNotificationSync';

const mocks = vi.hoisted(() => ({
  hasBridge: vi.fn(),
  refreshUnread: vi.fn(),
  tick: vi.fn(),
  setOwner: vi.fn(),
  pause: vi.fn(),
}));
vi.mock('@/utils/androidBridge', () => ({ hasAndroidBridge: mocks.hasBridge }));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('./useNotification', () => ({ useNotification: () => ({ refreshUnread: mocks.refreshUnread }) }));
vi.mock('@/utils/nativeNotificationSync', () => ({
  nativeNotificationMessage: vi.fn(),
  createNativeNotificationSync: () => ({ tick: mocks.tick, setOwner: mocks.setOwner, pause: mocks.pause }),
}));
let app: ReturnType<typeof createApp> | undefined;
function mount(owner = ref<string | null>('alice')) {
  app = createApp({
    setup() {
      useNativeNotificationSync(owner, vi.fn());
      return () => h('div');
    },
  });
  app.mount(document.createElement('div'));
  mocks.refreshUnread.mockClear();
  mocks.tick.mockClear();
  return owner;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.hasBridge.mockReturnValue(true);
  mocks.refreshUnread.mockResolvedValue(undefined);
  mocks.tick.mockResolvedValue(undefined);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('native notification resume', () => {
  it('refreshes unread on foreground, reconnect and notification clicks without adding a polling loop', async () => {
    mount();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('light-note:native-notification-open'));
    expect(mocks.refreshUnread).toHaveBeenCalledTimes(3);
    expect(mocks.tick).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.tick).toHaveBeenCalledTimes(4);
    expect(mocks.refreshUnread).toHaveBeenCalledTimes(3);
  });
  it('does not refresh while hidden, offline, unauthenticated or outside an App', () => {
    const owner = mount();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('online'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    owner.value = null;
    document.dispatchEvent(new Event('visibilitychange'));
    owner.value = '';
    document.dispatchEvent(new Event('visibilitychange'));
    owner.value = 'alice';
    mocks.hasBridge.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.refreshUnread).not.toHaveBeenCalled();
  });
  it('removes resume listeners and timer on unmount', async () => {
    mount();
    app?.unmount();
    app = undefined;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('light-note:native-notification-open'));
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.refreshUnread).not.toHaveBeenCalled();
    expect(mocks.tick).not.toHaveBeenCalled();
  });
});
