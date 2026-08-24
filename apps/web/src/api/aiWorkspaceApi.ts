import { apiBasePost } from '@/http/request';

export type AiConversationStatus = 'active' | 'archived';
export type AiRetentionMode = 'standard' | 'temporary' | 'indefinite';

export interface AiEvidenceLocator {
  type?: string;
  value?: string;
  label?: string;
  page?: number | string;
  section?: string;
  paragraph?: string | number;
}

export interface AiPersistedSource {
  sourceId: string;
  resourceType: string;
  resourceId: string | null;
  title: string;
  resourceVersion: string | null;
  target: Record<string, unknown> | string | null;
  coverage: Record<string, unknown> | null;
  capturedAt?: string;
}

export interface AiEvidence {
  evidenceRef: string;
  sourceId: string;
  citationKey: string;
  locator: AiEvidenceLocator | null;
  excerpt: string;
  excerptHash?: string;
}

export interface AiCloudMessage {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  requestId: string | null;
  traceId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'generating' | 'completed' | 'failed' | 'stopped';
  contextRefs: Array<Record<string, unknown>>;
  attachmentRefs: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown> | string>;
  coverage: Record<string, unknown> | null;
  versionGroupId: string | null;
  modelMeta: Record<string, unknown> | null;
  sources: AiPersistedSource[];
  evidence: AiEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  summary: string;
  scopeType: string;
  scope: Record<string, unknown>;
  status: AiConversationStatus;
  isPinned?: boolean;
  retentionMode: AiRetentionMode;
  expireAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversation extends AiConversationSummary {
  messages: AiCloudMessage[];
}

function workspaceError(response: any, fallback: string) {
  const code = String(response?.data?.code || fallback);
  const error = new Error(code) as Error & { code?: string; status?: number };
  error.code = code;
  error.status = Number(response?.status || 500);
  return error;
}

async function post<T>(path: string, body: Record<string, unknown> = {}, fallback = 'AI_ARCHIVE_FAILED'): Promise<T> {
  try {
    const response = await apiBasePost(path, body, { silent: true });
    if (response?.status !== 200) throw workspaceError(response, fallback);
    return response.data as T;
  } catch (raw: any) {
    if (raw instanceof Error && (raw as Error & { code?: string }).code === fallback) throw raw;
    throw workspaceError(
      raw?.response?.data || {
        status: raw?.status || raw?.response?.status,
        data: { code: raw?.response?.data?.data?.code || raw?.code },
      },
      fallback,
    );
  }
}

export const listAiConversations = (
  input: { status?: AiConversationStatus; keyword?: string; cursor?: string; limit?: number } = {},
) => post<{ items: AiConversationSummary[]; nextCursor: string | null }>('/api/chat/conversations/list', input);

export const getAiConversation = (conversationId: string, messageLimit = 100) =>
  post<AiConversation>('/api/chat/conversations/get', { conversationId, messageLimit });

export const deleteAiConversation = (conversationId: string) =>
  post<{ deleted: number; undoExpiresAt: string | null }>('/api/chat/conversations/delete', { conversationId });

export const exportAiCloudConversations = () =>
  post<{
    schemaVersion: 1;
    exportedAt: string;
    conversationCount: number;
    messageCount: number;
    conversations: AiConversation[];
    feedback: Array<Record<string, unknown>>;
  }>('/api/chat/conversations/export');
