import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { getConnection: vi.fn(), query: vi.fn() },
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));

import { processDueTodoReminderJobs, todoReminderV2Internals } from './todoReminderV2.js';

function clock(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function validJob(overrides = {}) {
  return {
    id: 'job-1',
    user_id: 'user-1',
    todo_id: 'todo-1',
    series_id: null,
    channel: 'in_app',
    timezone: 'Asia/Shanghai',
    quietPolicy: 'defer_once',
    targetEmail: null,
    retry_count: 0,
    title: '每日复盘',
    description: null,
    dueAt: '2026-08-07 18:00:00',
    todoStatus: 'pending',
    todoDeleted: 0,
    instanceState: 'normal',
    seriesStatus: null,
    preferences: '{}',
    ...overrides,
  };
}

describe('todoReminderV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('领取任务时加 processing 租约并在事务后释放连接', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[validJob()]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);

    const claimed = await todoReminderV2Internals.claimJob('job-1');

    expect(claimed).toMatchObject({ id: 'job-1', userId: 'user-1', todoId: 'todo-1', channel: 'in_app' });
    expect(claimed.leaseToken).toEqual(expect.any(String));
    expect(connection.query.mock.calls[0][0]).toContain("DATE_FORMAT(j.stop_at_utc");
    expect(connection.query.mock.calls[1][0]).toContain("SET status = 'processing'");
    expect(connection.query.mock.calls[1][0]).toContain('lease_until');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('免打扰期间只延期一次并合并同项同渠道积压任务', async () => {
    const now = new Date();
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const preferences = {
      notificationsDnd: true,
      notificationsDndStart: clock(minute - 1),
      notificationsDndEnd: clock(minute + 10),
      notificationsTimezoneOffset: 0,
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[validJob({ preferences: JSON.stringify(preferences), rule_id: 'rule-1' })]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);

    const claimed = await todoReminderV2Internals.claimJob('job-1');

    expect(claimed).toBeNull();
    expect(connection.query.mock.calls[1][0]).toContain("cancel_reason = 'quiet_hours_deferred'");
    expect(connection.query.mock.calls[3][0]).toContain("cancel_reason = 'quiet_hours_coalesced'");
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('旧规则更新期间失败后回队列的 Job 会被跳过，不再按旧时刻投递', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[validJob({ cancel_reason: 'instance_updated' })]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    mocks.pool.getConnection.mockResolvedValue(connection);

    await expect(todoReminderV2Internals.claimJob('job-1')).resolves.toBeNull();
    expect(connection.query.mock.calls[1][0]).toContain("SET status = 'skipped'");
    expect(connection.query.mock.calls[1][1]).toEqual(['superseded_rule', 'job-1']);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('SMTP 结果不确定时标为 unknown，禁止自动重发', async () => {
    mocks.pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    await todoReminderV2Internals.markFailed(
      { id: 'job-1', leaseToken: 'lease-1', channel: 'email' },
      Object.assign(new Error('socket connection closed'), { code: 'ECONNRESET' }),
    );

    expect(mocks.pool.query.mock.calls[0][0]).toContain("SET status = 'unknown'");
    expect(mocks.pool.query.mock.calls[0][1]).toEqual(['ECONNRESET', 'job-1', 'lease-1']);
  });

  it('明确失败按旧 retry_count 一致判断状态和下次重试时间', async () => {
    mocks.pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    await todoReminderV2Internals.markFailed(
      { id: 'job-1', leaseToken: 'lease-1', channel: 'in_app' },
      Object.assign(new Error('temporary failure'), { code: 'DELIVERY_FAILED' }),
    );

    const sql = mocks.pool.query.mock.calls[0][0];
    expect(sql).toContain("status = IF(retry_count + 1 > ?, 'failed', 'pending')");
    expect(sql).toContain('scheduled_at_utc = IF(retry_count + 1 > ?');
    expect(sql.indexOf('scheduled_at_utc')).toBeLessThan(sql.indexOf('retry_count = retry_count + 1'));
  });

  it('扫描过期租约时邮件转 unknown，站内提醒恢复 pending', async () => {
    mocks.pool.query.mockResolvedValueOnce([{ affectedRows: 2 }]).mockResolvedValueOnce([[]]);

    await processDueTodoReminderJobs();

    expect(mocks.pool.query.mock.calls[0][0]).toContain("IF(channel = 'email', 'unknown', 'pending')");
    expect(mocks.pool.query.mock.calls[1][0]).toContain("WHERE status = 'pending'");
  });

  it('时间与渠道辅助函数保持确定性', () => {
    expect(todoReminderV2Internals.channelEnabled({}, 'in_app')).toBe(true);
    expect(todoReminderV2Internals.channelEnabled({ notificationsEmail: false }, 'email')).toBe(false);
    expect(todoReminderV2Internals.sqlUtc('2026-08-06T01:30:00Z')).toBe('2026-08-06 01:30:00');
    expect(todoReminderV2Internals.sqlLocal('2026-08-06T01:30:00Z', 'Asia/Shanghai')).toBe('2026-08-06 09:30:00');
    expect(todoReminderV2Internals.isAmbiguousSmtpError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(todoReminderV2Internals.isAmbiguousSmtpError({ code: 'EENVELOPE' })).toBe(false);
  });
});
