import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));

import {
  aiExecutionRecoveryInternals,
  recoverExpiredAiExecutions,
  startAiExecutionRecoveryScheduler,
  stopAiExecutionRecoveryScheduler,
} from './recovery.js';

describe('AI Execution 过期租约回收', () => {
  afterEach(() => {
    stopAiExecutionRecoveryScheduler();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('原子认领 stale running、保留 Span 聚合并把预占退到 0', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [{ id: 'e-1', status: 'running', billing_policy: 'user', quota_reservation_key: 'reservation-1' }],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ charged_tokens: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const quota = { releaseReservation: vi.fn().mockResolvedValue(true) };

    await expect(recoverExpiredAiExecutions({ database: { query }, quota })).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      reconciled: 1,
      deferred: 0,
    });
    expect(query.mock.calls[1][0]).toContain("execution_row.status = 'failed'");
    expect(query.mock.calls[1][0]).toContain('SUM(total_tokens)');
    expect(query.mock.calls[1][0]).toContain("execution_row.billing_policy IN ('user', 'none')");
    expect(query.mock.calls[1][0]).toContain("LEFT(stage, 18) = 'image_recognition_'");
    expect(quota.releaseReservation).toHaveBeenCalledWith({ reservationKey: 'reservation-1' }, { database: { query } });
  });

  it('结算失败保留 deferred，下一轮可直接重试而不重复认领', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          id: 'e-2',
          status: 'failed',
          quota_reservation_key: 'reservation-2',
        },
      ],
    ]);
    const quota = { releaseReservation: vi.fn().mockResolvedValue(false) };

    await expect(recoverExpiredAiExecutions({ database: { query }, quota })).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      reconciled: 0,
      deferred: 1,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('当前规则的正常终态 deferred 会按已落库金额重试，不被当作失败退款', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 'e-success-deferred',
            status: 'success',
            billing_policy: 'user',
            charged_tokens: 37,
            quota_reservation_key: 'reservation-success',
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const quota = { reconcile: vi.fn().mockResolvedValue(true), releaseReservation: vi.fn() };

    await expect(recoverExpiredAiExecutions({ database: { query }, quota })).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      reconciled: 1,
      deferred: 0,
    });
    expect(query.mock.calls[0][0]).toContain('billing_rule_version = ?');
    expect(quota.reconcile).toHaveBeenCalledWith({ reservationKey: 'reservation-success' }, 37, {
      database: { query },
    });
    expect(quota.releaseReservation).not.toHaveBeenCalled();
  });

  it('租约竞争中未认领到行时不触碰额度', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ id: 'e-3', status: 'running', quota_reservation_key: 'reservation-3' }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    const quota = { reconcile: vi.fn() };

    const result = await recoverExpiredAiExecutions({ database: { query }, quota });
    expect(result).toMatchObject({ scanned: 1, recovered: 0, reconciled: 0 });
    expect(quota.reconcile).not.toHaveBeenCalled();
  });

  it('system 执行过期时按用户主阶段 Span 结算系统预算，不错误归零', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 'e-system',
            status: 'running',
            billing_policy: 'system',
            quota_reservation_key: 'reservation-system',
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ charged_tokens: 42 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const quota = { reconcile: vi.fn().mockResolvedValue(true), releaseReservation: vi.fn() };

    await expect(recoverExpiredAiExecutions({ database: { query }, quota })).resolves.toMatchObject({
      recovered: 1,
      reconciled: 1,
    });
    expect(quota.reconcile).toHaveBeenCalledWith({ reservationKey: 'reservation-system' }, 42, {
      database: { query },
    });
    expect(quota.releaseReservation).not.toHaveBeenCalled();
  });

  it('额度已退回但账本终态写入竞争时保留 deferred 供下一轮重试', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ id: 'e-4', status: 'failed', quota_reservation_key: 'reservation-4' }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ quota_settlement_status: 'deferred' }]]);
    const quota = { releaseReservation: vi.fn().mockResolvedValue(true) };

    await expect(recoverExpiredAiExecutions({ database: { query }, quota })).resolves.toEqual({
      scanned: 1,
      recovered: 0,
      reconciled: 0,
      deferred: 1,
    });
  });

  it('调度器立即执行一次且只注册一个受限周期', async () => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue([[]]);
    const first = await startAiExecutionRecoveryScheduler({ database: { query }, quota: {}, intervalMs: 1 });
    const duplicate = await startAiExecutionRecoveryScheduler({ database: { query }, quota: {}, intervalMs: 1 });
    expect(first).toEqual({
      started: true,
      intervalMs: aiExecutionRecoveryInternals.MIN_RECOVERY_INTERVAL_MS,
    });
    expect(duplicate.started).toBe(false);
  });

  it('首次扫描暂时失败也保留周期重试能力', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const query = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue([[]]);

    await expect(startAiExecutionRecoveryScheduler({ database: { query }, quota: {}, intervalMs: 1 })).resolves.toEqual(
      {
        started: true,
        intervalMs: aiExecutionRecoveryInternals.MIN_RECOVERY_INTERVAL_MS,
      },
    );
    await vi.advanceTimersByTimeAsync(aiExecutionRecoveryInternals.MIN_RECOVERY_INTERVAL_MS);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
