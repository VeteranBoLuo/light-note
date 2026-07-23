import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const apiQueryPost = vi.fn();

vi.mock('@/http/request.ts', () => ({ apiQueryPost }));

const { default: useBookmarkStore } = await import('./bookmark');

describe('bookmark store 标签加载', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('登录后的新请求会阻止较早的游客空响应覆盖标签', async () => {
    const store = useBookmarkStore();
    let resolveGuest: (value: any) => void = () => {};
    apiQueryPost
      .mockImplementationOnce(() => new Promise((resolve) => (resolveGuest = resolve)))
      .mockResolvedValueOnce({
        status: 200,
        data: [{ id: 'tag-1', name: '轻笺入门' }],
      });

    const guestRequest = store.loadTagList('visitor-id');
    const userRequest = store.loadTagList('user-1', { showLoading: false });
    await userRequest;
    resolveGuest({ status: 200, data: [] });
    await guestRequest;

    expect(store.tagList).toEqual([{ id: 'tag-1', name: '轻笺入门' }]);
    expect(apiQueryPost).toHaveBeenNthCalledWith(2, '/api/bookmark/queryTagList', {
      filters: { userId: 'user-1' },
    });
  });

  it('重置账号状态会让仍在途的标签请求失效', async () => {
    const store = useBookmarkStore();
    let resolveRequest: (value: any) => void = () => {};
    apiQueryPost.mockImplementationOnce(() => new Promise((resolve) => (resolveRequest = resolve)));

    const request = store.loadTagList('user-1');
    store.reset();
    resolveRequest({ status: 200, data: [{ id: 'stale-tag' }] });
    await request;

    expect(store.tagList).toEqual([]);
    expect(store.tagLoading).toBe(false);
  });
});
