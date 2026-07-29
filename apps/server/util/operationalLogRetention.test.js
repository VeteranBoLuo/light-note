import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupOperationalLogs,
  getOperationalLogRetentionConfig,
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
    });
  });

  it('physically deletes API, operation and conversion logs older than the cutoff', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
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

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('DELETE FROM `api_logs`'),
      expect.stringContaining('DELETE FROM `operation_logs`'),
      expect.stringContaining('DELETE FROM `conversion_events`'),
    ]);
    for (const [, params] of db.query.mock.calls) {
      expect(params).toEqual([new Date('2026-01-29T12:00:00.000Z'), 1000]);
    }
    expect(result).toMatchObject({
      retentionDays: 180,
      cutoff: new Date('2026-01-29T12:00:00.000Z'),
      backlogPossible: false,
      tables: {
        api_logs: { deleted: 2, batches: 1, tableMissing: false },
        operation_logs: { deleted: 1, batches: 1, tableMissing: false },
        conversion_events: { deleted: 0, batches: 1, tableMissing: false },
      },
    });
  });

  it('continues in bounded batches and reports a possible backlog', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
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
    expect(db.query).toHaveBeenCalledTimes(4);
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
