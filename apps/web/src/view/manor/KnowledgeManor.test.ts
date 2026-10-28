import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeManor from './KnowledgeManor.vue';
import { createManor, MANOR_VERSION } from '@lightnote/shared/manor';
import AppLayout from '../index.vue';
import { requestActivitySnapshot } from '@/http/requestActivity';

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
        ...['noteLibrary', 'home', 'cloudSpace', 'inbox', 'organize', 'growth'].map(path => ({
          path, component: { render: () => h('p', `${path}-ready`) },
        })),
      ] },
    ],
  });
  await router.push('/knowledge-manor');
  if (previous) router.options.history.state.back = previous;
  app = createApp(RouterView).use(router);
  app.component('BButton', { setup: (_, context) => () => h('button', context.attrs, context.slots.default?.()) });
  app.component('BLoading', { render: () => h('span', 'loading') });
  app.component('svg-icon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  await flush();
  return router;
}
beforeEach(() => {
  sessionStorage.clear();
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
  it('从 0% 复用同一加载层，真实进度只前进；100% 后仍等待场景可交互', async () => {
    await mount();
    const frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    const cover = document.querySelector('.manor-loading')!;
    const send = async (action: string, payload = {}, token = nonce, source: Window | null = frame.contentWindow) => {
      window.dispatchEvent(new MessageEvent('message', { source, origin: location.origin,
        data: { type: 'lightnote-manor', nonce: token, id: 0, action, payload } }));
      await flush();
    };
    const percent = () => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow');
    expect(percent()).toBe('0');
    await send('loading');
    expect(document.querySelector('.manor-loading')).toBe(cover);
    await send('progress', { percent: 42 });
    expect(percent()).toBe('42');
    expect(document.querySelector<HTMLElement>('.b-progress__bar')?.style.width).toBe('42%');
    for (const value of [20, -1, 101, 12.5, '70', null]) await send('progress', { percent: value });
    await send('progress', { percent: 90 }, 'other-frame');
    await send('progress', { percent: 90 }, nonce, window);
    expect(percent()).toBe('42');
    await send('progress', { percent: 100 });
    expect(document.querySelector('.manor-loading')).toBe(cover);
    expect(percent()).toBe('100');
    expect(document.querySelector<HTMLElement>('.b-progress__bar')?.style.width).toBe('100%');
    expect(document.querySelector('nav')).not.toBeNull();
    await send('ready');
    expect(document.querySelector('.manor-loading')).toBeNull();
    expect(document.querySelector('nav')).toBeNull();
    await send('load-error');
    (document.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await flush();
    expect(percent()).toBe('0');
    expect(document.querySelector('iframe')).not.toBe(frame);
    // A late completion from the discarded frame cannot finish the new load.
    await send('progress', { percent: 100 });
    await send('ready');
    expect(percent()).toBe('0');
  });

  it('可见场景的被动同步读取正式存档，并拒绝将旧场景意图套用新版本', async () => {
    await mount();
    const frame = document.querySelector('iframe')!, reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    const send = async (id: number, action: string, payload = {}) => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
        data: { type: 'lightnote-manor', nonce: new URL(frame.src).searchParams.get('bridge'), id, action, payload } }));
      await flush();
    };
    await send(1, 'get');
    mocks.read.mockResolvedValueOnce({ quests: [], state: { fert: { rabbit: 1 } }, revision: 2, version: 'fixture' } as never);
    await send(2, 'get', { background: true });
    expect(mocks.read).toHaveBeenLastCalledWith(expect.any(AbortSignal), true);
    expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ value: expect.objectContaining({ revision: 2, state: { fert: { rabbit: 1 } } }) }), location.origin);
    await send(3, 'command', { action: 'pickPoop', args: [], revision: 0 });
    expect(mocks.command).not.toHaveBeenCalled();
    expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ id: 3, error: 'manor.actionFailed' }), location.origin);
  });
  it.each([
    ['daily_note', '/noteLibrary'], ['daily_bookmark', '/home'], ['daily_file', '/cloudSpace'],
    ['daily_todo_create', '/inbox?tab=todo'], ['daily_todo', '/inbox?tab=todo'],
    ['daily_organize', '/organize?issue=pending'], ['checkin', '/growth?section=overview'],
  ])('任务 %s 的去完成复用每日任务目的地 %s', async (key, destination) => {
    mocks.read.mockResolvedValue({ quests: [{ key, done: false }], state: {}, revision: 0, version: 'fixture' } as never);
    const router = await mount(), frame = document.querySelector('iframe')!;
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin, data: { type: 'lightnote-manor', nonce: new URL(frame.src).searchParams.get('bridge'), id: 1, action: 'ready' } }));
    await flush();
    const arrived = new Promise<void>(resolve => {
      const stop = router.afterEach(to => { if (to.fullPath === destination) { stop(); resolve(); } });
    });
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
      data: { type: 'lightnote-manor', nonce: new URL(frame.src).searchParams.get('bridge'), id: 11, action: 'tasks', payload: { index: 0 } } }));
    await arrived;
    expect(router.currentRoute.value.fullPath).toBe(destination);
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it.each([-1, 1, '0', 0.5])('拒绝无效任务序号 %s，不允许场景任意导航', async index => {
    mocks.read.mockResolvedValue({ quests: [{ key: 'daily_note', done: false }], state: {}, revision: 0, version: 'fixture' } as never);
    const router = await mount(), frame = document.querySelector('iframe')!, reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
      data: { type: 'lightnote-manor', nonce: new URL(frame.src).searchParams.get('bridge'), id: 11, action: 'tasks', payload: { index, url: '/home' } } }));
    await flush();
    expect(router.currentRoute.value.path).toBe('/knowledge-manor');
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ id: 11, error: 'manor.actionFailed' }), location.origin);
  });

  it('场景路由回退由同一游戏确认状态裁决，保留真实目标并拒绝伪造回复', async () => {
    const router = await mount(), frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    const send = async (action: string, payload = {}, token = nonce) => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
        data: { type: 'lightnote-manor', nonce: token, id: 33, action, payload } }));
      await flush();
    };
    await send('ready');
    const bridge = vi.spyOn(frame.contentWindow!, 'postMessage');
    const first = router.push('/bookmarks'); await flush();
    const check = bridge.mock.calls.find(([v]) => v.action === 'navigation-back')![0];
    await send('navigation', { requestId: check.requestId, allow: true }, 'other-frame');
    expect(router.currentRoute.value.path).toBe('/knowledge-manor');
    await send('navigation', { requestId: check.requestId, allow: false }); await first;
    expect(router.currentRoute.value.path).toBe('/knowledge-manor');
    bridge.mockClear();
    const second = router.push('/bookmarks'); await flush();
    const next = bridge.mock.calls.find(([v]) => v.action === 'navigation-back')![0];
    await send('navigation', { requestId: check.requestId, allow: true });
    expect(router.currentRoute.value.path).toBe('/knowledge-manor');
    await send('navigation', { requestId: next.requestId, allow: true }); await second;
    expect(router.currentRoute.value.path).toBe('/bookmarks');
  });

  it('就绪场景桥接失联时允许离开，避免浏览器被卡死场景困住', async () => {
    const router = await mount(), frame = document.querySelector('iframe')!, nonce = new URL(frame.src).searchParams.get('bridge');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: location.origin,
      data: { type: 'lightnote-manor', nonce, id: 1, action: 'ready' } }));
    await flush();
    const leaving = router.push('/bookmarks'); await flush();
    await vi.advanceTimersByTimeAsync(1500); await leaving;
    expect(router.currentRoute.value.path).toBe('/bookmarks');
  });

  it('重置测试使用独立存档，命令不写正式 API，恢复后重新读取正式存档', async () => {
    const state=createManor({now:new Date('2026-10-25T10:00:00Z'),points:320,calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:480}});
    mocks.read.mockResolvedValue({quests:[],state,revision:8,version:MANOR_VERSION});
    await mount();
    const send=async(action:string,payload:object={})=>{
      const frame=document.querySelector('iframe')!,nonce=new URL(frame.src).searchParams.get('bridge');
      window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:location.origin,data:{type:'lightnote-manor',nonce,id:10,action,payload}}));
      await flush();
    };
    await send('reset-test');
    const frame=document.querySelector('iframe')!,reply=vi.spyOn(frame.contentWindow!,'postMessage');
    await send('get');
    expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({value:expect.objectContaining({testing:true,state:expect.objectContaining({adopted:false})})}),location.origin);
    await send('command',{action:'adopt',args:[]});
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    app?.unmount();app=undefined;document.body.innerHTML='';
    await mount();
    const resumedFrame=document.querySelector('iframe')!,resumedReply=vi.spyOn(resumedFrame.contentWindow!,'postMessage');
    await send('get');
    expect(resumedReply).toHaveBeenLastCalledWith(expect.objectContaining({value:expect.objectContaining({testing:true,state:expect.objectContaining({adopted:true})})}),location.origin);
    expect(mocks.command).not.toHaveBeenCalled();
    await send('restore-formal');
    await send('get');
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(sessionStorage.getItem('lightnote-manor-test-v1:root-fixture')).toBeNull();
  });

  it('旧渲染器的积分入口也留在庄园内打开账本',async()=>{
    const router=await mount(),frame=document.querySelector('iframe')!,nonce=new URL(frame.src).searchParams.get('bridge');
    const reply=vi.spyOn(frame.contentWindow!,'postMessage');
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:location.origin,data:{type:'lightnote-manor',nonce,id:10,action:'ledger'}}));
    await flush();
    expect(router.currentRoute.value.path).toBe('/knowledge-manor');
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({type:'lightnote-manor-control',action:'open-ledger'}),location.origin);
  });

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
    expect(requestActivitySnapshot().foreground).toBe(1);
    await notify('ready');
    expect(requestActivitySnapshot().foreground).toBe(0);
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
  it('移动端加载时不显示额外返回按钮，游戏就绪后使用游戏内返回', async () => {
    mocks.bookmark.isMobile = true;
    await mount();
    expect(document.querySelector('nav')).toBeNull();
    expect(document.body.textContent).not.toContain('manor.returnToApp');
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
    expect(requestActivitySnapshot().foreground).toBe(1);
    await notify('ready');
    expect(requestActivitySnapshot().foreground).toBe(0);
    expect(document.querySelector('nav')).toBeNull();
    expect(document.querySelector('iframe')).toBe(frame);
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    await notify('loading');
    expect(requestActivitySnapshot().foreground).toBe(1);
    expect(document.querySelector('nav')).not.toBeNull();
    expect(document.querySelector('iframe')).toBe(frame);
    expect(document.body.textContent).not.toContain('manor.returnToApp');
    await notify('ready');
    await notify('load-error');
    expect(requestActivitySnapshot().foreground).toBe(0);
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
    expect(requestActivitySnapshot().foreground).toBe(0);
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
