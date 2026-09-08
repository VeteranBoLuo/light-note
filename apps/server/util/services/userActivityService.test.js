import { describe, it, expect, vi } from 'vitest';
import {
  activityTime,
  recordActivity,
  queryActivitySummary,
  queryActivityBaseline,
  queryActiveUsers,
  activityCoverage,
} from './userActivityService.js';

const now = new Date('2026-09-08T10:30:00+08:00');
const metadata = [[{ startedAt: '2026-08-01 10:00:00.000000' }]];
function redisStub() {
  const redis = { isReady: true, set: vi.fn().mockResolvedValue('OK'), eval: vi.fn().mockResolvedValue(1) };
  redis.withAbortSignal = vi.fn(() => redis);
  return redis;
}
describe('real activity writes', () => {
  it('uses server Beijing date and atomically updates the same user/day; duplicates do not write', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) },
      redis = redisStub();
    expect(await recordActivity('u1', { db, redis, now })).toEqual({ accepted: true, recorded: true });
    expect(redis.set.mock.calls[0][0]).toBe('user-activity:v1:2026-09-08:u1');
    expect(redis.set.mock.calls[0][2]).toEqual({ NX: true, EX: 60 });
    expect(db.query.mock.calls[0][1]).toEqual([
      '2026-09-08',
      '2026-09-08 10:30:00.000',
      '2026-09-08 10:30:00.000',
      'u1',
    ]);
    redis.set.mockResolvedValue(null);
    expect(await recordActivity('u1', { db, redis, now })).toEqual({ accepted: true, recorded: false });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('Redis failure never falls back to unbounded database writes', async () => {
    const db = { query: vi.fn() },
      redis = redisStub();
    redis.isReady = false;
    await expect(recordActivity('u', { db, redis, now })).rejects.toMatchObject({ code: 'ACTIVITY_REDIS_UNAVAILABLE' });
    expect(db.query).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('failed writes release only their own reservation and do not mark success', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('offline')) },
      redis = redisStub();
    await expect(recordActivity('u', { db, redis, now })).rejects.toThrow('offline');
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval.mock.calls[0][1].arguments).toEqual([redis.set.mock.calls[0][1]]);
    expect(redis.eval.mock.calls[0][0]).toContain('== ARGV[1]');
  });
  it('midnight gets a separate reservation and disabled accounts produce no accepted record', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) },
      redis = redisStub();
    const result = await recordActivity('u', { db, redis, now: new Date('2026-09-08T16:00:00Z') });
    expect(redis.set.mock.calls[0][0]).toContain('2026-09-09');
    expect(result.accepted).toBe(false);
    expect(activityTime(new Date('2026-09-08T15:59:59.999Z'))).toBe('2026-09-08 23:59:59.999');
  });
});
describe('activity read model', () => {
  it('daily and period counts share account filters and do not sum daily unique counts', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce(metadata)
        .mockResolvedValueOnce([[{ today: 3, period: 7 }]]),
    };
    const result = await queryActivitySummary({ hideInternal: true, now, db });
    expect(result).toMatchObject({ today: 3, period: 7, available: true, partialToday: false });
    expect(db.query.mock.calls[1][0]).toContain('COUNT(DISTINCT a.user_id)');
    expect(db.query.mock.calls[1][1].slice(-2)).toEqual(['root', 'test']);
    expect(db.query.mock.calls[1][0]).not.toContain('api_logs');
  });
  it('missing schema is unavailable, not zero; rollout day is partial', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };
    await expect(queryActivitySummary({ now, db })).rejects.toMatchObject({ code: 'ACTIVITY_SCHEMA_NOT_READY' });
    db.query.mockResolvedValue([[{ startedAt: '2026-09-08 09:00:00.000000' }]]);
    expect(await activityCoverage({ now, db })).toMatchObject({ partialToday: true, fullDaysFrom: '2026-09-09' });
  });
  it('insufficient full days omit comparison; real empty dates after rollout count as zero', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([[{ startedAt: '2026-09-07 09:00:00.000000' }]]) };
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'];
    expect(await queryActivityBaseline({ hideInternal: true, now, dates, cutoffTime: '10:30:00', db })).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
    db.query
      .mockReset()
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce([[{ d: '2026-09-07', c: 7 }]]);
    expect(await queryActivityBaseline({ hideInternal: false, now, dates, cutoffTime: '10:30:00', db })).toEqual({
      yesterday: 7,
      average7d: 1,
    });
    expect(db.query.mock.calls[1][1]).toEqual(['2026-09-01', '2026-09-07', '10:30:00']);
  });
  it('20-row cursor pages bind actor, filter and snapshot; last activity does not affect ordering', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `user-${i}`,
      name: 'name',
      userRemark: '',
      firstActiveAt: '2026-09-08 09:00:00.000000',
      lastActiveAt: '2026-09-08 10:00:00.000000',
    }));
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce(metadata)
        .mockResolvedValueOnce([[{ total: 21 }]])
        .mockResolvedValueOnce([rows]),
    };
    const page = await queryActiveUsers({ actorId: 'root', now, db });
    expect(page.items).toHaveLength(20);
    expect(page.total).toBe(21);
    expect(page.hasMore).toBe(true);
    db.query
      .mockReset()
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce([[{ total: 21 }]])
      .mockResolvedValueOnce([[rows[20]]]);
    const second = await queryActiveUsers({
      actorId: 'root',
      now,
      db,
      cursor: page.nextCursor,
      snapshotAt: page.snapshotAt,
    });
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(db.query.mock.calls[2][0]).toContain('ORDER BY a.first_active_at DESC, a.user_id DESC');
    expect(db.query.mock.calls[2][1].slice(-3)).toEqual([
      '2026-09-08 09:00:00.000',
      '2026-09-08 09:00:00.000',
      'user-19',
    ]);
    db.query.mockResolvedValue(metadata);
    await expect(
      queryActiveUsers({ actorId: 'other', now, db, cursor: page.nextCursor, snapshotAt: page.snapshotAt }),
    ).rejects.toMatchObject({ code: 'ADMIN_LIST_CURSOR_INVALID' });
    await expect(
      queryActiveUsers({
        actorId: 'root',
        now: new Date('2026-09-09T10:00:00+08:00'),
        db,
        cursor: page.nextCursor,
        snapshotAt: page.snapshotAt,
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_LIST_CURSOR_INVALID' });
  });
});
