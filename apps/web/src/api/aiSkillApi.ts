import { apiBaseGet, apiBasePost, type RequestOptions } from '@/http/request';
import {
  validateAiSkillResponse,
  type AiSkillRequest,
  type AiSkillResponse,
} from '@lightnote/shared/ai-skill-protocol';

export class AiSkillApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = 'AiSkillApiError';
    this.code = code;
    this.status = status;
  }
}

function normalizeAiSkillApiError(cause: unknown, fallbackCode = 'AI_SKILL_FAILED') {
  if (cause instanceof AiSkillApiError) return cause;
  const value = cause as any;
  const envelope = value?.response?.data;
  const status = Number(envelope?.status || value?.status || value?.response?.status || 500);
  const code = String(envelope?.data?.code || value?.data?.code || value?.code || fallbackCode);
  const message = String(envelope?.msg || value?.message || 'AI 能力暂时不可用');
  return new AiSkillApiError(code, message, Number.isFinite(status) ? status : 500);
}

function assertSuccessEnvelope(response: any, fallbackCode: string) {
  if (Number(response?.status) === 200) return response.data;
  throw new AiSkillApiError(
    String(response?.data?.code || fallbackCode),
    String(response?.msg || 'AI 能力暂时不可用'),
    Number(response?.status || 500),
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
      );
    }
    return result;
  } catch (cause) {
    throw normalizeAiSkillApiError(cause);
  }
}
