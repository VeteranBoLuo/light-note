import type { AiEvidence, AiAgentRecoverySnapshot, AiAgentRecoveryTerminal } from '@/api/aiWorkspaceApi';
import type { AiSource } from '@/components/aiAssistant/aiSourceNavigation';
import { sanitizeAiMessageActivity } from '@/utils/aiMemoryInfluence';

export interface AiRecoveryMessageTarget {
  content: string;
  requestId?: string;
  sources?: AiSource[];
  evidence?: AiEvidence[];
  coverage?: Record<string, unknown> | null;
  citationAudit?: {
    citedKeys: string[];
    invalidKeys: string[];
    verifiedCitationCount: number;
    evidenceCount: number;
  };
  activity?: Array<Record<string, unknown> | string>;
  recovered?: boolean;
  stage?: string;
  terminal?: AiAgentRecoveryTerminal;
}

export interface AiStreamRecoveryDecision {
  attempted: boolean;
  requestCurrent: boolean;
  requestId: string;
  reliableTerminalReceived: boolean;
  cancelled: boolean;
}

export function shouldAttemptAiStreamRecovery(input: AiStreamRecoveryDecision) {
  return Boolean(
    !input.attempted &&
    input.requestCurrent &&
    !input.cancelled &&
    !input.reliableTerminalReceived &&
    String(input.requestId || '').trim(),
  );
}

function cloneRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({ ...item }));
}

function cloneEvidence(value: unknown): AiEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AiEvidence =>
        Boolean(item) &&
        typeof item === 'object' &&
        Boolean(String((item as AiEvidence).evidenceRef || '').trim()) &&
        Boolean(String((item as AiEvidence).sourceId || '').trim()),
    )
    .map((item) => ({ ...item, locator: item.locator ? { ...item.locator } : null }));
}

function normalizeCitationAudit(value: unknown): AiRecoveryMessageTarget['citationAudit'] {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const stringList = (items: unknown) =>
    Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const count = (item: unknown) => {
    const normalized = Number(item);
    return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : 0;
  };
  return {
    citedKeys: stringList(raw.citedKeys),
    invalidKeys: stringList(raw.invalidKeys),
    verifiedCitationCount: count(raw.verifiedCitationCount),
    evidenceCount: count(raw.evidenceCount),
  };
}

/**
 * 恢复结果是权威快照：所有可聚合字段都直接替换，绝不与已经收到的 delta/source/event 合并。
 * 这样即使断流前已经展示了部分内容，也不会重复追加答案或证据。
 */
export function applyAiRecoverySnapshot(target: AiRecoveryMessageTarget, snapshot: AiAgentRecoverySnapshot) {
  const status = snapshot?.status;
  const lastEventId = Number(snapshot?.lastEventId);
  const terminalEventId = Number(snapshot?.terminal?.eventId);
  if (
    (status !== 'completed' && status !== 'failed') ||
    snapshot?.terminal?.status !== status ||
    !Number.isSafeInteger(lastEventId) ||
    lastEventId <= 0 ||
    terminalEventId !== lastEventId
  ) {
    throw new Error('AI_RESPONSE_RECOVERY_SNAPSHOT_INVALID');
  }

  target.content = typeof snapshot.answer === 'string' ? snapshot.answer : '';
  target.requestId = String(snapshot.requestId || target.requestId || '').trim() || undefined;
  target.sources = cloneRecordArray(snapshot.sources) as unknown as AiSource[];
  const evidence = cloneEvidence(snapshot.evidence);
  target.evidence = evidence.length ? evidence : cloneEvidence(snapshot.citations);
  target.coverage = snapshot.coverage && typeof snapshot.coverage === 'object' ? { ...snapshot.coverage } : null;
  target.citationAudit = normalizeCitationAudit(snapshot.citationAudit);
  target.activity = sanitizeAiMessageActivity(snapshot.activity);
  target.recovered = true;
  target.stage = String(snapshot.stage || status);
  target.terminal = { ...snapshot.terminal };
  return status;
}
