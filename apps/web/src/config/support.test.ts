import { describe, expect, it, vi } from 'vitest';
import { AFDIAN_SUPPORT_OPTIONS, normalizeAfdianSupportUrl, openAfdianSupportPage } from './support';

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

  it('固化轻笺的三个金额档与自选金额入口', () => {
    expect(AFDIAN_SUPPORT_OPTIONS.map(({ key, amount, configured }) => ({ key, amount, configured }))).toEqual([
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
});
