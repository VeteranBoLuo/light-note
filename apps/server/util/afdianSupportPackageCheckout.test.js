import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import { createAfdianPackageCheckoutIntent } from './afdianSupportService.js';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_SKU_ID = '22222222-2222-4222-8222-222222222222';

function connectionFor({ campaign = false } = {}) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM support_first_purchase_claims')) return [[], []];
      if (statement.includes('FROM support_account_links')) return [[], []];
      if (campaign && statement.includes('FROM support_campaign_skus s')) {
        return [[{
          id: CAMPAIGN_SKU_ID,
          sku_id: 'anniversary-combo',
          title: '周年组合包',
          category: 'combo',
          amount: '30.00',
          ai_tokens: 2_500_000,
          storage_mb: 640,
          per_user_limit: 1,
          margin_bps: 4800,
          campaign_id: CAMPAIGN_ID,
          campaign_key: 'anniversary',
          version: 2,
          campaign_title: '周年支持季',
          starts_at: '2026-08-01T00:00:00.000Z',
          ends_at: '2026-09-01T00:00:00.000Z',
          status: 'published',
        }], []];
      }
      if (campaign && statement.includes('SELECT completed_count')) {
        return [[{ completed_count: 0, active_intent_id: null, active_until: null }], []];
      }
      if (
        statement.includes('INSERT IGNORE INTO support_campaign_user_limits') ||
        statement.includes('INSERT INTO support_checkout_intents') ||
        statement.includes('UPDATE support_campaign_user_limits')
      ) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`UNHANDLED_SUPPORT_CHECKOUT_SQL:${statement}`);
    }),
  };
  return connection;
}

beforeEach(() => {
  vi.stubEnv('AFDIAN_CREATOR_USER_ID', 'creator-user');
  vi.stubEnv('AFDIAN_API_TOKEN', 'api-token-for-test');
});

afterEach(() => vi.unstubAllEnvs());

describe('爱发电 v2 套餐结算意图', () => {
  it('常驻套餐生成精确金额和一次性随机码，只在数据库保存摘要与不可变首充快照', async () => {
    const connection = connectionFor();
    const result = await createAfdianPackageCheckoutIntent({
      userId: 'user-1',
      skuId: 'combo-10',
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      db: { getConnection: vi.fn().mockResolvedValue(connection) },
      env: {
        SUPPORT_PACKAGES_CATALOG_ENABLED: 'true',
        SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true',
        SUPPORT_PACKAGES_GRANT_ENABLED: 'true',
      },
    });
    const url = new URL(result.url);
    const token = url.searchParams.get('custom_order_id');
    expect(url.origin + url.pathname).toBe('https://ifdian.net/order/create');
    expect(url.searchParams.get('user_id')).toBe('creator-user');
    expect(url.searchParams.get('custom_price')).toBe('10.00');
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(result).toMatchObject({ expiresIn: 30 * 24 * 60 * 60, firstPurchaseCandidate: true });
    const insert = connection.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO support_checkout_intents'));
    expect(insert?.[1]).not.toContain(token);
    expect(insert?.[1]).toEqual(expect.arrayContaining([
      'user-1',
      'permanent',
      'combo-10',
      SUPPORT_PACKAGE_CATALOG_VERSION,
      '10.00',
      600_000,
      128,
      780_000,
      160,
      1,
    ]));
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('活动期内生成独立 24 小时意图，直接快照最终权益且不携带首充倍率', async () => {
    const connection = connectionFor({ campaign: true });
    const catalogVersion = `campaign:${CAMPAIGN_ID}:v2`;
    const result = await createAfdianPackageCheckoutIntent({
      userId: 'user-1',
      skuId: CAMPAIGN_SKU_ID,
      catalogVersion,
      db: { getConnection: vi.fn().mockResolvedValue(connection) },
      env: {
        SUPPORT_PACKAGES_CATALOG_ENABLED: 'true',
        SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true',
        SUPPORT_PACKAGES_GRANT_ENABLED: 'true',
        SUPPORT_CAMPAIGNS_ENABLED: 'true',
      },
      now: new Date('2026-08-25T00:00:00.000Z'),
    });
    expect(new URL(result.url).searchParams.get('custom_price')).toBe('30.00');
    expect(result).toMatchObject({ expiresIn: 24 * 60 * 60, firstPurchaseCandidate: false });
    const insert = connection.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO support_checkout_intents'));
    expect(insert?.[1]).toEqual(expect.arrayContaining([
      'campaign',
      'anniversary-combo',
      catalogVersion,
      '30.00',
      2_500_000,
      640,
      CAMPAIGN_ID,
      CAMPAIGN_SKU_ID,
      2,
      1,
      24 * 60 * 60,
    ]));
    expect(
      connection.query.mock.calls.some(
        ([sql, params]) => String(sql).includes('active_until = DATE_ADD') && params[1] === 24 * 60 * 60,
      ),
    ).toBe(true);
  });

  it('结算目录关闭时在取数据库连接前失败关闭', async () => {
    const db = { getConnection: vi.fn() };
    await expect(
      createAfdianPackageCheckoutIntent({
        userId: 'user-1',
        skuId: 'ai-6',
        catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
        db,
        env: { SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true' },
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_PACKAGE_CHECKOUT_DISABLED' });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('缺少登录用户时在取数据库连接前拒绝创建意图', async () => {
    const db = { getConnection: vi.fn() };
    await expect(
      createAfdianPackageCheckoutIntent({
        userId: '   ',
        skuId: 'ai-6',
        catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
        db,
        env: {
          SUPPORT_PACKAGES_CATALOG_ENABLED: 'true',
          SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true',
          SUPPORT_PACKAGES_GRANT_ENABLED: 'true',
        },
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_PACKAGE_AUTH_REQUIRED', status: 401 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });
});
