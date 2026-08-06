import type { AiAttachment } from '@/api/aiAttachmentApi';
import type { GlobalSearchType } from '@/api/search';
import type { AiScopeRef } from '@/types/aiScope';

export const AI_ASSISTANT_OPEN_EVENT = 'light-note:open-ai';
export const AI_ASSISTANT_VISIBILITY_EVENT = 'light-note:ai-visibility';
let aiAssistantVisible = false;

export type AiAssistantIntent =
  | 'ask'
  | 'find'
  | 'summarize'
  | 'compare'
  | 'organize'
  | 'extract_todos'
  | 'find_related'
  | 'create_note';

export interface AiAssistantContextRef {
  type: GlobalSearchType;
  id: string;
  title: string;
}

export interface AiAssistantLaunchPayload {
  contextRefs?: AiAssistantContextRef[];
  scopeRefs?: AiScopeRef[];
  attachmentRefs?: AiAttachment[];
  suggestedIntent?: AiAssistantIntent;
  /** 仅用于无正文产品漏斗，不参与权限或材料范围判断。 */
  surface?: 'note_detail' | 'note_library' | 'search' | 'bookmark_manage' | 'cloud_space' | 'tag_detail' | 'workspace';
  /** 只用于继承全局搜索关键词，不允许据此绕开材料范围或直接执行写操作。 */
  query?: string;
}

function normalizedScopes(value: unknown): AiScopeRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(
      (item): item is AiScopeRef =>
        Boolean(item) &&
        typeof item === 'object' &&
        String((item as AiScopeRef).type) === 'note_branch' &&
        Boolean(String((item as AiScopeRef).id || '').trim()),
    )
    .filter((item) => {
      const key = `${item.type}:${String(item.id)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((item) => ({
      type: 'note_branch',
      id: String(item.id),
      title: String(item.title || '').slice(0, 255),
      ...(Number.isFinite(Number(item.estimatedResourceCount))
        ? { estimatedResourceCount: Math.max(1, Number(item.estimatedResourceCount)) }
        : {}),
    }));
}

/**
 * 手机端一律不挂 AI 侧边触发器——它是贴在屏幕边缘的悬浮把手，在触控端既容易误触，
 * 又和底部导航的 AI 入口重复。
 *
 * 此前对 noteDetail 开了例外，因为那条路由不显示底部导航（meta 没有 mobileBottomNav），
 * 边缘把手是笔记里唯一的 AI 入口。现在按产品决定统一去掉；如果之后需要在笔记里就近唤起
 * AI，应该加进顶栏的更多菜单，而不是把悬浮把手放回来。
 */
export function shouldHideAiEdgeTrigger(isMobile: boolean, _routeName?: unknown): boolean {
  return isMobile;
}

function normalizedContexts(value: unknown): AiAssistantContextRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AiAssistantContextRef =>
        Boolean(item) &&
        typeof item === 'object' &&
        ['note', 'bookmark', 'file', 'tag', 'todo'].includes(String((item as AiAssistantContextRef).type)) &&
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
    'create_note',
  ]);
  const intent = intents.has(raw.suggestedIntent as AiAssistantIntent)
    ? (raw.suggestedIntent as AiAssistantIntent)
    : undefined;
  return {
    contextRefs: normalizedContexts(raw.contextRefs),
    scopeRefs: normalizedScopes(raw.scopeRefs),
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

export function setAiAssistantVisibility(open: boolean) {
  aiAssistantVisible = open;
  window.dispatchEvent(
    new CustomEvent(AI_ASSISTANT_VISIBILITY_EVENT, {
      detail: { open },
    }),
  );
}

export function getAiAssistantVisibility() {
  return aiAssistantVisible;
}
