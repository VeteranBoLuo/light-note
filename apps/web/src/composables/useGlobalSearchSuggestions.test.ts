import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { useGlobalSearchSuggestions } from './useGlobalSearchSuggestions';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), combined: vi.fn(), scope: {} as any, user: {} as any }));
vi.mock('@/api/publicResources', () => ({ fetchCombinedSearch: mocks.combined }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/search', () => ({ fetchGlobalSearchSuggestions: mocks.fetch }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
let unmount: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetch.mockReset();
  mocks.combined.mockReset();
  mocks.scope = reactive({ included: true, caps: { enabled: true }, ensure: vi.fn().mockResolvedValue(undefined) });
  mocks.user = reactive({ id: 'one', role: 'user' });
});
afterEach(() => {
  unmount?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function setup(includeRecent = false, suggestLayout?: 'grouped', allowPublicScope = false) {
  let search!: ReturnType<typeof useGlobalSearchSuggestions>;
  const app = createApp({
    setup() {
      search = useGlobalSearchSuggestions(undefined, undefined, { includeRecent, suggestLayout, allowPublicScope });
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  unmount = () => app.unmount();
  return search;
}
describe('共享快捷搜索', () => {
  it('PC 打开和清空搜索都读取最近内容，关闭仍取消请求', async () => {
    mocks.fetch.mockResolvedValue({ items: [{ id: 'recent', type: 'todo' }], hasMore: false });
    const search = setup(true);
    await search.run('');
    expect(search.items.value.map((item) => item.id)).toEqual(['recent']);
    expect(mocks.fetch).toHaveBeenLastCalledWith('', expect.objectContaining({ includeRecent: true }));
    await search.run('任务');
    search.schedule('   ');
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.fetch).toHaveBeenLastCalledWith('', expect.objectContaining({ includeRecent: true }));
    expect(search.items.value.map((item) => item.id)).toEqual(['recent']);
    search.reset();
    expect(search.items.value).toEqual([]);
  });
  it('未开启最近内容的移动调用保持空关键词不请求', async () => {
    const search = setup();
    await search.run('');
    search.schedule('');
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('默认请求待办，并在防抖期间丢弃旧响应', async () => {
    let resolveOld!: (value: any) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    mocks.fetch.mockResolvedValue({ items: [{ id: 'new', type: 'todo' }], hasMore: false });
    const search = setup();
    const old = search.run('旧');
    search.schedule('新');
    resolveOld({ items: [{ id: 'old', type: 'todo' }], hasMore: false });
    await old;
    expect(search.items.value).toEqual([]);
    expect(search.loading.value).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(search.items.value.map((item) => item.id)).toEqual(['new']);
    expect(mocks.fetch.mock.calls[0][1].types).toContain('todo');
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('关闭或账号切换清空结果并取消待发请求', async () => {
    mocks.fetch.mockResolvedValue({ items: [{ id: 'one', type: 'todo' }], hasMore: false });
    const search = setup();
    await search.run('任务');
    mocks.user.id = 'two';
    await nextTick();
    expect(search.items.value).toEqual([]);
    search.schedule('另一任务');
    search.reset();
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

it('PC 分组保留服务端五类 25 条结果，不再经过 8 条裁剪', async () => {
  const items = ['bookmark', 'note', 'file', 'todo', 'tag'].flatMap((type) =>
    Array.from({ length: 5 }, (_, i) => ({ type, id: `${type}-${i}` })),
  );
  mocks.fetch.mockResolvedValue({ items, hasMore: true });
  const search = setup(true, 'grouped');
  await search.run('项目');
  expect(search.items.value).toHaveLength(25);
  expect(mocks.fetch).toHaveBeenCalledWith('项目', expect.objectContaining({ suggestLayout: 'grouped' }));
});

it('V4 混排保持既有分组容量，来源纳入去重键', async () => {
  const items = Array.from({ length: 15 }, (_, i) => ({
    type: i < 5 ? 'bookmark' : i < 10 ? 'note' : 'file',
    id: String(i),
    origin: i % 2 ? 'public' : 'personal',
  }));
  items[1] = { ...items[0], origin: 'public' };
  mocks.combined.mockResolvedValue({ items, hasMore: true });
  const search = setup(true, 'grouped', true);
  await search.run('资料');
  expect(search.items.value).toHaveLength(15);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.combined).toHaveBeenCalledWith(
    '资料',
    expect.objectContaining({ mode: 'suggest', suggestLayout: 'grouped' }),
    expect.anything(),
  );
});
it('恢复开启后首次搜索等待能力结果，直接读取混排建议', async () => {
  mocks.scope.caps.enabled = false;
  let finish!: () => void;
  mocks.scope.ensure.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  mocks.combined.mockResolvedValue({ items: [{ type: 'note', id: 'public', origin: 'public' }], hasMore: false });
  const search = setup(true, 'grouped', true);
  const pending = search.run('资料');
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.combined).not.toHaveBeenCalled();
  mocks.scope.caps.enabled = true;
  finish();
  await pending;
  expect(mocks.combined).toHaveBeenCalledTimes(1);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(search.items.value[0].id).toBe('public');
});
it('等待能力期间关闭搜索，迟到结果不再发起查询', async () => {
  let finish!: () => void;
  mocks.scope.ensure.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const search = setup(true, 'grouped', true);
  const pending = search.run('资料');
  search.reset();
  finish();
  await pending;
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.combined).not.toHaveBeenCalled();
  expect(search.loading.value).toBe(false);
});
it('公开请求失败保留完整个人建议并明确标记公开数量未知', async () => {
  mocks.combined.mockRejectedValue(new Error('unavailable'));
  mocks.fetch.mockResolvedValue({ items: [{ type: 'note', id: 'mine' }], hasMore: false });
  const search = setup(true, 'grouped', true);
  await search.run('资料');
  expect(search.items.value[0].id).toBe('mine');
  expect(search.publicFailed.value).toBe(true);
  expect(search.failed.value).toBe(false);
  mocks.scope.included = false;
  await search.run('私人');
  expect(mocks.combined).toHaveBeenCalledTimes(1);
  expect(search.publicFailed.value).toBe(false);
});

it('恢复前台先清除公开建议并重新校验，关闭后不再请求', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  mocks.combined.mockResolvedValue({ items: [{ id: 'public', type: 'note', origin: 'public' }], hasMore: false });
  const search = setup(true, 'grouped', true);
  await search.run('资料');
  let finish!: (value: any) => void;
  mocks.combined.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  window.dispatchEvent(new Event('focus'));
  expect(search.items.value).toEqual([]);
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.scope.ensure).toHaveBeenCalledWith(true);
  expect(mocks.combined).toHaveBeenCalledTimes(2);
  finish({ items: [], hasMore: false });
  await nextTick();
  await nextTick();
  expect(search.items.value).toEqual([]);
  search.reset();
  await vi.advanceTimersByTimeAsync(1000);
  window.dispatchEvent(new Event('focus'));
  expect(mocks.combined).toHaveBeenCalledTimes(2);
});
