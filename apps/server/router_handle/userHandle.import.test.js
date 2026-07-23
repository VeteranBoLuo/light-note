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
  });

  it('导入无站内链接的笔记 → 不同步(旧/越权 id 由解析或校验自然过滤)', async () => {
    extractOwnedResourceRefs.mockReturnValue([]);
    const res = mockRes();
    await importData(req({ notes: [{ title: 'T', content: '纯文本或旧环境链接', type: 'html' }] }), res);
    expect(syncNoteResourceRefs).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('同步抛错 → 整个导入事务回滚,不 commit', async () => {
    extractOwnedResourceRefs.mockReturnValue([{ type: 'note', id: 'n1' }]);
    syncNoteResourceRefs.mockRejectedValueOnce(new Error('sync failed'));
    const res = mockRes();
    await importData(req({ notes: [{ title: 'T', content: '[x](/noteLibrary/n1)', type: 'markdown' }] }), res);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
