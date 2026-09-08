import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const post = vi.hoisted(() => vi.fn());
vi.mock('@/http/request', () => ({ apiBasePost: post }));
vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: () => false }));
let binding: any;
let subscription: any;
let permission = 'granted';
let requestPermission: ReturnType<typeof vi.fn>;
let subscribe: ReturnType<typeof vi.fn>;
const key = 'B' + 'A'.repeat(86);
class Channel {
  port1: any;
  port2: any;
  constructor() {
    this.port1 = { close: vi.fn() };
    this.port2 = { postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })) };
  }
}
beforeEach(() => {
  vi.stubGlobal('innerWidth', 1440);
  vi.resetModules();
  localStorage.clear();
  post.mockReset();
  binding = null;
  permission = 'default';
  subscription = null;
  requestPermission = vi.fn(async () => permission);
  subscribe = vi.fn(
    async () =>
      (subscription = {
        options: {},
        toJSON: () => ({ endpoint: 'test' }),
        unsubscribe: vi.fn(async () => {
          subscription = null;
          return true;
        }),
      }),
  );
  vi.stubGlobal('MessageChannel', Channel);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    get permission() {
      return permission;
    },
    requestPermission,
  });
  const worker = {
    postMessage: (data, ports) => {
      if (data.type === 'push.binding.set') binding = data.binding;
      ports[0].postMessage({ binding });
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: async () => ({ active: worker, pushManager: { getSubscription: async () => subscription, subscribe } }),
    },
  });
  post.mockImplementation(async (url, body) => {
    if (url.endsWith('/config'))
      return { status: 200, data: { available: true, enabled: !!binding, userId: 'u1', publicKey: key } };
    if (url.endsWith('/subscribe')) return { status: 200, data: { id: 's1', userId: 'u1', generation: 'g1' } };
    return { status: 200, data: null };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('browser subscription lifecycle', () => {
  it('does not request permission or subscribe while reading state', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    expect(module.useBrowserPush().state.value).toBe('pending');
    expect(module.useBrowserPush().preferred.value).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
  it.each(['existing-user', 'new-user'])(
    'defaults on for %s independently of the legacy preference',
    async (userId) => {
      localStorage.setItem('notificationsBrowser', 'false');
      post.mockImplementation(async () => ({
        status: 200,
        data: { available: true, enabled: false, userId, publicKey: key },
      }));
      const module = await import('./useBrowserPush');
      await module.syncBrowserPushOwner(userId);
      expect(module.useBrowserPush().preferred.value).toBe(true);
      expect(module.useBrowserPush().state.value).toBe('pending');
      expect(requestPermission).not.toHaveBeenCalled();
    },
  );
  it('automatically subscribes previously authorized browsers without another permission prompt', async () => {
    permission = 'granted';
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    expect(module.useBrowserPush().enabled.value).toBe(true);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
    await module.useBrowserPush().setEnabled(false, 'zh-CN');
    await module.refreshBrowserPush();
    expect(module.useBrowserPush().preferred.value).toBe(false);
    expect(module.useBrowserPush().enabled.value).toBe(false);
    expect(subscribe).toHaveBeenCalledOnce();
    vi.resetModules();
    const reloaded = await import('./useBrowserPush');
    await reloaded.refreshBrowserPush();
    expect(reloaded.useBrowserPush().preferred.value).toBe(false);
    expect(subscribe).toHaveBeenCalledOnce();
  });
  it('dismissing authorization keeps the preference on and reports pending', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    await module.useBrowserPush().setEnabled(true, 'zh-CN');
    expect(module.useBrowserPush().preferred.value).toBe(true);
    expect(module.useBrowserPush().state.value).toBe('pending');
    expect(subscribe).not.toHaveBeenCalled();
  });
  it('explicit enable binds this browser; disable clears local ownership before API unbind', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    permission = 'granted';
    await module.useBrowserPush().setEnabled(true, 'zh-CN');
    expect(module.useBrowserPush().state.value).toBe('on');
    expect(binding).toEqual({ id: 's1', userId: 'u1', generation: 'g1' });
    post.mockImplementation(async (url) => {
      if (url.endsWith('/unsubscribe')) expect(binding).toBeNull();
      return { status: 200 };
    });
    await module.useBrowserPush().setEnabled(false, 'zh-CN');
    expect(module.useBrowserPush().state.value).toBe('off');
    expect(subscription).toBeNull();
  });
  it('denied permission never creates a subscription', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    permission = 'denied';
    await module.useBrowserPush().setEnabled(true, 'zh-CN');
    expect(module.useBrowserPush().state.value).toBe('denied');
    expect(subscribe).not.toHaveBeenCalled();
  });
  it('backend bind failure does not claim notifications are enabled', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    post.mockResolvedValue({ status: 500 });
    permission = 'granted';
    await module.useBrowserPush().setEnabled(true, 'zh-CN');
    expect(module.useBrowserPush().state.value).toBe('error');
    expect(binding).toBeNull();
  });
  it('account switch removes the previous binding instead of auto-enabling the new account', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    permission = 'granted';
    await module.useBrowserPush().setEnabled(true, 'zh-CN');
    await module.syncBrowserPushOwner('u2');
    expect(binding).toBeNull();
    expect(subscription).toBeNull();
    expect(subscribe).toHaveBeenCalledOnce();
  });
});
it('never authorizes or subscribes on mobile and revokes an existing device binding', async () => {
  document.documentElement.classList.add('light-note-mobile-rendering');
  try {
    binding = { userId: 'u1', id: 'existing', generation: 'old' };
    subscription = { unsubscribe: vi.fn(async () => true) };
    const oldSubscription = subscription;
    const { syncBrowserPushOwner, useBrowserPush } = await import('./useBrowserPush');
    await syncBrowserPushOwner('u1');
    expect(oldSubscription.unsubscribe).toHaveBeenCalledOnce();
    expect(useBrowserPush().state.value).toBe('unsupported');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  } finally {
    document.documentElement.classList.remove('light-note-mobile-rendering');
  }
});

