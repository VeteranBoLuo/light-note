import { describe, expect, it, vi } from 'vitest';
import { getAfdianAdminOverview, getAfdianUserOrders } from './afdianSupportReadService.js';

const mocks = vi.hoisted(() => ({ defaultQuery: vi.fn() }));

vi.mock('../db/index.js', () => ({
  default: {
    query: mocks.defaultQuery,
    getConnection: vi.fn(),
  },
}));

describe('资源商店订单读取', () => {
  it('后台概览允许 Handler 无参数调用并使用默认数据库连接', async () => {
    mocks.defaultQuery
      .mockResolvedValueOnce([
        [
          {
            verified_orders: 2,
            total_amount: '30.00',
            purchase_orders: 1,
            purchase_amount: '18.00',
            month_amount: '10.00',
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[{ pending_orders: 0, conflict_orders: 0, unlinked_orders: 0 }], []])
      .mockResolvedValueOnce([[{ granted_tokens: 600_000, manual_review_rewards: 1, reversal_review_rewards: 0 }], []])
      .mockResolvedValueOnce([
        [{ granted_tokens: 780_000, granted_storage_mb: 160, manual_review_rewards: 0, reversal_review_rewards: 1 }],
        [],
      ]);

    await expect(getAfdianAdminOverview()).resolves.toEqual({
      verifiedOrders: 2,
      totalAmount: '30.00',
      purchaseOrders: 1,
      purchaseAmount: '18.00',
      monthAmount: '10.00',
      pendingOrders: 0,
      conflictOrders: 0,
      unlinkedOrders: 0,
      grantedTokens: 1_380_000,
      grantedStorageMb: 160,
      manualReviewRewards: 1,
      reversalReviewRewards: 1,
    });
    expect(mocks.defaultQuery).toHaveBeenCalledTimes(4);
    expect(String(mocks.defaultQuery.mock.calls[0][0])).not.toMatch(/donation|legacy_support|support_account_links/);
  });

  it('用户订单只读取资源购买，并返回常驻套餐和活动套餐的 AI/空间到账事实', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        const statement = String(sql);
        if (statement.includes('COUNT(*) AS total')) return [[{ total: 1 }], []];
        return [
          [
            {
              id: 'order-1',
              total_amount: '10.00',
              month: 1,
              product_type: 0,
              ownership_source: 'checkout',
              order_purpose: 'entitlement_purchase',
              verified_at: '2026-08-25 10:00:00',
              ranking_observed_at: '2026-08-25 10:00:00',
              option_key: 'package',
              intent_type: 'permanent',
              sku_id: 'combo-10',
              grant_status: 'credited',
              reason_code: null,
              calculated_tokens: 780_000,
              granted_tokens: 780_000,
              calculated_storage_mb: 160,
              granted_storage_mb: 160,
              first_purchase_applied: 1,
            },
          ],
          [],
        ];
      }),
    };
    await expect(getAfdianUserOrders({ userId: 'user-1', db })).resolves.toMatchObject({
      total: 1,
      items: [
        {
          intentType: 'permanent',
          orderPurpose: 'entitlement_purchase',
          skuId: 'combo-10',
          rewardStatus: 'credited',
          rewardTokens: 780_000,
          grantedTokens: 780_000,
          rewardStorageMb: 160,
          grantedStorageMb: 160,
          firstPurchaseApplied: true,
        },
      ],
    });
    expect(db.query.mock.calls.every(([sql]) => String(sql).includes("o.order_purpose = 'entitlement_purchase'"))).toBe(
      true,
    );
  });
});
