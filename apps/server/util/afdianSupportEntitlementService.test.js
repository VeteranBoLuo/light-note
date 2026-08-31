import { beforeEach, describe, expect, it, vi } from 'vitest';

const entitlementMocks = vi.hoisted(() => ({
  creditAi: vi.fn(async (_connection, input) => ({
    replay: false,
    ledgerId: `ai-ledger-${input.amountTokens}`,
    balanceAfter: input.amountTokens,
  })),
  earnStorage: vi.fn(async () => true),
}));

vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: entitlementMocks.creditAi }));
vi.mock('./points.js', () => ({ earnStorage: entitlementMocks.earnStorage }));

import {
  SUPPORT_ENTITLEMENT_STATUS,
  syncAfdianPackageEntitlementForOrder,
} from './afdianSupportEntitlementService.js';

function packageOrder(overrides = {}) {
  return {
    id: 'support-order-1',
    provider_order_no: 'afdian-order-1',
    provider_user_id: 'afdian-user-1',
    provider_private_id: null,
    checkout_intent_id: 'checkout-intent-1',
    light_note_user_id: 'user-1',
    ownership_source: 'checkout',
    product_type: 0,
    total_amount: '10.00',
    provider_status: 2,
    verification_state: 'api_verified',
    provider_created_epoch: 1_800_000_100,
    intent_user_id: 'user-1',
    intent_provider_user_id: 'afdian-user-1',
    intent_provider_private_id: null,
    intent_type: 'permanent',
    intent_status: 'issued',
    sku_id: 'combo-10',
    catalog_version: 'support-packages-v3',
    quoted_amount: '10.00',
    base_ai_tokens: 600_000,
    base_storage_mb: 128,
    quoted_ai_tokens: 720_000,
    quoted_storage_mb: 128,
    first_purchase_candidate: 1,
    campaign_id: null,
    campaign_sku_id: null,
    campaign_version: null,
    campaign_user_limit: null,
    consumed_order_id: null,
    intent_expires_epoch: 1_800_003_600,
    ...overrides,
  };
}

function connectionFor({
  grant = null,
  existingUserFirstClaim = false,
  existingIdentityFirstClaim = false,
  duplicateFirstClaim = false,
  campaignCount = 0,
  campaignUpdate = 1,
  consumedUpdate = 1,
  consumedOrderId = null,
} = {}) {
  return {
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM support_entitlement_grants') && statement.includes('FOR UPDATE')) {
        return [grant ? [grant] : [], []];
      }
      if (statement.includes('FROM support_first_purchase_claims') && statement.includes('user_id = ?')) {
        return [existingUserFirstClaim ? [{ id: 'existing-user-first-claim' }] : [], []];
      }
      if (statement.includes('FROM support_first_purchase_claims') && statement.includes('provider_identity_hash = ?')) {
        return [existingIdentityFirstClaim ? [{ id: 'existing-identity-first-claim' }] : [], []];
      }
      if (statement.includes('INSERT INTO support_first_purchase_claims')) {
        if (duplicateFirstClaim) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        return [{ affectedRows: 1 }, []];
      }
      if (statement.includes('FROM support_campaign_user_limits') && statement.includes('FOR UPDATE')) {
        return [[{ completed_count: campaignCount, active_intent_id: 'checkout-intent-1' }], []];
      }
      if (statement.includes('UPDATE support_campaign_user_limits') && statement.includes('completed_count = completed_count + 1')) {
        return [{ affectedRows: campaignUpdate }, []];
      }
      if (statement.includes('UPDATE support_checkout_intents')) {
        return [{ affectedRows: consumedUpdate }, []];
      }
      if (statement.includes('SELECT consumed_order_id') && statement.includes('FROM support_checkout_intents')) {
        return [[{ consumed_order_id: consumedOrderId }], []];
      }
      if (
        statement.includes('UPDATE support_campaign_user_limits') ||
        statement.includes('INSERT IGNORE INTO user_growth') ||
        statement.includes('INSERT INTO support_entitlement_grants') ||
        statement.includes('UPDATE support_entitlement_grants')
      ) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`UNHANDLED_SUPPORT_ENTITLEMENT_SQL:${statement}`);
    }),
  };
}

