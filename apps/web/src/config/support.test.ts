import { describe, expect, it, vi } from 'vitest';
import { normalizeAfdianPackageCheckoutUrl, openAfdianPackageCheckout } from './support';

const PLAN = 'a'.repeat(32);
const SKU = 'b'.repeat(32);
const TOKEN = 'c'.repeat(43);
const LINE = { sku_id: SKU, count: 1 };
const BASE = 'https://ifdian.net/order/create';

function checkout(overrides: Record<string, string> = {}) {
  return (
    BASE +
    '?' +
    new URLSearchParams({
      product_type: '1',
      plan_id: PLAN,
      sku: JSON.stringify([LINE]),
      custom_order_id: TOKEN,
      ...overrides,
    })
  );
}

describe('爱发电固定商品入口', () => {
  it('在官方地址打开绑定了归属凭证的单件商品', () => {
    const opener = vi.fn();
    const url = checkout();
    expect(normalizeAfdianPackageCheckoutUrl(url)).toBe(url);
    expect(openAfdianPackageCheckout(url, opener)).toBe(true);
    expect(opener).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
  });

  it.each([
    'https://afdian.com/a/lightnote',
    BASE + '?user_id=' + PLAN + '&custom_price=50&custom_order_id=' + TOKEN,
    checkout({ product_type: '0' }),
    checkout({ custom_order_id: '' }),
    checkout({ sku: JSON.stringify([{ ...LINE, count: 2 }]) }),
    checkout({ sku: JSON.stringify([LINE, LINE]) }),
    checkout({ sku: JSON.stringify([{ ...LINE, sku_id: 'invalid' }]) }),
    checkout({ custom_price: '50' }),
    checkout() + '&plan_id=' + PLAN,
    checkout().replace('ifdian.net', 'ifdian.net.example.com'),
    checkout().replace('https:', 'http:'),
  ])('拒绝不符合固定单件结算的地址 %#', (url) => {
    const opener = vi.fn();
    expect(openAfdianPackageCheckout(url, opener)).toBe(false);
    expect(opener).not.toHaveBeenCalled();
  });
});
