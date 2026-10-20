import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  consumeSearchReturn,
  readSearchReturn,
  rememberSearchReturn,
  resolveSearchReturnPath,
  restoreSearchReturnPosition,
  trackSearchReturnNavigation,
} from './searchReturnNavigation';

const source = '/search?q=hello&type=note,file&tags=tag-1&sort=name&view=list#results';
const scope = 'user-1|user||||';
const input = { scope, path: source, view: 'list', loadedCount: 48, inspectedKey: 'note:42' };
const note = (id = '42') => ({ path: `/noteLibrary/${id}`, query: { from: source } });

afterEach(() => {
  readSearchReturn('reset-owner', source, 'list');
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function routerAtSource() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push(source);
  trackSearchReturnNavigation(router);
  return router;
}

function position() {
  const container = document.createElement('div');
  const first = document.createElement('div');
  const anchor = document.createElement('div');
  first.dataset.searchResourceKey = 'note:1';
  anchor.dataset.searchResourceKey = 'note:37';
  container.append(first, anchor);
  container.scrollTop = 1200;
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ top: -200, bottom: 90 } as DOMRect);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ top: 88, bottom: 250 } as DOMRect);
  const scrollTo = vi.fn();
  container.scrollTo = scrollTo;
  return { container, anchor, scrollTo };
}

describe('资源中心笔记返回位置', () => {
  it('只在真实返回原搜索时恢复，保留已加载范围和锚点相对位置', async () => {
    const router = await routerAtSource();
    const { container, anchor, scrollTo } = position();
    rememberSearchReturn(input, container);
    expect(readSearchReturn(scope, source, 'list')).toBeNull();
    await router.push(note());
    await router.push(source);
    const snapshot = readSearchReturn(scope, source, 'list')!;
    expect(snapshot).toMatchObject({ loadedCount: 48, top: 1200, anchorKey: 'note:37', anchorOffset: -12 });
    container.scrollTop = 0;
    vi.mocked(anchor.getBoundingClientRect).mockReturnValue({ top: 1700 } as DOMRect);
    restoreSearchReturnPosition(container, snapshot);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1612, behavior: 'auto' });
    consumeSearchReturn(snapshot);
    expect(readSearchReturn(scope, source, 'list')).toBeNull();
  });

  it('浏览器返回和在笔记树中切换后返回都识别原来源', async () => {
    const router = await routerAtSource();
    rememberSearchReturn(input, null);
    await router.push(note());
    await router.push(note('child'));
    await router.push(source);
    expect(readSearchReturn(scope, source, 'list')?.inspectedKey).toBe('note:42');
    rememberSearchReturn(input, null);
    await router.push(note());
    const returned = new Promise<void>((resolve) => {
      const stop = router.afterEach(() => {
        stop();
        resolve();
      });
    });
    router.back();
    await returned;
    expect(readSearchReturn(scope, source, 'list')?.loadedCount).toBe(48);
  });

  it('其他页面、不同搜索条件及后续手动访问不恢复旧现场', async () => {
    const router = await routerAtSource();
    rememberSearchReturn(input, null);
    await router.push(note());
    await router.push('/workbenches');
    await router.push(source);
    expect(readSearchReturn(scope, source, 'list')).toBeNull();
  });

  it('账号、管理员上下文、视图和查询范围隔离', async () => {
    const router = await routerAtSource();
    rememberSearchReturn(input, null);
    await router.push(note());
    await router.push(source);
    expect(readSearchReturn(scope, source + '&date=7d', 'list')).toBeNull();
    expect(readSearchReturn(scope, source, 'card')).toBeNull();
    expect(readSearchReturn(scope + '|admin-context', source, 'list')).toBeNull();
    expect(readSearchReturn(scope, source, 'list')).toBeNull();
  });

  it('刷新笔记后可以从当前标签页元数据恢复，过期记录丢弃', async () => {
    const router = await routerAtSource();
    rememberSearchReturn(input, null);
    await router.push(note());
    const freshRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    });
    await freshRouter.push(note());
    trackSearchReturnNavigation(freshRouter);
    await freshRouter.push(source);
    expect(readSearchReturn(scope, source, 'list')?.loadedCount).toBe(48);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 13 * 60 * 60_000);
    expect(readSearchReturn(scope, source, 'list')).toBeNull();
  });

  it('锚点已被删除或不再匹配时回退到原滚动位置，不制造旧资料', async () => {
    const router = await routerAtSource();
    const { container, anchor, scrollTo } = position();
    rememberSearchReturn(input, container);
    await router.push(note());
    await router.push(source);
    const snapshot = readSearchReturn(scope, source, 'list')!;
    anchor.remove();
    restoreSearchReturnPosition(container, snapshot);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'auto' });
  });

  it('存储受限不阻断导航，旧请求不能消费后来创建的新现场', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const router = await routerAtSource();
    rememberSearchReturn(input, null);
    await router.push(note());
    await router.push(source);
    const old = readSearchReturn(scope, source, 'list')!;
    rememberSearchReturn({ ...input, loadedCount: 72 }, null);
    await router.push(note());
    await router.push(source);
    consumeSearchReturn(old);
    expect(readSearchReturn(scope, source, 'list')?.loadedCount).toBe(72);
  });

  it.each(['https://example.com/search', '//example.com/search', '/search/other', '/noteLibrary', '/search-other'])(
    '只接受精确的站内资源中心来源：%s',
    (value) => expect(resolveSearchReturnPath(value)).toBe(''),
  );
});
