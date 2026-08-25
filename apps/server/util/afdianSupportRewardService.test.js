import { beforeEach, describe, expect, it, vi } from 'vitest';

const walletMocks = vi.hoisted(() => ({
  credit: vi.fn(async () => ({ replay: false, ledgerId: 'wallet-ledger-1', balanceAfter: 600_000 })),
}));

vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: walletMocks.credit }));

import {
  AFDIAN_REWARD_STATUS,
  approveAfdianSupportReward,
  calculateAfdianRewardTokens,
  syncAfdianRewardForOrder,
} from './afdianSupportRewardService.js';

const POLICY = {
  policy_version: 'support-ai-v1',
  tokens_per_cny: 100_000,
  auto_credit_max_amount: '200.00',
  activated_epoch: 1_700_000_000,
};

function order(overrides = {}) {
  return {
    id: 'order-id-1',
    provider_order_no: 'order-12345678',
    light_note_user_id: 'user-1',
    ownership_source: 'checkout',
    product_type: 0,
    total_amount: '6.00',
    provider_status: 2,
    verification_state: 'api_verified',
    provider_created_epoch: 1_700_000_100,
    checkout_created_epoch: 1_700_000_050,
    first_seen_epoch: 1_700_000_200,
    ...overrides,
  };
}

function connectionFor({ orderRow = order(), grantRow = null, applicablePolicy = POLICY } = {}) {
  return {
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM support_orders') && statement.includes('WHERE o.id = ?')) return [[orderRow], []];
      if (statement.includes('FROM support_reward_grants') && statement.includes('FOR UPDATE')) {
        return [grantRow ? [grantRow] : [], []];
      }
      if (statement.includes('activated_at <= FROM_UNIXTIME')) {
        return [applicablePolicy ? [applicablePolicy] : [], []];
      }
      if (statement.includes('FROM support_reward_policy_state')) return [[POLICY], []];
      if (statement.includes('INSERT INTO support_reward_grants')) return [{ affectedRows: 1 }, []];
      if (statement.includes('UPDATE support_reward_grants')) return [{ affectedRows: 1 }, []];
      throw new Error(`UNHANDLED_REWARD_TEST_SQL:${statement}`);
    }),
  };
}

beforeEach(() => walletMocks.credit.mockClear());

