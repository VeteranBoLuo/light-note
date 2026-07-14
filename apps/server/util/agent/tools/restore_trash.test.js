import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
vi.mock('../../../db/index.js', () => ({
  default: { query, getConnection: vi.fn(() => connection) },
}));

const { default: restoreTrash } = await import('./restore_trash.js');

describe('restore_trash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([[{ count: 0 }]]);
    connection.query.mockResolvedValue([{ affectedRows: 0 }]);
  });

  it('空条件、非法类型及缺少类型的 ID 均在 SQL 前拒绝', async () => {
    await expect(restoreTrash.preview({}, { userId: 'u1' })).rejects.toThrow(/FILTER_REQUIRED/);
    await expect(restoreTrash.preview({ type: 'user' }, { userId: 'u1' })).rejects.toThrow(/INVALID_TYPE/);
    await expect(restoreTrash.preview({ id: 'same-id' }, { userId: 'u1' })).rejects.toThrow(/TYPE_REQUIRED/);
    expect(query).not.toHaveBeenCalled();
  });

  it('预检只统计当前用户且返回分类型影响数量', async () => {
    query
      .mockResolvedValueOnce([[{ count: 2 }]])
      .mockResolvedValueOnce([[{ count: 1 }]])
      .mockResolvedValueOnce([[{ count: 0 }]]);
    const preview = await restoreTrash.preview({ timeRange: '今天' }, { userId: 'u1' });
    expect(preview.impact).toBe('预计恢复 3 项内容');
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.every((call) => call[1][0] === 'u1')).toBe(true);
  });

  it('执行恢复使用事务并按资源类型限制归属', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await restoreTrash.execute({ type: 'note', id: 'n1' }, { userId: 'u1' });
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('create_by = ? AND del_flag = 1 AND id = ?'),
      ['u1', 'n1'],
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ type: 'note', count: 1 }]);
  });

  it('任一更新失败时整体回滚并释放连接', async () => {
    connection.query.mockRejectedValueOnce(new Error('db failed'));
    await expect(restoreTrash.execute({ type: 'file' }, { userId: 'u1' })).rejects.toThrow('db failed');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
