import type { AiAttachment } from '@/api/aiAttachmentApi';
import type { SearchType } from '@/api/search';

export const AI_ASSISTANT_OPEN_EVENT = 'light-note:open-ai';

export type AiAssistantIntent =
  'ask' | 'find' | 'summarize' | 'compare' | 'organize' | 'extract_todos' | 'find_related';

export interface AiAssistantContextRef {
  type: SearchType;
  id: string;
  title: string;
}

export interface AiAssistantLaunchPayload {
  contextRefs?: AiAssistantContextRef[];
  attachmentRefs?: AiAttachment[];
  suggestedIntent?: AiAssistantIntent;
  /** 仅用于无正文产品漏斗，不参与权限或材料范围判断。 */
  surface?: 'note_detail' | 'note_library' | 'search' | 'bookmark_manage' | 'cloud_space' | 'tag_detail' | 'workspace';
  /** 只用于继承全局搜索关键词，不允许据此绕开材料范围或直接执行写操作。 */
  query?: string;
}

function normalizedContexts(value: unknown): AiAssistantContextRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AiAssistantContextRef =>
        Boolean(item) &&
        typeof item === 'object' &&
        ['note', 'bookmark', 'file', 'tag'].includes(String((item as AiAssistantContextRef).type)) &&
        Boolean(String((item as AiAssistantContextRef).id || '').trim()),
    )
    .slice(0, 5)
    .map((item) => ({ type: item.type, id: String(item.id), title: String(item.title || '').slice(0, 255) }));
}

function normalizedAttachments(value: unknown): AiAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AiAttachment =>
        Boolean(item) &&
        typeof item === 'object' &&
        Boolean(String((item as AiAttachment).id || '').trim()) &&
        ['temporary', 'cloud'].includes(String((item as AiAttachment).sourceType)),
    )
    .slice(0, 5)
    .map((item) => ({ ...item, id: String(item.id) }));
}

export function normalizeAiAssistantLaunchPayload(value: unknown): AiAssistantLaunchPayload {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const intents = new Set<AiAssistantIntent>([
    'ask',
    'find',
    'summarize',
    'compare',
    'organize',
    'extract_todos',
    'find_related',
  ]);
  const intent = intents.has(raw.suggestedIntent as AiAssistantIntent)
    ? (raw.suggestedIntent as AiAssistantIntent)
    : undefined;
  return {
    contextRefs: normalizedContexts(raw.contextRefs),
    attachmentRefs: normalizedAttachments(raw.attachmentRefs),
    suggestedIntent: intent,
    surface: [
      'note_detail',
      'note_library',
      'search',
      'bookmark_manage',
      'cloud_space',
      'tag_detail',
      'workspace',
    ].includes(String(raw.surface))
      ? (raw.surface as AiAssistantLaunchPayload['surface'])
      : undefined,
    query: typeof raw.query === 'string' ? raw.query.trim().slice(0, 500) : undefined,
  };
}

export function openAiAssistant(payload: AiAssistantLaunchPayload = {}) {
  window.dispatchEvent(
    new CustomEvent<AiAssistantLaunchPayload>(AI_ASSISTANT_OPEN_EVENT, {
      detail: normalizeAiAssistantLaunchPayload(payload),
    }),
  );
}
