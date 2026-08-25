import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAfdianAuthorizationUrl,
  buildAfdianWebhookSignText,
  exchangeAfdianAuthorizationCode,
  isAfdianDashboardWebhookTestPayload,
  normalizeAfdianOrder,
  queryAfdianPublicProfile,
  queryAfdianOrders,
  verifyAfdianWebhookSignature,
} from './afdianClient.js';

beforeEach(() => {
  vi.stubEnv('AFDIAN_OAUTH_CLIENT_ID', 'test-client');
  vi.stubEnv('AFDIAN_OAUTH_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('AFDIAN_OAUTH_REDIRECT_URI', 'https://example.com/api/support/afdian/oauth/callback');
  vi.stubEnv('AFDIAN_CREATOR_USER_ID', 'creator-user');
  vi.stubEnv('AFDIAN_API_TOKEN', 'test-api-token');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('爱发电客户端协议', () => {
  it('OAuth 授权地址包含 state 与回调，但永不包含 secret', () => {
    const url = new URL(buildAfdianAuthorizationUrl('A'.repeat(43)));
    expect(url.origin + url.pathname).toBe('https://afdian.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('state')).toBe('A'.repeat(43));
    expect(url.toString()).not.toContain('test-secret');
  });

  it('接受爱发电实际长度的 OAuth 授权码，并只采用官方 basic 返回的身份 ID', async () => {
    const authorizationCode = 'A'.repeat(864);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ec: 200,
        data: {
          user_id: 'provider-user',
          name: '不应从 OAuth 响应读取',
          avatar: 'https://pic.example.com/ignored.png',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeAfdianAuthorizationCode(authorizationCode)).resolves.toEqual({
      providerUserId: 'provider-user',
      providerPrivateId: null,
    });
    const [url, options] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(String(options.body));
    expect(url).toBe('https://afdian.com/api/oauth2/access_token');
    expect(body.get('code')).toBe(authorizationCode);
    expect(body.get('redirect_uri')).toBe('https://example.com/api/support/afdian/oauth/callback');
  });

  it('从公开用户资料补全昵称和 HTTPS 头像，并校验响应身份', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ec: 200,
        data: {
          user: {
            user_id: 'provider-user',
            name: '  菠萝\u0000  ',
            avatar: 'https://pic.example.com/avatar.png',
          },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(queryAfdianPublicProfile('provider-user')).resolves.toEqual({
      providerName: '菠萝',
      providerAvatarUrl: 'https://pic.example.com/avatar.png',
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://afdian.com/api/user/get-profile?user_id=provider-user');
  });

  it('公开资料响应身份不匹配时拒绝写入其他账号资料', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ec: 200,
          data: { user: { user_id: 'another-user', name: '错误账号' } },
        }),
      })),
    );

    await expect(queryAfdianPublicProfile('provider-user')).rejects.toMatchObject({
      code: 'AFDIAN_RESPONSE_INVALID',
    });
  });

  it('仍拒绝异常膨胀的 OAuth 授权码', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeAfdianAuthorizationCode('A'.repeat(4097))).rejects.toMatchObject({
      code: 'AFDIAN_OAUTH_CODE_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Webhook 官方签名文本不覆盖 custom_order_id，不能据此直接认领用户', () => {
    const order = {
      out_trade_no: 'order-12345678',
      user_id: 'provider-user',
      plan_id: 'plan-id',
      total_amount: '6.00',
      custom_order_id: 'token-a',
    };
    expect(buildAfdianWebhookSignText(order)).toBe('order-12345678provider-userplan-id6.00');
    expect(buildAfdianWebhookSignText({ ...order, custom_order_id: 'token-b' })).toBe(
      buildAfdianWebhookSignText(order),
    );
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const sign = crypto
      .sign('RSA-SHA256', Buffer.from(buildAfdianWebhookSignText(order)), privateKey)
      .toString('base64');
    const payload = { data: { type: 'order', order }, sign };

    expect(verifyAfdianWebhookSignature(payload, { publicKey })).toBe(true);
    expect(
      verifyAfdianWebhookSignature(
        { ...payload, data: { ...payload.data, order: { ...order, custom_order_id: 'token-b' } } },
        { publicKey },
      ),
    ).toBe(true);
    expect(
      verifyAfdianWebhookSignature(
        { ...payload, data: { ...payload.data, order: { ...order, total_amount: '60.00' } } },
        { publicKey },
      ),
    ).toBe(false);
  });

  it('只确认开发者后台固定无签名测试夹具，任何变体仍必须验签', () => {
    const payload = {
      data: {
        type: 'order',
        order: {
          out_trade_no: '202106232138371083454010626',
          user_id: 'adf397fe8374811eaacee52540025c377',
          plan_id: 'a45353328af911eb973052540025c377',
          total_amount: '5.00',
          show_amount: '5.00',
          status: 2,
        },
      },
    };

    expect(isAfdianDashboardWebhookTestPayload(payload)).toBe(true);
    expect(
      isAfdianDashboardWebhookTestPayload({
        ...payload,
        data: { ...payload.data, order: { ...payload.data.order, out_trade_no: 'real-order-123' } },
      }),
    ).toBe(false);
    expect(isAfdianDashboardWebhookTestPayload({ ...payload, sign: 'unexpected-signature' })).toBe(false);
  });

  it('查询 API 只发送签名，不发送 API Token', async () => {
    const fetchMock = vi.fn(async (_url, options) => ({
      ok: true,
      json: async () => ({ ec: 200, data: { list: [], total_page: 1 } }),
      options,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await queryAfdianOrders({ page: 1, per_page: 100 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://afdian.com/api/open/query-order');
    const body = JSON.parse(String(options.body));
    const expected = crypto
      .createHash('md5')
      .update(`test-api-tokenparams${body.params}ts${body.ts}user_idcreator-user`)
      .digest('hex');
    expect(body.sign).toBe(expected);
    expect(String(options.body)).not.toContain('test-api-token');
  });

  it('归一化订单时保留可信的服务商创建时间，并拒绝异常时间', () => {
    const baseOrder = {
      out_trade_no: 'order-12345678',
      user_id: 'provider-user',
      total_amount: '6.00',
      status: 2,
    };

    expect(normalizeAfdianOrder({ ...baseOrder, create_time: 1_787_640_000 })).toMatchObject({
      providerOrderNo: 'order-12345678',
      providerCreatedAt: 1_787_640_000,
    });
    expect(normalizeAfdianOrder({ ...baseOrder, create_time: 1_787_640_000_000 })).toMatchObject({
      providerCreatedAt: 1_787_640_000,
    });
    expect(() => normalizeAfdianOrder({ ...baseOrder, create_time: '1970-01-01' })).toThrow('订单创建时间不合法');
  });
});