describe('read-only browser push diagnostics', () => {
  it('derives authorization and connection from actual checks', async () => {
    const module = await import('./useBrowserPush');
    await module.refreshBrowserPush();
    expect(module.useBrowserPush().diagnostics.value).toMatchObject({permission:'default',subscription:'absent',bindingActive:false,stale:false});
    permission='granted';
    await module.useBrowserPush().setEnabled(true,'zh-CN');
    expect(module.useBrowserPush().diagnostics.value).toMatchObject({permission:'granted',subscription:'present',bindingActive:true,stale:false});
  });
  it('a failed check marks the snapshot stale instead of claiming permission or subscription is absent', async () => {
    const module = await import('./useBrowserPush');await module.refreshBrowserPush();permission='granted';await module.useBrowserPush().setEnabled(true,'zh-CN');
    post.mockRejectedValueOnce(new Error('offline'));await module.refreshBrowserPush();
    expect(module.useBrowserPush().diagnostics.value).toMatchObject({permission:'granted',subscription:'present',bindingActive:true,stale:true});
    expect(module.useBrowserPush().state.value).toBe('error');
  });
  it('a new owner can be checked while an old owner check is unresolved', async () => {
    let resolveOld!: (value: any) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({status:200,data:{available:true,enabled:false,userId:'u2',publicKey:key}});
    const module=await import('./useBrowserPush');const old=module.refreshBrowserPush();await vi.waitFor(()=>expect(post).toHaveBeenCalledOnce());
    await module.syncBrowserPushOwner('u2');
    expect(module.useBrowserPush().state.value).toBe('pending');
    resolveOld({status:200,data:{available:true,enabled:true,userId:'u1',publicKey:key}});await old;
    expect(module.useBrowserPush().diagnostics.value).toMatchObject({bindingActive:false,stale:false});expect(module.useBrowserPush().state.value).toBe('pending');
  });
});
