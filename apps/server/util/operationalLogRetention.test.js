import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupOperationalLogs,
  getOperationalLogRetentionConfig,
  purgeExpiredAgentLogDigests,
  stopOperationalLogRetentionScheduler,
} from './operationalLogRetention.js';

afterEach(() => {
  stopOperationalLogRetentionScheduler();
  vi.restoreAllMocks();
});

describe('operational log retention', () => {
  it('defaults to a bounded 180-day retention policy', () => {
    expect(getOperationalLogRetentionConfig({})).toEqual({
      retentionDays: 180,
      batchSize: 1000,
      maxBatches: 20,
      digestRetentionDays: 7,
    });
    expect(
      getOperationalLogRetentionConfig({
        OPERATIONAL_LOG_RETENTION_DAYS: '99999',
        OPERATIONAL_LOG_RETENTION_BATCH_SIZE: '0',
        OPERATIONAL_LOG_RETENTION_MAX_BATCHES: '2',
      }),
    ).toEqual({
      retentionDays: 3650,
      batchSize: 1,
      maxBatches: 2,
      digestRetentionDays: 7,
    });
  });

  it('caps the AI answer digest retention below the general log retention', () => {
    expect(getOperationalLogRetentionConfig({ AGENT_LOG_DIGEST_RETENTION_DAYS: '30' }).digestRetentionDays).toBe(30);
    // 摘要保留期不允许超过通用日志保留上限，也不允许降到 0(那会让摘要写入即刻失效)
    expect(getOperationalLogRetentionConfig({ AGENT_LOG_DIGEST_RETENTION_DAYS: '9999' }).digestRetentionDays).toBe(180);
    expect(getOperationalLogRetentionConfig({ AGENT_LOG_DIGEST_RETENTION_DAYS: '0' }).digestRetentionDays).toBe(1);
    expect(getOperationalLogRetentionConfig({ AGENT_LOG_DIGEST_RETENTION_DAYS: 'abc' }).digestRetentionDays).toBe(7);
  });

  it('physically deletes API, operation and conversion logs older than the cutoff', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }]),
    };
    const now = new Date('2026-07-28T12:00:00.000Z');

    const result = await cleanupOperationalLogs({
      db,
      retentionDays: 180,
      batchSize: 1000,
      maxBatches: 20,
      now,
    });

    expect(db.query).toHaveBeenCalledTimes(4);
    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('DELETE FROM `api_logs`'),
      expect.stringContaining('DELETE FROM `operation_logs`'),
      expect.stringContaining('DELETE FROM `conversion_events`'),
      expect.stringContaining('UPDATE `agent_logs`'),
    ]);
    // 前三张表按 180 天删除；摘要用独立的 7 天窗口，两者不能共用 cutoff
    for (const [, params] of db.query.mock.calls.slice(0, 3)) {
      expect(params).toEqual([new Date('2026-01-29T12:00:00.000Z'), 1000]);
    }
    expect(db.query.mock.calls[3][1]).toEqual([new Date('2026-07-21T12:00:00.000Z'), 1000]);
    expect(result).toMatchObject({
      retentionDays: 180,
      cutoff: new Date('2026-01-29T12:00:00.000Z'),
      backlogPossible: false,
      tables: {
        api_logs: { deleted: 2, batches: 1, tableMissing: false },
        operation_logs: { deleted: 1, batches: 1, tableMissing: false },
        conversion_events: { deleted: 0, batches: 1, tableMissing: false },
      },
      agentLogDigests: { purged: 0, batches: 1, skipped: false, retentionDays: 7 },
    });
  });

  it('continues in bounded batches and reports a possible backlog', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }]),
    };

    const result = await cleanupOperationalLogs({
      db,
      retentionDays: 30,
      batchSize: 2,
      maxBatches: 2,
      now: new Date('2026-07-28T12:00:00.000Z'),
    });

    expect(result.tables.api_logs).toEqual({
      deleted: 4,
      batches: 2,
      backlogPossible: true,
      tableMissing: false,
    });
    expect(result.backlogPossible).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(5);
  });

  it('tolerates an optional log table not existing yet', async () => {
    const missingTable = Object.assign(new Error('table unavailable'), {
      code: 'ER_NO_SUCH_TABLE',
      errno: 1146,
    });
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockRejectedValueOnce(missingTable)
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }]),
    };

    const result = await cleanupOperationalLogs({
      db,
      now: new Date('2026-07-28T12:00:00.000Z'),
    });

    expect(result.tables.operation_logs).toEqual({
      deleted: 0,
      batches: 0,
      backlogPossible: false,
      tableMissing: true,
    });
    expect(result.tables.conversion_events.tableMissing).toBe(false);
  });
});

describe('agent log answer digest retention', () => {
  it('blanks expired digests without deleting the surrounding log rows', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([{ affectedRows: 3 }]) };

    const result = await purgeExpiredAgentLogDigests({
      db,
      digestRetentionDays: 7,
      batchSize: 500,
      maxBatches: 5,
      now: new Date('2026-08-05T12:00:00.000Z'),
    });

    const [sql, params] = db.query.mock.calls[0];
    // 只把摘要置空：轮廓字段(outcome_kind/answer_chars)与整行必须保留，否则历史统计会被清掉
    expect(sql).toContain('UPDATE `agent_logs`');
    expect(sql).toContain('SET `answer_digest` = NULL');
    expect(sql).not.toContain('DELETE');
    expect(params).toEqual([new Date('2026-07-29T12:00:00.000Z'), 500]);
    expect(result).toMatchObject({ purged: 3, batches: 1, skipped: false, backlogPossible: false });
  });

  it('stops after the batch ceiling and flags the remaining backlog', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }]),
    };

    const result = await purgeExpiredAgentLogDigests({
      db,
      batchSize: 2,
      maxBatches: 2,
      now: new Date('2026-08-05T12:00:00.000Z'),
    });

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ purged: 4, batches: 2, backlogPossible: true });
  });

  it('silently skips when the digest column has not been migrated yet', async () => {
    const missingColumn = Object.assign(new Error('unknown column'), {
      code: 'ER_BAD_FIELD_ERROR',
      errno: 1054,
    });
    const db = { query: vi.fn().mockRejectedValueOnce(missingColumn) };

    const result = await purgeExpiredAgentLogDigests({ db, now: new Date('2026-08-05T12:00:00.000Z') });

    expect(result).toMatchObject({ purged: 0, skipped: true, backlogPossible: false });
  });

  it('propagates unexpected database failures instead of reporting a clean sweep', async () => {
    const db = { query: vi.fn().mockRejectedValueOnce(new Error('connection lost')) };

    await expect(purgeExpiredAgentLogDigests({ db })).rejects.toThrow('connection lost');
  });
});
