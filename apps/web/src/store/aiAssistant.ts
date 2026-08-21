import { defineStore } from 'pinia';
import type { AiAttachment } from '@/api/aiAttachmentApi';
import type { AiSource } from '@/components/aiAssistant/aiSourceNavigation';
import type { GlobalSearchType } from '@/api/search';
import type { AiAgentInteraction, AiToolConfirmation } from '@/types/aiAgent';
import type { AiConversationActionSettlement } from '@/components/aiAssistant/aiConversationState';
import type { AiEvidence } from '@/api/aiWorkspaceApi';
import { sanitizeAiMessageActivity } from '@/utils/aiMemoryInfluence';
import { compareAiConversationRecency, type AiConversationRecency } from '@/utils/aiConversationContinuity';
import type { AiResourceContext, AiScopeRef } from '@/types/aiScope';
import { normalizeAiArtifacts, type AiArtifact } from '@/types/aiArtifact';
import { normalizeAiCapabilityModule, type AiCapabilityModule } from '@/types/aiCapabilityScope';
import { normalizeAiQueryScopes, type AiQueryScope } from '@/types/aiQueryScope';
import {
  normalizeAiMaterialClarification,
  normalizeAiResolvedGrounding,
  type AiMaterialClarification,
  type AiResolvedGrounding,
} from '@/types/aiGrounding';

interface AiToolStatusItem {
  name: string;
  status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
  round?: number;
}

export type AiAssistantAdminContextMode = 'self' | 'readonly' | 'maintain';
export type AiAssistantScopeMode = 'selected' | 'workspace';
export type AiAssistantEdgeStatus = 'idle' | 'generating' | 'completed' | 'needs_attention' | 'failed';
export type AiAssistantRequestResult = 'completed' | 'failed' | 'stopped';
export type AiAssistantAbortReason =
  'user_stop' | 'new_conversation' | 'conversation_switch' | 'identity_change' | 'superseded' | 'app_shutdown';

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
  /** 服务端返回的安全实体锚点；只含 type/id/title，用于明确承接式追问。 */
  entityRefs?: AiResourceContext[];
  evidence?: AiEvidence[];
  coverage?: Record<string, unknown> | null;
  citationAudit?: { citedKeys: string[]; invalidKeys: string[]; verifiedCitationCount: number; evidenceCount: number };
  /** 服务端裁决后的材料边界摘要；不含资源 ID、标题或正文。 */
  resolvedGrounding?: AiResolvedGrounding;
  materialClarification?: AiMaterialClarification;
  /** 服务端签发的安全查询口径；只用于持久化与核验，不参与下一轮材料或工具选择。 */
  queryScopes?: AiQueryScope[];
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
  /** 与单个材料分离的目录检索范围快照。 */
  scopeRefs?: AiScopeRef[];
  /** 发送瞬间的不可变附件快照，重试/重新生成只能读取该字段。 */
  attachmentRefs?: AiAttachment[];
  /** 用户发送时显式选择的本轮能力模块；auto 不限制工具领域。 */
  capabilityModule?: AiCapabilityModule;
  transient?: boolean;
  transientGroupId?: string;
  pendingConfirmationIds?: string[];
  pendingInteractionIds?: string[];
  confirmationSucceeded?: boolean;
  persistAfterConfirmationSettlement?: boolean;
  /** 不含令牌和执行参数的安全结算结果，可写入本地与云端历史。 */
  actionSettlements?: AiConversationActionSettlement[];
  recommendations?: string[];
  recommendationReady?: boolean;
  recommendationPending?: boolean;
  /** 服务端签发的结构化业务事实卡片；模型正文不能覆盖其状态与数字。 */
  artifacts?: AiArtifact[];
  /** 卡片成功后的内部续答，不对应一条用户消息，也禁止按普通提问重新生成。 */
  generatedBy?: 'action_continuation';
}

