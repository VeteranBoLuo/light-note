import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeManor from './KnowledgeManor.vue';

const mocks = vi.hoisted(() => ({
  user: { id: 'root-fixture', role: 'root', adminContext: null },
  read: vi.fn(async (_signal?: AbortSignal) => ({ quests: [], state: {}, revision: 0, version: 'fixture' })),
  command: vi.fn(),
  pending: vi.fn<() => unknown>(() => null),
  save: vi.fn(),
  growth: vi.fn(async (_force?: boolean) => {}),
  inventory: vi.fn(async () => {}),
}));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user, bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/api/manorApi', () => ({ getManor: mocks.read, runManorCommand: mocks.command }));
vi.mock('@/composables/useGrowth', () => ({
  useGrowth: () => ({ load: mocks.growth, loadInventory: mocks.inventory }),
}));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: () => {} }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/utils/manorPending', () => ({
  readPendingManorCommand: mocks.pending,
  savePendingManorCommand: mocks.save,
  isUncertainManorResult: () => false,
}));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  registerMobileOverlayHistory: vi.fn(),
  releaseMobileOverlayHistory: vi.fn(),
}));
let app: App | undefined;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
};
async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/knowledge-manor', component: KnowledgeManor },
      { path: '/bookmarks', component: { render: () => h('p', 'bookmarks-ready') } },
    ],
  });
  await router.push('/knowledge-manor');
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
  it('场景因响应式布局重新加载时，恢复加载退出入口', async () => {
    await mount();
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
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    await notify('loading');
    expect(document.body.textContent).toContain('manor.returnToApp');
  });
  it('初始存档仍在读取时，导航立即退出并取消读取', async () => {
    mocks.read.mockImplementationOnce(() => new Promise(() => {}));
    const router = await mount(),
      signal = mocks.read.mock.calls[0][0]!;
    expect(document.body.textContent).toContain('manor.returnToApp');
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
