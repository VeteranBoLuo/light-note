import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import {
  aiResponseRecoveryInternals,
  cleanupExpiredResponseEvents,
  startAiResponseRecoveryCleanupScheduler,
  stopAiResponseRecoveryCleanupScheduler,
} from './aiResponseRecoveryService.js';

describe('旧 Agent SSE 快照过渡清理', () => {
  afterEach(() => {
    stopAiResponseRecoveryCleanupScheduler();
    vi.useRealTimers();
  });

  it('分批删除到不足一个批次即停止', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: aiResponseRecoveryInternals.RESPONSE_CLEANUP_BATCH_SIZE }])
      .mockResolvedValueOnce([{ affectedRows: 7 }]);

    await expect(cleanupExpiredResponseEvents({ query }, { maxBatches: 8 })).resolves.toEqual({ deleted: 507 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('expires_at <= CURRENT_TIMESTAMP');
  });

  it('旧表不存在时安全跳过，其他数据库错误仍向上暴露', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
    await expect(cleanupExpiredResponseEvents({ query: vi.fn().mockRejectedValue(missing) })).resolves.toEqual({
      deleted: 0,
    });

    const offline = Object.assign(new Error('offline'), { code: 'ECONNRESET' });
    await expect(cleanupExpiredResponseEvents({ query: vi.fn().mockRejectedValue(offline) })).rejects.toMatchObject({
      code: 'ECONNRESET',
    });
  });

  it('启动器只创建一个定时任务并限制最短周期', async () => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue([{ affectedRows: 0 }]);
    const start = await startAiResponseRecoveryCleanupScheduler({ intervalMs: 1, database: { query } });
    const duplicate = await startAiResponseRecoveryCleanupScheduler({ intervalMs: 1, database: { query } });

    expect(start).toEqual({
      started: true,
      intervalMs: aiResponseRecoveryInternals.MIN_RESPONSE_CLEANUP_INTERVAL_MS,
    });
    expect(duplicate.started).toBe(false);
    expect(stopAiResponseRecoveryCleanupScheduler()).toBe(true);
    expect(stopAiResponseRecoveryCleanupScheduler()).toBe(false);
  });
});
