import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
import { apiBasePost } from '@/http/request';
import { stripAiAnalysisCitations } from '@/utils/aiAnalysisContent';
import { confirmNoteShareExposure } from '@/utils/noteShareExposure';

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

export interface PersistedAiNoteHandoff {
  noteId: string;
  route: { path: string };
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
    title:
      String(value.title || 'AI 生成笔记')
        .trim()
        .slice(0, 255) || 'AI 生成笔记',
    content: String(value.content || ''),
    type: value.type === 'html' ? 'html' : 'markdown',
  };
}

function notePreviewFromResponse(response: AiSkillResponse, fallbackTitle: string): AiNoteDraft | null {
  const result = response.result;
  if (result?.kind !== 'artifact_preview' || result.artifactType !== 'note') return null;
  const content = stripAiAnalysisCitations(result.content);
  if (!content.trim()) return null;
  return normalizeDraft({
    title: String(result.title || fallbackTitle),
    content,
    type: result.contentType === 'html' ? 'html' : 'markdown',
  });
}

function markdownResultFromResponse(response: AiSkillResponse, fallbackTitle: string): AiNoteDraft | null {
  const result = response.result;
  if (result?.kind !== 'grounded_markdown' || !response.sources.length) return null;
  const content = stripAiAnalysisCitations(result.content);
  if (!content.trim()) return null;
  return normalizeDraft({ title: fallbackTitle, content, type: 'markdown' });
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
  const draft = notePreviewFromResponse(response, fallbackTitle);
  if (!draft) return null;
  const token = stageAiNoteDraft(draft);
  return {
    token,
    route: { path: '/noteLibrary/add', query: { type: draft.type, aiDraft: token } },
  };
}

/**
 * 确认 AI 笔记预览时直接复用笔记领域的权威创建接口。
 * requestId 作为幂等键，避免重复点击或提交回包丢失时创建多份笔记。
 */
async function persistAiNoteDraft(
  response: AiSkillResponse,
  draft: AiNoteDraft | null,
): Promise<PersistedAiNoteHandoff | null> {
  if (!draft) return null;
  const requestId = String(response.requestId || '').trim();
  if (!requestId) {
    throw Object.assign(new Error('AI 结果缺少请求标识，请重新生成后再创建笔记'), {
      code: 'AI_NOTE_REQUEST_ID_MISSING',
      status: 422,
    });
  }
  const payload = {
    ...draft,
    idempotencyKey: `ai-skill-note:${requestId}`.slice(0, 512),
  };
  let result = await apiBasePost('/api/note/addNote', payload, { silent: true });
  const exposureDecision = await confirmNoteShareExposure(result);
  if (exposureDecision === false) return null;
  if (exposureDecision === true) {
    result = await apiBasePost('/api/note/addNote', { ...payload, shareExposureAcknowledged: true }, { silent: true });
  }
  const noteId = String(result?.data?.id || '').trim();
  if (Number(result?.status) !== 200 || !noteId) {
    throw Object.assign(new Error(String(result?.msg || '笔记创建失败，请稍后重试')), {
      code: String(result?.data?.code || 'AI_NOTE_CREATE_FAILED'),
      status: Number(result?.status || 500),
    });
  }
  return {
    noteId,
    route: { path: `/noteLibrary/${encodeURIComponent(noteId)}` },
  };
}

export function persistAiNotePreview(
  response: AiSkillResponse,
  fallbackTitle = 'AI 生成笔记',
): Promise<PersistedAiNoteHandoff | null> {
  return persistAiNoteDraft(response, notePreviewFromResponse(response, fallbackTitle));
}

/**
 * 用户检查 Markdown 分析结果后，可把移除界面引用角标的同一结果直接保存为新笔记。
 * 复用原请求 ID 幂等落库，不再为同一材料重复调用模型。
 */
export function persistAiMarkdownResultAsNote(
  response: AiSkillResponse,
  fallbackTitle = 'AI 生成笔记',
): Promise<PersistedAiNoteHandoff | null> {
  return persistAiNoteDraft(response, markdownResultFromResponse(response, fallbackTitle));
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
