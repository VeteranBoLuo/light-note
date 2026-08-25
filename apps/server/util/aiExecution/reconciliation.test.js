import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));

import { aiExecutionReconciliationInternals, reconcileHistoricalAiExecutionBilling } from './reconciliation.js';

describe('历史 AI Execution 账单重放', () => {
  it('失败执行归零、成功执行只计用户 Span，并跳过不确定或会追扣的行', async () => {
    const rows = [
      {
        id: 'failed',
        status: 'failed',
        providerCallCount: 2,
        chargedTokens: 100,
        billingRuleVersion: 1,
        reservationKey: 'r-1',
        reservationStatus: 'reconciled',
        reservationActualTokens: 100,
        userSpanCount: 1,
        userTokens: 70,
        missingUserUsageSpans: 1,
      },
      {
        id: 'success',
        status: 'success',
        providerCallCount: 2,
        chargedTokens: 150,
        billingRuleVersion: 1,
        reservationKey: 'r-2',
        reservationStatus: 'reconciled',
        reservationActualTokens: 150,
        userSpanCount: 1,
        userTokens: 100,
        missingUserUsageSpans: 0,
      },
      {
        id: 'missing',
        status: 'success',
        providerCallCount: 1,
        chargedTokens: 50,
        userSpanCount: 1,
        userTokens: 0,
        missingUserUsageSpans: 1,
      },
      {
        id: 'increase',
        status: 'success',
        providerCallCount: 1,
        chargedTokens: 80,
        userSpanCount: 1,
        userTokens: 90,
        missingUserUsageSpans: 0,
      },
    ];
    const database = { query: vi.fn().mockResolvedValueOnce([rows]) };
    const quota = { correctReconciledReservation: vi.fn() };

    await expect(reconcileHistoricalAiExecutionBilling({ database, quota })).resolves.toEqual({
      dryRun: true,
      ruleVersion: 3,
      scanned: 4,
      eligible: 2,
      wouldCorrect: 2,
      corrected: 0,
      markedCurrent: 0,
      refundTokens: 150,
      skipped: { missing_usage: 1, would_increase_charge: 1 },
    });
    expect(quota.correctReconciledReservation).not.toHaveBeenCalled();
    expect(database.query.mock.calls[0][0]).not.toMatch(/(?:prompt|content|question|title|url)/iu);
  });

  it('apply 先幂等修正 reservation，再更新 execution 金额和规则版本', async () => {
    const row = {
      id: 'e-1',
      status: 'success',
      providerCallCount: 2,
      chargedTokens: 150,
      billingRuleVersion: 1,
      reservationKey: 'r-1',
      reservationStatus: 'reconciled',
      reservationActualTokens: 150,
      userSpanCount: 1,
      userTokens: 100,
      missingUserUsageSpans: 0,
    };
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[row]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const quota = { correctReconciledReservation: vi.fn().mockResolvedValue({ corrected: true }) };

    const result = await reconcileHistoricalAiExecutionBilling({ database, quota, apply: true, userId: 'u-1' });
    expect(result).toMatchObject({ corrected: 1, markedCurrent: 1, refundTokens: 50 });
    expect(quota.correctReconciledReservation).toHaveBeenCalledWith({ reservationKey: 'r-1' }, 100, { database });
    expect(database.query.mock.calls[1][1]).toEqual([100, 3, 'e-1', 1]);
    expect(database.query.mock.calls[0][0]).toContain('execution_row.actor_user_id = ?');
    expect(database.query.mock.calls[0][0]).toContain("LEFT(span.stage, 18) = 'image_recognition_'");
  });

  it('识别 reservation 已修正但 execution 尚未更新的中断点', () => {
    expect(
      aiExecutionReconciliationInternals.replayHistoricalCharge({
        status: 'failed',
        chargedTokens: 100,
        reservationKey: 'r-1',
        reservationStatus: 'reconciled',
        reservationActualTokens: 0,
      }),
    ).toMatchObject({
      eligible: true,
      expectedTokens: 0,
      refundTokens: 0,
      reservationAlreadyCorrected: true,
      ledgerNeedsCorrection: false,
    });
  });

  it('Execution 金额已正确但 reservation 仍多扣时仍会退款', async () => {
    const row = {
      id: 'e-ledger-gap',
      status: 'success',
      providerCallCount: 1,
      chargedTokens: 100,
      billingRuleVersion: 1,
      reservationKey: 'r-ledger-gap',
      reservationStatus: 'reconciled',
      reservationActualTokens: 150,
      userSpanCount: 1,
      userTokens: 100,
      missingUserUsageSpans: 0,
    };
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[row]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const quota = { correctReconciledReservation: vi.fn().mockResolvedValue({ corrected: true }) };

    const result = await reconcileHistoricalAiExecutionBilling({ database, quota, apply: true });
    expect(result).toMatchObject({ refundTokens: 50, corrected: 1, markedCurrent: 1 });
    expect(quota.correctReconciledReservation).toHaveBeenCalledWith({ reservationKey: 'r-ledger-gap' }, 100, {
      database,
    });
  });
});
