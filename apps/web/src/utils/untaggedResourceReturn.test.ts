import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import {
  clearUntaggedResourceReturn,
  readUntaggedResourceReturn,
  rememberUntaggedResourceReturn,
  resolveUntaggedReturnPath,
  trackUntaggedResourceReturn,
} from './untaggedResourceReturn';
import { resolveResourceListScrollAnchor } from './resourceListScroll';

const source = '/organize?issue=untagged';
const scope = 'owner|user||context|subject|view';
const input = {
  scope,
  path: source,
  keyword: '项目（尚未筛选）',
  resourceType: 'note' as const,
  appliedKeyword: '项目',
  appliedResourceType: 'note' as const,
  loadedCount: 60,
  anchor: { key: 'note:42', index: 41, offset: 13.5 },
  top: 3400,
};
const note = (id = '42') => ({ path: `/noteLibrary/${id}`, query: { from: source } });

afterEach(() => {
  clearUntaggedResourceReturn();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

async function routerAt(location: string | ReturnType<typeof note> = source) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  await router.push(location);
  trackUntaggedResourceReturn(router);
  trackUntaggedResourceReturn(router);
  return router;
}

async function back(router: Router) {
  const done = new Promise<void>((resolve) => {
    const stop = router.afterEach(() => {
      stop();
      resolve();
    });
  });
  router.back();
  await done;
}

describe('无标签资源打开资料后的返回现场', () => {
  it('仅真实返回时恢复草稿、已应用筛选、已加载范围与虚拟行锚点', async () => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    expect(readUntaggedResourceReturn(scope, source)).toBeNull();
    await router.push(note());
    await back(router);
    expect(readUntaggedResourceReturn(scope, source)).toMatchObject(input);
    const snapshot = readUntaggedResourceReturn(scope, source)!;
    clearUntaggedResourceReturn(snapshot);
    expect(readUntaggedResourceReturn(scope, source)).toBeNull();
  });

  it.each([
    { path: '/manage/editBookmark/42', query: { organize: 'untagged', from: source } },
    { path: '/cloudSpace', query: { fileId: '42', organize: 'untagged', from: source } },
  ])('书签与文件在刷新后仍支持浏览器返回：$path', async (target) => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    await router.push(target);
    const refreshed = await routerAt(target);
    await refreshed.replace(source);
    expect(readUntaggedResourceReturn(scope, source)).toMatchObject(input);
  });

  it('文件关闭预览、切换预览或删除目标后保留原返回现场', async () => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    const query = { organize: 'untagged', from: source };
    await router.push({ path: '/cloudSpace', query: { ...query, fileId: '42' } });
    await router.replace({ path: '/cloudSpace', query: { ...query, fileId: 'next' } });
    await router.replace({ path: '/cloudSpace', query });
    await back(router);
    expect(readUntaggedResourceReturn(scope, source)).toMatchObject(input);
  });

  it.each([
    { path: '/manage/editBookmark/42', query: { organize: 'inbox', from: source } },
    { path: '/cloudSpace', query: { fileId: '42', from: '/search' } },
    { path: '/settings', query: { from: source } },
  ])('不从其他编辑或云空间入口继承旧筛选：$path', async (target) => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    await router.push(target);
    await router.push(source);
    expect(readUntaggedResourceReturn(scope, source)).toBeNull();
  });

  it('树内切换、刷新笔记及删除后 replace 返回沿用同一来源', async () => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    await router.push(note());
    await router.push(note('child'));
    const refreshedRouter = await routerAt(note('child'));
    await refreshedRouter.replace(source);
    expect(readUntaggedResourceReturn(scope, source)?.anchor).toEqual(input.anchor);
  });

  it.each(['/search?q=项目', '/organize?issue=pending', '/workbenches'])(
    '离开原链路 %s 后不恢复旧位置',
    async (other) => {
      const router = await routerAt();
      rememberUntaggedResourceReturn(input);
      await router.push(note());
      await router.push(other);
      await router.push(source);
      expect(readUntaggedResourceReturn(scope, source)).toBeNull();
    },
  );

  it('账号、游客空间与管理员上下文隔离；错误来源不能恢复', async () => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    await router.push(note());
    await router.push(source);
    expect(readUntaggedResourceReturn(scope, source + '&other=1')).toBeNull();
    expect(readUntaggedResourceReturn(scope + '|other-context', source)).toBeNull();
    expect(readUntaggedResourceReturn(scope, source)).toBeNull();
  });

  it('旧请求不能消费新的返回现场，过期元数据丢弃', async () => {
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    await router.push(note());
    await router.push(source);
    const old = readUntaggedResourceReturn(scope, source)!;
    rememberUntaggedResourceReturn({ ...input, loadedCount: 80 });
    await router.push(note());
    await router.push(source);
    clearUntaggedResourceReturn(old);
    expect(readUntaggedResourceReturn(scope, source)?.loadedCount).toBe(80);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 13 * 60 * 60_000);
    expect(readUntaggedResourceReturn(scope, source)).toBeNull();
  });

  it('存储受限仍能在当前标签页返回', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const router = await routerAt();
    rememberUntaggedResourceReturn(input);
    await router.push(note());
    await router.push(source);
    expect(readUntaggedResourceReturn(scope, source)?.loadedCount).toBe(60);
  });

  it('锚点加标签、删除或排序变化后复用虚拟列表的稳定键与邻近位置回退', () => {
    const items = [{ key: 'note:other' }, { key: 'note:42' }, { key: 'note:next' }];
    expect(resolveResourceListScrollAnchor({ items, itemKey: 'key', anchor: input.anchor, pitch: 100 })).toMatchObject({
      keyMatched: true,
      top: 113.5,
    });
    expect(
      resolveResourceListScrollAnchor({
        items: items.filter((item) => item.key !== 'note:42'),
        itemKey: 'key',
        anchor: input.anchor,
        pitch: 100,
      }),
    ).toMatchObject({
      keyMatched: false,
    });
  });

  it.each([
    'https://example.com/organize?issue=untagged',
    '//example.com/organize?issue=untagged',
    '/organize/other?issue=untagged',
    '/organize?issue=pending',
    '/search',
  ])('拒绝其他来源：%s', (path) => {
    expect(resolveUntaggedReturnPath(path)).toBe('');
  });
});
