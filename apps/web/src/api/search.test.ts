import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request.ts', () => ({
  apiBasePost: mocks.apiBasePost,
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      locale: { value: 'zh-CN' },
    },
  },
}));

import { clearGlobalSearchCache, fetchGlobalSearch } from './search.ts';

describe('fetchGlobalSearch cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGlobalSearchCache();
  });

  it('同页重复查询可以复用缓存，重新进入资源中心时可强制获取最新资源', async () => {
    mocks.apiBasePost
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ id: 'bookmark-old', type: 'bookmark', title: '旧书签' }],
          total: 1,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ id: 'bookmark-new', type: 'bookmark', title: '新书签' }],
          total: 1,
        },
      });

    const first = await fetchGlobalSearch('', 0);
    const cached = await fetchGlobalSearch('', 0);
    const refreshed = await fetchGlobalSearch('', 0, true);

    expect(mocks.apiBasePost).toHaveBeenCalledTimes(2);
    expect(first.items[0]?.id).toBe('bookmark-old');
    expect(cached.items[0]?.id).toBe('bookmark-old');
    expect(refreshed.items[0]?.id).toBe('bookmark-new');
  });
});
