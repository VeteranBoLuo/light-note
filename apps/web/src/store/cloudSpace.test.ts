import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  apiQueryPost: vi.fn(),
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request.ts', () => ({
  apiQueryPost: mocks.apiQueryPost,
  apiBasePost: mocks.apiBasePost,
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string) => key,
    },
  },
}));

const { default: useCloudSpaceStore } = await import('./cloudSpace');

describe('cloud space pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { totalSizeMB: 10, quotaMB: 512 },
    });
  });

  it('loads the first page and appends the next page without replacing existing files', async () => {
    mocks.apiQueryPost
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: 'file-1', fileName: 'one.txt' }], total: 49, page: 1, hasMore: true },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: 'file-49', fileName: 'last.txt' }], total: 49, page: 2, hasMore: false },
      });
    const store = useCloudSpaceStore();

    await store.queryFieldList();
    await store.loadMoreFiles();

    expect(store.fileList.map((item) => item.id)).toEqual(['file-1', 'file-49']);
    expect(store.fileTotal).toBe(49);
    expect(store.filePage).toBe(2);
    expect(store.fileHasMore).toBe(false);
    expect(mocks.apiQueryPost).toHaveBeenNthCalledWith(
      2,
      '/api/file/queryFiles',
      expect.objectContaining({ pageSize: 48, currentPage: 2 }),
    );
  });
});
