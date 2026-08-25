import request, { apiBaseGet, apiBasePost, type RequestOptions } from '@/http/request';
import {
  validateAiSkillResponse,
  type AiSkillRequest,
  type AiSkillResponse,
} from '@lightnote/shared/ai-skill-protocol';

export class AiSkillApiError extends Error {
  code: string;
  status: number;
  isPublicMessage: boolean;

  constructor(code: string, message: string, status = 500, isPublicMessage = false) {
    super(message);
    this.name = 'AiSkillApiError';
    this.code = code;
    this.status = status;
    this.isPublicMessage = isPublicMessage;
  }
}

const PUBLIC_TRANSPORT_ERROR_CODES = new Set(['NETWORK_ERROR', 'OFFLINE', 'REQUEST_TIMEOUT']);

export function getAiSkillPublicErrorMessage(cause: unknown) {
  if (!(cause instanceof AiSkillApiError) || !cause.isPublicMessage) return '';
  return String(cause.message || '').trim();
}

function normalizeAiSkillApiError(cause: unknown, fallbackCode = 'AI_SKILL_FAILED') {
  if (cause instanceof AiSkillApiError) return cause;
  const value = cause as any;
  const envelope = value?.response?.data;
  const status = Number(envelope?.status || value?.status || value?.response?.status || 500);
  const code = String(envelope?.data?.code || value?.data?.code || value?.code || fallbackCode);
  const message = String(envelope?.msg || value?.message || 'AI 能力暂时不可用');
  const isPublicMessage =
    typeof envelope?.msg === 'string' || /^HTTP_\d{3}$/u.test(code) || PUBLIC_TRANSPORT_ERROR_CODES.has(code);
  return new AiSkillApiError(code, message, Number.isFinite(status) ? status : 500, isPublicMessage);
}

function assertSuccessEnvelope(response: any, fallbackCode: string) {
  if (Number(response?.status) === 200) return response.data;
  throw new AiSkillApiError(
    String(response?.data?.code || fallbackCode),
    String(response?.msg || 'AI 能力暂时不可用'),
    Number(response?.status || 500),
    true,
  );
}

export function createAiSkillRequest({
  skillId,
  skillVersion = 1,
  threadId = null,
  input,
  resourceRefs = [],
  surface,
}: {
  skillId: string;
  skillVersion?: number;
  threadId?: string | null;
  input: Record<string, unknown>;
  resourceRefs?: AiSkillRequest['scope']['resourceRefs'];
  surface: string;
}): AiSkillRequest {
  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
          const value = Math.floor(Math.random() * 16);
          return (part === 'x' ? value : (value & 0x3) | 0x8).toString(16);
        });
  let timezone = 'Asia/Singapore';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
  } catch {}
  const browserLocale = typeof navigator === 'undefined' ? '' : navigator.language;
  const pageLocale = typeof document === 'undefined' ? '' : document.documentElement.lang;
  return {
    protocolVersion: 1,
    requestId,
    skillId,
    skillVersion,
    threadId,
    input,
    scope: { resourceRefs },
    client: { locale: pageLocale || browserLocale || 'zh-CN', timezone, surface },
  };
}

export interface AiProductFeatureState {
  protocolVersion: 1;
  kernelEnabled: boolean;
  skills: Record<string, boolean>;
  archive: { readonly: true };
  availableSkills: Array<{ id: string; version: number; domain: string; effect: 'read' | 'preview' }>;
}

export async function getAiSkillsConfig(): Promise<AiProductFeatureState> {
  try {
    const response = await apiBaseGet('/api/ai/skills/config', undefined, { silent: true });
    return assertSuccessEnvelope(response, 'AI_SKILL_CONFIG_UNAVAILABLE') as AiProductFeatureState;
  } catch (cause) {
    throw normalizeAiSkillApiError(cause, 'AI_SKILL_CONFIG_UNAVAILABLE');
  }
}

export async function executeAiSkill(
  request: AiSkillRequest,
  options: Pick<RequestOptions, 'signal'> = {},
): Promise<AiSkillResponse> {
  try {
    const response = await apiBasePost('/api/ai/skills/execute', request, { silent: true, ...options });
    const result = validateAiSkillResponse(assertSuccessEnvelope(response, 'AI_SKILL_FAILED'));
    if (result.status === 'failed') {
      throw new AiSkillApiError(
        String(result.error?.code || 'AI_SKILL_FAILED'),
        String(result.error?.message || 'AI 能力暂时不可用'),
        500,
        true,
      );
    }
    return result;
  } catch (cause) {
    throw normalizeAiSkillApiError(cause);
  }
}

export interface AiSkillStreamHandlers {
  signal?: AbortSignal;
  onStart?: (payload: Record<string, unknown>) => void;
  onDelta?: (content: string) => void;
  onReset?: () => void;
}

function parseSseFrame(frame: string) {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    throw new AiSkillApiError('AI_SKILL_STREAM_INVALID', 'AI 流式响应格式无效', 502);
  }
}

export async function executeAiSkillStream(
  skillRequest: AiSkillRequest,
  handlers: AiSkillStreamHandlers = {},
): Promise<AiSkillResponse> {
  try {
    const response = await request({
      url: '/api/ai/skills/stream',
      method: 'post',
      data: skillRequest,
      adapter: 'fetch',
      responseType: 'stream',
      signal: handlers.signal,
      silent: true,
    } as RequestOptions);
    const stream = response.data as ReadableStream<Uint8Array> | null;
    if (!stream || typeof stream.getReader !== 'function') {
      throw new AiSkillApiError('AI_SKILL_STREAM_UNAVAILABLE', '当前环境无法读取 AI 流式响应', 502);
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed: AiSkillResponse | null = null;
    const handleFrame = (frame: string) => {
      const parsed = parseSseFrame(frame);
      if (!parsed) return;
      if (parsed.event === 'start') handlers.onStart?.(parsed.data || {});
      else if (parsed.event === 'delta') handlers.onDelta?.(String(parsed.data?.content || ''));
      else if (parsed.event === 'reset') handlers.onReset?.();
      else if (parsed.event === 'complete') completed = validateAiSkillResponse(parsed.data);
      else if (parsed.event === 'error') {
        throw new AiSkillApiError(
          String(parsed.data?.code || 'AI_SKILL_FAILED'),
          String(parsed.data?.message || 'AI 能力暂时不可用'),
          Number(parsed.data?.status || 500),
          true,
        );
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n?/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleFrame(frame);
        boundary = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
    if (buffer.trim()) handleFrame(buffer);
    if (!completed) throw new AiSkillApiError('AI_SKILL_STREAM_INCOMPLETE', 'AI 流式响应未完整结束，请重试', 502);
    return completed;
  } catch (cause) {
    throw normalizeAiSkillApiError(cause);
  }
}

export const aiSkillApiInternals = Object.freeze({ parseSseFrame });
