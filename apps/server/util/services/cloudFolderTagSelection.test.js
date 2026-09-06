import { describe, expect, it, vi } from 'vitest';
import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('./cloudFileDeletionService.js', () => ({ softDeleteOwnedCloudFiles: vi.fn() }));
const { resolveCloudFolderTagSelection } = await import('./cloudFolderTreeService.js');
const folders = [
  { id: 1, name: '项目', parent_id: null },
  { id: 2, name: '设计', parent_id: 1 },
  { id: 3, name: '归档', parent_id: 2 },
  { id: 4, name: '其他', parent_id: null },
];
function db(rows = [{ id: 9, title: '设计.pdf' }], tree = folders) {
  return { query: vi.fn().mockResolvedValueOnce([tree]).mockResolvedValue([rows]) };
}
describe('文件夹标签操作范围', () => {
  it.each([false, true])('只读核对 owner、存活文件及显式递归范围：%s', async (includeDescendants) => {
    const database = db();
    const result = await resolveCloudFolderTagSelection({
      userId: 'owner',
      folderId: '1',
      includeDescendants,
      database,
    });
    expect(database.query.mock.calls[0][1]).toEqual(['owner']);
    expect(database.query.mock.calls[1][1]).toEqual(['owner', '1', ...(includeDescendants ? ['2', '3'] : []), 1001]);
    expect(database.query.mock.calls[1][0]).toContain('create_by = ? AND del_flag = 0');
    expect(database.query.mock.calls[1][0]).not.toMatch(/FOR UPDATE|file_url|object_key|SELECT \*/);
    expect(result.resolvedItems).toEqual([{ id: '9', type: 'file', title: '设计.pdf' }]);
  });
  it('越权、已删除或不存在的文件夹失败，不会扩大成全部文件', async () => {
    const database = db([], []);
    await expect(resolveCloudFolderTagSelection({ userId: 'other', folderId: '1', database })).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
    });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
  it('超限整体拒绝，不截取一部分文件继续操作', async () => {
    const database = db(Array.from({ length: MAX_EXPLICIT_RESOURCE_SELECTION + 1 }, (_, id) => ({ id })));
    await expect(resolveCloudFolderTagSelection({ userId: 'owner', folderId: '1', database })).rejects.toMatchObject({
      code: 'FOLDER_TAG_SELECTION_LIMIT',
    });
  });
  it('空目录返回空范围', async () => {
    expect(
      (await resolveCloudFolderTagSelection({ userId: 'owner', folderId: '1', database: db([]) })).resolvedItems,
    ).toEqual([]);
  });
});
