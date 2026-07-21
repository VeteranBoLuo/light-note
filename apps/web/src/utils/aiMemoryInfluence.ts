export type AiMemoryInfluenceType = 'preference' | 'fact' | 'topic' | 'workflow' | 'temporary_state';
export type AiMemoryInfluenceScope = 'global' | 'conversation' | 'resource';
export type AiMemoryInfluenceReason =
  'temporary_session' | 'disabled' | 'translation' | 'visitor' | 'admin_context' | 'no_match' | 'unavailable';

export type AiMemoryInfluence =
  | {
      status: 'used';
      count: number;
      types: AiMemoryInfluenceType[];
      scopes: AiMemoryInfluenceScope[];
    }
  | {
      status: 'not_used';
      count: 0;
      types: [];
      scopes: [];
      reason: AiMemoryInfluenceReason;
    };

const MEMORY_TYPES = new Set<AiMemoryInfluenceType>(['preference', 'fact', 'topic', 'workflow', 'temporary_state']);
const MEMORY_SCOPES = new Set<AiMemoryInfluenceScope>(['global', 'conversation', 'resource']);
const MEMORY_REASONS = new Set<AiMemoryInfluenceReason>([
  'temporary_session',
  'disabled',
  'translation',
  'visitor',
  'admin_context',
  'no_match',
  'unavailable',
]);

function uniqueAllowed<T extends string>(value: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.has(item as T)))];
}

/**
 * 浏览器端再次执行白名单校验，云历史或恢复快照中的未知字段不会进入 UI。
 * 协议刻意不支持记忆 ID、正文、来源、时间或错误详情。
 */
export function normalizeAiMemoryInfluence(value: unknown): AiMemoryInfluence | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.status === 'used') {
    const count = Number(raw.count);
    if (!Number.isSafeInteger(count) || count < 1 || count > 20) return null;
    return {
      status: 'used',
      count,
      types: uniqueAllowed(raw.types, MEMORY_TYPES),
      scopes: uniqueAllowed(raw.scopes, MEMORY_SCOPES),
    };
  }
  if (raw.status !== 'not_used') return null;
  const reason =
    typeof raw.reason === 'string' && MEMORY_REASONS.has(raw.reason as AiMemoryInfluenceReason)
      ? (raw.reason as AiMemoryInfluenceReason)
      : 'unavailable';
  return { status: 'not_used', count: 0, types: [], scopes: [], reason };
}

export function extractAiMemoryInfluence(activity: unknown): AiMemoryInfluence | null {
  if (!Array.isArray(activity)) return null;
  for (let index = activity.length - 1; index >= 0; index -= 1) {
    const item = activity[index];
    if (
      !item ||
      typeof item !== 'object' ||
      String((item as Record<string, unknown>).event || '') !== 'memory_context'
    ) {
      continue;
    }
    return normalizeAiMemoryInfluence(item);
  }
  return null;
}

export function toAiMemoryInfluenceActivity(value: unknown): Record<string, unknown> | null {
  const normalized = normalizeAiMemoryInfluence(value);
  return normalized ? { event: 'memory_context', ...normalized } : null;
}

export function sanitizeAiMessageActivity(value: unknown): Array<Record<string, unknown> | string> {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 200)
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      if (String(record.event || '') !== 'memory_context') return { ...record };
      return toAiMemoryInfluenceActivity(record);
    })
    .filter((item): item is Record<string, unknown> | string => Boolean(item));
}
