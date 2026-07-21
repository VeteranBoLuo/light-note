import { defineStore } from 'pinia';
import type { AiAttachment } from '@/api/aiAttachmentApi';
import type { AiSource } from '@/components/aiAssistant/aiSourceNavigation';
import type { SearchType } from '@/api/search';
import type { AiAgentInteraction, AiToolConfirmation } from '@/types/aiAgent';
import type { AiEvidence } from '@/api/aiWorkspaceApi';
import { sanitizeAiMessageActivity } from '@/utils/aiMemoryInfluence';

interface AiResourceContext {
  type: SearchType;
  id: string;
  title: string;
}

interface AiToolStatusItem {
  name: string;
  status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
  round?: number;
}

export type AiAssistantAdminContextMode = 'self' | 'readonly' | 'maintain';
export type AiAssistantScopeMode = 'selected' | 'workspace';
export type AiAssistantEdgeStatus = 'idle' | 'generating' | 'completed' | 'needs_attention' | 'failed';
export type AiAssistantRequestResult = 'completed' | 'failed' | 'stopped';

export interface AiAssistantIdentity {
  actorUserId: string;
  subjectUserId: string;
  adminContextMode: AiAssistantAdminContextMode;
  /** 管理员授权上下文本身也是隔离边界；普通自有账号为空字符串。 */
  adminContextId: string;
}

export interface AiAssistantIdentitySource {
  id?: string | null;
  adminContext?: {
    id?: string | null;
    subjectUserId?: string | null;
    mode?: 'readonly' | 'maintain' | string | null;
  } | null;
}

export interface AiAssistantMessage {
  id: string;
  parentMessageId?: string;
  versionGroupId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  confirmations?: AiToolConfirmation[];
  interactions?: AiAgentInteraction[];
  sources?: AiSource[];
  evidence?: AiEvidence[];
  coverage?: Record<string, unknown> | null;
  citationAudit?: { citedKeys: string[]; invalidKeys: string[]; verifiedCitationCount: number; evidenceCount: number };
  activity?: Array<Record<string, unknown> | string>;
  cloudId?: string;
  requestId?: string;
  traceId?: string;
  /** 该消息由服务端终态快照恢复，正文/来源/证据均以快照为准。 */
  recovered?: boolean;
  stage?: string;
  terminal?: {
    status: 'completed' | 'failed';
    eventId: number;
    error: string | null;
    message: string | null;
    at: string;
  };
  feedback?: { rating: 'helpful' | 'unhelpful'; reason?: string; resolved?: boolean | null };
  toolEvents?: AiToolStatusItem[];
  /** 兼容现有消息材料展示。 */
  contexts?: AiResourceContext[];
  /** 发送瞬间的不可变上下文快照，重试/重新生成只能读取该字段。 */
  contextRefs?: AiResourceContext[];
  /** 发送瞬间的不可变附件快照，重试/重新生成只能读取该字段。 */
  attachmentRefs?: AiAttachment[];
  transient?: boolean;
  transientGroupId?: string;
  pendingConfirmationIds?: string[];
  pendingInteractionIds?: string[];
  confirmationSucceeded?: boolean;
  persistAfterConfirmationSettlement?: boolean;
  recommendations?: string[];
  recommendationReady?: boolean;
  recommendationPending?: boolean;
}

export interface AiAssistantMaterialSnapshot {
  contextRefs: AiResourceContext[];
  attachmentRefs: AiAttachment[];
}

export interface AiAssistantRequestLease {
  domainKey: string;
  runtimeIdentityKey: string;
  epoch: number;
  controller: AbortController;
}

interface AiAssistantPersistedState {
  version: 3;
  identity: AiAssistantIdentity;
  draft: string;
  contextRefs: AiResourceContext[];
  attachmentRefs: AiAttachment[];
  messages: Array<Record<string, unknown>>;
  scrollTop: number;
  shouldFollowMessages: boolean;
  showScrollToBottom: boolean;
  sessionId: string;
  conversationId: string;
  longChatHinted: boolean;
  scopeMode?: AiAssistantScopeMode;
  temporarySession?: boolean;
  /** 边缘入口只保存有限状态，不保存回答正文、错误详情或确认内容。 */
  edgeStatus?: AiAssistantEdgeStatus;
  savedAt: string;
}

