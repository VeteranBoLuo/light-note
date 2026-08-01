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

const { claimGrowthTask, completeGrowthTask } = await import('./growthTaskCompletion.js');

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

  it('首次达成只写任务状态，不自动发放经验', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(completeGrowthTask('user-1', 'first_note', { userRole: 'user' })).resolves.toMatchObject({
      completed: true,
      taskKey: 'first_note',
      rewardExp: 50,
    });
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO user_growth_tasks'), [
      'user-1',
      'first_note',
      null,
    ]);
    expect(grantExp).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('重复达成不改变状态也不发放经验', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(completeGrowthTask('user-1', 'first_bookmark', { userRole: 'user' })).resolves.toMatchObject({
      completed: false,
      duplicated: true,
    });
    expect(grantExp).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('达成状态写入失败时回滚', async () => {
    connection.query.mockRejectedValueOnce(new Error('task state unavailable'));
    await expect(completeGrowthTask('user-1', 'first_todo', { userRole: 'user' })).rejects.toThrow(
      'task state unavailable',
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('任务未达成时不能领取', async () => {
    connection.query.mockResolvedValueOnce([[], []]);
    await expect(claimGrowthTask('user-1', 'first_note', { userRole: 'user' })).resolves.toEqual({
      ok: false,
      reason: 'incomplete',
      taskKey: 'first_note',
    });
    expect(grantExp).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('用户主动领取时在同一事务发经验并写领取时间', async () => {
    connection.query
      .mockResolvedValueOnce([[{ status: 'completed', claimedAt: null }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    grantExp.mockResolvedValueOnce({ granted: 50, duplicated: false, leveledUp: true });

    await expect(claimGrowthTask('user-1', 'profile_avatar', { userRole: 'user' })).resolves.toEqual({
      ok: true,
      already: false,
      taskKey: 'profile_avatar',
      expGained: 50,
      leveledUp: true,
    });
    expect(connection.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      ['user-1', 'profile_avatar'],
    );
    expect(grantExp).toHaveBeenCalledWith(
      'user-1',
      'growth_task',
      expect.objectContaining({ refId: 'profile_avatar', amount: 50 }),
      connection,
    );
    expect(connection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET claimed_at = COALESCE(claimed_at, NOW())'),
      ['user-1', 'profile_avatar'],
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('已领取任务幂等返回，不重复发经验', async () => {
    connection.query.mockResolvedValueOnce([
      [{ status: 'completed', claimedAt: '2026-08-01 12:00:00' }],
      [],
    ]);
    await expect(claimGrowthTask('user-1', 'first_bookmark', { userRole: 'user' })).resolves.toEqual({
      ok: true,
      already: true,
      taskKey: 'first_bookmark',
      expGained: 0,
    });
    expect(grantExp).not.toHaveBeenCalled();
  });

  it('经验发放失败时领取状态与账本一起回滚', async () => {
    connection.query.mockResolvedValueOnce([[{ status: 'completed', claimedAt: null }], []]);
    grantExp.mockRejectedValueOnce(new Error('ledger unavailable'));
    await expect(claimGrowthTask('user-1', 'first_todo', { userRole: 'user' })).rejects.toThrow(
      'ledger unavailable',
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
