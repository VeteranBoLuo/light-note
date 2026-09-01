import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();

vi.mock('../db/index.js', () => ({ default: { query: poolQuery } }));

beforeEach(() => {
  vi.resetModules();
  poolQuery.mockReset();
});

describe('daily review schema', () => {
  it('多实例同时补日期列时只忽略 duplicate-column 竞态', async () => {
    poolQuery
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockRejectedValueOnce(Object.assign(new Error('duplicate column'), { code: 'ER_DUP_FIELDNAME' }))
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockRejectedValueOnce(Object.assign(new Error('duplicate column'), { code: 'ER_DUP_FIELDNAME' }));
    const { ensureDailyReviewSchema } = await import('./dailyReviewSchema.js');

    await expect(ensureDailyReviewSchema()).resolves.toBeUndefined();

    expect(poolQuery).toHaveBeenCalledTimes(7);
    expect(poolQuery.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS growth_recap_state');
    expect(poolQuery.mock.calls[2][0]).toContain('ALTER TABLE growth_recap_state ADD COLUMN last_shown_date');
    expect(poolQuery.mock.calls[3][0]).toContain('CREATE TABLE IF NOT EXISTS daily_content_review_sessions');
    expect(poolQuery.mock.calls[4][0]).toContain('CREATE TABLE IF NOT EXISTS daily_content_review_items');
    expect(poolQuery.mock.calls[6][0]).toContain('ALTER TABLE daily_content_review_items ADD COLUMN resource_date');
  });

  it('last_shown_date 升级的其他数据库错误继续失败关闭', async () => {
    poolQuery
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }));
    const { ensureDailyReviewSchema } = await import('./dailyReviewSchema.js');

    await expect(ensureDailyReviewSchema()).rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
    expect(poolQuery).toHaveBeenCalledTimes(3);
  });

  it('resource_date 升级的其他数据库错误继续失败关闭', async () => {
    poolQuery
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ count: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }));
    const { ensureDailyReviewSchema } = await import('./dailyReviewSchema.js');

    await expect(ensureDailyReviewSchema()).rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
    expect(poolQuery).toHaveBeenCalledTimes(6);
  });
});
