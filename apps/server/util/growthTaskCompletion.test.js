import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection) };
const grantExp = vi.fn();
const ensureGrowthTaskSchema = vi.fn();

vi.mock('../db/index.js', () => ({ default: pool }));
vi.mock('./growth.js', () => ({ grantExp }));
vi.mock('./growthTaskSchema.js', () => ({ ensureGrowthTaskSchema }));

const { completeGrowthTask } = await import('./growthTaskCompletion.js');

describe('growthTaskCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureGrowthTaskSchema.mockResolvedValue(undefined);
    connection.beginTransaction.mockResolvedValue(undefined);
    connection.commit.mockResolvedValue(undefined);
    connection.rollback.mockResolvedValue(undefined);
    connection.release.mockImplementation(() => {});
    grantExp.mockResolvedValue({ granted: 50, duplicated: false });
  });

  it('游客、root 和未知任务不写库', async () => {
    await expect(completeGrowthTask('visitor', 'first_note', { userRole: 'visitor' })).resolves.toEqual({
      completed: false,
      skipped: 'read_only_actor',
    });
    await expect(completeGrowthTask('root-1', 'first_note', { userRole: 'root' })).resolves.toEqual({
      completed: false,
      skipped: 'read_only_actor',
    });
    await expect(completeGrowthTask('user-1', 'unknown')).resolves.toEqual({
      completed: false,
      skipped: 'unknown_task',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('首次完成使用唯一键抢占并发资格，再在同一连接发放任务经验', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(completeGrowthTask('user-1', 'first_note', { userRole: 'user' })).resolves.toMatchObject({
      completed: true,
      taskKey: 'first_note',
      rewardExp: 50,
      granted: 50,
    });
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO user_growth_tasks'), [
      'user-1',
      'first_note',
      null,
    ]);
    expect(grantExp).toHaveBeenCalledWith(
      'user-1',
      'growth_task',
      expect.objectContaining({ refId: 'first_note', amount: 50 }),
      connection,
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('重复完成不再次发放经验', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(completeGrowthTask('user-1', 'first_bookmark', { userRole: 'user' })).resolves.toMatchObject({
      completed: false,
      duplicated: true,
    });
    expect(grantExp).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('经验发放失败时回滚任务状态', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    grantExp.mockRejectedValueOnce(new Error('ledger unavailable'));
    await expect(completeGrowthTask('user-1', 'first_todo', { userRole: 'user' })).rejects.toThrow('ledger unavailable');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
