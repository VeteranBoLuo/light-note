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
const { default: useUserStore } = await import('./useUser');

describe('cloud space pagination', () => {
  it('carries the account scope through pagination and mutation refresh without changing the upload folder', async () => {
    setActivePinia(createPinia());
    const cloud = useCloudSpaceStore();
    useUserStore().preferences.cloudIncludeDescendants = true;
    cloud.folder = { id: '1', name: '旅行' };
    mocks.apiQueryPost.mockResolvedValue({ status: 200, data: { items: [], total: 100, page: 1, hasMore: true } });
    await cloud.queryFieldList();
    await cloud.loadMoreFiles();
    await cloud.refreshLoadedFiles();
    for (const [, body] of mocks.apiQueryPost.mock.calls)
      expect(body.filters).toMatchObject({ folderId: '1', includeDescendants: true });
    expect(cloud.folder).toEqual({ id: '1', name: '旅行' });
  });
  it('ignores a previous scope response and exposes a failed new scope instead of a false empty state', async () => {
    setActivePinia(createPinia());
    const cloud = useCloudSpaceStore();
    let finish!: (value: any) => void;
    mocks.apiQueryPost.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const oldRequest = cloud.queryFieldList();
    useUserStore().preferences.cloudIncludeDescendants = true;
    mocks.apiQueryPost.mockResolvedValueOnce({ status: 503 });
    await cloud.queryFieldList();
    finish({ status: 200, data: { items: [{ id: 'stale' }], total: 1, page: 1 } });
    await oldRequest;
    expect(cloud.fileError).toBe(true);
    expect(cloud.fileList).toEqual([]);
    mocks.apiQueryPost.mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'current' }], total: 1, page: 1 } });
    await cloud.queryFieldList();
    expect(cloud.fileError).toBe(false);
    expect(cloud.fileList[0].id).toBe('current');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setActivePinia(createPinia());
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { totalSizeMB: 10, activeSizeMB: 8, trashSizeMB: 2, quotaMB: 1024, sharedWithTrash: true },
    });
  });

  it('待整理与文件类型、目录和搜索组合，并用于分页和刷新', async () => {
    const store = useCloudSpaceStore();
    store.pendingOnly = true;
    store.folder = { id: 'folder-1', name: 'Folder' };
    store.searchFileName = 'report';
    store.typeCheckValue = ['pdf'];
    mocks.apiQueryPost.mockResolvedValue({ status: 200, data: { items: [], total: 60, page: 1, hasMore: true } });
    await store.queryFieldList();
    await store.loadMoreFiles();
    await store.refreshLoadedFiles();
    for (const [, body] of mocks.apiQueryPost.mock.calls)
      expect(body.filters).toEqual({
        pendingOnly: true,
        folderId: 'folder-1',
        fileName: 'report',
        category: ['pdf'],
        includeDescendants: false,
      });
    store.reset();
    expect(store.pendingOnly).toBe(false);
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

    await store.setFileSortValue({ field: 'fileSize', order: 'asc' });
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ sort: { field: 'fileSize', order: 'asc' } }),
    );

    await store.setFileSortValue({ field: 'createTime', order: 'asc' });
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ sort: { field: 'createTime', order: 'asc' } }),
    );

    setActivePinia(createPinia());
    expect(useCloudSpaceStore().fileSort).toEqual({ field: 'createTime', order: 'asc' });
  });

  it('损坏或越权的本地排序字段回退到原有默认顺序', () => {
    window.localStorage.setItem(CLOUD_FILE_SORT_STORAGE_KEY, JSON.stringify({ field: 'notAllowed', order: 'asc' }));
    setActivePinia(createPinia());
    expect(useCloudSpaceStore().fileSort).toEqual({ field: 'createTime', order: 'desc' });
  });

  it('时间表头先按最新上传排序，再次点击切换方向并从第一页重新查询', async () => {
    mocks.apiQueryPost.mockResolvedValue({
      status: 200,
      data: { items: [{ id: 'latest-file' }], total: 96, page: 1, hasMore: true },
    });
    const store = useCloudSpaceStore();
    await store.setFileSort('fileName');
    store.filePage = 3;
    store.fileList = [{ id: 'old-page-file' }];

    await store.setFileSort('createTime');
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ currentPage: 1, sort: { field: 'createTime', order: 'desc' } }),
    );
    expect(store.filePage).toBe(1);
    expect(store.fileList).toEqual([{ id: 'latest-file' }]);

    await store.setFileSort('createTime');
    expect(mocks.apiQueryPost).toHaveBeenLastCalledWith(
      '/api/file/queryFiles',
      expect.objectContaining({ currentPage: 1, sort: { field: 'createTime', order: 'asc' } }),
    );
    expect(JSON.parse(window.localStorage.getItem(CLOUD_FILE_SORT_STORAGE_KEY) || '{}')).toEqual({
      field: 'createTime',
      order: 'asc',
    });
  });
});
