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

const { CLOUD_FILE_SORT_STORAGE_KEY, default: useCloudSpaceStore } = await import('./cloudSpace');

describe('cloud space pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setActivePinia(createPinia());
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { totalSizeMB: 10, activeSizeMB: 8, trashSizeMB: 2, quotaMB: 1024, sharedWithTrash: true },
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
      expect.objectContaining({
        pageSize: 48,
        currentPage: 2,
        sort: { field: 'createTime', order: 'desc' },
      }),
    );
  });

  it('名称和大小排序交给接口处理，并在本机记住选择', async () => {
    mocks.apiQueryPost.mockResolvedValue({
      status: 200,
      data: { items: [], total: 0, page: 1, hasMore: false },
    });
    const store = useCloudSpaceStore();

    await store.setFileSort('fileName');
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ sort: { field: 'fileName', order: 'asc' } }),
    );
    expect(JSON.parse(window.localStorage.getItem(CLOUD_FILE_SORT_STORAGE_KEY) || '{}')).toEqual({
      field: 'fileName',
      order: 'asc',
    });

    await store.setFileSort('fileName');
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ sort: { field: 'fileName', order: 'desc' } }),
    );

    await store.setFileSort('fileSize');
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ sort: { field: 'fileSize', order: 'desc' } }),
    );

    setActivePinia(createPinia());
    expect(useCloudSpaceStore().fileSort).toEqual({ field: 'fileSize', order: 'desc' });
  });

  it('损坏或越权的本地排序字段回退到原有默认顺序', () => {
    window.localStorage.setItem(CLOUD_FILE_SORT_STORAGE_KEY, JSON.stringify({ field: 'notAllowed', order: 'asc' }));
    setActivePinia(createPinia());
    expect(useCloudSpaceStore().fileSort).toEqual({ field: 'createTime', order: 'desc' });
  });
});
