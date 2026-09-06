import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pool: { getConnection: vi.fn(), query: vi.fn() }, owned: vi.fn(), folder: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  formatDateTime: vi.fn(),
}));
vi.mock('../util/services/resourceTagWriteService.js', () => ({
  queryOwnedResourceIds: mocks.owned,
  batchWriteResourceTags: vi.fn(),
}));
vi.mock('../util/services/cloudFolderTreeService.js', () => ({ resolveCloudFolderTagSelection: mocks.folder }));
const { getBatchResourceTagWorkspace, previewBatchSelection } = await import('./searchHandle.js');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owned.mockImplementation((_db, { ids }) => Promise.resolve(ids));
});
describe('批量标签权威预览', () => {
  it('标签覆盖数统计全部资源，不能被 100 条清单预览截断', async () => {
    const items = Array.from({ length: 101 }, (_, id) => ({ type: 'file', id: String(id + 1) }));
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([items.map((item) => ({ resourceId: item.id, tagId: 'tag-1', tagName: '设计' }))])
        .mockResolvedValueOnce([
          [
            { id: 'tag-1', name: '设计' },
            { id: 'tag-2', name: '工作' },
          ],
        ]),
      release: vi.fn(),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = { send: vi.fn() };
    await getBatchResourceTagWorkspace(
      { user: { id: 'owner' }, body: { selection: { mode: 'explicit', items } } },
      res,
    );
    const response = res.send.mock.calls[0][0];
    expect(response.status).toBe(200);
    expect(response.data.tagRelationCounts).toEqual({ 'tag-1': 101 });
    expect(response.data.items).toHaveLength(100);
    expect(response.data.itemsTruncated).toBe(true);
    expect(response.data.selectionSummary.editableCount).toBe(101);
    expect(Object.keys(response.data.resourceTagsMap)).toHaveLength(100);
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('资源核对不一致时停止，不悄悄缩小范围', async () => {
    const connection = { query: vi.fn(), release: vi.fn() };
    mocks.pool.getConnection.mockResolvedValue(connection);
    mocks.owned.mockResolvedValue([]);
    const res = { send: vi.fn() };
    await getBatchResourceTagWorkspace(
      { user: { id: 'owner' }, body: { selection: { mode: 'explicit', items: [{ id: '1', type: 'file' }] } } },
      res,
    );
    expect(res.send.mock.calls[0][0].status).toBe(409);
    expect(connection.query).not.toHaveBeenCalled();
  });
  it('文件夹入口按资源主体身份准备，与当前搜索筛选隔离', async () => {
    mocks.folder.mockResolvedValue({ resolvedItems: [{ id: '1', type: 'file', title: 'A' }], unavailableItems: [] });
    const res = { send: vi.fn() };
    await previewBatchSelection(
      {
        user: { id: 'admin' },
        resourceUser: { id: 'owner' },
        body: { folderScope: { folderId: '2', includeDescendants: true } },
      },
      res,
    );
    expect(mocks.folder).toHaveBeenCalledWith({
      userId: 'owner',
      folderId: '2',
      includeDescendants: true,
      database: mocks.pool,
    });
    expect(res.send.mock.calls[0][0].data.editableCount).toBe(1);
  });
});
