import { apiBasePost } from '@/http/request';

export type AiConversationStatus = 'active' | 'archived';
export type AiRetentionMode = 'standard' | 'temporary' | 'indefinite';
export type AiMemoryStatus = 'candidate' | 'active' | 'paused' | 'expired';

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
  feedback?: { rating: 'helpful' | 'unhelpful'; reason?: string; resolved?: boolean | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiAgentRecoveryTerminal {
  status: 'completed' | 'failed';
  eventId: number;
  error: string | null;
  message: string | null;
  at: string;
}

export interface AiAgentRecoverySnapshot {
  protocolVersion: string;
  requestId: string;
  sessionId: string;
  answer: string;
  sources: Array<Record<string, unknown>>;
  citations: AiEvidence[];
  evidence: AiEvidence[];
  citationAudit: {
    citedKeys: string[];
    invalidKeys: string[];
    verifiedCitationCount: number;
    evidenceCount: number;
  } | null;
  coverage: Record<string, unknown> | null;
  activity: Array<Record<string, unknown> | string>;
  stage: string;
  status: 'completed' | 'failed';
  terminal: AiAgentRecoveryTerminal;
  lastEventId: number;
  startedAt: string;
  updatedAt: string;
}

export interface AiAgentRecoveryResult {
  protocolVersion: string;
  requestId: string;
  recovered: true;
  snapshot: AiAgentRecoverySnapshot;
  events: Array<Record<string, unknown>>;
  lastEventId: number;
  expiresAt: string | null;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  summary: string;
  scopeType: string;
  scope: Record<string, unknown>;
  status: AiConversationStatus;
  retentionMode: AiRetentionMode;
  expireAt: string | null;
  rootConversationId: string;
  parentConversationId: string | null;
  branchFromMessageId: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversation extends AiConversationSummary {
  messages: AiCloudMessage[];
}

export interface AiConversationLineageNode extends AiConversationSummary {
  depth: number;
  childCount: number;
  parentAvailable: boolean;
  current: boolean;
}

export interface AiConversationLineage {
  rootConversationId: string;
  currentConversationId: string;
  nodes: AiConversationLineageNode[];
  truncated: boolean;
}

export interface AiMessageVersionSummary {
  messageId: string;
  requestId: string | null;
  versionGroupId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageVersions {
  conversationId: string;
  currentMessageId: string;
  versionGroupId: string;
  items: AiMessageVersionSummary[];
  truncated: boolean;
}

export interface AiChangeItem {
  id: string;
  order: number;
  operation:
    | 'set_tags'
    | 'move_file'
    | 'update_note_metadata'
    | 'update_note_content'
    | 'update_bookmark_metadata'
    | 'create_todo';
  resourceType: string;
  resourceId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  beforeHash: string | null;
  reason: string;
  status: string;
  receipt: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

export interface AiChangeSetRetry {
  version: 1;
  state: 'failed' | 'ready';
  selectedItemIds: string[];
  selectedCount: number;
  processedCount: number;
  failedItemId: string | null;
  errorCode: string | null;
  phase: 'validation' | 'item_apply' | 'finalize';
  failedAt: string | null;
  revalidatedAt: string | null;
  previewRevision: number;
}

export interface AiChangeSet {
  id: string;
  conversationId: string | null;
  requestId: string | null;
  title: string;
  summary: string;
  status: 'draft' | 'applied' | 'undone' | 'expired';
  riskLevel: 'low' | 'medium' | 'high';
  selection: string[] | null;
  previewRevision: number;
  retry: AiChangeSetRetry | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  expiresAt: string | null;
  appliedAt: string | null;
  undoneAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: AiChangeItem[];
}

export interface AiMemory {
  id: string;
  scopeType: 'global' | 'conversation' | 'resource';
  scope: Record<string, unknown>;
  memoryType: 'preference' | 'fact' | 'topic' | 'workflow' | 'temporary_state';
  content: string;
  status: AiMemoryStatus;
  temporary: boolean;
  expireAt: string | null;
  expired: boolean;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  confirmedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiResultNoteTarget {
  id: string;
  title: string;
  type: 'html' | 'markdown';
  contentLength: number;
  resourceVersion: string;
  updatedAt: string;
}

export interface AiResultReusableBlock {
  id: string;
  index: number;
  kind: 'section' | 'paragraph' | 'list' | 'code' | 'blockquote' | 'table' | 'group';
  title: string;
  preview: string;
  charCount: number;
  citationKeys: string[];
}

export interface AiResultNoteReusePreview {
  mode: 'append' | 'merge' | 'selection';
  target: Pick<AiResultNoteTarget, 'id' | 'title' | 'type' | 'resourceVersion'>;
  beforeLength: number;
  afterLength: number;
  addedLength: number;
  sourceCount: number;
  evidenceCount: number;
  uniqueBlockCount: number | null;
  duplicateBlockCount: number | null;
  selectedBlockCount: number | null;
  totalBlockCount: number | null;
  selectedCitationCount: number | null;
  undoSupported: true;
  versionCheck: 'content_hash';
}

export interface AiCreateNoteReceipt {
  action: 'create_note';
  target: { resourceType: 'note'; resourceId: string; title: string };
  sourceMessageId: string;
  sourceCount: number;
  evidenceCount: number;
  appliedAt: string;
  undo: { supported: false; reasonCode: 'CREATED_NOTE_REQUIRES_MANUAL_TRASH' };
}

function workspaceError(response: any, fallback: string) {
  const code = String(response?.data?.code || 'AI_WORKSPACE_FAILED');
  const error = new Error(code || fallback) as Error & { code?: string; status?: number };
  error.code = code;
  error.status = Number(response?.status || 500);
  return error;
}

async function post<T>(
  path: string,
  body: Record<string, unknown> = {},
  fallback = 'AI_WORKSPACE_FAILED',
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  try {
    const response = await apiBasePost(path, body, { silent: true, ...options });
    if (response?.status !== 200) throw workspaceError(response, fallback);
    return response.data as T;
  } catch (raw: any) {
    if (raw instanceof Error && (raw as Error & { code?: string }).code === 'AI_WORKSPACE_FAILED') throw raw;
    const response = raw?.response?.data || {
      msg: raw?.message,
      status: raw?.status || raw?.response?.status,
      data: { code: raw?.response?.data?.data?.code || raw?.code },
    };
    throw workspaceError(response, fallback);
  }
}

export const createAiConversation = (input: {
  title?: string;
  scopeType?: string;
  scope?: Record<string, unknown>;
  retentionMode?: AiRetentionMode;
}) => post<AiConversation>('/api/chat/conversations/create', input);

export const listAiConversations = (
  input: {
    status?: AiConversationStatus;
    keyword?: string;
    cursor?: string;
    limit?: number;
  } = {},
) => post<{ items: AiConversationSummary[]; nextCursor: string | null }>('/api/chat/conversations/list', input);

export const getAiConversation = (conversationId: string, messageLimit = 100) =>
  post<AiConversation>('/api/chat/conversations/get', { conversationId, messageLimit });

export const getAiConversationLineage = (conversationId: string) =>
  post<AiConversationLineage>('/api/chat/conversations/lineage', { conversationId });

export const updateAiConversation = (conversationId: string, patch: Record<string, unknown>) =>
  post<AiConversationSummary>('/api/chat/conversations/update', { conversationId, patch });

export const deleteAiConversation = (conversationId: string) =>
  post<{ deleted: number; undoExpiresAt: string | null }>('/api/chat/conversations/delete', { conversationId });

export const restoreDeletedAiConversation = (conversationId: string) =>
  post<{ restored: number }>('/api/chat/conversations/restore', { conversationId });

export const clearAiCloudConversations = () => post<{ deleted: number }>('/api/chat/conversations/clear');

export const clearAllAiData = () =>
  post<{
    deleted: number;
    byType: Record<string, number>;
    scope: 'subject_user' | 'owner_domain';
    retained: string[];
  }>('/api/chat/conversations/clear-all-data');

export const recoverAiAgentResponse = (
  input: { requestId: string; lastEventId?: number },
  options: { signal?: AbortSignal } = {},
) => post<AiAgentRecoveryResult>('/api/chat/agent/recover', input, 'AI_RESPONSE_RECOVERY_FAILED', options);

export const exportAiCloudConversations = () =>
  post<{
    schemaVersion: 1;
    exportedAt: string;
    conversationCount: number;
    messageCount: number;
    conversations: AiConversation[];
    feedback: Array<Record<string, unknown>>;
  }>('/api/chat/conversations/export');

export const saveAiCloudMessage = (conversationId: string, message: Record<string, unknown>) =>
  post<AiCloudMessage>('/api/chat/conversations/messages/save', { conversationId, message });

export const listAiMessageVersions = (conversationId: string, messageId: string) =>
  post<AiMessageVersions>('/api/chat/conversations/messages/versions', { conversationId, messageId });

export const prepareAiMessageVersionGroup = (conversationId: string, messageId: string) =>
  post<{ conversationId: string; messageId: string; versionGroupId: string }>(
    '/api/chat/conversations/messages/version-group',
    { conversationId, messageId },
  );

export const branchAiConversation = (conversationId: string, throughMessageId?: string, title?: string) =>
  post<AiConversation>('/api/chat/conversations/branch', { conversationId, throughMessageId, title });

export const submitAiFeedback = (input: {
  conversationId: string;
  messageId: string;
  rating: 'helpful' | 'unhelpful';
  reason?: 'incorrect' | 'unsupported' | 'outdated' | 'irrelevant' | 'unsafe_action' | 'hard_to_use' | 'other';
  resolved?: boolean;
  comment?: string;
}) => post<Record<string, unknown>>('/api/chat/conversations/feedback', input);

export const saveAiMessageAsNote = (conversationId: string, messageId: string, title?: string) =>
  post<{
    note: { id: string; title: string };
    sourceMessageId: string;
    sourceCount: number;
    evidenceCount: number;
    receipt: AiCreateNoteReceipt;
  }>('/api/chat/conversations/save-note', { conversationId, messageId, title });

export const listAiResultNoteTargets = (input: { keyword?: string; limit?: number } = {}) =>
  post<{ items: AiResultNoteTarget[]; total: number }>('/api/chat/conversations/note-targets', input);

export const listAiResultReusableBlocks = (input: { conversationId: string; messageId: string }) =>
  post<{
    items: AiResultReusableBlock[];
    total: number;
    sourceCount: number;
    evidenceCount: number;
  }>('/api/chat/conversations/reuse-note/blocks', input);

export const prepareAiResultNoteReuse = (input: {
  conversationId: string;
  messageId: string;
  mode: 'append' | 'merge' | 'selection';
  selectedBlockIds?: string[];
  targetNoteId: string;
  targetVersion: string;
}) =>
  post<{ changeSetId: string; preview: AiResultNoteReusePreview }>('/api/chat/conversations/reuse-note/prepare', input);

export const listAiChangeSets = (input: { status?: AiChangeSet['status']; limit?: number } = {}) =>
  post<{ items: AiChangeSet[]; total: number }>('/api/chat/change-sets/list', input);
export const createAiChangeSet = (input: Record<string, unknown>) =>
  post<AiChangeSet>('/api/chat/change-sets/create', input);
export const proposeAiChangeSet = (input: {
  instruction: string;
  contexts: Array<{ type: 'note' | 'bookmark' | 'file'; id: string }>;
  conversationId?: string;
  requestId?: string;
}) => post<AiChangeSet>('/api/chat/change-sets/propose', input);
export const getAiChangeSet = (changeSetId: string) => post<AiChangeSet>('/api/chat/change-sets/get', { changeSetId });
export const updateAiChangeSet = (changeSetId: string, patch: Record<string, unknown>) =>
  post<AiChangeSet>('/api/chat/change-sets/update', { changeSetId, patch });
export const applyAiChangeSet = (changeSetId: string, selectedItemIds: string[] | null) =>
  post<AiChangeSet>('/api/chat/change-sets/apply', { changeSetId, selectedItemIds });
export const revalidateAiChangeSetRetry = (changeSetId: string) =>
  post<AiChangeSet>('/api/chat/change-sets/revalidate-retry', { changeSetId });
export const retryAiChangeSet = (changeSetId: string, previewRevision: number) =>
  post<AiChangeSet>('/api/chat/change-sets/retry', { changeSetId, previewRevision });
export const undoAiChangeSet = (changeSetId: string) =>
  post<AiChangeSet>('/api/chat/change-sets/undo', { changeSetId });

export const listAiMemories = (
  input: {
    status?: AiMemoryStatus | 'all';
    scopeType?: AiMemory['scopeType'];
    includeExpired?: boolean;
    limit?: number;
  } = {},
) => post<{ items: AiMemory[]; total: number }>('/api/chat/memories/list', input);
export const createAiMemoryCandidate = (input: Record<string, unknown>) =>
  post<AiMemory>('/api/chat/memories/create', input);
export const confirmAiMemory = (memoryId: string) => post<AiMemory>('/api/chat/memories/confirm', { memoryId });
export const updateAiMemory = (memoryId: string, patch: Record<string, unknown>) =>
  post<AiMemory>('/api/chat/memories/update', { memoryId, patch });
export const deleteAiMemory = (memoryId: string) =>
  post<{ deleted: number }>('/api/chat/memories/delete', { memoryId });
export const clearAiMemories = () => post<{ cleared: number }>('/api/chat/memories/clear');
