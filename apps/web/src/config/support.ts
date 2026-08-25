import {
  AFDIAN_CHECKOUT_OPTIONS as SHARED_AFDIAN_CHECKOUT_OPTIONS,
  AFDIAN_CREATOR_URL,
  type AfdianCheckoutOptionKey,
} from '@lightnote/shared';

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
  // 轻笺后端签发的一次性归属凭证。只允许 URL 安全字符，且不写入日志。
  'custom_order_id',
]);

export type AfdianSupportOptionKey = AfdianCheckoutOptionKey;

export interface AfdianSupportOption {
  key: AfdianSupportOptionKey;
  amount: number | null;
  rewardTokens: number | null;
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

    const coreKeys = ['plan_id', 'product_type', 'user_id', 'custom_order_id'];
    if (coreKeys.some((key) => url.searchParams.getAll(key).length > 1)) return '';

    const planId = url.searchParams.get('plan_id') || '';
    const productType = url.searchParams.get('product_type') || '';
    const userId = url.searchParams.get('user_id') || '';
    const hasPlanId = url.searchParams.has('plan_id');
    const hasProductType = url.searchParams.has('product_type');
    const hasUserId = url.searchParams.has('user_id');
    const customOrderId = url.searchParams.get('custom_order_id') || '';
    const hasCustomOrderId = url.searchParams.has('custom_order_id');
    const normalizedUrl = new URL(`https://${hostname}${AFDIAN_ORDER_PATH}`);

    if (hasCustomOrderId && !/^[A-Za-z0-9_-]{32,128}$/.test(customOrderId)) return '';

    if (hasPlanId) {
      if (!AFDIAN_ID_PATTERN.test(planId) || !hasProductType || productType !== '0' || hasUserId) return '';
      normalizedUrl.searchParams.set('plan_id', planId.toLowerCase());
      normalizedUrl.searchParams.set('product_type', '0');
      if (hasCustomOrderId) normalizedUrl.searchParams.set('custom_order_id', customOrderId);
      return normalizedUrl.toString();
    }

    if (!hasUserId || !AFDIAN_ID_PATTERN.test(userId) || hasProductType) return '';
    normalizedUrl.searchParams.set('user_id', userId.toLowerCase());
    if (hasCustomOrderId) normalizedUrl.searchParams.set('custom_order_id', customOrderId);
    return normalizedUrl.toString();
  } catch {
    return '';
  }
}

function resolveCreatorUrl(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return normalizeAfdianSupportUrl(value);
  return normalizeAfdianSupportUrl(AFDIAN_CREATOR_URL);
}

function createSupportOption(
  key: AfdianSupportOptionKey,
  amount: number | null,
  rewardTokens: number | null,
  sourceUrl: string,
): AfdianSupportOption {
  const url = normalizeAfdianSupportUrl(sourceUrl);
  return Object.freeze({ key, amount, rewardTokens, url, configured: Boolean(url) });
}

export const AFDIAN_SUPPORT_URL = resolveCreatorUrl(import.meta.env.VITE_AFDIAN_SUPPORT_URL);
export const AFDIAN_SUPPORT_CONFIGURED = Boolean(AFDIAN_SUPPORT_URL);

export const AFDIAN_SUPPORT_OPTIONS: readonly AfdianSupportOption[] = Object.freeze([
  ...SHARED_AFDIAN_CHECKOUT_OPTIONS.map((option) => {
    const url = new URL('https://ifdian.net/order/create');
    if (option.planId) {
      url.searchParams.set('plan_id', option.planId);
      url.searchParams.set('product_type', '0');
    } else if (option.creatorId) {
      url.searchParams.set('user_id', option.creatorId);
    }
    return createSupportOption(option.key, option.amount, option.rewardTokens, url.toString());
  }),
]);

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

/**
 * 浏览器/PWA 会新开标签页；轻笺 Android WebView 会拦截这个 _blank 请求，
 * 交给应用内浏览页打开，因此网页与 APK 共用同一入口。
 */
export function openAfdianSupportPage(value: unknown = AFDIAN_SUPPORT_URL, openWindow?: ExternalWindowOpener): boolean {
  const url = normalizeAfdianSupportUrl(value);
  if (!url) return false;

  return openNewPage(url, openWindow);
}

/** 同步打开轻笺后端跳转端点，避免等待接口后再开窗被浏览器或 Android WebView 拦截。 */
export function openTrackedAfdianCheckout(
  optionKey: AfdianSupportOptionKey,
  openWindow?: ExternalWindowOpener,
): boolean {
  if (!SHARED_AFDIAN_CHECKOUT_OPTIONS.some((option) => option.key === optionKey)) return false;
  return openNewPage(`/api/support/checkout?option=${encodeURIComponent(optionKey)}`, openWindow);
}

export function openAfdianOAuthPage(openWindow?: ExternalWindowOpener): boolean {
  return openNewPage('/api/support/afdian/oauth/start', openWindow);
}
