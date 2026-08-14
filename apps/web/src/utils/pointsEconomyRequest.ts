const STORAGE_PREFIX = 'ln:points-economy-request:';
const memoryPending = new Map<string, PendingOperation>();

export type PointsEconomyOperation = 'shop_buy' | 'lottery_free' | 'lottery_paid';

interface PendingOperation {
  requestId: string;
  payloadKey: string;
  createdAt: number;
}

function safeSessionStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function randomRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function serializePayload(payload: Record<string, unknown>) {
  return JSON.stringify(canonicalize(payload));
}

function semanticPayload(operation: PointsEconomyOperation, payload: Record<string, unknown>) {
  if (operation === 'shop_buy') return { itemId: payload.itemId };
  return { mode: payload.mode, times: payload.times };
}

function storageKey(userId: string, operation: PointsEconomyOperation, payload: Record<string, unknown>) {
  // key 只使用跨版本不变的业务语义；收据负载仍完整保存旧版本与旧价格，目录切换后才能先重放未知结果。
  const semanticKey = serializePayload(semanticPayload(operation, payload));
  return `${STORAGE_PREFIX}${userId || 'visitor'}:${operation}:${encodeURIComponent(semanticKey)}`;
}

function resultFromPending<T extends Record<string, unknown>>(pending: PendingOperation) {
  try {
    return {
      clientRequestId: pending.requestId,
      payload: JSON.parse(pending.payloadKey) as T,
    };
  } catch {
    return null;
  }
}

export function getOrCreatePointsEconomyRequest<T extends Record<string, unknown>>(
  userId: string,
  operation: PointsEconomyOperation,
  payload: T,
) {
  const payloadKey = serializePayload(payload);
  const storage = safeSessionStorage();
  const key = storageKey(userId, operation, payload);
  const memoryStored = memoryPending.get(key);
  if (memoryStored?.requestId) {
    const result = resultFromPending<T>(memoryStored);
    if (result) return result;
    memoryPending.delete(key);
  }
  if (storage) {
    try {
      const stored = JSON.parse(storage.getItem(key) || 'null') as PendingOperation | null;
      if (stored?.requestId) {
        const result = resultFromPending<T>(stored);
        if (result) {
          memoryPending.set(key, stored);
          return result;
        }
      }
      storage.removeItem(key);
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        // 隐私模式可能同时禁止读写；内存副本仍可保证当前页面内的重试复用。
      }
    }
  }
  const pending: PendingOperation = { requestId: randomRequestId(), payloadKey, createdAt: Date.now() };
  memoryPending.set(key, pending);
  try {
    storage?.setItem(key, JSON.stringify(pending));
  } catch {
    // 当前页面继续使用 memoryPending；刷新后无法恢复属于浏览器存储策略限制。
  }
  return { clientRequestId: pending.requestId, payload };
}

export function completePointsEconomyRequest(
  userId: string,
  operation: PointsEconomyOperation,
  payload: Record<string, unknown>,
) {
  const key = storageKey(userId, operation, payload);
  memoryPending.delete(key);
  try {
    safeSessionStorage()?.removeItem(key);
  } catch {
    // 已删除内存副本；存储被浏览器禁用时无需再抛出，避免覆盖真实业务结果。
  }
}

export function isAmbiguousPointsEconomyFailure(error: unknown) {
  const source = error as { code?: string; response?: { data?: { code?: string } } };
  const code = String(source?.code || source?.response?.data?.code || '');
  return [
    'REQUEST_TIMEOUT',
    'NETWORK_ERROR',
    'OFFLINE',
    'ECONNRESET',
    'ERR_NETWORK',
    'ECONNABORTED',
    'ETIMEDOUT',
    'IDEMPOTENCY_RESULT_PENDING',
  ].includes(code);
}
