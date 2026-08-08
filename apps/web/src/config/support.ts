const AFDIAN_CREATOR_HOSTS = new Set(['afdian.com', 'www.afdian.com']);
const AFDIAN_ORDER_HOSTS = new Set(['ifdian.net', 'www.ifdian.net']);
const AFDIAN_CREATOR_PATH = /^\/a\/[^/]+(?:\/.*)?$/;
const AFDIAN_ORDER_PATH = '/order/create';
const AFDIAN_ID_PATTERN = /^[0-9a-f]{32}$/i;
const AFDIAN_ORDER_QUERY_KEYS = new Set([
  'plan_id',
  'product_type',
  'user_id',
  // 爱发电“复制链接”会附带下列空值或来源参数；校验后会统一丢弃。
  'remark',
  'affiliate_code',
  'fr',
]);

const DEFAULT_AFDIAN_CREATOR_URL = 'https://afdian.com/a/lightnote';

export type AfdianSupportOptionKey = 'coffee' | 'server' | 'companion' | 'custom';

export interface AfdianSupportOption {
  key: AfdianSupportOptionKey;
  amount: number | null;
  url: string;
  configured: boolean;
}

/**
 * 只接受爱发电官方 HTTPS 创作者页，或结构严格受限的官方下单页。
 * 订单链接仅保留方案 ID / 创作者 ID 等核心字段，不向第三方续传空留言或推广参数。
 */
export function normalizeAfdianSupportUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== 'https:' || url.username || url.password) return '';

    if (AFDIAN_CREATOR_HOSTS.has(hostname)) {
      if (!AFDIAN_CREATOR_PATH.test(url.pathname)) return '';
      return url.toString();
    }

    if (!AFDIAN_ORDER_HOSTS.has(hostname) || url.pathname !== AFDIAN_ORDER_PATH || url.hash) return '';

    const queryKeys = Array.from(url.searchParams.keys());
    if (queryKeys.some((key) => !AFDIAN_ORDER_QUERY_KEYS.has(key))) return '';

    const coreKeys = ['plan_id', 'product_type', 'user_id'];
    if (coreKeys.some((key) => url.searchParams.getAll(key).length > 1)) return '';

    const planId = url.searchParams.get('plan_id') || '';
    const productType = url.searchParams.get('product_type') || '';
    const userId = url.searchParams.get('user_id') || '';
    const hasPlanId = url.searchParams.has('plan_id');
    const hasProductType = url.searchParams.has('product_type');
    const hasUserId = url.searchParams.has('user_id');
    const normalizedUrl = new URL(`https://${hostname}${AFDIAN_ORDER_PATH}`);

    if (hasPlanId) {
      if (!AFDIAN_ID_PATTERN.test(planId) || !hasProductType || productType !== '0' || hasUserId) return '';
      normalizedUrl.searchParams.set('plan_id', planId.toLowerCase());
      normalizedUrl.searchParams.set('product_type', '0');
      return normalizedUrl.toString();
    }

    if (!hasUserId || !AFDIAN_ID_PATTERN.test(userId) || hasProductType) return '';
    normalizedUrl.searchParams.set('user_id', userId.toLowerCase());
    return normalizedUrl.toString();
  } catch {
    return '';
  }
}

function resolveCreatorUrl(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return normalizeAfdianSupportUrl(value);
  return normalizeAfdianSupportUrl(DEFAULT_AFDIAN_CREATOR_URL);
}

function createSupportOption(
  key: AfdianSupportOptionKey,
  amount: number | null,
  sourceUrl: string,
): AfdianSupportOption {
  const url = normalizeAfdianSupportUrl(sourceUrl);
  return Object.freeze({ key, amount, url, configured: Boolean(url) });
}

export const AFDIAN_SUPPORT_URL = resolveCreatorUrl(import.meta.env.VITE_AFDIAN_SUPPORT_URL);
export const AFDIAN_SUPPORT_CONFIGURED = Boolean(AFDIAN_SUPPORT_URL);

export const AFDIAN_SUPPORT_OPTIONS: readonly AfdianSupportOption[] = Object.freeze([
  createSupportOption(
    'coffee',
    6,
    'https://ifdian.net/order/create?plan_id=4415b194930c11f1ac7b5254001e7c00&product_type=0',
  ),
  createSupportOption(
    'server',
    18,
    'https://ifdian.net/order/create?plan_id=a05f9730930c11f1aeb65254001e7c00&product_type=0',
  ),
  createSupportOption(
    'companion',
    50,
    'https://ifdian.net/order/create?plan_id=9fc7a358930c11f1abee52540025c377&product_type=0',
  ),
  createSupportOption('custom', null, 'https://ifdian.net/order/create?user_id=9a64b3ac930611f18e8052540025c377'),
]);

type ExternalWindowOpener = (url: string, target: string, features: string) => unknown;

/**
 * 浏览器/PWA 会新开标签页；轻笺 Android WebView 会拦截这个 _blank 请求，
 * 交给应用内浏览页打开，因此网页与 APK 共用同一入口。
 */
export function openAfdianSupportPage(value: unknown = AFDIAN_SUPPORT_URL, openWindow?: ExternalWindowOpener): boolean {
  const url = normalizeAfdianSupportUrl(value);
  if (!url) return false;

  const opener =
    openWindow ||
    (typeof window !== 'undefined'
      ? (targetUrl: string, target: string, features: string) => window.open(targetUrl, target, features)
      : null);
  if (!opener) return false;

  opener(url, '_blank', 'noopener,noreferrer');
  return true;
}