interface AiAssistantState {
  initialized: boolean;
  identity: AiAssistantIdentity | null;
  domainKey: string;
  runtimeIdentityKey: string;
  draft: string;
  contextRefs: AiResourceContext[];
  attachmentRefs: AiAttachment[];
  messages: AiAssistantMessage[];
  isLoading: boolean;
  hasAnswerStarted: boolean;
  shouldFollowMessages: boolean;
  showScrollToBottom: boolean;
  scrollTop: number;
  sessionId: string;
  conversationId: string;
  longChatHinted: boolean;
  scopeMode: AiAssistantScopeMode;
  temporarySession: boolean;
  edgeStatus: AiAssistantEdgeStatus;
  activeAssistantMessageId: string | null;
  requestEpoch: number;
}

interface AiAssistantRuntime {
  controller: AbortController | null;
  typewriter: { cancel: () => void } | null;
  persistTimer: number | null;
  unsubscribe: (() => void) | null;
  conversationCache: Map<string, AiAssistantPersistedState>;
}

const STORAGE_PREFIX = 'ai-assistant-state:v3';
const LEGACY_V2_STORAGE_PREFIX = 'ai-assistant-state:v2';
const LEGACY_STORAGE_PREFIX = 'ai-chat-history';
const PERSIST_THROTTLE_MS = 400;
const runtimeByStore = new WeakMap<object, AiAssistantRuntime>();
let messageSequence = 0;

function getRuntime(store: object): AiAssistantRuntime {
  let runtime = runtimeByStore.get(store);
  if (!runtime) {
    runtime = {
      controller: null,
      typewriter: null,
      persistTimer: null,
      unsubscribe: null,
      conversationCache: new Map(),
    };
    runtimeByStore.set(store, runtime);
  }
  return runtime;
}

function normalizeIdentityPart(value: unknown, fallback: string) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function normalizeMode(value: unknown): AiAssistantAdminContextMode {
  return value === 'readonly' || value === 'maintain' ? value : 'self';
}

function normalizeEdgeStatus(value: unknown): AiAssistantEdgeStatus {
  return ['idle', 'generating', 'completed', 'needs_attention', 'failed'].includes(String(value))
    ? (value as AiAssistantEdgeStatus)
    : 'idle';
}

export function resolveAiAssistantRequestEdgeStatus(
  result: AiAssistantRequestResult,
  hasPendingAction: boolean,
): Exclude<AiAssistantEdgeStatus, 'generating'> {
  if (result === 'stopped') return 'idle';
  if (result === 'failed') return 'failed';
  return hasPendingAction ? 'needs_attention' : 'completed';
}

export function resolveAiAssistantIdentity(source: AiAssistantIdentitySource): AiAssistantIdentity {
  const actorUserId = normalizeIdentityPart(source.id, 'visitor');
  const adminContextMode = normalizeMode(source.adminContext?.mode);
  const subjectUserId =
    adminContextMode === 'self' ? actorUserId : normalizeIdentityPart(source.adminContext?.subjectUserId, actorUserId);
  return {
    actorUserId,
    subjectUserId,
    adminContextMode,
    adminContextId: adminContextMode === 'self' ? '' : normalizeIdentityPart(source.adminContext?.id, 'missing'),
  };
}

export function buildAiAssistantDomainKey(identity: AiAssistantIdentity) {
  return [
    STORAGE_PREFIX,
    encodeURIComponent(identity.actorUserId),
    encodeURIComponent(identity.subjectUserId),
    encodeURIComponent(identity.adminContextMode),
    encodeURIComponent(identity.adminContextId || 'self'),
  ].join(':');
}

export function buildAiAssistantRuntimeIdentityKey(identity: AiAssistantIdentity) {
  return buildAiAssistantDomainKey(identity);
}

