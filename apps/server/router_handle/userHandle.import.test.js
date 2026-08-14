import { describe, it, expect, vi, beforeEach } from 'vitest';

// 笔记内联提及(N0)· 备份导入路径的引用同步接入测试(P0-1)。
// 隔离引用同步钩子(其逻辑由 noteReferenceService.test.js 覆盖),验证:
//   - 导入的每篇笔记在导入事务内、INSERT 后用最终 content/type 解析并同步;
//   - 无站内链接的笔记不触发同步;
//   - 同步抛错时整个导入事务回滚,不 commit。
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(async () => [[]]),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(async () => connection);
vi.mock('../db/index.js', () => ({ default: { query: vi.fn(async () => [[]]), getConnection } }));

const ensureNotVisitor = vi.fn(() => true);
vi.mock('../util/auth.js', async () => {
  const actual = await vi.importActual('../util/auth.js');
  return { ...actual, ensureNotVisitor };
});

const completeGrowthTask = vi.fn(async () => ({ completed: true }));
vi.mock('../util/growthTaskCompletion.js', () => ({ completeGrowthTask }));
vi.mock('../util/services/newUserSeedService.js', () => ({
  seedNewUserCloudFile: vi.fn(),
  seedNewUserWorkspaceData: vi.fn(),
}));
vi.mock('../util/personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('../util/obsClient.js', () => ({
  bucketBaseUrl: 'https://example.invalid',
  buildObjectKey: vi.fn(),
  buildObjectUrl: vi.fn(),
  copyObjectInObs: vi.fn(),
  createDownloadSignedUrl: vi.fn(),
  createUploadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  putObjectToObs: vi.fn(),
}));

const extractOwnedResourceRefs = vi.fn(() => []);
const syncNoteResourceRefs = vi.fn(async () => ({ inserted: 0, updated: 0, deleted: 0 }));
vi.mock('../util/services/noteReferenceService.js', () => ({ extractOwnedResourceRefs, syncNoteResourceRefs }));

await import('../util/common.js'); // 破 common↔router↔handler 循环依赖(同其它 handler 测试)
const { importData } = await import('./userHandle.js');

function mockRes() {
  const res = {};
  res.send = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}
const req = (data) => ({ user: { id: 'u1', role: 'user' }, body: { data } });

