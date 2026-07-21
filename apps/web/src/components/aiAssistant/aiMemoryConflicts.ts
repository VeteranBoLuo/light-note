import type { AiMemory } from '@/api/aiWorkspaceApi';

const REVIEWABLE_STATUSES = new Set<AiMemory['status']>(['candidate', 'active', 'paused']);

function canonicalContent(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

function stableScope(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

/**
 * 这里只找“需要一起复核”的同范围同类型记忆，不把文本差异直接宣称为语义冲突。
 * 真正的取舍始终留给用户，避免用不可靠的关键词规则自动停用或覆盖记忆。
 */
export function memoryReviewPeers(memory: AiMemory, memories: AiMemory[], limit = 3): AiMemory[] {
  const scope = stableScope(memory.scope);
  const content = canonicalContent(memory.content);
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit) || 3));
  return memories
    .filter(
      (candidate) =>
        candidate.id !== memory.id &&
        REVIEWABLE_STATUSES.has(candidate.status) &&
        candidate.memoryType === memory.memoryType &&
        candidate.scopeType === memory.scopeType &&
        stableScope(candidate.scope) === scope &&
        canonicalContent(candidate.content) !== content,
    )
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, safeLimit);
}