const ENABLED_ENV = { SUPPORT_PACKAGES_GRANT_ENABLED: 'true' };

beforeEach(() => {
  entitlementMocks.creditAi.mockClear();
  entitlementMocks.earnStorage.mockReset().mockResolvedValue(true);
});

describe('爱发电 v2 通用权益原子发放', () => {
  it('发放开关关闭时保留套餐待处理状态，绝不降级为旧 AI 赠送', async () => {
    const connection = connectionFor();
    await expect(syncAfdianPackageEntitlementForOrder(connection, packageOrder(), { env: {} })).resolves.toMatchObject({
      handled: true,
      status: SUPPORT_ENTITLEMENT_STATUS.PENDING,
      reasonCode: 'package_grant_disabled',
    });
    expect(entitlementMocks.creditAi).not.toHaveBeenCalled();
    expect(entitlementMocks.earnStorage).not.toHaveBeenCalled();
  });

  it('常驻组合包首次购买在同一连接写入账号级 AI 首购、AI 与基础空间权益', async () => {
    const connection = connectionFor();
    await expect(
      syncAfdianPackageEntitlementForOrder(connection, packageOrder(), { env: ENABLED_ENV }),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.CREDITED,
      aiTokens: 720_000,
      storageMb: 128,
      firstPurchaseApplied: true,
    });
    expect(entitlementMocks.creditAi).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({
        userId: 'user-1',
        amountTokens: 720_000,
        sourceType: 'support_package',
        sourceRef: 'support-order-1',
        idempotencyKey: 'support-package:support-order-1',
      }),
    );
    expect(entitlementMocks.earnStorage).toHaveBeenCalledWith(
      'user-1',
      128,
      'support_package',
      'support-v2:support-order-1',
      connection,
    );
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('support_first_purchase_claims'))).toBe(true);
    const firstClaim = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO support_first_purchase_claims'),
    );
    expect(firstClaim?.[1]).toEqual(expect.arrayContaining(['scope-ai-account-v3']));
  });

  it('轻笺账号或爱发电身份任一首充唯一约束冲突时只发基础权益', async () => {
    const connection = connectionFor({ duplicateFirstClaim: true });
    await expect(
      syncAfdianPackageEntitlementForOrder(connection, packageOrder(), { env: ENABLED_ENV }),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.CREDITED,
      aiTokens: 600_000,
      storageMb: 128,
      firstPurchaseApplied: false,
    });
    expect(entitlementMocks.creditAi).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ amountTokens: 600_000 }),
    );
    expect(entitlementMocks.earnStorage).toHaveBeenCalledWith(
      'user-1',
      128,
      'support_package',
      'support-v2:support-order-1',
      connection,
    );
  });

  it('发放前发现账号或实际付款身份已有历史 AI 首购时降级为基础权益', async () => {
    const connection = connectionFor({ existingIdentityFirstClaim: true });
    await expect(
      syncAfdianPackageEntitlementForOrder(connection, packageOrder(), { env: ENABLED_ENV }),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.CREDITED,
      aiTokens: 600_000,
      storageMb: 128,
      firstPurchaseApplied: false,
    });
    const eligibilityQuery = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('provider_identity_hash = ?'),
    );
    expect(eligibilityQuery?.[0]).toContain('provider_identity_hash = ?');
    expect(eligibilityQuery?.[1]).toEqual(
      expect.arrayContaining(['scope-ai-account-v3', 'ai-6', 'combo-10']),
    );
    expect(eligibilityQuery?.[1]?.at(-1)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO support_first_purchase_claims')),
    ).toBe(false);
  });

  it('尚未结算的 v2 AI 组合意图保留冻结快照，但统一占用账号级首购范围', async () => {
    const connection = connectionFor();
    await expect(
      syncAfdianPackageEntitlementForOrder(
        connection,
        packageOrder({
          catalog_version: 'support-packages-v2',
          quoted_ai_tokens: 780_000,
          quoted_storage_mb: 160,
        }),
        { env: ENABLED_ENV },
      ),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.CREDITED,
      aiTokens: 780_000,
      storageMb: 160,
      firstPurchaseApplied: true,
    });
    const firstClaim = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO support_first_purchase_claims'),
    );
    expect(firstClaim?.[1]).toEqual(expect.arrayContaining(['scope-ai-account-v3']));
  });

  it('纯空间套餐继续按 SKU 独立占用首购资格', async () => {
    const connection = connectionFor();
    await expect(
      syncAfdianPackageEntitlementForOrder(
        connection,
        packageOrder({
          sku_id: 'storage-6',
          total_amount: '6.00',
          quoted_amount: '6.00',
          base_ai_tokens: 0,
          quoted_ai_tokens: 0,
          base_storage_mb: 128,
          quoted_storage_mb: 160,
        }),
        { env: ENABLED_ENV },
      ),
    ).resolves.toMatchObject({ aiTokens: 0, storageMb: 160, firstPurchaseApplied: true });
    const firstClaim = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO support_first_purchase_claims'),
    );
    expect(firstClaim?.[1]).toEqual(expect.arrayContaining(['storage-6']));
    expect(firstClaim?.[1]).not.toEqual(expect.arrayContaining(['scope-ai-account-v3']));
  });

  it('活动套餐使用最终快照和独立限购，不读取或消耗常驻首充资格', async () => {
    const connection = connectionFor();
    const order = packageOrder({
      intent_type: 'campaign',
      sku_id: 'anniversary-combo',
      catalog_version: 'campaign:11111111-1111-4111-8111-111111111111:v2',
      quoted_amount: '30.00',
      total_amount: '30.00',
      base_ai_tokens: 2_500_000,
      base_storage_mb: 640,
      quoted_ai_tokens: 2_500_000,
      quoted_storage_mb: 640,
      campaign_id: '11111111-1111-4111-8111-111111111111',
      campaign_sku_id: '22222222-2222-4222-8222-222222222222',
      campaign_version: 2,
      campaign_user_limit: 1,
      first_purchase_candidate: 1,
    });
    await expect(syncAfdianPackageEntitlementForOrder(connection, order, { env: ENABLED_ENV })).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.CREDITED,
      aiTokens: 2_500_000,
      storageMb: 640,
      firstPurchaseApplied: false,
    });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('support_first_purchase_claims'))).toBe(false);
    expect(
      connection.query.mock.calls.some(
        ([sql]) => String(sql).includes('completed_count = completed_count + 1'),
      ),
    ).toBe(true);
    expect(entitlementMocks.creditAi).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ sourceType: 'support_campaign', amountTokens: 2_500_000 }),
    );
  });

  it('少付、多付、归属冲突和过期支付只进入人工复核，不发任何权益', async () => {
    for (const [overrides, reasonCode] of [
      [{ total_amount: '9.99' }, 'amount_mismatch'],
      [{ total_amount: '10.01' }, 'amount_mismatch'],
      [{ light_note_user_id: 'user-2' }, 'ownership_conflict'],
      [{ provider_created_epoch: 1_800_003_601 }, 'checkout_expired'],
    ]) {
      const connection = connectionFor();
      await expect(
        syncAfdianPackageEntitlementForOrder(connection, packageOrder(overrides), { env: ENABLED_ENV }),
      ).resolves.toMatchObject({ status: SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW, reasonCode });
    }
    expect(entitlementMocks.creditAi).not.toHaveBeenCalled();
    expect(entitlementMocks.earnStorage).not.toHaveBeenCalled();
  });

  it('同一结算凭证被另一订单并发抢占后只进入人工复核', async () => {
    const connection = connectionFor({
      consumedUpdate: 0,
      consumedOrderId: 'support-order-from-another-payment',
    });
    await expect(
      syncAfdianPackageEntitlementForOrder(connection, packageOrder(), { env: ENABLED_ENV }),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW,
      reasonCode: 'intent_reused',
    });
    expect(entitlementMocks.creditAi).not.toHaveBeenCalled();
    expect(entitlementMocks.earnStorage).not.toHaveBeenCalled();
  });

  it('账号注销后到达的套餐订单只进入人工复核，不给匿名墓碑创建权益钱包', async () => {
    const connection = connectionFor();
    const tombstone = `deleted:${'a'.repeat(64)}`;
    await expect(
      syncAfdianPackageEntitlementForOrder(
        connection,
        packageOrder({
          light_note_user_id: tombstone,
          intent_user_id: tombstone,
          intent_status: 'cancelled',
        }),
        { env: ENABLED_ENV },
      ),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.MANUAL_REVIEW,
      reasonCode: 'account_deleted',
    });
    expect(entitlementMocks.creditAi).not.toHaveBeenCalled();
    expect(entitlementMocks.earnStorage).not.toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('support_first_purchase_claims'))).toBe(false);
  });

  it('重复回放已入账订单不重复发放，退款反转只标记人工复核且不恢复首充', async () => {
    const grant = {
      id: 'grant-1',
      support_order_id: 'support-order-1',
      checkout_intent_id: 'checkout-intent-1',
      user_id: 'user-1',
      entitlement_type: 'permanent',
      sku_id: 'combo-10',
      catalog_version: 'support-packages-v2',
      campaign_id: null,
      campaign_sku_id: null,
      campaign_version: null,
      paid_amount: '10.00',
      calculated_ai_tokens: 780_000,
      calculated_storage_mb: 160,
      granted_ai_tokens: 780_000,
      granted_storage_mb: 160,
      first_purchase_applied: 1,
      grant_status: 'credited',
      reason_code: null,
      ai_ledger_entry_id: 'ai-ledger-780000',
      storage_log_ref: 'support-v2:support-order-1',
    };
    const replayConnection = connectionFor({ grant });
    await expect(
      syncAfdianPackageEntitlementForOrder(replayConnection, packageOrder(), { env: ENABLED_ENV }),
    ).resolves.toMatchObject({ status: SUPPORT_ENTITLEMENT_STATUS.CREDITED, firstPurchaseApplied: true });

    const reversalConnection = connectionFor({ grant });
    await expect(
      syncAfdianPackageEntitlementForOrder(
        reversalConnection,
        packageOrder({ provider_status: 1 }),
        { env: ENABLED_ENV },
      ),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.REVERSAL_REVIEW,
      reasonCode: 'provider_reversal',
      firstPurchaseApplied: true,
    });
    expect(entitlementMocks.creditAi).not.toHaveBeenCalled();
    expect(entitlementMocks.earnStorage).not.toHaveBeenCalled();
    expect(
      reversalConnection.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM support_first_purchase_claims')),
    ).toBe(false);
    const reversalGrantUpdate = reversalConnection.query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE support_entitlement_grants'),
    );
    expect(reversalGrantUpdate?.[1]?.[1]).toBe('10.00');
  });

  it('已入账订单金额漂移时保留原实付快照，只转入反转复核', async () => {
    const grant = {
      id: 'grant-amount-snapshot',
      user_id: 'user-1',
      paid_amount: '10.00',
      calculated_ai_tokens: 780_000,
      calculated_storage_mb: 160,
      granted_ai_tokens: 780_000,
      granted_storage_mb: 160,
      first_purchase_applied: 1,
      ai_ledger_entry_id: 'ai-ledger-780000',
      storage_log_ref: 'support-v2:support-order-1',
    };
    const connection = connectionFor({ grant });
    await expect(
      syncAfdianPackageEntitlementForOrder(connection, packageOrder({ total_amount: '9.00' }), {
        env: ENABLED_ENV,
      }),
    ).resolves.toMatchObject({
      status: SUPPORT_ENTITLEMENT_STATUS.REVERSAL_REVIEW,
      reasonCode: 'credited_amount_changed',
    });
    const update = connection.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE support_entitlement_grants'));
    expect(update?.[1]?.[1]).toBe('10.00');
  });

  it('组合包空间写入失败时向外抛错，不落成功权益记录，由订单事务整体回滚', async () => {
    entitlementMocks.earnStorage.mockRejectedValueOnce(new Error('storage-write-failed'));
    const connection = connectionFor();
    await expect(
      syncAfdianPackageEntitlementForOrder(connection, packageOrder(), { env: ENABLED_ENV }),
    ).rejects.toThrowError('storage-write-failed');
    expect(entitlementMocks.creditAi).toHaveBeenCalledTimes(1);
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO support_entitlement_grants')),
    ).toBe(false);
  });
});