export interface AiAssistantMaterialSnapshot {
  contextRefs: AiResourceContext[];
  scopeRefs: AiScopeRef[];
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
  scopeRefs: AiScopeRef[];
  attachmentRefs: AiAttachment[];
  messages: Array<Record<string, unknown>>;
  scrollTop: number;
  shouldFollowMessages: boolean;
  showScrollToBottom: boolean;
  sessionId: string;
  conversationId: string;
  /** 云端会话已在其他设备删除；保留本机历史，等待用户明确决定是否恢复。 */
  staleCloudConversationId?: string;
  /** 本设备最后确认过的云端最新会话位置，用于避免同一跨设备更新反复询问。 */
  cloudConversationCheckpointId?: string;
  cloudConversationCheckpointAt?: string;
  /**
   * 用户主动新建了对话、但还没发出第一条消息。
   *
   * 此时本地没有 conversationId，而"没有 conversationId"默认会去加载云端最近活跃会话
   * （给新设备接上历史用）。这个标记把"用户要空白对话"和"新设备首次打开"区分开，
   * 否则新建对话会被静默退回旧会话。随载荷持久化：移动端页面被系统回收是用户无感的，
   * 只放内存会让同一个"划走再回来"时好时坏。发出第一条消息或打开任意会话后清除。
   */
  newConversationPending?: boolean;
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
  scopeRefs: AiScopeRef[];
  attachmentRefs: AiAttachment[];
  messages: AiAssistantMessage[];
  isLoading: boolean;
  hasAnswerStarted: boolean;
  shouldFollowMessages: boolean;
  showScrollToBottom: boolean;
  scrollTop: number;
  sessionId: string;
  conversationId: string;
  staleCloudConversationId: string;
  cloudConversationCheckpointId: string;
  cloudConversationCheckpointAt: string;
  /** 见 AiAssistantPersistedState.newConversationPending */
  newConversationPending: boolean;
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
  abortHandler: ((reason: AiAssistantAbortReason) => void) | null;
  attachedViews: Set<symbol>;
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
      abortHandler: null,
      attachedViews: new Set(),
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

function cloneScopeRef(value: AiScopeRef): AiScopeRef {
  return {
    type: value.type,
    id: String(value.id),
    title: String(value.title || ''),
    ...(Number.isFinite(Number(value.estimatedResourceCount))
      ? { estimatedResourceCount: Math.max(1, Number(value.estimatedResourceCount)) }
      : {}),
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
  scopes: AiScopeRef[] = [],
): AiAssistantMaterialSnapshot {
  return {
    contextRefs: freezeSnapshotItems(contexts.map(cloneContextRef)),
    scopeRefs: freezeSnapshotItems(scopes.map(cloneScopeRef)),
    attachmentRefs: freezeSnapshotItems(attachments.map(cloneAttachmentRef)),
  };
}

export interface AiAssistantPendingNoteDraftReference {
  confirmationId: string;
  confirmationToken: string;
}

/**
 * 返回当前会话最近一张仍有效的 create_note 确认卡，仅作为服务端语义判断的候选上下文。
 * 前端不解释用户句式，也不决定是否改写；服务端验证令牌、owner 与 session 后再做语义分类。
 */
export function resolveAiAssistantPendingNoteDraftReference(
  messages: AiAssistantMessage[],
): AiAssistantPendingNoteDraftReference | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    // 普通误答不会让仍在页面上且未过期的确认卡失去上下文；继续向前寻找最近的待确认动作。
    if (!message.pendingConfirmationIds?.length) {
      // 取消、过期、已执行或已被替换的 create_note 是草稿生命周期边界。
      // 跨过这个边界去找更早的卡片，会把本轮续写绑到旧令牌；材料续用应由
      // entityRefs / sources 的稳定引用单独承担。
      if ((message.actionSettlements || []).some((item) => item.toolName === 'create_note')) return null;
      continue;
    }
    const pendingIds = new Set(message.pendingConfirmationIds);
    const confirmations = [...(message.confirmations || [])].reverse().filter((item) => pendingIds.has(item.id));
    // 有待确认 ID 却没有对应详情时，不能越过未知的新动作去操作更早的卡片。
    if (!confirmations.length) return null;
    const confirmation = confirmations.find(
      (item) =>
        !item.expiresAt || (Number.isFinite(Date.parse(item.expiresAt)) && Date.parse(item.expiresAt) > Date.now()),
    );
    // 此轮动作均已过期时继续寻找；更晚的有效动作不是笔记草稿时则不得越过。
    if (!confirmation) {
      // 最新一轮确实是 create_note，但已过期时不得回退到更早草稿。
      if (confirmations.some((item) => item.toolName === 'create_note')) return null;
      continue;
    }
    if (confirmation.toolName !== 'create_note') return null;
    if (!confirmation.id || !/^[A-Za-z0-9_-]{40,}$/.test(String(confirmation.token || ''))) return null;
    return { confirmationId: confirmation.id, confirmationToken: confirmation.token };
  }
  return null;
}

