import type { AiAgentInteraction, AiToolConfirmation } from '@/types/aiAgent';
import type { AiEvidence } from '@/api/aiWorkspaceApi';

export interface AiSseEvent {
  event?: string;
  eventId?: number;
  protocolVersion?: string;
  requestId?: string;
  error?: string;
  message?: string;
  /** 终态权威答案；用于替换流中可能含无效引用编号的原始增量。 */
  answer?: string;
  output?: { text?: string; session_id?: string };
  confirmation?: AiToolConfirmation;
  interaction?: AiAgentInteraction;
  sources?: any[];
  evidence?: AiEvidence[];
  coverage?: Record<string, unknown>;
  citationAudit?: {
    citedKeys: string[];
    invalidKeys: string[];
    verifiedCitationCount: number;
    evidenceCount: number;
  };
  stage?: string;
  previousStage?: string;
  usage?: Record<string, number>;
  finishReason?: string | null;
  elapsedMs?: number;
  phase?: string;
  followUpAvailable?: boolean;
  [key: string]: unknown;
}

export function parseAiSseDataLine(rawLine: string): AiSseEvent | null {
  const line = String(rawLine || '').trim();
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload) as AiSseEvent;
  } catch {
    return null;
  }
}

export function consumeAiSseChunk(buffer: string, chunk: string) {
  const combined = `${buffer || ''}${chunk || ''}`;
  const lines = combined.split(/\r?\n/);
  const nextBuffer = lines.pop() || '';
  const events = lines.map(parseAiSseDataLine).filter((event): event is AiSseEvent => Boolean(event));
  return { buffer: nextBuffer, events };
}

export function flushAiSseBuffer(buffer: string) {
  const event = parseAiSseDataLine(buffer);
  return event ? [event] : [];
}