describe('importData 引用同步接入(N0 · P0-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.query.mockResolvedValue([[]]);
    ensureNotVisitor.mockReturnValue(true);
    extractOwnedResourceRefs.mockReturnValue([]);
  });

  it('导入含站内链接的笔记 → 同一导入事务内解析并同步引用', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    const res = mockRes();
    await importData(req({ notes: [{ title: 'T', content: '[x](/noteLibrary/n1)', type: 'markdown' }] }), res);
    expect(extractOwnedResourceRefs).toHaveBeenCalledWith({ content: '[x](/noteLibrary/n1)', type: 'markdown' });
    expect(syncNoteResourceRefs).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ userId: 'u1', refs: [{ type: 'note', id: 'n1' }] }),
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(completeGrowthTask).toHaveBeenCalledWith('u1', 'first_note', { userRole: 'user' });
  });

  it('导入无站内链接的笔记 → 不同步(旧/越权 id 由解析或校验自然过滤)', async () => {
    extractOwnedResourceRefs.mockReturnValue([]);
    const res = mockRes();
    await importData(req({ notes: [{ title: 'T', content: '纯文本或旧环境链接', type: 'html' }] }), res);
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('导入 Markdown 时恢复行首被旧页面转义的引用标记', async () => {
    const res = mockRes();
    await importData(req({ notes: [{ title: '日报', content: '&gt; 2026-07-24 星期五', type: 'markdown' }] }), res);

    const noteInsert = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO note SET ?');
    expect(noteInsert?.[1]?.[0]).toMatchObject({ content: '> 2026-07-24 星期五', type: 'markdown' });
  });

  it('手绘备份按共享 scene 协议规范化，非法 scene 只跳过当前笔记', async () => {
    const res = mockRes();
    await importData(
      req({
        notes: [
          {
            id: 'valid-drawing',
            title: '草图',
            type: 'drawing',
            content: JSON.stringify({
              v: 1,
              page: { width: 1024, height: 1448 },
              elements: [{ id: 's1', kind: 'stroke', color: '#1f2937', width: 4, points: [1.234, 2.345] }],
            }),
          },
          { id: 'invalid-drawing', title: '坏草图', type: 'drawing', content: '{"v":2}' },
        ],
      }),
      res,
    );

    const noteInserts = connection.query.mock.calls
      .filter(([sql]) => sql === 'INSERT INTO note SET ?')
      .map(([, params]) => params[0]);
    expect(noteInserts).toHaveLength(1);
    expect(noteInserts[0]).toMatchObject({ title: '草图', type: 'drawing' });
    expect(noteInserts[0].content).toBe(
      '{"v":1,"page":{"width":1024,"height":1448},"elements":[{"id":"s1","kind":"stroke","color":"#1f2937","width":4,"points":[1.23,2.35]}]}',
    );
    expect(res.send.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 200,
      data: { notes: { added: 1, skipped: 1, invalid: 1 } },
    });
  });

  it('同步抛错 → 整个导入事务回滚,不 commit', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    syncNoteResourceRefs.mockRejectedValueOnce(new Error('sync failed'));
    const res = mockRes();
    await importData(req({ notes: [{ title: 'T', content: '[x](/noteLibrary/n1)', type: 'markdown' }] }), res);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('先创建全部笔记再按旧 ID 映射恢复父关系，并保留同级 sort 与删除批次字段', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (/^UPDATE note\s+SET parent_id/.test(String(sql).trim())) return [{ affectedRows: 1 }];
      return [[]];
    });
    const res = mockRes();

    await importData(
      req({
        notes: [
          {
            id: 'old-child',
            parentId: 'old-parent',
            title: '子页面',
            content: 'child',
            type: 'html',
            sort: 7,
            treeDeleteBatchId: 'legacy-batch',
          },
          { id: 'old-parent', parentId: null, title: '父页面', content: 'parent', type: 'html', sort: 2 },
        ],
      }),
      res,
    );

    const noteInserts = connection.query.mock.calls
      .filter(([sql]) => sql === 'INSERT INTO note SET ?')
      .map(([, params]) => params[0]);
    const child = noteInserts.find((note) => note.title === '子页面');
    const parent = noteInserts.find((note) => note.title === '父页面');
    expect(child).toMatchObject({ parent_id: null, sort: 7, tree_delete_batch_id: 'legacy-batch' });
    expect(parent).toMatchObject({ parent_id: null, sort: 2 });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET parent_id = ?'), [
      parent.id,
      child.id,
      'u1',
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('父 ID 在备份中缺失时把页面放到根目录并返回可解释预警', async () => {
    const res = mockRes();
    await importData(
      req({ notes: [{ id: 'old-child', parentId: 'missing', title: '孤立页面', content: 'x', type: 'html' }] }),
      res,
    );

    expect(connection.query.mock.calls.some(([sql]) => /UPDATE note\s+SET parent_id/.test(String(sql)))).toBe(false);
    const response = res.send.mock.calls.at(-1)?.[0];
    expect(response).toMatchObject({
      status: 200,
      data: {
        notes: { added: 1, rerooted: 1 },
        preflight: { warnings: expect.arrayContaining(['NOTE_TREE_MISSING_PARENT_REROOTED']) },
      },
    });
  });

  it('备份目录存在循环时在获取事务连接前整批拒绝', async () => {
    const res = mockRes();
    await importData(
      req({
        notes: [
          { id: 'a', parentId: 'b', title: 'A', content: 'a' },
          { id: 'b', parentId: 'a', title: 'B', content: 'b' },
        ],
      }),
      res,
    );

    expect(getConnection).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 400,
      data: { errorCode: 'NOTE_IMPORT_TREE_CYCLE' },
    });
  });
});
