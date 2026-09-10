import { describe, expect, it, vi } from 'vitest';
import {
  campaignLifecycle,
  getCampaignPresentation,
  setCampaignVisibility,
  getCheckoutStatus,
} from './afdianCampaignPresentation.js';
import { lockCampaignSkuForCheckout } from './afdianSupportCampaignService.js';
const id = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-26T00:00:00Z');
const env = {
  SUPPORT_PACKAGES_CATALOG_ENABLED: 'true',
  SUPPORT_PACKAGES_GRANT_ENABLED: 'true',
  SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'true',
  SUPPORT_CAMPAIGNS_ENABLED: 'true',
};
const campaign = {
  id,
  campaign_key: 'autumn',
  version: 1,
  title: 'Autumn',
  status: 'published',
  starts_at: '2026-09-25T00:00:00Z',
  ends_at: '2026-10-09T00:00:00Z',
};
describe('manual campaign visibility', () => {
  it('does not reveal a hidden campaign even during its date window', async () => {
    const db = { query: vi.fn(async () => [[], []]) };
    expect(await getCampaignPresentation({ db, env, now, campaignKey: 'autumn' })).toBeNull();
    expect(db.query.mock.calls[0][0]).toContain('public_enabled = 1');
  });
  it('keeps upcoming, paused and ended lifecycle distinct', () => {
    expect(campaignLifecycle(campaign, new Date('2026-09-24'))).toBe('upcoming');
    expect(campaignLifecycle(campaign, now)).toBe('active');
    expect(campaignLifecycle({ ...campaign, status: 'suspended' }, now)).toBe('paused');
    expect(campaignLifecycle(campaign, new Date('2026-10-09T00:00:00Z'))).toBe('ended');
  });
  it('removes promotion on suspension while retaining the opened detail', async () => {
    const db = {
      query: vi.fn(async (sql) =>
        sql.includes('FROM support_campaigns') ? [[{ ...campaign, status: 'suspended' }], []] : [[], []],
      ),
    };
    expect(await getCampaignPresentation({ db, env, now, entryOnly: true })).toBeNull();
    expect((await getCampaignPresentation({ db, env, now, campaignKey: 'autumn' })).lifecycle).toBe('paused');
  });
  it('serializes visibility changes and checkout with the same lock, and rejects a hidden SKU', async () => {
    const connection = {
      query: vi.fn(async (sql) =>
        sql.includes('visibility_lock')
          ? [[{ id: 1 }], []]
          : [[{ ...campaign, id, campaign_id: id, public_enabled: 0 }], []],
      ),
    };
    await expect(
      lockCampaignSkuForCheckout(connection, {
        campaignSkuId: id,
        catalogVersion: `campaign:${id}:v1`,
        userId: 'owner',
        now,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_NOT_ACTIVE' });
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('closing stays available with emergency switches off and does not touch existing orders', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => (sql.startsWith('SELECT id, status') ? [[campaign], []] : [[], []])),
    };
    await setCampaignVisibility({
      campaignId: id,
      enabled: false,
      actorUserId: 'root',
      db: { getConnection: async () => connection },
      env: {},
      now,
    });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.some(([sql]) => /checkout_intents|entitlement_grants/.test(sql))).toBe(false);
  });
  it.each(['draft', 'suspended'])('cannot open %s', async (status) => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => (sql.startsWith('SELECT id, status') ? [[{ ...campaign, status }], []] : [[], []])),
    };
    await expect(
      setCampaignVisibility({
        campaignId: id,
        enabled: true,
        actorUserId: 'root',
        db: { getConnection: async () => connection },
        env,
        now,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_OPEN_BLOCKED' });
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
});
describe('owner-bound order status', () => {
  it('filters ownership server-side and returns the same missing result for another owner', async () => {
    const db = { query: vi.fn(async () => [[], []]) };
    await expect(getCheckoutStatus({ intentId: id, userId: 'other', db })).rejects.toMatchObject({
      code: 'SUPPORT_INTENT_NOT_FOUND',
    });
    expect(db.query.mock.calls[0][1]).toEqual([id, 'other']);
    expect(db.query.mock.calls[0][0]).toContain('i.user_id = ?');
  });
  it.each([
    ['credited', 'credited'],
    ['pending', 'processing'],
    ['manual_review', 'review'],
    ['reversal_review', 'review'],
  ])('maps %s without reissuing benefits', async (grantStatus, status) => {
    const db = {
      query: vi.fn(async () => [
        [
          {
            id,
            grant_status: grantStatus,
            quoted_amount: '9.90',
            quoted_ai_tokens: 100000,
            quoted_storage_mb: 256,
            granted_ai_tokens: 80000,
            granted_storage_mb: 256,
          },
        ],
        [],
      ]),
    };
    const result = await getCheckoutStatus({ intentId: id, userId: 'owner', db });
    expect(result.status).toBe(status);
    expect(db.query).toHaveBeenCalledOnce();
    expect(Object.keys(result)).not.toContain('token_hash');
    if (status === 'credited') expect(result.benefit.aiTokens).toBe(80000);
  });
});

describe('opening a concrete version', () => {
  function database(row = campaign, skus = [{ amount: 18, ai_tokens: 1000, storage_mb: 10 }]) {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) =>
        sql.startsWith('SELECT id, status') ? [[row], []] : sql.startsWith('SELECT amount') ? [skus, []] : [[], []],
      ),
    };
    return { connection, db: { getConnection: async () => connection } };
  }
  it('allows early manual opening and switches the old version in one transaction', async () => {
    const { connection, db } = database();
    await setCampaignVisibility({
      campaignId: id,
      enabled: true,
      actorUserId: 'root',
      db,
      env,
      now: new Date('2026-09-01'),
    });
    const calls = connection.query.mock.calls;
    expect(calls[0][0]).toContain('support_campaign_visibility_lock');
    expect(calls.filter(([sql]) => sql.startsWith('UPDATE')).map(([, args]) => args)).toEqual([
      ['root', id],
      [1, 'root', id],
    ]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });
  it('rolls back on current cost failure before changing the publicly visible version', async () => {
    const { connection, db } = database(campaign, [{ amount: 1, ai_tokens: 1000000000, storage_mb: 0 }]);
    await expect(
      setCampaignVisibility({ campaignId: id, enabled: true, actorUserId: 'root', db, env, now }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_COST_BLOCKED' });
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
  it('rejects an ended version before altering visibility', async () => {
    const { connection, db } = database();
    await expect(
      setCampaignVisibility({
        campaignId: id,
        enabled: true,
        actorUserId: 'root',
        db,
        env,
        now: new Date('2026-10-10'),
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_CAMPAIGN_OPEN_BLOCKED' });
    expect(connection.commit).not.toHaveBeenCalled();
  });
  it('shows an early-opened version but keeps checkout unavailable until its start', async () => {
    const db = { query: vi.fn(async (sql) => (sql.includes('FROM support_campaigns') ? [[campaign], []] : [[], []])) };
    const result = await getCampaignPresentation({ db, env, now: new Date('2026-09-01'), campaignKey: 'autumn' });
    expect(result).toMatchObject({ lifecycle: 'upcoming', checkoutEnabled: false });
  });
  it('keeps a credited original order credited after the campaign/intent expiry', async () => {
    const db = {
      query: vi.fn(async () => [
        [
          {
            id,
            grant_status: 'credited',
            intent_status: 'expired',
            expires_at: '2026-09-01',
            quoted_amount: 18,
            granted_ai_tokens: 1000,
            granted_storage_mb: 10,
          },
        ],
        [],
      ]),
    };
    expect(await getCheckoutStatus({ intentId: id, userId: 'owner', db, now })).toMatchObject({
      status: 'credited',
      benefit: { aiTokens: 1000, storageMb: 10 },
    });
  });
});
