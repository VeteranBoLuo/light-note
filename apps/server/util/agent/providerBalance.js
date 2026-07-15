const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';
const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

let balanceCache = null;
let balanceCacheExpiresAt = 0;

function normalizeAmount(value) {
  const amount = String(value ?? '0').trim();
  return /^-?\d+(?:\.\d+)?$/.test(amount) ? amount : '0';
}

export function normalizeDeepSeekBalance(payload, fetchedAt = new Date()) {
  const balanceInfos = Array.isArray(payload?.balance_infos)
    ? payload.balance_infos.map((item) => ({
        currency: String(item?.currency || '').toUpperCase(),
        totalBalance: normalizeAmount(item?.total_balance),
        grantedBalance: normalizeAmount(item?.granted_balance),
        toppedUpBalance: normalizeAmount(item?.topped_up_balance),
      }))
    : [];
  const preferred = balanceInfos.find((item) => item.currency === 'CNY') || balanceInfos[0] || null;

  return {
    provider: 'deepseek',
    isAvailable: Boolean(payload?.is_available),
    currency: preferred?.currency || '',
    totalBalance: preferred?.totalBalance || '0',
    grantedBalance: preferred?.grantedBalance || '0',
    toppedUpBalance: preferred?.toppedUpBalance || '0',
    balanceInfos,
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function getDeepSeekBalance({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && balanceCache && balanceCacheExpiresAt > now) return balanceCache;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error('未配置 DEEPSEEK_API_KEY');
    error.code = 'DEEPSEEK_BALANCE_NOT_CONFIGURED';
    throw error;
  }

  try {
    const response = await fetch(DEEPSEEK_BALANCE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `DeepSeek 余额查询失败：${response.status}`);
      error.code = 'DEEPSEEK_BALANCE_UPSTREAM_ERROR';
      throw error;
    }
    balanceCache = normalizeDeepSeekBalance(payload);
    balanceCacheExpiresAt = now + CACHE_TTL_MS;
    return balanceCache;
  } catch (error) {
    // 上游短暂异常时返回最近一次成功值，监控页仍可用，并明确标记为缓存数据。
    if (balanceCache) return { ...balanceCache, stale: true };
    throw error;
  }
}

export function resetDeepSeekBalanceCacheForTest() {
  balanceCache = null;
  balanceCacheExpiresAt = 0;
}
