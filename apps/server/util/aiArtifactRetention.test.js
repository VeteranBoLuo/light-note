import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupExpiredAiChangeSets,
  getAiArtifactRetentionConfig,
  isAiArtifactRetentionEnabled,
  runAiArtifactRetentionCleanup,
  startAiArtifactRetentionScheduler,
  stopAiArtifactRetentionScheduler,
} from './aiArtifactRetention.js';

function transactionDatabase(queryImplementation) {
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(queryImplementation),
  };
  return {
    connection,
    database: { getConnection: vi.fn().mockResolvedValue(connection) },
  };
}

describe('AI artifact retention', () => {
  afterEach(() => {
    stopAiArtifactRetentionScheduler();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('默认完全关闭，只有每域显式配置合法正整数时才启用', () => {
    const disabled = getAiArtifactRetentionConfig({});
    expect(disabled.enabledDomains).toEqual([]);
    expect(disabled.invalidDomains).toEqual([]);
    expect(isAiArtifactRetentionEnabled({})).toBe(false);

    const partial = getAiArtifactRetentionConfig({
      AI_CHANGE_SET_RETENTION_DAYS: '90',
    });
    expect(partial.enabledDomains).toEqual(['changeSet']);
    expect(partial.domains.changeSet.days).toBe(90);
    expect(partial.invalidDomains).toEqual([]);
    expect(isAiArtifactRetentionEnabled({ AI_CHANGE_SET_RETENTION_DAYS: '90' })).toBe(true);
  });

  it('Change Set 只清理不可编辑终态，保留 draft 与 indefinite 会话关联对象', async () => {
    const { database, connection } = transactionDatabase(async (sql) => {
      if (String(sql).includes('SELECT s.id')) return [[{ id: 'set-1' }]];
      if (String(sql).includes('DELETE s FROM ai_change_sets')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected query: ${sql}`);
    });

    await expect(cleanupExpiredAiChangeSets(database, 180)).resolves.toMatchObject({
      deleted: 1,
      retentionDays: 180,
    });
    const statements = connection.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.every((sql) => sql.includes("status IN ('applied', 'undone', 'expired')"))).toBe(true);
    expect(statements.every((sql) => sql.includes("c.retention_mode = 'indefinite'"))).toBe(true);
    expect(statements.every((sql) => !sql.includes("status IN ('draft'"))).toBe(true);
  });

  it('按批次设置上限并明确报告积压，重复执行保持幂等', async () => {
    const database = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT s.id')) return [[{ id: 'set-1' }, { id: 'set-2' }]];
        if (String(sql).includes('DELETE s FROM ai_change_sets')) return [{ affectedRows: 2 }];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    await expect(cleanupExpiredAiChangeSets(database, 30, { batchSize: 2, maxBatches: 2 })).resolves.toMatchObject({
      deleted: 4,
      batches: 2,
      backlogRemaining: true,
    });

    const idempotentDatabase = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT s.id')) return [[]];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    await expect(cleanupExpiredAiChangeSets(idempotentDatabase, 30)).resolves.toMatchObject({
      deleted: 0,
      batches: 1,
      backlogRemaining: false,
    });
  });

  it('缺表时按域安全跳过，真实数据库错误会回滚并上抛', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
    const missingDatabase = transactionDatabase(async () => {
      throw missing;
    });
    await expect(cleanupExpiredAiChangeSets(missingDatabase.database, 30)).resolves.toMatchObject({
      deleted: 0,
      skipped: true,
    });
    expect(missingDatabase.connection.commit).toHaveBeenCalledOnce();

    const failure = Object.assign(new Error('database failed'), { code: 'ER_LOCK_DEADLOCK' });
    const failedDatabase = transactionDatabase(async () => {
      throw failure;
    });
    await expect(cleanupExpiredAiChangeSets(failedDatabase.database, 30)).rejects.toBe(failure);
    expect(failedDatabase.connection.rollback).toHaveBeenCalledOnce();
    expect(failedDatabase.connection.commit).not.toHaveBeenCalled();
    expect(failedDatabase.connection.release).toHaveBeenCalledOnce();
  });

  it('总调度只执行已启用域，非法期限不会回退到隐式默认值', async () => {
    const database = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT s.id')) return [[]];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const config = getAiArtifactRetentionConfig({ AI_CHANGE_SET_RETENTION_DAYS: '45' });
    await expect(runAiArtifactRetentionCleanup(database, { config })).resolves.toMatchObject({
      enabledDomains: ['changeSet'],
      changeSet: { retentionDays: 45, deleted: 0 },
    });
    expect(database.query).toHaveBeenCalledOnce();

    await expect(cleanupExpiredAiChangeSets(database, 0)).rejects.toMatchObject({
      code: 'AI_ARTIFACT_RETENTION_DAYS_INVALID',
    });
  });

  it('未配置时不注册计时器；显式启用后才启动并支持停止', async () => {
    vi.useFakeTimers();
    vi.stubEnv('AI_CHANGE_SET_RETENTION_DAYS', '');
    await expect(startAiArtifactRetentionScheduler()).resolves.toMatchObject({
      started: false,
      reason: 'disabled',
    });

    vi.stubEnv('AI_CHANGE_SET_RETENTION_DAYS', '30');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const database = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT s.id')) return [[]];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    await expect(startAiArtifactRetentionScheduler({ database })).resolves.toMatchObject({
      started: true,
      enabledDomains: ['changeSet'],
    });
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('code=%s'),
      'AI_ARTIFACT_RETENTION_CLEANUP_OK',
      0,
      0,
    );
    expect(stopAiArtifactRetentionScheduler()).toBe(true);
  });
});
