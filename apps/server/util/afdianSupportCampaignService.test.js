import { describe, expect, it, vi } from 'vitest';
import {
  lockCampaignSkuForCheckout,
  previewSupportCampaignCosts,
  publishSupportCampaign,
  suspendSupportCampaign,
  supportCampaignCatalogVersion,
} from './afdianSupportCampaignService.js';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_SKU_ID = '22222222-2222-4222-8222-222222222222';
const VERSION = `campaign:${CAMPAIGN_ID}:v3`;

function activeSku(overrides = {}) {
  return {
    id: CAMPAIGN_SKU_ID,
    sku_id: 'anniversary-combo',
    title: '周年组合包',
    category: 'combo',
    amount: '30.00',
    ai_tokens: 2_000_000,
    storage_mb: 512,
    per_user_limit: 1,
    margin_bps: 4700,
    campaign_id: CAMPAIGN_ID,
    campaign_key: 'anniversary',
    version: 3,
    campaign_title: '周年支持季',
    starts_at: '2026-08-01T00:00:00.000Z',
    ends_at: '2026-09-01T00:00:00.000Z',
    status: 'published',
    ...overrides,
  };
}

function connectionFor({ sku = activeSku(), completedCount = 0, activeIntentId = null, activeUntil = null } = {}) {
  return {
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM support_campaign_skus s')) return [sku ? [sku] : [], []];
      if (statement.includes('INSERT IGNORE INTO support_campaign_user_limits')) return [{ affectedRows: 1 }, []];
      if (statement.includes('SELECT completed_count')) {
        return [[{ completed_count: completedCount, active_intent_id: activeIntentId, active_until: activeUntil }], []];
      }
      if (statement.includes("SET intent_status = 'expired'")) return [{ affectedRows: 1 }, []];
      throw new Error(`UNHANDLED_SUPPORT_CAMPAIGN_LOCK_SQL:${statement}`);
    }),
  };
}

function lifecycleConnection({ status = 'draft', endsAt = '2026-09-01T00:00:00.000Z', skuOverrides = {} } = {}) {
  let currentStatus = status;
  const cost = previewSupportCampaignCosts([
    {
      skuId: 'anniversary-combo',
      title: '周年组合包',
      amount: 30,
      aiTokens: 2_000_000,
      storageMb: 512,
    },
  ]).items[0];
  const sku = {
    id: CAMPAIGN_SKU_ID,
    sku_id: 'anniversary-combo',
    title: '周年组合包',
    category: 'combo',
    amount: '30.00',
    ai_tokens: 2_000_000,
    storage_mb: 512,
    per_user_limit: 1,
    margin_bps: cost.marginBps,
    sort_order: 0,
    ...skuOverrides,
  };
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM support_campaigns')) {
        return [[{
          id: CAMPAIGN_ID,
          campaign_key: 'anniversary',
          version: 3,
          title: '周年支持季',
          description: '独立限时套餐',
          status: currentStatus,
          starts_at: '2026-08-01T00:00:00.000Z',
          ends_at: endsAt,
          cost_policy_version: 'support-cost-v1',
          created_by: 'root-1',
          published_by: currentStatus === 'published' ? 'root-1' : null,
          published_at: currentStatus === 'published' ? '2026-08-25T00:00:00.000Z' : null,
          suspended_by: null,
          suspended_at: null,
          create_time: '2026-08-20T00:00:00.000Z',
          update_time: '2026-08-25T00:00:00.000Z',
        }], []];
      }
      if (statement.includes('FROM support_campaign_skus')) return [[sku], []];
      if (statement.includes("SET status = 'published'")) {
        currentStatus = 'published';
        return [{ affectedRows: 1 }, []];
      }
      if (statement.includes("SET status = 'suspended'")) {
        currentStatus = 'suspended';
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`UNHANDLED_SUPPORT_CAMPAIGN_LIFECYCLE_SQL:${statement}`);
    }),
  };
}

