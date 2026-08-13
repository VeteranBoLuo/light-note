import { describe, expect, it, vi } from 'vitest';
import { closeBackfillResources } from './backfillCommunityChatIdentities.js';

describe('backfillCommunityChatIdentities', () => {
  it('关闭数据库与脚本导入链路打开的 Redis 连接', async () => {
    const db = { end: vi.fn().mockResolvedValue(undefined) };
    const redis = { isOpen: true, quit: vi.fn().mockResolvedValue(undefined), destroy: vi.fn() };

    await closeBackfillResources({ db, redis });

    expect(db.end).toHaveBeenCalledTimes(1);
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.destroy).not.toHaveBeenCalled();
  });

  it('Redis 尚未打开时销毁潜在连接句柄且不调用 quit', async () => {
    const db = { end: vi.fn().mockResolvedValue(undefined) };
    const redis = { isOpen: false, quit: vi.fn(), destroy: vi.fn() };

    await closeBackfillResources({ db, redis });

    expect(db.end).toHaveBeenCalledTimes(1);
    expect(redis.quit).not.toHaveBeenCalled();
    expect(redis.destroy).toHaveBeenCalledTimes(1);
  });
});
