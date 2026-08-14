import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyVerifiedAfdianOrder,
  createAfdianCheckoutIntent,
  ingestAfdianWebhookOrder,
  linkAfdianAccount,
  refreshAfdianAccountProfile,
  resolveAfdianOwnership,
  shouldRefreshAfdianProfile,
} from './afdianSupportService.js';

describe('爱发电订单归属合并', () => {
  it('缺失资料按十分钟退避，完整资料按一天刷新', () => {
    const now = Date.parse('2026-08-14T12:00:00.000Z');
    expect(
      shouldRefreshAfdianProfile({ provider_name: null, provider_avatar_url: null, identity_refreshed_at: null }, now),
    ).toBe(true);
    expect(
      shouldRefreshAfdianProfile(
        {
          provider_name: null,
          provider_avatar_url: null,
          identity_refreshed_at: '2026-08-14T11:55:00.000Z',
        },
        now,
      ),
    ).toBe(false);
    expect(
      shouldRefreshAfdianProfile(
        {
          provider_name: '菠萝',
          provider_avatar_url: 'https://pic.example.com/avatar.png',
          identity_refreshed_at: '2026-08-13T11:59:59.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('关联资料补全后写回昵称头像，失败时只记录重试时间', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await expect(
      refreshAfdianAccountProfile({
        userId: 'light-note-user-1',
        providerUserId: 'provider-user',
        db,
        loadProfile: vi.fn().mockResolvedValue({
          providerName: '菠萝',
          providerAvatarUrl: 'https://pic.example.com/avatar.png',
        }),
      }),
    ).resolves.toEqual({
      providerName: '菠萝',
      providerAvatarUrl: 'https://pic.example.com/avatar.png',
    });
    expect(db.query.mock.calls[0][0]).toContain('provider_name = ?');
    expect(db.query.mock.calls[0][1]).toEqual([
      '菠萝',
      'https://pic.example.com/avatar.png',
      'light-note-user-1',
      'provider-user',
    ]);

    db.query.mockClear();
    await expect(
      refreshAfdianAccountProfile({
        userId: 'light-note-user-1',
        providerUserId: 'provider-user',
        db,
        loadProfile: vi.fn().mockRejectedValue(Object.assign(new Error('upstream'), { code: 'AFDIAN_TEST' })),
      }),
    ).rejects.toMatchObject({ code: 'AFDIAN_TEST' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('identity_refreshed_at = NOW()');
  });

  it('重复关联同一账号时，资料接口失败不会清空已保存的昵称头像', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'link-1', provider_user_id: 'provider-user' }]])
        .mockResolvedValueOnce([[{ user_id: 'light-note-user-1' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }]),
    };
    await linkAfdianAccount({
      userId: 'light-note-user-1',
      providerUserId: 'provider-user',
      db: { getConnection: vi.fn().mockResolvedValue(connection) },
    });

    const [updateSql, updateParams] = connection.query.mock.calls[2];
    expect(updateSql).toContain('provider_name = COALESCE(?, provider_name)');
    expect(updateSql).toContain('provider_avatar_url = COALESCE(?, provider_avatar_url)');
    expect(updateSql).toContain('THEN identity_refreshed_at');
    expect(updateParams.slice(2, 6)).toEqual([null, null, null, null]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
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

  it('数据库只保存下单随机码摘要，Webhook 不使用未签名随机码归属用户', async () => {
    vi.stubEnv('AFDIAN_CREATOR_USER_ID', 'test-creator');
    vi.stubEnv('AFDIAN_API_TOKEN', 'test-token');
    const checkoutDb = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    const checkout = await createAfdianCheckoutIntent({
      userId: 'light-note-user-1',
      optionKey: 'coffee',
      db: checkoutDb,
    });
    const token = new URL(checkout.url).searchParams.get('custom_order_id');
    const checkoutParams = checkoutDb.query.mock.calls[0][1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(checkoutParams).not.toContain(token);
    expect(checkoutParams[1]).toMatch(/^[a-f0-9]{64}$/);

    const webhookDb = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await ingestAfdianWebhookOrder(
      {
        out_trade_no: 'order-12345678',
        user_id: 'provider-user',
        user_private_id: 'provider-private',
        custom_order_id: token,
        plan_id: 'plan-id',
        product_type: 0,
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
      },
      { db },
    );

    const upsertSql = String(connection.query.mock.calls[2][0]);
    expect(upsertSql).toContain('verified_at, ranking_observed_at');
    expect(upsertSql).not.toContain('ranking_observed_at =');
    expect(upsertSql).toContain('verified_at = COALESCE(verified_at, NOW())');
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => vi.unstubAllEnvs());