export function createAiAssistantMessageId(prefix = 'message') {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}:${randomId}`;
  messageSequence += 1;
  return `${prefix}:${Date.now().toString(36)}:${messageSequence.toString(36)}`;
}

function cloneContextRef(value: AiResourceContext): AiResourceContext {
  return {
    type: value.type,
    id: String(value.id),
    title: String(value.title || ''),
  };
}

function cloneAttachmentRef(value: AiAttachment): AiAttachment {
  return {
    id: String(value.id),
    sourceType: value.sourceType === 'cloud' ? 'cloud' : 'temporary',
    fileId: value.fileId == null ? null : String(value.fileId),
    fileName: String(value.fileName || ''),
    fileType: String(value.fileType || ''),
    fileSize: Number(value.fileSize || 0),
    status: value.status,
    ...(value.errorCode ? { errorCode: String(value.errorCode) } : {}),
    ...(value.errorMessage ? { errorMessage: String(value.errorMessage) } : {}),
    ...(Number.isFinite(value.extractedChars) ? { extractedChars: Number(value.extractedChars) } : {}),
    ...(Number.isFinite(value.chunkCount) ? { chunkCount: Number(value.chunkCount) } : {}),
    ...(value.expiresAt
      ? { expiresAt: value.expiresAt instanceof Date ? value.expiresAt.toISOString() : value.expiresAt }
      : {}),
  };
}

function freezeSnapshotItems<T extends object>(items: T[]) {
  items.forEach((item) => Object.freeze(item));
  return Object.freeze(items) as unknown as T[];
}

export function createAiAssistantMaterialSnapshot(
  contexts: AiResourceContext[],
  attachments: AiAttachment[],
): AiAssistantMaterialSnapshot {
  return {
    contextRefs: freezeSnapshotItems(contexts.map(cloneContextRef)),
    attachmentRefs: freezeSnapshotItems(attachments.map(cloneAttachmentRef)),
  };
}

function safeCloneArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  try {
    return JSON.parse(JSON.stringify(value)) as T[];
  } catch {
    return [];
  }
}

function normalizeContextRefs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AiResourceContext =>
        Boolean(item) &&
        typeof item === 'object' &&
        ['bookmark', 'note', 'file', 'tag'].includes(String((item as AiResourceContext).type)) &&
        Boolean(String((item as AiResourceContext).id || '').trim()),
    )
    .slice(0, 5)
    .map(cloneContextRef);
}

function normalizeAttachmentRefs(value: unknown) {
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
    .map(cloneAttachmentRef);
}

function normalizeTimestamp(value: unknown) {
  const date = new Date(typeof value === 'string' || typeof value === 'number' ? value : Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizePersistedMessage(value: unknown): AiAssistantMessage | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.role !== 'user' && raw.role !== 'assistant') return null;
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!content) return null;
  const contextRefs = normalizeContextRefs(raw.contextRefs || raw.contexts);
  const attachmentRefs = normalizeAttachmentRefs(raw.attachmentRefs);
  return {
    id: normalizeIdentityPart(raw.id, createAiAssistantMessageId(raw.role)),
    parentMessageId: typeof raw.parentMessageId === 'string' ? raw.parentMessageId : undefined,
    versionGroupId: typeof raw.versionGroupId === 'string' ? raw.versionGroupId : undefined,
    role: raw.role,
    content,
    timestamp: normalizeTimestamp(raw.timestamp),
    sources: safeCloneArray<AiSource>(raw.sources),
    evidence: safeCloneArray<AiEvidence>(raw.evidence),
    coverage:
      raw.coverage && typeof raw.coverage === 'object'
        ? safeCloneArray<Record<string, unknown>>([raw.coverage as Record<string, unknown>])[0] || null
        : null,
    citationAudit:
      raw.citationAudit && typeof raw.citationAudit === 'object'
        ? (safeCloneArray([raw.citationAudit])[0] as AiAssistantMessage['citationAudit'])
        : undefined,
    activity: sanitizeAiMessageActivity(raw.activity),
    cloudId: typeof raw.cloudId === 'string' ? raw.cloudId : undefined,
    requestId: typeof raw.requestId === 'string' ? raw.requestId : undefined,
    traceId: typeof raw.traceId === 'string' ? raw.traceId : undefined,
    recovered: raw.recovered === true,
    stage: typeof raw.stage === 'string' ? raw.stage : undefined,
    terminal:
      raw.terminal && typeof raw.terminal === 'object'
        ? (safeCloneArray([raw.terminal])[0] as AiAssistantMessage['terminal'])
        : undefined,
    feedback:
      raw.feedback && typeof raw.feedback === 'object'
        ? (safeCloneArray([raw.feedback])[0] as AiAssistantMessage['feedback'])
        : undefined,
    contexts: normalizeContextRefs(raw.contexts || raw.contextRefs),
    contextRefs: freezeSnapshotItems(contextRefs),
    attachmentRefs: freezeSnapshotItems(attachmentRefs),
    toolEvents: safeCloneArray<AiToolStatusItem>(raw.toolEvents),
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 3)
      : [],
    recommendationReady: Boolean(raw.recommendationReady),
    recommendationPending: false,
  };
}

function shouldPersistMessage(message: AiAssistantMessage) {
  return Boolean(
    message.content &&
    !message.transient &&
    !message.pendingConfirmationIds?.length &&
    !message.pendingInteractionIds?.length,
  );
}

function serializeMessage(message: AiAssistantMessage): Record<string, unknown> {
  return {
    id: message.id,
    parentMessageId: message.parentMessageId,
    versionGroupId: message.versionGroupId,
    role: message.role,
    content: message.content,
    timestamp: normalizeTimestamp(message.timestamp).toISOString(),
    sources: safeCloneArray<AiSource>(message.sources),
    evidence: safeCloneArray<AiEvidence>(message.evidence),
    coverage: message.coverage ? safeCloneArray([message.coverage])[0] : null,
    citationAudit: message.citationAudit ? safeCloneArray([message.citationAudit])[0] : undefined,
    activity: sanitizeAiMessageActivity(message.activity),
    cloudId: message.cloudId,
    requestId: message.requestId,
    traceId: message.traceId,
    recovered: message.recovered === true,
    stage: message.stage,
    terminal: message.terminal ? safeCloneArray([message.terminal])[0] : undefined,
    feedback: message.feedback ? safeCloneArray([message.feedback])[0] : undefined,
    toolEvents: safeCloneArray<AiToolStatusItem>(message.toolEvents),
    contexts: normalizeContextRefs(message.contexts || message.contextRefs),
    contextRefs: normalizeContextRefs(message.contextRefs || message.contexts),
    attachmentRefs: normalizeAttachmentRefs(message.attachmentRefs),
    recommendations: (message.recommendations || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 3),
    recommendationReady: Boolean(message.recommendationReady),
  };
}

function readPersistedState(identity: AiAssistantIdentity): AiAssistantPersistedState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(buildAiAssistantDomainKey(identity));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<AiAssistantPersistedState>;
    if (data.version !== 3 || !data.identity) return null;
    if (
      data.identity.actorUserId !== identity.actorUserId ||
      data.identity.subjectUserId !== identity.subjectUserId ||
      data.identity.adminContextMode !== identity.adminContextMode ||
      data.identity.adminContextId !== identity.adminContextId
    ) {
      return null;
    }
    return data as AiAssistantPersistedState;
  } catch {
    return null;
  }
}

function readLegacyV2SelfConversation(identity: AiAssistantIdentity): AiAssistantPersistedState | null {
  if (
    typeof localStorage === 'undefined' ||
    identity.adminContextMode !== 'self' ||
    identity.actorUserId !== identity.subjectUserId ||
    identity.adminContextId
  ) {
    return null;
  }
  const legacyKey = [
    LEGACY_V2_STORAGE_PREFIX,
    encodeURIComponent(identity.actorUserId),
    encodeURIComponent(identity.subjectUserId),
    encodeURIComponent(identity.adminContextMode),
  ].join(':');
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const data = JSON.parse(raw) as Omit<AiAssistantPersistedState, 'version' | 'identity'> & {
      version?: number;
      identity?: Partial<AiAssistantIdentity>;
    };
    if (
      data.version !== 2 ||
      data.identity?.actorUserId !== identity.actorUserId ||
      data.identity?.subjectUserId !== identity.subjectUserId ||
      data.identity?.adminContextMode !== 'self'
    ) {
      return null;
    }
    localStorage.removeItem(legacyKey);
    return { ...data, version: 3, identity } as AiAssistantPersistedState;
  } catch {
    return null;
  }
}

function readLegacySelfConversation(identity: AiAssistantIdentity): AiAssistantPersistedState | null {
  if (
    typeof localStorage === 'undefined' ||
    identity.adminContextMode !== 'self' ||
    identity.actorUserId !== identity.subjectUserId
  ) {
    return null;
  }
  const legacyKey = `${LEGACY_STORAGE_PREFIX}:${identity.actorUserId}`;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const data = JSON.parse(raw) as { messages?: unknown[]; sessionId?: unknown };
    if (!Array.isArray(data.messages)) return null;
    const migrated: AiAssistantPersistedState = {
      version: 3,
      identity: {
        actorUserId: identity.actorUserId,
        subjectUserId: identity.subjectUserId,
        adminContextMode: identity.adminContextMode,
        adminContextId: '',
      },
      draft: '',
      contextRefs: [],
      attachmentRefs: [],
      messages: data.messages as Array<Record<string, unknown>>,
      scrollTop: 0,
      shouldFollowMessages: true,
      showScrollToBottom: false,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
      conversationId: '',
      longChatHinted: false,
      scopeMode: 'workspace',
      temporarySession: false,
      edgeStatus: 'idle',
      savedAt: new Date().toISOString(),
    };
    localStorage.removeItem(legacyKey);
    return migrated;
  } catch {
    return null;
  }
}

function createInitialState(): AiAssistantState {
  return {
    initialized: false,
    identity: null,
    domainKey: '',
    runtimeIdentityKey: '',
    draft: '',
    contextRefs: [],
    attachmentRefs: [],
    messages: [],
    isLoading: false,
    hasAnswerStarted: false,
    shouldFollowMessages: true,
    showScrollToBottom: false,
    scrollTop: 0,
    sessionId: '',
    conversationId: '',
    longChatHinted: false,
    scopeMode: 'workspace',
    temporarySession: false,
    edgeStatus: 'idle',
    activeAssistantMessageId: null,
    requestEpoch: 0,
  };
}

export default defineStore('aiAssistant', {
  state: (): AiAssistantState => createInitialState(),
  actions: {
    initializePersistence() {
      const runtime = getRuntime(this as unknown as object);
      if (runtime.unsubscribe) return;
      runtime.unsubscribe = this.$subscribe(
        () => {
          this.schedulePersistence();
        },
        { detached: true },
      );
    },
    schedulePersistence() {
      if (!this.initialized || typeof window === 'undefined') return;
      const runtime = getRuntime(this as unknown as object);
      if (runtime.persistTimer) return;
      runtime.persistTimer = window.setTimeout(() => {
        runtime.persistTimer = null;
        this.persistCurrentConversation();
      }, PERSIST_THROTTLE_MS);
    },
    flushPersistence() {
      const runtime = getRuntime(this as unknown as object);
      if (runtime.persistTimer && typeof window !== 'undefined') window.clearTimeout(runtime.persistTimer);
      runtime.persistTimer = null;
      this.persistCurrentConversation();
    },
    persistCurrentConversation() {
      if (!this.initialized || !this.identity || typeof localStorage === 'undefined') return;
      const payload: AiAssistantPersistedState = {
        version: 3,
        identity: {
          actorUserId: this.identity.actorUserId,
          subjectUserId: this.identity.subjectUserId,
          adminContextMode: this.identity.adminContextMode,
          adminContextId: this.identity.adminContextId,
        },
        draft: this.draft,
        contextRefs: normalizeContextRefs(this.contextRefs),
        attachmentRefs: normalizeAttachmentRefs(this.attachmentRefs),
        messages: this.messages.filter(shouldPersistMessage).map(serializeMessage),
        scrollTop: Math.max(0, Number(this.scrollTop || 0)),
        shouldFollowMessages: Boolean(this.shouldFollowMessages),
        showScrollToBottom: Boolean(this.showScrollToBottom),
        sessionId: this.sessionId,
        conversationId: this.conversationId,
        longChatHinted: Boolean(this.longChatHinted),
        scopeMode: this.scopeMode,
        temporarySession: Boolean(this.temporarySession),
        edgeStatus: normalizeEdgeStatus(this.edgeStatus),
        savedAt: new Date().toISOString(),
      };
      getRuntime(this as unknown as object).conversationCache.set(this.domainKey, payload);
      try {
        localStorage.setItem(this.domainKey, JSON.stringify(payload));
      } catch {
        // 隐私模式或容量不足时仅降级为本次页面内的 Pinia 状态。
      }
    },
    switchConversation(identity: AiAssistantIdentity, greeting: string) {
      const normalizedIdentity: AiAssistantIdentity = {
        actorUserId: normalizeIdentityPart(identity.actorUserId, 'visitor'),
        subjectUserId: normalizeIdentityPart(identity.subjectUserId, identity.actorUserId || 'visitor'),
        adminContextMode: normalizeMode(identity.adminContextMode),
        adminContextId: String(identity.adminContextId || ''),
      };
      const nextRuntimeIdentityKey = buildAiAssistantRuntimeIdentityKey(normalizedIdentity);
      if (this.initialized && this.runtimeIdentityKey === nextRuntimeIdentityKey) return false;

      if (this.initialized) {
        this.abortActiveRequest();
        this.flushPersistence();
      } else {
        this.requestEpoch += 1;
      }

      const nextDomainKey = buildAiAssistantDomainKey(normalizedIdentity);
      const runtime = getRuntime(this as unknown as object);
      const persisted =
        runtime.conversationCache.get(nextDomainKey) ||
        readPersistedState(normalizedIdentity) ||
        readLegacyV2SelfConversation(normalizedIdentity) ||
        readLegacySelfConversation(normalizedIdentity);
      const restoredMessages = (persisted?.messages || [])
        .map(normalizePersistedMessage)
        .filter((item): item is AiAssistantMessage => Boolean(item));
      const fallbackGreeting: AiAssistantMessage = {
        id: createAiAssistantMessageId('assistant'),
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      };

      this.identity = normalizedIdentity;
      this.domainKey = nextDomainKey;
      this.runtimeIdentityKey = nextRuntimeIdentityKey;
      this.draft = typeof persisted?.draft === 'string' ? persisted.draft : '';
      this.contextRefs = normalizeContextRefs(persisted?.contextRefs);
      this.attachmentRefs = normalizeAttachmentRefs(persisted?.attachmentRefs);
      this.messages = restoredMessages.length ? restoredMessages : [fallbackGreeting];
      this.isLoading = false;
      this.hasAnswerStarted = false;
      this.shouldFollowMessages = persisted?.shouldFollowMessages !== false;
      this.showScrollToBottom = Boolean(persisted?.showScrollToBottom);
      this.scrollTop = Math.max(0, Number(persisted?.scrollTop || 0));
      this.sessionId = typeof persisted?.sessionId === 'string' ? persisted.sessionId : '';
      this.conversationId = typeof persisted?.conversationId === 'string' ? persisted.conversationId : '';
      this.longChatHinted = Boolean(persisted?.longChatHinted);
      // 检索范围已收敛为「始终整个知识空间」(已选材料仍会被优先带入),不再从持久化恢复旧的 selected。
      this.scopeMode = 'workspace';
      this.temporarySession = Boolean(persisted?.temporarySession);
      const restoredEdgeStatus = normalizeEdgeStatus(persisted?.edgeStatus);
      // 浏览器刷新后原请求控制器已不存在，不能把中断的请求永久伪装成仍在生成。
      this.edgeStatus = restoredEdgeStatus === 'generating' ? 'failed' : restoredEdgeStatus;
      this.activeAssistantMessageId = null;
      this.initialized = true;
      this.persistCurrentConversation();
      return true;
    },
    beginRequest(assistantMessageId: string): AiAssistantRequestLease {
      this.abortActiveRequest();
      this.requestEpoch += 1;
      const controller = new AbortController();
      const runtime = getRuntime(this as unknown as object);
      runtime.controller = controller;
      runtime.typewriter = null;
      this.activeAssistantMessageId = assistantMessageId;
      this.isLoading = true;
      this.hasAnswerStarted = false;
      this.edgeStatus = 'generating';
      this.persistCurrentConversation();
      return {
        domainKey: this.domainKey,
        runtimeIdentityKey: this.runtimeIdentityKey,
        epoch: this.requestEpoch,
        controller,
      };
    },
    attachRequestTypewriter(lease: AiAssistantRequestLease, typewriter: { cancel: () => void }) {
      if (!this.isRequestCurrent(lease)) {
        typewriter.cancel();
        return false;
      }
      getRuntime(this as unknown as object).typewriter = typewriter;
      return true;
    },
    clearRequestTypewriter(lease: AiAssistantRequestLease, typewriter: { cancel: () => void }) {
      if (!this.isRequestCurrent(lease)) return;
      const runtime = getRuntime(this as unknown as object);
      if (runtime.typewriter === typewriter) runtime.typewriter = null;
    },
    isRequestCurrent(lease: AiAssistantRequestLease) {
      return Boolean(
        this.initialized &&
        this.domainKey === lease.domainKey &&
        this.runtimeIdentityKey === lease.runtimeIdentityKey &&
        this.requestEpoch === lease.epoch &&
        !lease.controller.signal.aborted,
      );
    },
    finishRequest(lease: AiAssistantRequestLease, edgeStatus: Exclude<AiAssistantEdgeStatus, 'generating'>) {
      if (!this.isRequestCurrent(lease)) return false;
      const runtime = getRuntime(this as unknown as object);
      if (runtime.controller === lease.controller) runtime.controller = null;
      runtime.typewriter = null;
      this.isLoading = false;
      this.activeAssistantMessageId = null;
      this.edgeStatus = normalizeEdgeStatus(edgeStatus);
      this.persistCurrentConversation();
      return true;
    },
    abortActiveRequest() {
      const runtime = getRuntime(this as unknown as object);
      const activeMessageId = this.activeAssistantMessageId;
      runtime.typewriter?.cancel();
      runtime.typewriter = null;
      runtime.controller?.abort();
      runtime.controller = null;
      this.requestEpoch += 1;
      this.isLoading = false;
      this.hasAnswerStarted = false;
      this.activeAssistantMessageId = null;
      if (this.edgeStatus === 'generating') this.edgeStatus = 'idle';
      return activeMessageId;
    },
    markEdgeNeedsAttention() {
      this.edgeStatus = 'needs_attention';
      this.persistCurrentConversation();
    },
    acknowledgeEdgeStatus() {
      if (this.edgeStatus === 'idle' || this.edgeStatus === 'generating') return false;
      this.edgeStatus = 'idle';
      this.persistCurrentConversation();
      return true;
    },
    setSessionIdForRequest(lease: AiAssistantRequestLease, value: string) {
      if (!this.isRequestCurrent(lease)) return false;
      this.sessionId = value;
      return true;
    },
    clearCurrentConversation(greeting: string) {
      this.abortActiveRequest();
      getRuntime(this as unknown as object).conversationCache.delete(this.domainKey);
      if (this.domainKey && typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(this.domainKey);
        } catch {
          // ignore
        }
      }
      this.draft = '';
      this.contextRefs = [];
      this.attachmentRefs = [];
      this.messages = [
        {
          id: createAiAssistantMessageId('assistant'),
          role: 'assistant',
          content: greeting,
          timestamp: new Date(),
        },
      ];
      this.shouldFollowMessages = true;
      this.showScrollToBottom = false;
      this.scrollTop = 0;
      this.sessionId = '';
      this.conversationId = '';
      this.longChatHinted = false;
      this.scopeMode = 'workspace';
      this.temporarySession = false;
      this.edgeStatus = 'idle';
      this.persistCurrentConversation();
    },
    setCloudConversationId(conversationId: string) {
      this.conversationId = String(conversationId || '').trim();
      this.schedulePersistence();
    },
  },
});
