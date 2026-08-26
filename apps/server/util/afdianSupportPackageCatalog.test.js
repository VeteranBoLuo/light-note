import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import {
  calculateSupportPackageCost,
  getSupportCatalog,
  getSupportPackageFeatureState,
  normalizeSupportCampaignSkus,
  supportProviderIdentityHash,
} from './afdianSupportPackageCatalog.js';

describe('爱发电 v2 常驻与活动套餐目录', () => {
  it('常驻目录严格锁定 12 个 SKU、整洁首充到账和组合节省金额', () => {
    expect(SUPPORT_PACKAGE_CATALOG_VERSION).toBe('support-packages-v2');
    expect(SUPPORT_PACKAGE_CATALOG).toHaveLength(12);
    expect(SUPPORT_PACKAGE_CATALOG.map(({ skuId, amount, base, firstPurchase, comboSavings }) => ({
      skuId,
      amount,
      base,
      firstPurchase,
      comboSavings,
    }))).toEqual([
      { skuId: 'ai-6', amount: 6, base: { aiTokens: 600_000, storageMb: 0 }, firstPurchase: { aiTokens: 780_000, storageMb: 0 }, comboSavings: 0 },
      { skuId: 'ai-18', amount: 18, base: { aiTokens: 1_800_000, storageMb: 0 }, firstPurchase: { aiTokens: 2_340_000, storageMb: 0 }, comboSavings: 0 },
      { skuId: 'ai-50', amount: 50, base: { aiTokens: 5_000_000, storageMb: 0 }, firstPurchase: { aiTokens: 6_500_000, storageMb: 0 }, comboSavings: 0 },
      { skuId: 'ai-100', amount: 100, base: { aiTokens: 10_000_000, storageMb: 0 }, firstPurchase: { aiTokens: 13_000_000, storageMb: 0 }, comboSavings: 0 },
      { skuId: 'storage-6', amount: 6, base: { aiTokens: 0, storageMb: 128 }, firstPurchase: { aiTokens: 0, storageMb: 160 }, comboSavings: 0 },
      { skuId: 'storage-18', amount: 18, base: { aiTokens: 0, storageMb: 512 }, firstPurchase: { aiTokens: 0, storageMb: 640 }, comboSavings: 0 },
      { skuId: 'storage-50', amount: 50, base: { aiTokens: 0, storageMb: 1_536 }, firstPurchase: { aiTokens: 0, storageMb: 2_048 }, comboSavings: 0 },
      { skuId: 'storage-100', amount: 100, base: { aiTokens: 0, storageMb: 3_072 }, firstPurchase: { aiTokens: 0, storageMb: 4_096 }, comboSavings: 0 },
      { skuId: 'combo-10', amount: 10, base: { aiTokens: 600_000, storageMb: 128 }, firstPurchase: { aiTokens: 780_000, storageMb: 160 }, comboSavings: 2 },
      { skuId: 'combo-30', amount: 30, base: { aiTokens: 1_800_000, storageMb: 512 }, firstPurchase: { aiTokens: 2_340_000, storageMb: 640 }, comboSavings: 6 },
      { skuId: 'combo-88', amount: 88, base: { aiTokens: 5_000_000, storageMb: 1_536 }, firstPurchase: { aiTokens: 6_500_000, storageMb: 2_048 }, comboSavings: 12 },
      { skuId: 'combo-168', amount: 168, base: { aiTokens: 10_000_000, storageMb: 3_072 }, firstPurchase: { aiTokens: 13_000_000, storageMb: 4_096 }, comboSavings: 32 },
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

  it('首充最重套餐仍通过 40% 成本门禁，低价活动套餐被阻断', () => {
    const costs = SUPPORT_PACKAGE_CATALOG.map((item) => ({
      skuId: item.skuId,
      ...calculateSupportPackageCost({ amount: item.amount, ...item.firstPurchase }),
    }));
    expect(costs.every((item) => item.passes)).toBe(true);
    expect(costs.find((item) => item.skuId === 'combo-168')?.marginBps).toBe(4601);
    expect(() =>
      normalizeSupportCampaignSkus(
        [{ skuId: 'bad-ai', title: '过量低价包', amount: 1, aiTokens: 10_000_000, storageMb: 0 }],
        { requireMargin: true },
      ),
    ).toThrowError(/40%/);
  });

  it('首充状态同时合并轻笺账号与已关联爱发电身份的 SKU 领取记录', async () => {
    const providerHash = supportProviderIdentityHash('afdian-user-1');
    const db = {
      query: vi.fn(async (sql) => {
        const statement = String(sql);
        if (statement.includes('FROM support_account_links')) return [[{ provider_user_id: 'afdian-user-1' }], []];
        if (statement.includes('WHERE user_id = ?')) return [[{ sku_id: 'ai-6' }], []];
        if (statement.includes('provider_identity_hash')) {
          expect(providerHash).toMatch(/^[0-9a-f]{64}$/);
          return [[{ sku_id: 'storage-6' }], []];
        }
        throw new Error(`UNHANDLED_SUPPORT_CATALOG_SQL:${statement}`);
      }),
    };
    const catalog = await getSupportCatalog({
      userId: 'user-1',
      authenticated: true,
      db,
      env: { SUPPORT_PACKAGES_CATALOG_ENABLED: 'true' },
    });
    expect(catalog.packages.find((item) => item.skuId === 'ai-6')?.firstPurchaseStatus).toBe('used');
    expect(catalog.packages.find((item) => item.skuId === 'storage-6')?.firstPurchaseStatus).toBe('used');
    expect(catalog.packages.find((item) => item.skuId === 'combo-10')?.firstPurchaseStatus).toBe('available');
    expect(providerHash).not.toContain('afdian-user-1');
  });

  it('活动套餐只返回活动期内最终权益，不叠加常驻首充', async () => {
    const campaignId = '11111111-1111-4111-8111-111111111111';
    const db = {
      query: vi.fn(async (sql) => {
        const statement = String(sql);
        if (statement.includes('FROM support_account_links')) return [[], []];
        if (statement.includes('FROM support_first_purchase_claims')) return [[], []];
        if (statement.includes('FROM support_campaigns c')) {
          return [[{
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
          }], []];
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