/**
 * 从最新助手回答实际使用过的来源反查父级用户消息材料。
 * 确认类回答可能没有形成普通来源，此时仅对同一动作轮回退到其父消息的原始材料。
 */
export function resolveAiAssistantFollowUpMaterialSnapshot(
  messages: AiAssistantMessage[],
): AiAssistantMaterialSnapshot | null {
  let assistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      assistantIndex = index;
      break;
    }
  }
  if (assistantIndex < 0) return null;
  const assistant = messages[assistantIndex];
  let parentIndex = assistant.parentMessageId
    ? messages.findIndex(
        (message) =>
          message.role === 'user' &&
          (message.id === assistant.parentMessageId || message.cloudId === assistant.parentMessageId),
      )
    : -1;
  if (parentIndex < 0) {
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') {
        parentIndex = index;
        break;
      }
    }
  }
  if (parentIndex < 0) return null;
  const parent = messages[parentIndex];
  const parentContexts = parent.contextRefs || parent.contexts || [];
  const parentScopes = parent.scopeRefs || [];
  const parentAttachments = parent.attachmentRefs || [];

  const supportedEntityTypes = new Set<GlobalSearchType>(['bookmark', 'note', 'file', 'tag', 'todo']);
  const parentContextMap = new Map(parentContexts.map((item) => [`${item.type}:${item.id}`, item]));
  const sourceContextRefs = [
    ...(assistant.entityRefs || []),
    ...(assistant.sources || []).map((source) => ({
      type: source.type,
      id: source.resourceId || source.id,
      title: source.title,
    })),
  ]
    .map((source) => {
      const type = String(source.type || '') as GlobalSearchType;
      const id = String(source.id || '').trim();
      if (!supportedEntityTypes.has(type) || !id) return null;
      const parentContext = parentContextMap.get(`${type}:${id}`);
      return {
        type,
        id,
        title: String(source.title || parentContext?.title || '').slice(0, 255),
      };
    })
    .filter((item): item is AiResourceContext => Boolean(item));
  const contextRefs = sourceContextRefs.filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate.type === item.type && candidate.id === item.id) === index,
  );
  const sourceKeys = new Set(
    (assistant.sources || [])
      .map((source) => `${source.type}:${source.resourceId || source.id}`)
      .filter((key) => !key.endsWith(':')),
  );
  let attachmentRefs = parentAttachments.filter(
    (item) => sourceKeys.has(`document:${item.id}`) || sourceKeys.has(`file:${item.fileId || item.id}`),
  );

  const isActionRound = Boolean(
    assistant.pendingConfirmationIds?.length ||
    assistant.pendingInteractionIds?.length ||
    assistant.persistAfterConfirmationSettlement ||
    assistant.actionSettlements?.length,
  );
  if (!contextRefs.length && !attachmentRefs.length && !parentScopes.length && isActionRound) {
    contextRefs.push(...parentContexts);
    attachmentRefs = parentAttachments;
  }
  if (!contextRefs.length && !attachmentRefs.length && !parentScopes.length) return null;
  return createAiAssistantMaterialSnapshot(contextRefs, attachmentRefs, parentScopes);
}

/**
 * 返回最近一次服务端成功回答签发的 Source Set。新客户端只续传这个短期 ID，
 * 不再从消息展示字段反向拼装材料引用；实际引用由服务端按 owner 和 session 重新解析。
 */
export function resolveAiAssistantSourceSetId(messages: AiAssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const sourceSetId = String(message.resolvedGrounding?.sourceSetId || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sourceSetId)) return sourceSetId;
    // 澄清消息不替代原回答的材料集合；其余任何新助手终态都是材料生命周期边界。
    if (message.materialClarification) continue;
    return '';
  }
  return '';
}

/**
 * Source Set 候选只是服务端签发的短期稳定句柄，不等于授权继承。客户端不再用关键词
 * 白名单猜测“总结网页内容”之类省略式追问；只要最近回答带有真实 Source Set 就提交候选，
 * 由服务端结合完整语义三态判断承接、独立或澄清。工作区公开引用仍不能冒充 Source Set。
 */
