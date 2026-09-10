import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { useGlobalSearchSuggestions } from './useGlobalSearchSuggestions';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: {} as any }));
vi.mock('@/api/search', () => ({ fetchGlobalSearchSuggestions: mocks.fetch }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
let unmount: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetch.mockReset();
  mocks.user = reactive({ id: 'one', role: 'user' });
});
afterEach(() => {
  unmount?.();
  vi.useRealTimers();
});
function setup(includeRecent = false) {
  let search!: ReturnType<typeof useGlobalSearchSuggestions>;
  const app = createApp({
    setup() {
      search = useGlobalSearchSuggestions(undefined, undefined, { includeRecent });
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
