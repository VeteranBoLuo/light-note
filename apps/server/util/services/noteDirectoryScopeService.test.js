import { describe, expect, it } from 'vitest';
import { resolveNoteDirectoryScope } from './noteDirectoryScopeService.js';

function databaseWithNotes(rows) {
  return {
    async query() {
      return [rows];
    },
  };
}

const NOTES = [
  { id: 'root-a', parent_id: null, title: 'A', revision: 1, sort: 1, del_flag: 0 },
  { id: 'child-a', parent_id: 'root-a', title: 'A1', revision: 2, sort: 1, del_flag: 0 },
  { id: 'grandchild-a', parent_id: 'child-a', title: 'A1.1', revision: 3, sort: 1, del_flag: 0 },
  { id: 'root-b', parent_id: null, title: 'B', revision: 1, sort: 2, del_flag: 0 },
];

describe('resolveNoteDirectoryScope', () => {
  it('当前目录只返回直属子页面，不把父页面自身混入范围', async () => {
    await expect(
      resolveNoteDirectoryScope(databaseWithNotes(NOTES), {
        userId: 'user-1',
        parentId: 'root-a',
        includeDescendants: false,
      }),
    ).resolves.toMatchObject({
      directory: { parentId: 'root-a', title: 'A', includeDescendants: false },
      resourceRefs: [{ type: 'note', id: 'child-a' }],
    });
  });

  it('递归范围由服务端树快照展开，根目录也可覆盖完整知识库', async () => {
    const database = databaseWithNotes(NOTES);
    const nested = await resolveNoteDirectoryScope(database, {
      userId: 'user-1',
      parentId: 'root-a',
      includeDescendants: true,
    });
    expect(nested.resourceRefs).toEqual([
      { type: 'note', id: 'child-a' },
      { type: 'note', id: 'grandchild-a' },
    ]);

    const root = await resolveNoteDirectoryScope(database, {
      userId: 'user-1',
      parentId: null,
      includeDescendants: true,
    });
    expect(root.resourceRefs).toHaveLength(4);
    expect(new Set(root.resourceRefs.map((ref) => ref.id))).toEqual(
      new Set(['root-a', 'child-a', 'grandchild-a', 'root-b']),
    );
  });

  it('父页面不存在或不属于当前用户时失败关闭', async () => {
    await expect(
      resolveNoteDirectoryScope(databaseWithNotes(NOTES), {
        userId: 'user-1',
        parentId: 'missing',
      }),
    ).resolves.toBeNull();
  });
});
