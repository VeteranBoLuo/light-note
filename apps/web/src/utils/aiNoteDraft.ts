import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';

const STORAGE_PREFIX = 'light-note:ai-note-draft:v1:';
const DEFAULT_TTL_MS = 20 * 60 * 1000;

export interface AiNoteDraft {
  title: string;
  content: string;
  type: 'markdown' | 'html';
}

export interface AiNoteDraftHandoff {
  token: string;
  route: {
    path: '/noteLibrary/add';
    query: { type: AiNoteDraft['type']; aiDraft: string };
  };
}

interface StoredAiNoteDraft extends AiNoteDraft {
  expiresAt: number;
}

function createDraftToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeDraft(value: Partial<AiNoteDraft>): AiNoteDraft {
  return {
    title: String(value.title || 'AI 生成笔记').trim().slice(0, 255) || 'AI 生成笔记',
    content: String(value.content || ''),
    type: value.type === 'html' ? 'html' : 'markdown',
  };
}

export function stageAiNoteDraft(value: Partial<AiNoteDraft>, ttlMs = DEFAULT_TTL_MS) {
  const token = createDraftToken();
  const draft: StoredAiNoteDraft = {
    ...normalizeDraft(value),
    expiresAt: Date.now() + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS),
  };
  sessionStorage.setItem(`${STORAGE_PREFIX}${token}`, JSON.stringify(draft));
  return token;
}

export function createAiNoteDraftHandoff(
  response: AiSkillResponse,
  fallbackTitle = 'AI 生成笔记',
): AiNoteDraftHandoff | null {
  const result = response.result;
  if (result?.kind !== 'artifact_preview' || result.artifactType !== 'note') return null;
  const content = String(result.content || '');
  if (!content.trim()) return null;
  const type: AiNoteDraft['type'] = result.contentType === 'html' ? 'html' : 'markdown';
  const token = stageAiNoteDraft({
    title: String(result.title || fallbackTitle),
    content,
    type,
  });
  return {
    token,
    route: { path: '/noteLibrary/add', query: { type, aiDraft: token } },
  };
}

export function readAiNoteDraft(token: unknown): AiNoteDraft | null {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;
  const key = `${STORAGE_PREFIX}${normalizedToken}`;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAiNoteDraft;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    const draft = normalizeDraft(parsed);
    return draft.content.trim() ? draft : null;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function discardAiNoteDraft(token: unknown) {
  const normalizedToken = String(token || '').trim();
  if (normalizedToken) sessionStorage.removeItem(`${STORAGE_PREFIX}${normalizedToken}`);
}

export function consumeAiNoteDraft(token: unknown): AiNoteDraft | null {
  const draft = readAiNoteDraft(token);
  discardAiNoteDraft(token);
  return draft;
}

export const aiNoteDraftInternals = { STORAGE_PREFIX, DEFAULT_TTL_MS };
