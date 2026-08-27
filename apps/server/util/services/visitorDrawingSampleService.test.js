import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDrawingScene, serializeDrawingScene } from '@lightnote/shared/drawing-note';

const poolQuery = vi.fn();
const getConnection = vi.fn();
const snapshotOwnedNoteVersion = vi.fn();

vi.mock('../../db/index.js', () => ({
  default: { query: poolQuery, getConnection },
}));

vi.mock('./noteService.js', () => ({ snapshotOwnedNoteVersion }));

const { VISITOR_DRAWING_SAMPLE_NOTE_ID, buildVisitorDrawingSampleTarget, syncVisitorDrawingSample } =
  await import('./visitorDrawingSampleService.js');

function currentRow(overrides = {}) {
  return {
    id: VISITOR_DRAWING_SAMPLE_NOTE_ID,
    createBy: 'visitor-user',
    title: '手绘笔记示例',
    content: serializeDrawingScene(createEmptyDrawingScene()),
    type: 'drawing',
    revision: 3,
    delFlag: '0',
    role: 'visitor',
    userDelFlag: '0',
    ...overrides,
  };
}

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(queryImplementation),
  };
}

describe('visitorDrawingSampleService', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    getConnection.mockReset();
    snapshotOwnedNoteVersion.mockReset();
  });

  it('dry-run 只检查固定游客笔记，不产生写入', async () => {
    poolQuery.mockResolvedValue([[currentRow()]]);

    const result = await syncVisitorDrawingSample();

    expect(result).toMatchObject({
      applied: false,
      changed: true,
      currentTitle: '手绘笔记示例',
      targetTitle: '手绘笔记示例',
    });
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE n.id = ?'), [VISITOR_DRAWING_SAMPLE_NOTE_ID]);
    expect(getConnection).not.toHaveBeenCalled();
    expect(snapshotOwnedNoteVersion).not.toHaveBeenCalled();
  });

  it('apply 原位保存旧版本并更新正文和 revision，标题保持不变', async () => {
    const row = currentRow();
    const connection = createConnection(async (sql) => {
      if (sql.includes('FOR UPDATE')) return [[row]];
      if (sql.includes('UPDATE note')) return [{ affectedRows: 1 }];
      return [[]];
    });
    getConnection.mockResolvedValue(connection);

    const result = await syncVisitorDrawingSample({ apply: true });

    expect(snapshotOwnedNoteVersion).toHaveBeenCalledWith(connection, {
      userId: 'visitor-user',
      noteId: VISITOR_DRAWING_SAMPLE_NOTE_ID,
      currentNote: row,
      reason: 'visitor-sample-sync',
    });
    const target = buildVisitorDrawingSampleTarget();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('revision = revision + 1'), [
      '手绘笔记示例',
      target.content,
      VISITOR_DRAWING_SAMPLE_NOTE_ID,
      'visitor-user',
      3,
    ]);
    expect(result).toMatchObject({
      applied: true,
      changed: true,
      currentRevision: 4,
      previousTitle: '手绘笔记示例',
      targetTitle: '手绘笔记示例',
    });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('内容已同步时幂等跳过，不重复增加版本', async () => {
    const target = buildVisitorDrawingSampleTarget();
    const connection = createConnection(async (sql) => {
      if (sql.includes('FOR UPDATE')) return [[currentRow({ title: target.title, content: target.content })]];
      return [[]];
    });
    getConnection.mockResolvedValue(connection);

    const result = await syncVisitorDrawingSample({ apply: true });

    expect(result).toMatchObject({ applied: false, changed: false, currentRevision: 3 });
    expect(snapshotOwnedNoteVersion).not.toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('UPDATE note'))).toBe(false);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('固定 ID 不再属于有效游客账号时失败关闭并回滚', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('FOR UPDATE')) return [[currentRow({ role: 'user' })]];
      return [[]];
    });
    getConnection.mockResolvedValue(connection);

    await expect(syncVisitorDrawingSample({ apply: true })).rejects.toMatchObject({
      code: 'VISITOR_DRAWING_SAMPLE_OWNER_INVALID',
    });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
