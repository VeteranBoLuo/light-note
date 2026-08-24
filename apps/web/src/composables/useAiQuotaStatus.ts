import { computed, onMounted, ref, watch } from 'vue';
import { apiBasePost } from '@/http/request';
import { useUserStore } from '@/store';

export interface AiQuotaStatus {
  exempt?: boolean;
  unavailable?: boolean;
  type?: string;
  used?: number;
  quota?: number;
  remaining?: number;
  dailyQuota?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  bonusTokens?: number;
  enforcing?: boolean;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { status: AiQuotaStatus; cachedAt: number }>();
const pending = new Map<string, Promise<AiQuotaStatus>>();

function normalizeQuotaNumber(value: unknown) {
  if (value === null || value === '' || typeof value === 'boolean') throw new Error('AI_QUOTA_INVALID_RESPONSE');
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('AI_QUOTA_INVALID_RESPONSE');
  return Math.max(0, amount);
}

function normalizeQuotaStatus(payload: unknown): AiQuotaStatus {
  const status = payload as AiQuotaStatus | null;
  if (!status || status.unavailable) throw new Error('AI_QUOTA_UNAVAILABLE');
  if (status.exempt) return status;
  return {
    ...status,
    used: normalizeQuotaNumber(status.used),
    quota: normalizeQuotaNumber(status.quota),
    remaining: normalizeQuotaNumber(status.remaining),
  };
}

async function requestAiQuotaStatus(identityKey: string, force = false) {
  const cached = cache.get(identityKey);
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.status;
  const inflight = pending.get(identityKey);
  if (inflight) return inflight;

  const request = apiBasePost('/api/chat/aiQuota', {}, { silent: true })
    .then((response) => {
      if (Number(response?.status) !== 200) throw new Error('AI_QUOTA_REQUEST_FAILED');
      const status = normalizeQuotaStatus(response?.data);
      cache.set(identityKey, { status, cachedAt: Date.now() });
      return status;
    })
    .finally(() => {
      pending.delete(identityKey);
    });
  pending.set(identityKey, request);
  return request;
}

export function formatAiQuotaTokens(value: unknown, locale = 'zh-CN') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(locale, {
    notation: amount >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(Math.max(0, amount));
}

export function useAiQuotaStatus(options: { autoLoad?: boolean } = {}) {
  const user = useUserStore();
  const status = ref<AiQuotaStatus | null>(null);
  const loading = ref(false);
  const unavailable = ref(false);
  let hasRequested = false;
  const identityKey = computed(() =>
    [
      user.id || 'visitor',
      user.role || 'visitor',
      user.adminContext?.subjectUserId || '',
      user.adminContext?.mode || '',
    ].join('|'),
  );

  async function load({ force = false }: { force?: boolean } = {}) {
    hasRequested = true;
    const requestedIdentity = identityKey.value;
    loading.value = true;
    unavailable.value = false;
    try {
      const nextStatus = await requestAiQuotaStatus(requestedIdentity, force);
      if (identityKey.value === requestedIdentity) status.value = nextStatus;
      return nextStatus;
    } catch {
      if (identityKey.value === requestedIdentity) {
        status.value = null;
        unavailable.value = true;
      }
      return null;
    } finally {
      if (identityKey.value === requestedIdentity) loading.value = false;
    }
  }

  watch(identityKey, () => {
    const shouldReload = options.autoLoad !== false || hasRequested;
    status.value = null;
    unavailable.value = false;
    if (shouldReload) void load();
  });

  if (options.autoLoad !== false) onMounted(() => void load());

  const remainingPercent = computed(() => {
    const quota = Number(status.value?.quota || 0);
    const remaining = Number(status.value?.remaining || 0);
    if (!Number.isFinite(quota) || quota <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((remaining / quota) * 100)));
  });

  return { status, loading, unavailable, remainingPercent, load };
}

export function resetAiQuotaStatusCacheForTest() {
  cache.clear();
  pending.clear();
}

export const aiQuotaStatusInternals = Object.freeze({ CACHE_TTL_MS, normalizeQuotaStatus, requestAiQuotaStatus });
