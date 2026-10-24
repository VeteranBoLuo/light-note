import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import {
  calculateSupportPackageCost,
  getSupportCatalog,
  getSupportPackageFeatureState,
  normalizeSupportCampaignSkus,
  supportFirstPurchaseClaimKey,
  supportFirstPurchaseCompatibleClaimKeys,
  supportProviderIdentityHash,
} from './afdianSupportPackageCatalog.js';

describe('爱发电 v5 常驻与活动套餐目录', () => {
  it('常驻目录锁定 12 个 SKU、固定永久权益和组合节省金额', () => {
    expect(SUPPORT_PACKAGE_CATALOG_VERSION).toBe('support-packages-v5');
    expect(SUPPORT_PACKAGE_CATALOG).toHaveLength(12);
    expect(
      SUPPORT_PACKAGE_CATALOG.map(({ skuId, firstPurchaseScope, amount, base, firstPurchase, comboSavings }) => ({
        skuId,
        firstPurchaseScope,
        amount,
        base,
        firstPurchase,
        comboSavings,
      })),
    ).toEqual([
      {
        skuId: 'ai-6',
        firstPurchaseScope: 'none',
        amount: 6,
        base: { aiTokens: 300_000, storageMb: 0 },
        firstPurchase: { aiTokens: 300_000, storageMb: 0 },
        comboSavings: 0,
      },
      {
        skuId: 'ai-18',
        firstPurchaseScope: 'none',
        amount: 18,
        base: { aiTokens: 900_000, storageMb: 0 },
        firstPurchase: { aiTokens: 900_000, storageMb: 0 },
        comboSavings: 0,
      },
      {
        skuId: 'ai-50',
        firstPurchaseScope: 'none',
        amount: 50,
        base: { aiTokens: 2_500_000, storageMb: 0 },
        firstPurchase: { aiTokens: 2_500_000, storageMb: 0 },
        comboSavings: 0,
      },
      {
        skuId: 'ai-100',
        firstPurchaseScope: 'none',
        amount: 100,
        base: { aiTokens: 5_000_000, storageMb: 0 },
        firstPurchase: { aiTokens: 5_000_000, storageMb: 0 },
        comboSavings: 0,
      },
      {
        skuId: 'storage-6',
        firstPurchaseScope: 'none',
        amount: 6,
        base: { aiTokens: 0, storageMb: 256 },
        firstPurchase: { aiTokens: 0, storageMb: 256 },
        comboSavings: 0,
      },
      {
        skuId: 'storage-18',
        firstPurchaseScope: 'none',
        amount: 18,
        base: { aiTokens: 0, storageMb: 768 },
        firstPurchase: { aiTokens: 0, storageMb: 768 },
        comboSavings: 0,
      },
      {
        skuId: 'storage-50',
        firstPurchaseScope: 'none',
        amount: 50,
        base: { aiTokens: 0, storageMb: 2_048 },
        firstPurchase: { aiTokens: 0, storageMb: 2_048 },
        comboSavings: 0,
      },
      {
        skuId: 'storage-100',
        firstPurchaseScope: 'none',
        amount: 100,
        base: { aiTokens: 0, storageMb: 4_096 },
        firstPurchase: { aiTokens: 0, storageMb: 4_096 },
        comboSavings: 0,
      },
      {
        skuId: 'combo-10',
        firstPurchaseScope: 'none',
        amount: 10,
        base: { aiTokens: 300_000, storageMb: 256 },
        firstPurchase: { aiTokens: 300_000, storageMb: 256 },
        comboSavings: 2,
      },
      {
        skuId: 'combo-30',
        firstPurchaseScope: 'none',
        amount: 30,
        base: { aiTokens: 900_000, storageMb: 768 },
        firstPurchase: { aiTokens: 900_000, storageMb: 768 },
        comboSavings: 6,
      },
      {
        skuId: 'combo-88',
        firstPurchaseScope: 'none',
        amount: 88,
        base: { aiTokens: 2_500_000, storageMb: 2_048 },
        firstPurchase: { aiTokens: 2_500_000, storageMb: 2_048 },
        comboSavings: 12,
      },
      {
        skuId: 'combo-168',
        firstPurchaseScope: 'none',
        amount: 168,
        base: { aiTokens: 5_000_000, storageMb: 4_096 },
        firstPurchase: { aiTokens: 5_000_000, storageMb: 4_096 },
        comboSavings: 32,
      },
    ]);
  });

  it('功能开关按 Schema/目录/结算/发放顺序失败关闭', () => {
    expect(getSupportPackageFeatureState({})).toEqual({
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      catalogEnabled: false,
      checkoutEnabled: false,
      grantEnabled: false,
      campaignsEnabled: false,
    });
    expect(
      getSupportPackageFeatureState({
        SUPPORT_PACKAGES_CATALOG_ENABLED: 'true',
        SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true',
        SUPPORT_CAMPAIGNS_ENABLED: 'true',
      }),
    ).toMatchObject({ catalogEnabled: true, checkoutEnabled: false, campaignsEnabled: true, grantEnabled: false });
    expect(
      getSupportPackageFeatureState({
        SUPPORT_PACKAGES_CATALOG_ENABLED: 'true',
        SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true',
        SUPPORT_PACKAGES_GRANT_ENABLED: 'true',
      }),
    ).toMatchObject({ catalogEnabled: true, checkoutEnabled: true, grantEnabled: true });
  });

  it('新保守成本揭示常驻套餐风险但不修改合同，低价活动被阻断', () => {
    const costs = SUPPORT_PACKAGE_CATALOG.map((item) => ({
      skuId: item.skuId,
      ...calculateSupportPackageCost({ amount: item.amount, ...item.firstPurchase }),
    }));
    expect(costs.some((item) => !item.passes)).toBe(true);
    expect(costs.find((item) => item.skuId === 'combo-168')?.policyVersion).toBe('support-cost-v2');
    expect(() =>
      normalizeSupportCampaignSkus(
        [{ skuId: 'bad-ai', title: '过量低价包', amount: 1, aiTokens: 10_000_000, storageMb: 0 }],
        { requireMargin: true },
      ),
    ).toThrowError(/40%/);
  });

  it.each([true, false])('新目录固定权益，不读取历史首购或付款身份（登录：%s）', async (authenticated) => {
    const db = { query: vi.fn() };
    const catalog = await getSupportCatalog({
      userId: 'user-1',
      authenticated,
      db,
      env: { SUPPORT_PACKAGES_CATALOG_ENABLED: 'true' },
    });
    expect(catalog.packages).toHaveLength(12);
    for (const item of catalog.packages) {
      expect(item.firstPurchaseStatus).toBe('not_applicable');
      expect(item.firstPurchase).toEqual(item.base);
      expect(supportFirstPurchaseClaimKey(item)).toBe('');
      expect(supportFirstPurchaseCompatibleClaimKeys(item)).toEqual([]);
    }
    expect(db.query).not.toHaveBeenCalled();
    const providerHash = supportProviderIdentityHash('afdian-user-1');
    expect(providerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(providerHash).not.toContain('afdian-user-1');
  });

  it.each(['support-packages-v2', 'support-packages-v3', 'support-packages-v4'])(
    '%s 旧 AI 订单仍兼容全部历史 AI 与组合首购记录',
    (catalogVersion) => {
      const aiPackage = SUPPORT_PACKAGE_CATALOG.find((item) => item.skuId === 'ai-6');
      expect(supportFirstPurchaseCompatibleClaimKeys(aiPackage, catalogVersion)).toEqual([
        'scope-ai-account-v3',
        'ai-6',
        'ai-18',
        'ai-50',
        'ai-100',
        'combo-10',
        'combo-30',
        'combo-88',
        'combo-168',
      ]);
      expect(supportFirstPurchaseClaimKey(aiPackage, catalogVersion)).toBe('scope-ai-account-v3');
    },
  );

  it('旧空间首购只适用于 v2/v3，v4/v5 固定空间不产生首购键', () => {
    const item = SUPPORT_PACKAGE_CATALOG.find((entry) => entry.skuId === 'storage-6');
    for (const version of ['support-packages-v2', 'support-packages-v3']) {
      expect(supportFirstPurchaseClaimKey(item, version)).toBe('storage-6');
      expect(supportFirstPurchaseCompatibleClaimKeys(item, version)).toEqual(['storage-6']);
    }
    for (const version of ['support-packages-v4', 'support-packages-v5']) {
      expect(supportFirstPurchaseClaimKey(item, version)).toBe('');
      expect(supportFirstPurchaseCompatibleClaimKeys(item, version)).toEqual([]);
    }
  });

  it('活动套餐只返回活动期内最终权益，不叠加常驻首充', async () => {
    const campaignId = '11111111-1111-4111-8111-111111111111';
    const db = {
      query: vi.fn(async (sql) => {
        const statement = String(sql);
        if (statement.includes('FROM support_campaigns c')) {
          return [
            [
              {
                campaign_id: campaignId,
                campaign_key: 'anniversary',
                version: 2,
                campaign_title: '周年支持季',
                description: '最终到账，不叠加首充',
                starts_at: '2026-08-01 00:00:00',
                ends_at: '2026-09-01 00:00:00',
                campaign_sku_id: '22222222-2222-4222-8222-222222222222',
                sku_id: 'anniversary-combo',
                title: '周年组合包',
                category: 'combo',
                amount: '30.00',
                ai_tokens: 2_500_000,
                storage_mb: 640,
                per_user_limit: 1,
                margin_bps: 4800,
                completed_count: 0,
                active_intent_id: null,
                active_until: null,
              },
            ],
            [],
          ];
        }
        throw new Error(`UNHANDLED_SUPPORT_CAMPAIGN_SQL:${statement}`);
      }),
    };
    const catalog = await getSupportCatalog({
      userId: 'user-1',
      authenticated: true,
      db,
      env: { SUPPORT_PACKAGES_CATALOG_ENABLED: '1', SUPPORT_CAMPAIGNS_ENABLED: '1' },
      now: new Date('2026-08-25T00:00:00Z'),
    });
    expect(catalog.campaigns).toEqual([
      expect.objectContaining({
        catalogVersion: `campaign:${campaignId}:v2`,
        benefit: { aiTokens: 2_500_000, storageMb: 640 },
        remainingPurchases: 1,
        limitReached: false,
      }),
    ]);
    expect(catalog.campaigns[0]).not.toHaveProperty('firstPurchase');
  });
});
