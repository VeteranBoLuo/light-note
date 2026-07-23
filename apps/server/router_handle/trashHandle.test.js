import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query,
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(() => connection);
const deleteNoteResourceRefsForNotes = vi.fn();
const purgeDocumentSourcesForCloudFiles = vi.fn();
const cleanupOrphanNoteImages = vi.fn();

vi.mock('../db/index.js', () => ({
  default: { getConnection, query: vi.fn(), escape: (value) => `'${String(value)}'` },
}));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/obsClient.js', () => ({
  deleteObjectFromObs: vi.fn(),
  buildObjectKey: vi.fn(),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: vi.fn(() => true) }));
vi.mock('../util/aiDocument/service.js', () => ({ purgeDocumentSourcesForCloudFiles }));
vi.mock('../util/noteImages.js', () => ({ cleanupOrphanNoteImages }));
vi.mock('../util/services/noteReferenceService.js', () => ({ deleteNoteResourceRefsForNotes }));

const { permanentDelete, restoreTrash, emptyTrash, cleanupAllExpiredTrash } = await import('./trashHandle.js');

const mockRes = () => ({ send: vi.fn() });

describe('回收站与待整理关系', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnection.mockResolvedValue(connection);
    query.mockResolvedValue([{ affectedRows: 1 }]);
    deleteNoteResourceRefsForNotes.mockResolvedValue({ deleted: 0 });
    purgeDocumentSourcesForCloudFiles.mockResolvedValue({ deleted: 0 });
    cleanupOrphanNoteImages.mockResolvedValue({ deleted: 0 });
  });

  it('永久删除时在同一事务内兜底清理待整理关系', async () => {
    const res = mockRes();
    await permanentDelete({
      user: { id: 'u1' },
      body: { resourceType: 'bookmark', ids: ['b1'] },
    }, res);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM resource_inbox'))).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('恢复资源不自动恢复待整理状态', async () => {
    await restoreTrash({
      user: { id: 'u1' },
      body: { resourceType: 'note', ids: ['n1'] },
    }, mockRes());

    expect(query.mock.calls.some(([sql]) => String(sql).includes('resource_inbox'))).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('永久删除笔记时，在提交前清理对应的引用关系', async () => {
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (/SELECT id FROM note WHERE id IN/.test(statement)) return [[{ id: 'n1' }]];
      if (/SELECT url FROM note_images/.test(statement)) return [[]];
      return [{ affectedRows: 1 }];
    });

    await permanentDelete(
      { user: { id: 'u1' }, body: { resourceType: 'note', ids: ['n1'] } },
      mockRes(),
    );

    expect(deleteNoteResourceRefsForNotes).toHaveBeenCalledWith(connection, ['n1']);
    expect(deleteNoteResourceRefsForNotes.mock.invocationCallOrder[0]).toBeLessThan(connection.commit.mock.invocationCallOrder[0]);
  });

  it('清空回收站时，在提交前清理所有待删除笔记的引用关系', async () => {
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (/SELECT id, obs_key, create_by, file_name FROM files/.test(statement)) return [[]];
      if (/SELECT id FROM note WHERE create_by = \? AND del_flag = 1/.test(statement)) return [[{ id: 'n1' }, { id: 'n2' }]];
      if (/SELECT url FROM note_images/.test(statement)) return [[]];
      return [{ affectedRows: 1 }];
    });

    await emptyTrash({ user: { id: 'u1' }, body: {} }, mockRes());

    expect(deleteNoteResourceRefsForNotes).toHaveBeenCalledWith(connection, ['n1', 'n2']);
    expect(deleteNoteResourceRefsForNotes.mock.invocationCallOrder[0]).toBeLessThan(connection.commit.mock.invocationCallOrder[0]);
  });

  it('定时过期清理时，也在提交前清理笔记引用关系', async () => {
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (/SELECT b.id FROM bookmark/.test(statement)) return [[]];
      if (/SELECT n.id FROM note n/.test(statement)) return [[{ id: 'expired-note' }]];
      if (/SELECT url FROM note_images/.test(statement)) return [[]];
      if (/SELECT f.id, f.obs_key, f.create_by, f.file_name FROM files/.test(statement)) return [[]];
      return [{ affectedRows: 1 }];
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanupAllExpiredTrash();

    logSpy.mockRestore();
    expect(deleteNoteResourceRefsForNotes).toHaveBeenCalledWith(connection, ['expired-note']);
    expect(deleteNoteResourceRefsForNotes.mock.invocationCallOrder[0]).toBeLessThan(connection.commit.mock.invocationCallOrder[0]);
  });

  it('引用关系清理失败时，永久删除事务回滚且不提交', async () => {
    const cleanupError = new Error('reference cleanup failed');
    query.mockImplementation(async (sql) => {
      const statement = String(sql);
      if (/SELECT id FROM note WHERE id IN/.test(statement)) return [[{ id: 'n1' }]];
      if (/SELECT url FROM note_images/.test(statement)) return [[]];
      return [{ affectedRows: 1 }];
    });
    deleteNoteResourceRefsForNotes.mockRejectedValueOnce(cleanupError);

    await permanentDelete(
      { user: { id: 'u1' }, body: { resourceType: 'note', ids: ['n1'] } },
      mockRes(),
    );

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