describe('爱发电永久 AI 额度赠送', () => {
  it('按实付分精确计算，每 ¥1 对应 10 万 Token', () => {
    expect(calculateAfdianRewardTokens('6.00')).toBe(600_000);
    expect(calculateAfdianRewardTokens('6.01')).toBe(601_000);
    expect(() => calculateAfdianRewardTokens('0.00')).toThrowError(/金额不合法/);
  });

  it('策略生效后的已归属成功订单自动且幂等进入统一钱包', async () => {
    const connection = connectionFor();
    await expect(syncAfdianRewardForOrder(connection, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.CREDITED,
      tokens: 600_000,
    });
    expect(walletMocks.credit).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({
        userId: 'user-1',
        amountTokens: 600_000,
        sourceType: 'support',
        idempotencyKey: 'support-reward:order-id-1:support-ai-v1',
      }),
    );
    const insert = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO support_reward_grants'),
    );
    expect(insert[1]).toEqual(expect.arrayContaining(['credited', 'wallet-ledger-1']));
  });

  it('策略启用前的历史订单明确排除，不因后续全量同步补发', async () => {
    const connection = connectionFor({
      orderRow: order({ provider_created_epoch: 1_699_999_000, first_seen_epoch: 1_700_000_200 }),
      applicablePolicy: null,
    });
    await expect(syncAfdianRewardForOrder(connection, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.LEGACY_EXCLUDED,
      reasonCode: 'before_policy_activation',
    });
    expect(walletMocks.credit).not.toHaveBeenCalled();
  });

  it('未归属订单等待关联，超过 ¥200 的订单等待人工确认', async () => {
    const unlinked = connectionFor({ orderRow: order({ light_note_user_id: null, ownership_source: 'unlinked' }) });
    await expect(syncAfdianRewardForOrder(unlinked, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.PENDING_LINK,
    });

    const large = connectionFor({ orderRow: order({ total_amount: '200.01' }) });
    await expect(syncAfdianRewardForOrder(large, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.MANUAL_REVIEW,
      reasonCode: 'large_amount',
    });
    expect(walletMocks.credit).not.toHaveBeenCalled();
  });

  it('服务商未返回时间时，仅凭策略启用后的下单凭证可自动入账', async () => {
    const trustedCheckout = connectionFor({
      orderRow: order({ provider_created_epoch: null, checkout_created_epoch: 1_700_000_050 }),
    });
    await expect(syncAfdianRewardForOrder(trustedCheckout, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.CREDITED,
    });

    const oauthOnly = connectionFor({
      orderRow: order({ provider_created_epoch: null, checkout_created_epoch: null }),
    });
    await expect(syncAfdianRewardForOrder(oauthOnly, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.MANUAL_REVIEW,
      reasonCode: 'provider_time_missing',
    });
  });

  it('成功状态但实付为零的订单只登记不符合赠送条件，不阻断订单同步', async () => {
    const connection = connectionFor({ orderRow: order({ total_amount: '0.00' }) });
    await expect(syncAfdianRewardForOrder(connection, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.INELIGIBLE,
      tokens: 0,
    });
    expect(walletMocks.credit).not.toHaveBeenCalled();
  });

  it('大额复核后按当前权威订单一次入账，操作人写入复核事实', async () => {
    const grantRow = {
      id: 'grant-1',
      user_id: 'user-1',
      policy_version: 'support-ai-v1',
      paid_amount: '250.00',
      calculated_tokens: 25_000_000,
      granted_tokens: 0,
      grant_status: 'manual_review',
      reason_code: 'large_amount',
      ledger_entry_id: null,
    };
    const connection = connectionFor({ orderRow: order({ total_amount: '250.00' }), grantRow });
    await expect(
      syncAfdianRewardForOrder(connection, 'order-id-1', {
        manualApproval: true,
        actorUserId: 'root-1',
        approvalSnapshot: { expectedTokens: 25_000_000, expectedUserId: 'user-1' },
      }),
    ).resolves.toMatchObject({ status: AFDIAN_REWARD_STATUS.CREDITED, tokens: 25_000_000 });
    const update = connection.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE support_reward_grants'));
    expect(String(update[0])).toContain('reviewed_by = COALESCE(?, reviewed_by)');
    expect(update[1]).toEqual(expect.arrayContaining(['credited', 'wallet-ledger-1', 'root-1']));
  });

  it('大额订单金额或归属变化后拒绝使用管理员旧页面快照入账', async () => {
    const grantRow = {
      id: 'grant-1',
      user_id: 'user-1',
      policy_version: 'support-ai-v1',
      paid_amount: '300.00',
      calculated_tokens: 30_000_000,
      granted_tokens: 0,
      grant_status: 'manual_review',
      reason_code: 'large_amount',
      ledger_entry_id: null,
    };
    const connection = connectionFor({ orderRow: order({ total_amount: '300.00' }), grantRow });

    await expect(
      syncAfdianRewardForOrder(connection, 'order-id-1', {
        manualApproval: true,
        actorUserId: 'root-1',
        approvalSnapshot: { expectedTokens: 25_000_000, expectedUserId: 'user-1' },
      }),
    ).rejects.toMatchObject({ code: 'AFDIAN_REWARD_REVIEW_STALE' });
    expect(walletMocks.credit).not.toHaveBeenCalled();
  });

  it('后台审批没有携带所见资产快照时在取连接前失败关闭', async () => {
    const db = { getConnection: vi.fn() };

    await expect(approveAfdianSupportReward('order-12345678', { actorUserId: 'root-1', db })).rejects.toMatchObject({
      code: 'AFDIAN_REWARD_REVIEW_SNAPSHOT_REQUIRED',
    });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('后台审批把成功审计与额度入账放在同一事务中提交', async () => {
    const grantRow = {
      id: 'grant-1',
      user_id: 'user-1',
      policy_version: 'support-ai-v1',
      paid_amount: '250.00',
      calculated_tokens: 25_000_000,
      granted_tokens: 0,
      grant_status: 'manual_review',
      reason_code: 'large_amount',
      ledger_entry_id: null,
    };
    const rewardConnection = connectionFor({ orderRow: order({ total_amount: '250.00' }), grantRow });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        const statement = String(sql);
        if (statement.includes('WHERE provider_order_no = ?')) return [[{ id: 'order-id-1' }], []];
        if (statement.includes('INSERT INTO admin_operation_audit')) return [{ affectedRows: 1 }, []];
        return rewardConnection.query(sql, params);
      }),
    };
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      approveAfdianSupportReward('order-12345678', {
        actorUserId: 'root-1',
        expectedTokens: 25_000_000,
        expectedUserId: 'user-1',
        requestId: 'request-1',
        ip: '203.0.113.9',
        db,
      }),
    ).resolves.toMatchObject({ status: AFDIAN_REWARD_STATUS.CREDITED, tokens: 25_000_000 });

    const auditCall = connection.query.mock.calls.find(([sql]) => String(sql).includes('admin_operation_audit'));
    expect(auditCall?.[1]).toEqual(expect.arrayContaining(['support_reward_approve', 'succeeded']));
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('已入账订单发生退款或状态反转时不扣成负数，只进入人工复核', async () => {
    const grantRow = {
      id: 'grant-1',
      user_id: 'user-1',
      policy_version: 'support-ai-v1',
      paid_amount: '6.00',
      calculated_tokens: 600_000,
      granted_tokens: 600_000,
      grant_status: 'credited',
      reason_code: null,
      ledger_entry_id: 'wallet-ledger-1',
    };
    const connection = connectionFor({ orderRow: order({ provider_status: 1 }), grantRow });
    await expect(syncAfdianRewardForOrder(connection, 'order-id-1')).resolves.toMatchObject({
      status: AFDIAN_REWARD_STATUS.REVERSAL_REVIEW,
      reasonCode: 'provider_reversal',
    });
    expect(walletMocks.credit).not.toHaveBeenCalled();
  });
});
