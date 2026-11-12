import { afterEach, describe, expect, it, vi } from 'vitest';

const rewardMocks = vi.hoisted(() => ({
  syncOrder: vi.fn(async () => ({ status: 'credited', tokens: 600_000 })),
  syncUser: vi.fn(async () => []),
}));

vi.mock('./afdianSupportRewardService.js', () => ({
  syncAfdianRewardForOrder: rewardMocks.syncOrder,
  syncAfdianRewardsForUser: rewardMocks.syncUser,
}));

import {
  applyVerifiedAfdianOrder,
  ingestAfdianWebhookOrder,
  resolveAfdianOrderPurpose,
  resolveAfdianOwnership,
} from './afdianSupportService.js';

describe('爱发电订单归属合并', () => {
  it('以不可变订单用途区分历史赞助、纯赞助、权益购买和未知凭证', () => {
    expect(resolveAfdianOrderPurpose()).toBe('donation');
    expect(resolveAfdianOrderPurpose({ productType: 1 })).toBe('unknown');
    expect(resolveAfdianOrderPurpose({ intent: { intent_type: 'donation' }, hasCustomOrderId: true })).toBe('donation');
    expect(resolveAfdianOrderPurpose({ intent: { intent_type: 'permanent' }, hasCustomOrderId: true })).toBe(
      'entitlement_purchase',
    );
    expect(resolveAfdianOrderPurpose({ hasCustomOrderId: true })).toBe('unknown');
    expect(
      resolveAfdianOrderPurpose({ providerCreatedAt: 1_799_999_999, pureSupportActivatedEpoch: 1_800_000_000 }),
    ).toBe('legacy_support');
    expect(
      resolveAfdianOrderPurpose({ providerCreatedAt: 1_800_000_001, pureSupportActivatedEpoch: 1_800_000_000 }),
    ).toBe('donation');
    expect(resolveAfdianOrderPurpose({ pureSupportActivatedEpoch: 1_800_000_000 })).toBe('unknown');
    expect(
      resolveAfdianOrderPurpose({
        existingPurpose: 'legacy_support',
        intent: { intent_type: 'permanent' },
        hasCustomOrderId: true,
      }),
    ).toBe('legacy_support');
  });

  it('一次性下单凭证与后续 OAuth 指向同一账号时只升级证据来源', () => {
    expect(
      resolveAfdianOwnership({
        currentUserId: 'light-note-user-1',
        linkUserIds: new Set(['light-note-user-1']),
        intent: { user_id: 'light-note-user-1' },
      }),
    ).toEqual({ userId: 'light-note-user-1', source: 'oauth_checkout' });
  });

  it('没有新证据时保留已经由 API 确认过的归属来源', () => {
    expect(
      resolveAfdianOwnership({
        currentUserId: 'light-note-user-1',
        currentSource: 'checkout',
        linkUserIds: new Set(),
        intent: null,
      }),
    ).toEqual({ userId: 'light-note-user-1', source: 'checkout' });
  });

  it('OAuth 与下单凭证冲突时不把订单静默转给另一个账号', () => {
    expect(
      resolveAfdianOwnership({
        currentUserId: 'light-note-user-1',
        linkUserIds: new Set(['light-note-user-2']),
        intent: { user_id: 'light-note-user-1' },
      }),
    ).toEqual({ userId: 'light-note-user-1', source: 'conflict' });

    expect(
      resolveAfdianOwnership({
        currentUserId: null,
        linkUserIds: new Set(['light-note-user-2']),
        intent: { user_id: 'light-note-user-1' },
      }),
    ).toEqual({ userId: null, source: 'conflict' });
  });

  it('Webhook 不使用未签名的随机码或商品明细归属用户', async () => {
    const token = 'a'.repeat(43);
    const skuId = 'b'.repeat(32);
    const webhookDb = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await ingestAfdianWebhookOrder(
      {
        out_trade_no: 'order-12345678',
        user_id: 'provider-user',
        user_private_id: 'provider-private',
        custom_order_id: token,
        plan_id: 'plan-id',
        product_type: 1,
        sku_detail: [{ sku_id: skuId, count: 1 }],
        month: 1,
        total_amount: '6.00',
        show_amount: '6.00',
        status: 2,
      },
      { db: webhookDb },
    );
    const [webhookSql, webhookParams] = webhookDb.query.mock.calls[0];
    expect(webhookSql).not.toContain('light_note_user_id');
    expect(webhookSql).not.toContain('checkout_intent_id');
    expect(webhookParams).not.toContain(token);
    expect(webhookParams).not.toContain(skuId);
    expect(webhookSql).not.toContain('product_sku_id');
    expect(webhookSql).toContain('ranking_observed_at');
    expect(webhookSql).toContain("verification_state = 'pending'");
  });

  it('API 首次确认记录观察时间，重复同步不刷新该时间', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ activated_epoch: 1_800_000_000 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };
    await applyVerifiedAfdianOrder(
      {
        providerOrderNo: 'order-12345678',
        providerUserId: 'provider-user',
        providerPrivateId: null,
        customOrderId: '',
        planId: 'plan-id',
        productType: 0,
        month: 1,
        totalAmount: '6.00',
        showAmount: '6.00',
        providerStatus: 2,
        providerCreatedAt: 1_800_000_100,
      },
      { db },
    );

    const upsertSql = String(connection.query.mock.calls[3][0]);
    expect(upsertSql).toContain('verified_at, ranking_observed_at');
    expect(upsertSql).toContain('order_purpose');
    expect(connection.query.mock.calls[3][1]).toContain('donation');
    expect(upsertSql).not.toContain('ranking_observed_at =');
    expect(upsertSql).toContain('verified_at = COALESCE(verified_at, NOW())');
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('已冻结用途与后来出现的自定义凭证冲突时保留原用途和意图并退出榜单等待复核', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'existing-order-id',
              checkout_intent_id: 'original-donation-intent',
              light_note_user_id: 'light-note-user-1',
              ownership_source: 'checkout',
              order_purpose: 'donation',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              id: 'late-package-intent',
              user_id: 'light-note-user-1',
              provider_user_id: null,
              provider_private_id: null,
              intent_type: 'permanent',
              consumed_order_id: null,
              first_used_at: null,
              expires_at: '2026-09-01 00:00:00',
            },
          ],
        ])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]),
    };

    await applyVerifiedAfdianOrder(
      {
        providerOrderNo: 'order-purpose-conflict',
        providerUserId: 'provider-user',
        providerPrivateId: null,
        customOrderId: 'late-package-token',
        planId: '',
        productType: 0,
        month: 1,
        totalAmount: '6.00',
        showAmount: '6.00',
        providerStatus: 2,
      },
      { db: { getConnection: vi.fn().mockResolvedValue(connection) } },
    );

    const upsertParams = connection.query.mock.calls[3][1];
    expect(upsertParams[4]).toBe('original-donation-intent');
    expect(upsertParams[5]).toBe('light-note-user-1');
    expect(upsertParams[6]).toBe('conflict');
    expect(upsertParams[7]).toBe('donation');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('已使用凭证被另一爱发电身份复用时保留凭证快照但标记归属冲突', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([
          [
            {
              id: 'used-package-intent',
              user_id: 'light-note-user-1',
              provider_user_id: 'original-provider-user',
              provider_private_id: null,
              intent_type: 'permanent',
              consumed_order_id: null,
              first_used_at: '2026-08-26 12:00:00',
              expires_at: '2026-09-01 00:00:00',
            },
          ],
        ])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]),
    };

    await applyVerifiedAfdianOrder(
      {
        providerOrderNo: 'order-identity-conflict',
        providerUserId: 'different-provider-user',
        providerPrivateId: null,
        customOrderId: 'reused-package-token',
        planId: '',
        productType: 0,
        month: 1,
        totalAmount: '10.00',
        showAmount: '10.00',
        providerStatus: 2,
      },
      { db: { getConnection: vi.fn().mockResolvedValue(connection) } },
    );

    const upsertParams = connection.query.mock.calls[3][1];
    expect(upsertParams[4]).toBe('used-package-intent');
    expect(upsertParams[5]).toBe('light-note-user-1');
    expect(upsertParams[6]).toBe('conflict');
    expect(upsertParams[7]).toBe('entitlement_purchase');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('组合权益发放任一步失败时回滚整个订单同步事务', async () => {
    rewardMocks.syncOrder.mockRejectedValueOnce(new Error('package-storage-credit-failed'));
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ activated_epoch: 1_800_000_000 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    await expect(
      applyVerifiedAfdianOrder(
        {
          providerOrderNo: 'order-package-rollback',
          providerUserId: 'provider-user',
          providerPrivateId: null,
          customOrderId: '',
          planId: '',
          productType: 0,
          month: 1,
          totalAmount: '30.00',
          showAmount: '30.00',
          providerStatus: 2,
          providerCreatedAt: 1_800_000_100,
        },
        { db: { getConnection: vi.fn().mockResolvedValue(connection) } },
      ),
    ).rejects.toThrowError('package-storage-credit-failed');
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});

afterEach(() => vi.unstubAllEnvs());
