import type { AiChangeSet, AiMemory, AiRetentionMode } from '@/api/aiWorkspaceApi';

export interface AiConversationRetentionPatch {
  retentionMode: AiRetentionMode;
  expireAt: string | null;
}

const AI_TEMPORARY_RETENTION_DAYS = new Set([1, 7, 30]);

export function resolveAiChangeSetListTarget(
  items: readonly Pick<AiChangeSet, 'id'>[],
  initialId?: string,
  activeId?: string,
) {
  const ids = new Set(items.map((item) => item.id));
  if (initialId && ids.has(initialId)) return initialId;
  if (activeId && ids.has(activeId)) return activeId;
  return items[0]?.id || '';
}

export function parseMoveFileFolderId(value: unknown): number | null | undefined {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (!/^[1-9]\d*$/.test(normalized)) return undefined;
  const result = Number(normalized);
  return Number.isSafeInteger(result) ? result : undefined;
}

export function telemetryMemoryType(
  type: AiMemory['memoryType'],
): 'preference' | 'stable_fact' | 'project' | 'temporary_state' | 'unknown' {
  if (type === 'preference' || type === 'temporary_state') return type;
  if (type === 'fact') return 'stable_fact';
  if (type === 'topic' || type === 'workflow') return 'project';
  return 'unknown';
}

/**
 * 会话中心只提供经过产品说明的 1/7/30 天临时保留档位。
 * 非临时模式必须显式清空 expireAt，避免旧到期时间在服务端残留。
 */
export function buildAiConversationRetentionPatch(
  retentionMode: AiRetentionMode,
  temporaryDays: number,
  now = Date.now(),
): AiConversationRetentionPatch {
  if (retentionMode !== 'temporary') return { retentionMode, expireAt: null };
  const days = Math.trunc(Number(temporaryDays));
  if (!AI_TEMPORARY_RETENTION_DAYS.has(days)) throw new Error('AI_RETENTION_DAYS_INVALID');
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) throw new Error('AI_RETENTION_NOW_INVALID');
  return {
    retentionMode,
    expireAt: new Date(timestamp + days * 86_400_000).toISOString(),
  };
}

export function closestAiTemporaryRetentionDays(expireAt: string | null, now = Date.now()) {
  const timestamp = new Date(String(expireAt || '')).getTime();
  const remainingDays = Number.isFinite(timestamp) ? Math.max(1, Math.ceil((timestamp - now) / 86_400_000)) : 1;
  return [1, 7, 30].reduce((closest, candidate) =>
    Math.abs(candidate - remainingDays) < Math.abs(closest - remainingDays) ? candidate : closest,
  );
}

export function shouldUseAiCloudHistory(userId: unknown, role: unknown, preference: unknown) {
  return Boolean(String(userId || '').trim() && role !== 'visitor' && preference !== false);
}
