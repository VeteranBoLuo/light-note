import { describe, expect, it, vi } from 'vitest';
import {
  AFDIAN_SUPPORT_OPTIONS,
  normalizeAfdianSupportUrl,
  openAfdianOAuthPage,
  openAfdianSupportPage,
  openTrackedAfdianCheckout,
  openTrackedEntitlementCheckout,
  openTrackedSupportPackageCheckout,
} from './support';

const PLAN_ID = '4415b194930c11f1ac7b5254001e7c00';
const CREATOR_ID = '9a64b3ac930611f18e8052540025c377';

describe('爱发电赞助地址', () => {
  it('接受爱发电官方创作者页及其子路径', () => {
    expect(normalizeAfdianSupportUrl('https://afdian.com/a/lightnote')).toBe('https://afdian.com/a/lightnote');
    expect(normalizeAfdianSupportUrl(' https://www.afdian.com/a/lightnote/plan?from=light-note ')).toBe(
      'https://www.afdian.com/a/lightnote/plan?from=light-note',
    );
  });

  it('接受官方方案与自选金额订单，并丢弃空留言和推广参数', () => {
    expect(
      normalizeAfdianSupportUrl(
        `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&remark=&affiliate_code=&fr=afcom`,
      ),
    ).toBe(`https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0`);
    expect(normalizeAfdianSupportUrl(`https://ifdian.net/order/create?user_id=${CREATOR_ID}&remark=&fr=afcom`)).toBe(
      `https://ifdian.net/order/create?user_id=${CREATOR_ID}`,
    );
  });

  it('只保留格式严格的轻笺下单归属凭证', () => {
    const token = 'A'.repeat(43);
    expect(
      normalizeAfdianSupportUrl(
        `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&custom_order_id=${token}`,
      ),
    ).toBe(`https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&custom_order_id=${token}`);
    expect(
      normalizeAfdianSupportUrl(
        `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&custom_order_id=user%40example.com`,
      ),
    ).toBe('');
  });

  it('套餐订单必须同时携带精确自选金额与一次性归属凭证', () => {
    const token = 'B'.repeat(43);
    expect(
      normalizeAfdianSupportUrl(
        `https://ifdian.net/order/create?user_id=${CREATOR_ID}&custom_price=6&custom_order_id=${token}`,
      ),
    ).toBe(`https://ifdian.net/order/create?user_id=${CREATOR_ID}&custom_price=6.00&custom_order_id=${token}`);
    for (const url of [
      `https://ifdian.net/order/create?user_id=${CREATOR_ID}&custom_price=6`,
      `https://ifdian.net/order/create?user_id=${CREATOR_ID}&custom_price=0&custom_order_id=${token}`,
      `https://ifdian.net/order/create?user_id=${CREATOR_ID}&custom_price=6.001&custom_order_id=${token}`,
      `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&custom_price=6&custom_order_id=${token}`,
    ]) {
      expect(normalizeAfdianSupportUrl(url)).toBe('');
    }
  });

  it('固化轻笺的三个金额档与自选金额入口', () => {
    expect(
      AFDIAN_SUPPORT_OPTIONS.map(({ key, amount, configured }) => ({
        key,
        amount,
        configured,
      })),
    ).toEqual([
      { key: 'coffee', amount: 6, configured: true },
      { key: 'server', amount: 18, configured: true },
      { key: 'companion', amount: 50, configured: true },
      { key: 'custom', amount: null, configured: true },
    ]);
  });

  it('拒绝明文、伪造域名、账号口令、错误订单类型和未知参数', () => {
    [
      'http://afdian.com/a/lightnote',
      'https://afdian.com.evil.example/a/lightnote',
      'https://user:password@afdian.com/a/lightnote',
      'https://afdian.com/',
      'https://afdian.com/explore',
      `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=1`,
      `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&redirect=https://evil.example`,
      `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&user_id=${CREATOR_ID}`,
      `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&user_id=`,
      `https://ifdian.net/order/create?plan_id=&user_id=${CREATOR_ID}`,
      `https://ifdian.net/order/create?user_id=${CREATOR_ID}&product_type=`,
      `https://ifdian.net/order/create?user_id=${CREATOR_ID}#payment`,
      'javascript:alert(1)',
      '',
      undefined,
    ].forEach((value) => expect(normalizeAfdianSupportUrl(value)).toBe(''));
  });

  it('只把校验与规范化后的地址交给安全新窗口', () => {
    const opener = vi.fn();
    expect(
      openAfdianSupportPage(
        `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0&remark=&fr=afcom`,
        opener,
      ),
    ).toBe(true);
    expect(opener).toHaveBeenCalledWith(
      `https://ifdian.net/order/create?plan_id=${PLAN_ID}&product_type=0`,
      '_blank',
      'noopener,noreferrer',
    );

    opener.mockClear();
    expect(openAfdianSupportPage('https://evil.example/a/lightnote', opener)).toBe(false);
    expect(opener).not.toHaveBeenCalled();
  });

  it('跟踪下单与 OAuth 只打开轻笺内固定跳转端点', () => {
    const opener = vi.fn();
    expect(openTrackedAfdianCheckout('coffee', opener)).toBe(true);
    expect(openAfdianOAuthPage(opener)).toBe(true);
    expect(opener).toHaveBeenNthCalledWith(
      1,
      '/api/support/donation/checkout?option=coffee',
      '_blank',
      'noopener,noreferrer',
    );
    expect(opener).toHaveBeenNthCalledWith(2, '/api/support/afdian/oauth/start', '_blank', 'noopener,noreferrer');
  });

  it('套餐结算只接受受控 SKU 与版本并打开同源端点', () => {
    const opener = vi.fn();
    expect(openTrackedSupportPackageCheckout('combo-10', 'support-packages-v2', opener)).toBe(true);
    expect(
      openTrackedSupportPackageCheckout(
        '22222222-2222-4222-8222-222222222222',
        'campaign:11111111-1111-4111-8111-111111111111:v2',
        opener,
      ),
    ).toBe(true);
    expect(opener).toHaveBeenNthCalledWith(
      1,
      '/api/support/checkout?skuId=combo-10&catalogVersion=support-packages-v2',
      '_blank',
      'noopener,noreferrer',
    );
    expect(openTrackedSupportPackageCheckout('../combo', 'support-packages-v2', opener)).toBe(false);
    expect(openTrackedSupportPackageCheckout('combo-10', 'https://evil.example', opener)).toBe(false);

    opener.mockClear();
    expect(openTrackedEntitlementCheckout('ai-6', 'support-packages-v2', opener)).toBe(true);
    expect(opener).toHaveBeenCalledWith(
      '/api/support/checkout?skuId=ai-6&catalogVersion=support-packages-v2',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