export function resolveAiAssistantSourceSetCandidateId(messages: AiAssistantMessage[]) {
  return resolveAiAssistantSourceSetId(messages);
}

export function resolveAiAssistantMaterialClarificationToken(messages: AiAssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const clarification = normalizeAiMaterialClarification(message.materialClarification);
    if (!clarification) return '';
    if (Date.parse(clarification.expiresAt) <= Date.now()) return '';
    return clarification.token;
  }
  return '';
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
        ['bookmark', 'note', 'file', 'tag', 'todo'].includes(String((item as AiResourceContext).type)) &&
        Boolean(String((item as AiResourceContext).id || '').trim()),
    )
    .slice(0, 5)
    .map(cloneContextRef);
}

function normalizeScopeRefs(value: unknown) {
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
      const key = `${item.type}:${String(item.id).trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map(cloneScopeRef);
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

function normalizePendingConfirmations(value: unknown): AiToolConfirmation[] {
  const now = Date.now();
  return safeCloneArray<AiToolConfirmation>(value).filter((confirmation) => {
    const expiresAt = Date.parse(String(confirmation?.expiresAt || ''));
    return Boolean(
      confirmation &&
      String(confirmation.token || '').trim() &&
      String(confirmation.id || '').trim() &&
      String(confirmation.sessionId || '').trim() &&
      String(confirmation.toolName || '').trim() &&
      Number.isFinite(expiresAt) &&
      expiresAt > now,
    );
  });
}

function normalizeActionSettlements(value: unknown): AiConversationActionSettlement[] {
  if (!Array.isArray(value)) return [];
  const allowedStatuses = new Set(['confirmed', 'cancelled', 'editing', 'failed', 'expired']);
  return safeCloneArray<AiConversationActionSettlement>(value)
    .filter(
      (item) =>
        item &&
        String(item.confirmationId || '').trim() &&
        String(item.toolName || '').trim() &&
        allowedStatuses.has(String(item.status)) &&
        String(item.settledAt || '').trim(),
    )
    .slice(-20)
    .map((item) => ({
      confirmationId: String(item.confirmationId).slice(0, 128),
      toolName: String(item.toolName).slice(0, 64),
      status: item.status,
      summary: String(item.summary || '').slice(0, 500),
      settledAt: String(item.settledAt),
    }));
}

function normalizePersistedMessage(value: unknown): AiAssistantMessage | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.role !== 'user' && raw.role !== 'assistant') return null;
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!content) return null;
  const contextRefs = normalizeContextRefs(raw.contextRefs || raw.contexts);
  const scopeRefs = normalizeScopeRefs(raw.scopeRefs);
  const attachmentRefs = normalizeAttachmentRefs(raw.attachmentRefs);
  const rawPendingConfirmationIds = Array.isArray(raw.pendingConfirmationIds)
    ? raw.pendingConfirmationIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const pendingIdSet = new Set(rawPendingConfirmationIds);
  // 终态确认卡必须从可操作集合中移除。兼容旧缓存中“pending ID 已清、令牌仍残留”的幽灵卡。
  const confirmations = normalizePendingConfirmations(raw.confirmations).filter((confirmation) =>
    pendingIdSet.has(confirmation.id),
  );
  const confirmationIds = new Set(confirmations.map((confirmation) => confirmation.id));
  const pendingConfirmationIds = rawPendingConfirmationIds.filter((id) => confirmationIds.has(id));
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
    resolvedGrounding: normalizeAiResolvedGrounding(raw.resolvedGrounding),
    materialClarification: normalizeAiMaterialClarification(raw.materialClarification),
    queryScopes: normalizeAiQueryScopes(raw.queryScopes),
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
    scopeRefs: freezeSnapshotItems(scopeRefs),
    entityRefs: normalizeContextRefs(raw.entityRefs),
    attachmentRefs: freezeSnapshotItems(attachmentRefs),
    capabilityModule: normalizeAiCapabilityModule(raw.capabilityModule),
    confirmations,
    transient: raw.transient === true,
    transientGroupId: typeof raw.transientGroupId === 'string' ? raw.transientGroupId : undefined,
    pendingConfirmationIds,
    confirmationSucceeded: raw.confirmationSucceeded === true,
    persistAfterConfirmationSettlement: raw.persistAfterConfirmationSettlement === true,
    actionSettlements: normalizeActionSettlements(raw.actionSettlements),
    toolEvents: safeCloneArray<AiToolStatusItem>(raw.toolEvents),
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 3)
      : [],
    recommendationReady: Boolean(raw.recommendationReady),
    recommendationPending: false,
    artifacts: normalizeAiArtifacts(raw.artifacts),
    generatedBy: raw.generatedBy === 'action_continuation' ? 'action_continuation' : undefined,
  };
}

function shouldPersistMessage(message: AiAssistantMessage, activePendingGroups: Set<string>) {
  if (!message.content || message.pendingInteractionIds?.length) return false;
  if (!message.transient && !message.pendingConfirmationIds?.length) return true;
  return Boolean(message.transientGroupId && activePendingGroups.has(message.transientGroupId));
}

function serializeMessage(message: AiAssistantMessage): Record<string, unknown> {
  const pendingConfirmationIds = [...new Set(message.pendingConfirmationIds || [])];
  const pendingIdSet = new Set(pendingConfirmationIds);
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
    resolvedGrounding: normalizeAiResolvedGrounding(message.resolvedGrounding),
    materialClarification: normalizeAiMaterialClarification(message.materialClarification),
    queryScopes: normalizeAiQueryScopes(message.queryScopes),
    activity: sanitizeAiMessageActivity(message.activity),
    cloudId: message.cloudId,
    requestId: message.requestId,
    traceId: message.traceId,
    artifacts: normalizeAiArtifacts(message.artifacts),
    generatedBy: message.generatedBy,
    recovered: message.recovered === true,
    stage: message.stage,
    terminal: message.terminal ? safeCloneArray([message.terminal])[0] : undefined,
    feedback: message.feedback ? safeCloneArray([message.feedback])[0] : undefined,
    toolEvents: safeCloneArray<AiToolStatusItem>(message.toolEvents),
    contexts: normalizeContextRefs(message.contexts || message.contextRefs),
    contextRefs: normalizeContextRefs(message.contextRefs || message.contexts),
    scopeRefs: normalizeScopeRefs(message.scopeRefs),
    entityRefs: normalizeContextRefs(message.entityRefs),
    attachmentRefs: normalizeAttachmentRefs(message.attachmentRefs),
    capabilityModule: normalizeAiCapabilityModule(message.capabilityModule),
    confirmations: normalizePendingConfirmations(message.confirmations).filter((confirmation) =>
      pendingIdSet.has(confirmation.id),
    ),
    transient: Boolean(message.transient),
    transientGroupId: message.transientGroupId,
    pendingConfirmationIds,
    confirmationSucceeded: Boolean(message.confirmationSucceeded),
    persistAfterConfirmationSettlement: Boolean(message.persistAfterConfirmationSettlement),
    actionSettlements: normalizeActionSettlements(message.actionSettlements),
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
      scopeRefs: [],
      attachmentRefs: [],
      messages: data.messages as Array<Record<string, unknown>>,
      scrollTop: 0,
      shouldFollowMessages: true,
      showScrollToBottom: false,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
      conversationId: '',
      staleCloudConversationId: '',
      cloudConversationCheckpointId: '',
      cloudConversationCheckpointAt: '',
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
    scopeRefs: [],
    attachmentRefs: [],
    messages: [],
    isLoading: false,
    hasAnswerStarted: false,
    shouldFollowMessages: true,
    showScrollToBottom: false,
    scrollTop: 0,
    sessionId: '',
    conversationId: '',
    staleCloudConversationId: '',
    cloudConversationCheckpointId: '',
    cloudConversationCheckpointAt: '',
    newConversationPending: false,
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
      const activePendingGroups = new Set<string>(
        this.messages
          .filter(
            (message) =>
              message.pendingConfirmationIds?.length && normalizePendingConfirmations(message.confirmations).length,
          )
          .map((message) => String(message.transientGroupId || '').trim())
          .filter(Boolean),
      );
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
        scopeRefs: normalizeScopeRefs(this.scopeRefs),
        attachmentRefs: normalizeAttachmentRefs(this.attachmentRefs),
        messages: this.messages
          .filter((message) => shouldPersistMessage(message, activePendingGroups))
          .map(serializeMessage),
        scrollTop: Math.max(0, Number(this.scrollTop || 0)),
        shouldFollowMessages: Boolean(this.shouldFollowMessages),
        showScrollToBottom: Boolean(this.showScrollToBottom),
        sessionId: this.sessionId,
        conversationId: this.conversationId,
        staleCloudConversationId: this.staleCloudConversationId,
        cloudConversationCheckpointId: this.cloudConversationCheckpointId,
        cloudConversationCheckpointAt: this.cloudConversationCheckpointAt,
        newConversationPending: Boolean(this.newConversationPending),
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
        this.abortActiveRequest('identity_change');
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
      const restoredCandidates = (persisted?.messages || [])
        .map(normalizePersistedMessage)
        .filter((item): item is AiAssistantMessage => Boolean(item));
      const activePendingGroups = new Set<string>(
        restoredCandidates
          .filter((item) => item.pendingConfirmationIds?.length && item.confirmations?.length)
          .map((item) => String(item.transientGroupId || '').trim())
          .filter(Boolean),
      );
      const restoredMessages = restoredCandidates.filter(
        (item) => !item.transient || activePendingGroups.has(String(item.transientGroupId || '').trim()),
      );
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
      this.scopeRefs = normalizeScopeRefs(persisted?.scopeRefs);
      this.attachmentRefs = normalizeAttachmentRefs(persisted?.attachmentRefs);
      this.messages = restoredMessages.length ? restoredMessages : [fallbackGreeting];
      this.isLoading = false;
      this.hasAnswerStarted = false;
      this.shouldFollowMessages = persisted?.shouldFollowMessages !== false;
      this.showScrollToBottom = Boolean(persisted?.showScrollToBottom);
      this.scrollTop = Math.max(0, Number(persisted?.scrollTop || 0));
      this.sessionId = typeof persisted?.sessionId === 'string' ? persisted.sessionId : '';
      this.conversationId = typeof persisted?.conversationId === 'string' ? persisted.conversationId : '';
      this.staleCloudConversationId =
        typeof persisted?.staleCloudConversationId === 'string' ? persisted.staleCloudConversationId.trim() : '';
      this.cloudConversationCheckpointId =
        typeof persisted?.cloudConversationCheckpointId === 'string'
          ? persisted.cloudConversationCheckpointId.trim()
          : '';
      this.cloudConversationCheckpointAt =
        typeof persisted?.cloudConversationCheckpointAt === 'string'
          ? persisted.cloudConversationCheckpointAt.trim()
          : '';
      // 旧载荷没有这个字段 → false，行为与升级前完全一致，不需要 bump 版本
      this.newConversationPending = Boolean(persisted?.newConversationPending);
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
    /**
     * 发送后消费输入区材料(引用/附件默认一次性,P0-A)。
     * 按快照身份过滤而非清空数组:创建快照到真正发送之间是异步流程,
     * 期间用户可能又挂了新材料,不能被旧快照连带清掉。
     * 附件在这里只是「从输入区解除挂载」,不调用删除接口 —— 服务端对象
     * 由用户显式删除或 TTL 回收;消息里的不可变快照仍保留完整记录。
     */
    consumeComposerMaterials(snapshot: AiAssistantMaterialSnapshot) {
      const sentContextKeys = new Set(snapshot.contextRefs.map((item) => `${item.type}:${item.id}`));
      const sentScopeKeys = new Set(snapshot.scopeRefs.map((item) => `${item.type}:${item.id}`));
      const sentAttachmentIds = new Set(snapshot.attachmentRefs.map((item) => String(item.id)));
      this.contextRefs = this.contextRefs.filter((item) => !sentContextKeys.has(`${item.type}:${item.id}`));
      this.scopeRefs = this.scopeRefs.filter((item) => !sentScopeKeys.has(`${item.type}:${item.id}`));
      this.attachmentRefs = this.attachmentRefs.filter((item) => !sentAttachmentIds.has(String(item.id)));
      this.persistCurrentConversation();
    },
    /**
     * 会话边界清理:待发送材料的生命周期不能长于消息历史的会话边界,
     * 否则会话 A 挂的标签会跟着用户进入会话 B(切换云会话/跨设备恢复)。
     */
    detachAllComposerMaterials() {
      if (!this.contextRefs.length && !this.scopeRefs.length && !this.attachmentRefs.length) return;
      this.contextRefs = [];
      this.scopeRefs = [];
      this.attachmentRefs = [];
      this.persistCurrentConversation();
    },
    beginRequest(assistantMessageId: string): AiAssistantRequestLease {
      this.abortActiveRequest('superseded');
      this.requestEpoch += 1;
      const controller = new AbortController();
      const runtime = getRuntime(this as unknown as object);
      runtime.controller = controller;
      runtime.typewriter = null;
      runtime.abortHandler = null;
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
    attachRequestAbortHandler(lease: AiAssistantRequestLease, handler: (reason: AiAssistantAbortReason) => void) {
      if (!this.isRequestCurrent(lease)) return false;
      getRuntime(this as unknown as object).abortHandler = handler;
      return true;
    },
    attachView(viewId: symbol) {
      getRuntime(this as unknown as object).attachedViews.add(viewId);
    },
    detachView(viewId: symbol) {
      getRuntime(this as unknown as object).attachedViews.delete(viewId);
    },
    hasAttachedView() {
      return getRuntime(this as unknown as object).attachedViews.size > 0;
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
      runtime.abortHandler = null;
      this.isLoading = false;
      this.activeAssistantMessageId = null;
      this.edgeStatus = normalizeEdgeStatus(edgeStatus);
      this.persistCurrentConversation();
      return true;
    },
    abortActiveRequest(reason: AiAssistantAbortReason = 'user_stop') {
      const runtime = getRuntime(this as unknown as object);
      const activeMessageId = this.activeAssistantMessageId;
      const abortHandler = runtime.abortHandler;
      runtime.abortHandler = null;
      if (runtime.controller && abortHandler) {
        try {
          abortHandler(reason);
        } catch {
          // 终止请求是账号与会话隔离边界；埋点或界面收尾异常不能阻止真正 abort。
        }
      }
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
      this.abortActiveRequest('new_conversation');
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
      this.scopeRefs = [];
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
      this.staleCloudConversationId = '';
      // 记下"用户要的是空白对话"。没有这个标记时，空的 conversationId 会被当成
      // "新设备首次打开"而去加载云端最近活跃会话，把用户刚新建的对话静默顶掉。
      // 上面的 removeItem 只是清掉旧载荷，末尾的 persist 会把带标记的新载荷写回去。
      this.newConversationPending = true;
      this.longChatHinted = false;
      this.scopeMode = 'workspace';
      this.temporarySession = false;
      this.edgeStatus = 'idle';
      this.persistCurrentConversation();
    },
    setCloudConversationId(conversationId: string) {
      const nextConversationId = String(conversationId || '').trim();
      this.conversationId = nextConversationId;
      // 有了具体会话，"要空白对话"的意图就结束了：发出第一条消息(创建会话)和打开任意会话
      // 都必经这里。传空串的调用(云历史关闭、云端会话已删除)不能清标记 —— 那些情况下
      // 同样不该去恢复最近会话。
      if (nextConversationId) this.newConversationPending = false;
      this.schedulePersistence();
    },
    markCloudConversationCheckpoint(conversationId: string, lastMessageAt: string) {
      const candidate: AiConversationRecency = {
        id: String(conversationId || '').trim(),
        lastMessageAt: String(lastMessageAt || '').trim(),
      };
      if (!candidate.id || !candidate.lastMessageAt || Number.isNaN(new Date(candidate.lastMessageAt).getTime())) {
        return false;
      }
      const current =
        this.cloudConversationCheckpointId && this.cloudConversationCheckpointAt
          ? {
              id: this.cloudConversationCheckpointId,
              lastMessageAt: this.cloudConversationCheckpointAt,
            }
          : null;
      if (current && compareAiConversationRecency(candidate, current) <= 0) return false;
      this.cloudConversationCheckpointId = candidate.id;
      this.cloudConversationCheckpointAt = candidate.lastMessageAt;
      this.schedulePersistence();
      return true;
    },
    markCloudConversationMissing(conversationId: string) {
      const normalizedId = String(conversationId || '').trim();
      if (!normalizedId) return false;
      if (this.conversationId === normalizedId) this.conversationId = '';
      this.staleCloudConversationId = normalizedId;
      this.schedulePersistence();
      return true;
    },
    clearCloudConversationRecovery() {
      if (!this.staleCloudConversationId) return false;
      this.staleCloudConversationId = '';
      this.schedulePersistence();
      return true;
    },
  },
});
