const AFDIAN_ORDER_HOSTS = new Set(['ifdian.net', 'www.ifdian.net']);
const AFDIAN_ORDER_PATH = '/order/create';
const AFDIAN_ID_PATTERN = /^[0-9a-f]{32}$/i;
const AFDIAN_PRODUCT_QUERY_KEYS = ['product_type', 'plan_id', 'sku', 'custom_order_id'];

export function normalizeAfdianPackageCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !AFDIAN_ORDER_HOSTS.has(url.hostname) ||
      url.pathname !== AFDIAN_ORDER_PATH
    )
      return '';

    const params = url.searchParams;
    if (
      Array.from(params).length !== AFDIAN_PRODUCT_QUERY_KEYS.length ||
      AFDIAN_PRODUCT_QUERY_KEYS.some((key) => params.getAll(key).length !== 1)
    )
      return '';

    const planId = params.get('plan_id') || '';
    const token = params.get('custom_order_id') || '';
    const raw = params.get('sku') || '';
    if (
      params.get('product_type') !== '1' ||
      !AFDIAN_ID_PATTERN.test(planId) ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(token) ||
      raw.length > 128
    )
      return '';

    const lines = JSON.parse(raw);
    const item = Array.isArray(lines) && lines.length === 1 ? lines[0] : null;
    if (item?.count !== 1 || typeof item.sku_id !== 'string' || !AFDIAN_ID_PATTERN.test(item.sku_id)) return '';

    params.set('plan_id', planId.toLowerCase());
    params.set('sku', JSON.stringify([{ sku_id: item.sku_id.toLowerCase(), count: 1 }]));
    return url.toString();
  } catch {
    return '';
  }
}

type ExternalWindowOpener = (url: string, target: string, features: string) => unknown;

function openNewPage(url: string, openWindow?: ExternalWindowOpener): boolean {
  const opener =
    openWindow ||
    (typeof window !== 'undefined'
      ? (targetUrl: string, target: string, features: string) => window.open(targetUrl, target, features)
      : null);
  if (!opener) return false;
  opener(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** Android WebView 拦截同一个 _blank 请求并交给应用内浏览页。 */
export function openAfdianPackageCheckout(value: unknown, openWindow?: ExternalWindowOpener): boolean {
  const url = normalizeAfdianPackageCheckoutUrl(value);
  return Boolean(url) && openNewPage(url, openWindow);
}

export function openAfdianOAuthPage(openWindow?: ExternalWindowOpener): boolean {
  return openNewPage('/api/support/afdian/oauth/start', openWindow);
}
