import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));

const { ensureOwnedCloudFolder } = await import('./cloudFolderService.js');

function database(query) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query,
  };
  return { connection, getConnection: vi.fn().mockResolvedValue(connection) };
}

describe('ensureOwnedCloudFolder', () => {
  it('同名目录存在时直接复用并通过账号行锁串行化请求', async () => {
    const db = database(
      vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'user-1' }]])
        .mockResolvedValueOnce([[{ id: 7, name: '周报' }]]),
    );

    await expect(ensureOwnedCloudFolder({ userId: 'user-1', name: ' 周报 ', database: db })).resolves.toEqual({
      id: '7',
      name: '周报',
      created: false,
    });
    expect(db.connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(db.connection.query).toHaveBeenCalledTimes(2);
    expect(db.connection.commit).toHaveBeenCalledOnce();
    expect(db.connection.rollback).not.toHaveBeenCalled();
  });

  it('没有同名目录时在同一事务内创建', async () => {
    const db = database(
      vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'user-1' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 9 }]),
    );

    await expect(ensureOwnedCloudFolder({ userId: 'user-1', name: '周报', database: db })).resolves.toEqual({
      id: '9',
      name: '周报',
      created: true,
    });
    expect(db.connection.query.mock.calls[2]).toEqual([
      'INSERT INTO folders SET ?',
      [{ name: '周报', create_by: 'user-1', del_flag: 0 }],
    ]);
    expect(db.connection.commit).toHaveBeenCalledOnce();
  });

  it('事务失败时回滚且始终释放连接', async () => {
    const db = database(
      vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'user-1' }]])
        .mockRejectedValueOnce(new Error('db')),
    );

    await expect(ensureOwnedCloudFolder({ userId: 'user-1', name: '周报', database: db })).rejects.toThrow('db');
    expect(db.connection.rollback).toHaveBeenCalledOnce();
    expect(db.connection.release).toHaveBeenCalledOnce();
  });
});
