import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: {
    query: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));

const {
  createIconBatch,
  getIconBatchStatus,
  retryIconBatchFailures,
} = await import('./bookmarkIconBatchService.js');

describe('bookmarkIconBatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BOOKMARK_ICON_BACKGROUND_JOBS_ENABLED;
  });

  it('功能开关关闭时不创建后台任务', async () => {
    process.env.BOOKMARK_ICON_BACKGROUND_JOBS_ENABLED = 'false';

    const result = await createIconBatch('user-1', [
      { id: 'bookmark-1', url: 'https://example.com' },
    ]);

    expect(result).toMatchObject({ total: 0, status: 'no_tasks' });
    expect(mocks.pool.query).not.toHaveBeenCalled();
  });

  it('创建批次遇到数据库死锁时会有限重试并返回实际任务数', async () => {
    const deadlock = Object.assign(new Error('deadlock'), {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
    });
    mocks.pool.query
      .mockRejectedValueOnce(deadlock)
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await createIconBatch('user-1', [
      { id: 'bookmark-1', url: 'https://example.com/path' },
    ]);

    expect(result).toMatchObject({ total: 1, status: 'queued' });
    expect(mocks.pool.query).toHaveBeenCalledTimes(2);
    expect(mocks.pool.query.mock.calls[1]).toEqual(mocks.pool.query.mock.calls[0]);
  });

  it('创建批次遇到非锁冲突错误时不重试', async () => {
    const failure = Object.assign(new Error('schema unavailable'), {
      code: 'ER_NO_SUCH_TABLE',
    });
    mocks.pool.query.mockRejectedValueOnce(failure);

    await expect(
      createIconBatch('user-1', [
        { id: 'bookmark-1', url: 'https://example.com/path' },
      ]),
    ).rejects.toBe(failure);
    expect(mocks.pool.query).toHaveBeenCalledOnce();
  });

  it('增量状态查询严格携带用户归属和可回传的游标', async () => {
    mocks.pool.query
      .mockResolvedValueOnce([[{ status: 'success', cnt: 1 }]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        {
          jobId: 7,
          bookmarkId: 'bookmark-1',
          status: 'success',
          finishedAt: new Date('2026-07-25T02:00:00.123Z'),
          iconUrl: '/uploads/icon.png',
        },
      ]]);

    const result = await getIconBatchStatus('batch-1', 'user-1', {
      finishedAt: '2026-07-25T01:00:00.000Z',
      jobId: 3,
    });

    expect(result.status).toBe('completed');
    expect(result.total).toBe(1);
    expect(result.updates).toHaveLength(1);
    expect(result.nextCursor).toEqual({
      finishedAt: new Date('2026-07-25T02:00:00.123Z'),
      jobId: 7,
    });
    expect(mocks.pool.query.mock.calls[2][1][0]).toBe('batch-1');
    expect(mocks.pool.query.mock.calls[2][1][1]).toBe('user-1');
    expect(mocks.pool.query.mock.calls[2][1][2]).toBeInstanceOf(Date);
  });

  it('重试失败项时重新读取当前 URL 并清空全部终态与锁字段', async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn()
        .mockResolvedValueOnce([[
          {
            id: 11,
            bookmarkId: 'bookmark-1',
            currentUrl: 'https://new.example/path',
          },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);

    const result = await retryIconBatchFailures('batch-1', 'user-1', true);

    expect(result).toEqual({ retried: 1, cancelled: 0 });
    const updateSql = connection.query.mock.calls[1][0];
    const updateParams = connection.query.mock.calls[1][1];
    expect(updateSql).toContain('url_snapshot = ?');
    expect(updateSql).toContain('origin_key = ?');
    expect(updateSql).toContain('url_hash = ?');
    expect(updateSql).toContain('finished_at = NULL');
    expect(updateParams[0]).toBe('https://new.example/path');
    expect(updateParams[1]).toBe('https://new.example');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