describe('爱发电独立限时套餐', () => {
  it('活动版本标识不可变且成本预览以 40% 为发布门禁', () => {
    expect(supportCampaignCatalogVersion(CAMPAIGN_ID, 3)).toBe(VERSION);
    expect(
      previewSupportCampaignCosts([
        { skuId: 'campaign-ai', title: '活动 AI 包', amount: 20, aiTokens: 2_000_000, storageMb: 0 },
      ]),
    ).toMatchObject({ policyVersion: 'support-cost-v1', minimumMarginBps: 4000, passes: true });
    expect(
      previewSupportCampaignCosts([
        { skuId: 'campaign-loss', title: '亏损活动包', amount: 1, aiTokens: 10_000_000, storageMb: 0 },
      ]),
    ).toMatchObject({ passes: false });
  });

  it('只在已发布时间窗内建立用户限购锁', async () => {
    const connection = connectionFor();
    await expect(
      lockCampaignSkuForCheckout(connection, {
        campaignSkuId: CAMPAIGN_SKU_ID,
        catalogVersion: VERSION,
        userId: 'user-1',
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ sku_id: 'anniversary-combo', per_user_limit: 1 });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT IGNORE INTO support_campaign_user_limits')),
    ).toBe(true);
  });

  it('活动未开始、已结束、已暂停或版本过期时不生成新结算', async () => {
    for (const [sku, catalogVersion, code] of [
      [activeSku({ starts_at: '2026-08-26T00:00:00.000Z' }), VERSION, 'SUPPORT_CAMPAIGN_NOT_ACTIVE'],
      [activeSku({ ends_at: '2026-08-25T00:00:00.000Z' }), VERSION, 'SUPPORT_CAMPAIGN_NOT_ACTIVE'],
      [activeSku({ status: 'suspended' }), VERSION, 'SUPPORT_CAMPAIGN_NOT_ACTIVE'],
      [activeSku(), `campaign:${CAMPAIGN_ID}:v2`, 'SUPPORT_CATALOG_VERSION_STALE'],
    ]) {
      await expect(
        lockCampaignSkuForCheckout(connectionFor({ sku }), {
          campaignSkuId: CAMPAIGN_SKU_ID,
          catalogVersion,
          userId: 'user-1',
          now: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('默认每用户限购一次，并拒绝 24 小时内重复创建支付意图', async () => {
    await expect(
      lockCampaignSkuForCheckout(connectionFor({ completedCount: 1 }), {
        campaignSkuId: CAMPAIGN_SKU_ID,
        catalogVersion: VERSION,
        userId: 'user-1',
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_LIMIT_REACHED' });

    await expect(
      lockCampaignSkuForCheckout(
        connectionFor({
          activeIntentId: 'checkout-intent-active',
          activeUntil: '2026-08-25T12:00:00.000Z',
        }),
        {
          campaignSkuId: CAMPAIGN_SKU_ID,
          catalogVersion: VERSION,
          userId: 'user-1',
          now: new Date('2026-08-25T00:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_CHECKOUT_ACTIVE' });
  });

  it('过期未支付意图可被显式标记过期后替换，不占用购买次数', async () => {
    const connection = connectionFor({
      activeIntentId: 'checkout-intent-expired',
      activeUntil: '2026-08-24T23:59:59.000Z',
    });
    await expect(
      lockCampaignSkuForCheckout(connection, {
        campaignSkuId: CAMPAIGN_SKU_ID,
        catalogVersion: VERSION,
        userId: 'user-1',
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ id: CAMPAIGN_SKU_ID });
    expect(
      connection.query.mock.calls.some(
        ([sql, params]) => String(sql).includes("SET intent_status = 'expired'") && params[0] === 'checkout-intent-expired',
      ),
    ).toBe(true);
  });

  it('发布时重新计算成本并锁定发布人，发布后只能暂停不能原地再发布', async () => {
    const connection = lifecycleConnection();
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };
    await expect(
      publishSupportCampaign({
        campaignId: CAMPAIGN_ID,
        actorUserId: 'root-2',
        db,
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'published', version: 3 });
    expect(
      connection.query.mock.calls.some(
        ([sql, params]) => String(sql).includes("SET status = 'published'") && params[0] === 'root-2',
      ),
    ).toBe(true);

    await expect(
      publishSupportCampaign({
        campaignId: CAMPAIGN_ID,
        actorUserId: 'root-2',
        db,
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_NOT_DRAFT' });
    expect(connection.rollback).toHaveBeenCalledOnce();

    await expect(
      suspendSupportCampaign({ campaignId: CAMPAIGN_ID, actorUserId: 'root-3', db }),
    ).resolves.toMatchObject({ status: 'suspended' });
  });

  it('发布时拒绝过期活动、成本快照漂移和缺失 Root 操作人', async () => {
    const noActorDb = { getConnection: vi.fn() };
    await expect(
      publishSupportCampaign({ campaignId: CAMPAIGN_ID, actorUserId: '', db: noActorDb }),
    ).rejects.toMatchObject({ code: 'ROOT_REQUIRED' });
    expect(noActorDb.getConnection).not.toHaveBeenCalled();

    const expired = lifecycleConnection({ endsAt: '2026-08-24T00:00:00.000Z' });
    await expect(
      publishSupportCampaign({
        campaignId: CAMPAIGN_ID,
        actorUserId: 'root-1',
        db: { getConnection: vi.fn().mockResolvedValue(expired) },
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_ALREADY_ENDED' });
    expect(expired.rollback).toHaveBeenCalledOnce();

    const drifted = lifecycleConnection({ skuOverrides: { margin_bps: 4000 } });
    await expect(
      publishSupportCampaign({
        campaignId: CAMPAIGN_ID,
        actorUserId: 'root-1',
        db: { getConnection: vi.fn().mockResolvedValue(drifted) },
        now: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_COST_GATE_FAILED' });
    expect(drifted.rollback).toHaveBeenCalledOnce();
  });
});
