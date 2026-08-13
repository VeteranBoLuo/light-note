import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAfdianCheckoutIntent,
  ingestAfdianWebhookOrder,
  resolveAfdianOwnership,
} from './afdianSupportService.js';

describe('爱发电订单归属合并', () => {
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
  });
});

afterEach(() => vi.unstubAllEnvs());
