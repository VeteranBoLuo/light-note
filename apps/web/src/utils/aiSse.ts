import type { AiAgentInteraction, AiToolConfirmation } from '@/types/aiAgent';

export interface AiSseEvent {
  event?: string;
  requestId?: string;
  error?: string;
  message?: string;
  output?: { text?: string; session_id?: string; thoughts?: any[] };
  confirmation?: AiToolConfirmation;
  interaction?: AiAgentInteraction;
  sources?: any[];
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
