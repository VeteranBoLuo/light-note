import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeManor from './KnowledgeManor.vue';
import AppLayout from '../index.vue';

const mocks = vi.hoisted(() => ({
  bookmark: { isMobile: false },
  user: { id: 'root-fixture', role: 'root', adminContext: null },
  read: vi.fn(async (_signal?: AbortSignal) => ({ quests: [], state: {}, revision: 0, version: 'fixture' })),
  command: vi.fn(),
  pending: vi.fn<() => unknown>(() => null),
  save: vi.fn(),
  growth: vi.fn(async (_force?: boolean) => {}),
  inventory: vi.fn(async () => {}),
}));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user, bookmarkStore: () => mocks.bookmark }));
vi.mock('@/api/manorApi', () => ({ getManor: mocks.read, runManorCommand: mocks.command }));
vi.mock('@/composables/useGrowth', () => ({
  useGrowth: () => ({ load: mocks.growth, loadInventory: mocks.inventory }),
}));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: () => {} }));
vi.mock('@/components/home/navigation/Navigation.vue', () => ({ default: { render: () => h('nav', { 'aria-label': '轻笺导航' }, '轻笺导航') } }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/utils/manorPending', () => ({
  readPendingManorCommand: mocks.pending,
  savePendingManorCommand: mocks.save,
  isUncertainManorResult: () => false,
}));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: () => void, next: () => unknown) => { close(); return next(); },
  registerMobileOverlayHistory: vi.fn(),
  releaseMobileOverlayHistory: vi.fn(),
}));
let app: App | undefined;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
};
async function mount(previous?: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: AppLayout, children: [
        { path: 'knowledge-manor', name: 'knowledgeManor', component: KnowledgeManor },
        { path: 'bookmarks', name: 'bookmarks', component: { render: () => h('p', 'bookmarks-ready') } },
        { path: 'app', component: { render: () => h('p', 'app-ready') } },
      ] },
    ],
  });
  await router.push('/knowledge-manor');
  if (previous) router.options.history.state.back = previous;
  app = createApp(RouterView).use(router);
  app.component('BButton', { setup: (_, context) => () => h('button', context.attrs, context.slots.default?.()) });
  app.component('BLoading', { render: () => h('span', 'loading') });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  await flush();
  return router;
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.bookmark.isMobile = false;
  mocks.pending.mockReturnValue(null);
  mocks.read.mockResolvedValue({ quests: [], state: {}, revision: 0, version: 'fixture' });
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('庄园加载与主站导航', () => {
  it('存档读取与 iframe 静态资源并行，桥接复用同一次初始读取', async () => {
    let resolve!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof mocks.read>);
    await mount();
    const frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    expect(frame).not.toBeNull();
    const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
      data: { type: 'lightnote-manor', nonce, id: 1, action: 'get' } }));
    await flush();
    expect(reply).not.toHaveBeenCalled();
    resolve({ quests: [], state: {}, revision: 0, version: 'fixture' });
    await flush();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ id: 1, value: expect.objectContaining({ version: 'fixture' }) }), location.origin);
  });
  it('iframe 重试产生的同页历史不消耗返回点击，直接回到进入前的主站页面', async () => {
    const router = await mount('/bookmarks');
    router.options.history.state.back = '/knowledge-manor';
    const back = vi.spyOn(router, 'back');
    const frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    const exited = new Promise<void>(resolve => { const stop = router.afterEach(to => { if (to.path === '/bookmarks') { stop(); resolve(); } }); });
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
      data: { type: 'lightnote-manor', nonce, id: 1, action: 'exit' } }));
    await exited;
    expect(back).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/bookmarks');
  });
  it('游戏内返回能退出独立场景，并恢复主站导航', async () => {
    const router = await mount();
    const frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    const notify = async (action: string) => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
        data: { type: 'lightnote-manor', nonce, id: 1, action } }));
      await flush();
    };
    await notify('ready');
    expect(document.querySelector('nav')).toBeNull();
    const exited = new Promise<void>(resolve => {
      const stop = router.afterEach(to => { if (to.path === '/app') { stop(); resolve(); } });
    });
    await notify('exit');
    await exited;
    await flush();
    expect(router.currentRoute.value.path).toBe('/app');
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('移动端加载时没有主站导航，保留退出按钮直到游戏就绪', async () => {
    mocks.bookmark.isMobile = true;
    await mount();
    expect(document.querySelector('nav')).toBeNull();
    expect(document.body.textContent).toContain('manor.returnToApp');
    const frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
      data: { type: 'lightnote-manor', nonce, id: 1, action: 'ready' } }));
    await flush();
    expect(document.body.textContent).not.toContain('manor.returnToApp');
  });
  it('准备时保留主站导航，就绪后铺满页面；重新准备时恢复导航且不重建 iframe', async () => {
    await mount();
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    const frame = document.querySelector('iframe')!,
      nonce = new URL(frame.src).searchParams.get('bridge');
    const notify = async (action: string) => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        origin: location.origin,
        data: { type: 'lightnote-manor', nonce, id: 0, action },
      }));
      await flush();
    };
    await notify('ready');
    expect(document.querySelector('nav')).toBeNull();
    expect(document.querySelector('iframe')).toBe(frame);
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    await notify('loading');
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.querySelector('iframe')).toBe(frame);
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    await notify('ready');
    await notify('load-error');
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('初始存档仍在读取时，导航立即退出并取消读取', async () => {
    mocks.read.mockImplementationOnce(() => new Promise(() => {}));
    const router = await mount(),
      signal = mocks.read.mock.calls[0][0]!;
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    await router.push('/bookmarks');
    await flush();
    expect(document.body.textContent).toContain('bookmarks-ready');
    expect(signal.aborted).toBe(true);
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('场景未就绪时不等待积分与背包刷新，移除正在加载的 iframe', async () => {
    mocks.growth.mockImplementationOnce(() => new Promise(() => {}));
    mocks.inventory.mockImplementationOnce(() => new Promise(() => {}));
    const router = await mount();
    expect(document.querySelector('iframe')).not.toBeNull();
    await router.push('/bookmarks');
    await flush();
    expect(document.body.textContent).toContain('bookmarks-ready');
    expect(document.querySelector('iframe')).toBeNull();
    expect(mocks.growth).toHaveBeenCalledWith(true);
    expect(mocks.inventory).toHaveBeenCalledTimes(1);
  });
  it('带着未完成操作退出时保留收据，结算后等待旧刷新结束再读取余额', async () => {
    let receipt!: (result: unknown) => void, balance!: () => void;
    const pending = {
      requestId: 'same-receipt',
      revision: 0,
      version: 'fixture',
      action: 'buySeed',
      args: ['radish', 1],
    };
    mocks.pending.mockReturnValue(pending);
    mocks.command.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          receipt = resolve;
        }),
    );
    mocks.growth.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          balance = resolve;
        }),
    );
    const router = await mount();
    await router.push('/bookmarks');
    await flush();
    expect(document.body.textContent).toContain('bookmarks-ready');
    expect(mocks.growth).toHaveBeenCalledTimes(1);
    receipt({ quests: [], state: {}, revision: 1, version: 'fixture' });
    await flush();
    expect(mocks.command).toHaveBeenCalledExactlyOnceWith(pending);
    expect(mocks.growth).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    balance();
    await flush();
    expect(mocks.growth).toHaveBeenCalledTimes(2);
  });
});
