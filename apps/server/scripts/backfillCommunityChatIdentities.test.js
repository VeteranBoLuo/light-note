import { describe, expect, it, vi } from 'vitest';
import { closeBackfillResources, loadCandidates } from './backfillCommunityChatIdentities.js';

describe('backfillCommunityChatIdentities', () => {
  it('回填所有正常注册账号，不再要求先加入聊天室或发过言', async () => {
    const db = { query: vi.fn().mockResolvedValue([[], []]) };

    await loadCandidates(db, 50);

    const [sql, params] = db.query.mock.calls[0];
    expect(String(sql)).toContain("account.role <> 'visitor'");
    expect(String(sql)).toContain('community_chat_user_identities identity');
    expect(String(sql)).not.toContain('community_chat_members');
    expect(String(sql)).not.toContain('community_chat_messages');
    expect(params).toEqual([50]);
  });

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
