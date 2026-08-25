import { describe, expect, it, vi } from 'vitest';
import { creditAiBonusTokens, debitAiBonusTokens } from './aiBonusWallet.js';

const baseMutation = {
  userId: 'user-1',
  amountTokens: 600_000,
  sourceType: 'support',
  sourceRef: 'order-1',
  idempotencyKey: 'support-reward:order-1:support-ai-v1',
  policyVersion: 'support-ai-v1',
};

describe('永久 AI 额度钱包', () => {
  it('入账同时写追加式流水和来源批次，重复请求只回放原结果', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 100_000 }], []])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 700_000 }], []])
        .mockResolvedValueOnce([
          [
            {
              id: 'ledger-1',
              user_id: 'user-1',
              entry_type: 'credit',
              amount_tokens: 600_000,
              balance_after: 700_000,
              source_type: 'support',
              source_ref: 'order-1',
              policy_version: 'support-ai-v1',
            },
          ],
          [],
        ]),
    };

    await expect(creditAiBonusTokens(connection, baseMutation)).resolves.toMatchObject({
      replay: false,
      amountTokens: 600_000,
      balanceAfter: 700_000,
    });
    await expect(creditAiBonusTokens(connection, baseMutation)).resolves.toEqual({
      replay: true,
      ledgerId: 'ledger-1',
      amountTokens: 600_000,
      balanceAfter: 700_000,
    });

    const statements = connection.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.filter((sql) => sql.includes('INSERT INTO ai_bonus_ledger'))).toHaveLength(1);
    expect(statements.filter((sql) => sql.includes('INSERT INTO ai_bonus_lots'))).toHaveLength(1);
  });

  it('Provider 超额结算只扣当前已有余额，重放返回第一次实际扣款而非请求上限', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 300 }], []])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[{ id: 'lot-1', remaining_tokens: 300 }], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 0 }], []])
        .mockResolvedValueOnce([
          [
            {
              id: 'debit-ledger-1',
              user_id: 'user-1',
              entry_type: 'debit',
              amount_tokens: 300,
              balance_after: 0,
              source_type: 'ai_usage',
              source_ref: 'reservation-1',
              policy_version: 'ai-quota-v1',
            },
          ],
          [],
        ]),
    };
    const input = {
      userId: 'user-1',
      amountTokens: 500,
      sourceType: 'ai_usage',
      sourceRef: 'reservation-1',
      idempotencyKey: 'ai-quota:reservation-1:overrun',
      policyVersion: 'ai-quota-v1',
      allowPartial: true,
    };

    await expect(debitAiBonusTokens(connection, input)).resolves.toMatchObject({
      replay: false,
      amountTokens: 300,
      balanceAfter: 0,
    });
    await expect(debitAiBonusTokens(connection, input)).resolves.toEqual({
      replay: true,
      ledgerId: 'debit-ledger-1',
      amountTokens: 300,
      balanceAfter: 0,
    });
    const allocation = connection.query.mock.calls.find(([sql]) => String(sql).includes('ai_bonus_lot_allocations'));
    expect(allocation[1][1]).toBe('user-1');
    expect(allocation[1][4]).toBe(300);
  });

  it('余额为零的超额结算仍落幂等收据，后续充值后重放也不追扣', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 0 }], []])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 100_000 }], []])
        .mockResolvedValueOnce([
          [
            {
              id: 'zero-debit-ledger',
              user_id: 'user-1',
              entry_type: 'debit',
              amount_tokens: 0,
              balance_after: 0,
              source_type: 'ai_usage',
              source_ref: 'reservation-zero',
              policy_version: 'ai-quota-v1',
            },
          ],
          [],
        ]),
    };
    const input = {
      userId: 'user-1',
      amountTokens: 500,
      sourceType: 'ai_usage',
      sourceRef: 'reservation-zero',
      idempotencyKey: 'ai-quota:reservation-zero:overrun',
      policyVersion: 'ai-quota-v1',
      allowPartial: true,
    };

    await expect(debitAiBonusTokens(connection, input)).resolves.toMatchObject({
      replay: false,
      amountTokens: 0,
      balanceAfter: 0,
    });
    await expect(debitAiBonusTokens(connection, input)).resolves.toEqual({
      replay: true,
      ledgerId: 'zero-debit-ledger',
      amountTokens: 0,
      balanceAfter: 0,
    });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('SET ai_bonus_tokens = ai_bonus_tokens -')),
    ).toBe(false);
  });

  it('快照余额高于来源批次时先登记可审计的历史差额，再完成 FIFO 扣减', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }, []])
        .mockResolvedValueOnce([[{ ai_bonus_tokens: 500 }], []])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[{ id: 'lot-old', remaining_tokens: 200 }], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]),
    };

    await expect(
      debitAiBonusTokens(connection, {
        userId: 'user-1',
        amountTokens: 300,
        sourceType: 'ai_usage',
        sourceRef: 'reservation-gap',
        idempotencyKey: 'ai-quota:reservation-gap:reserve',
        policyVersion: 'ai-quota-v1',
      }),
    ).resolves.toMatchObject({ amountTokens: 300, balanceAfter: 200 });

    const ledgerCalls = connection.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO ai_bonus_ledger'),
    );
    expect(ledgerCalls).toHaveLength(2);
    expect(ledgerCalls[0][1]).toEqual(expect.arrayContaining(['legacy_reconciliation', 'user_growth']));
    const allocationCalls = connection.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO ai_bonus_lot_allocations'),
    );
    expect(allocationCalls.map(([, params]) => params[4])).toEqual([200, 100]);
  });
});
