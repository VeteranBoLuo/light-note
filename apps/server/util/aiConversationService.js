import crypto from 'node:crypto';
import pool from '../db/index.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';
import { stableAgentErrorCode } from './agent/logSafety.js';
import { normalizeAiMemoryInfluenceMetadata } from './agent/memoryRuntime.js';

const CONVERSATION_STATUSES = new Set(['active', 'archived']);
const MESSAGE_ROLES = new Set(['user', 'assistant', 'system']);
const MESSAGE_STATUSES = new Set(['generating', 'completed', 'failed', 'stopped']);
const RETENTION_MODES = new Set(['standard', 'temporary', 'indefinite']);
const FEEDBACK_RATINGS = new Set(['helpful', 'unhelpful']);
const FEEDBACK_REASONS = new Set([
  'incorrect',
  'unsupported',
  'outdated',
  'irrelevant',
  'unsafe_action',
  'hard_to_use',
  'other',
]);
const DEFAULT_TEMPORARY_RETENTION_MS = 24 * 60 * 60 * 1000;
const MIN_TEMPORARY_RETENTION_MS = 60 * 1000;
const MAX_TEMPORARY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MIN_RETENTION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DELETE_UNDO_MS = 15 * 1000;
const MIN_DELETE_UNDO_MS = 5 * 1000;
const MAX_DELETE_UNDO_MS = 2 * 60 * 1000;
const LIVE_RETENTION_SQL =
  "(retention_mode <> 'temporary' OR (expire_at IS NOT NULL AND expire_at > CURRENT_TIMESTAMP))";

let retentionCleanupTimer = null;

function serviceError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  error.isAiConversationError = true;
  return error;
}

function asString(value, maxLength, fallback = '') {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonValue(value, fallback) {
  const normalized = value == null ? fallback : value;
  try {
    return JSON.stringify(normalized);
  } catch {
    throw serviceError('INVALID_JSON', '提交的数据无法序列化');
  }
}

function boundedArray(value, max, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw serviceError('INVALID_ARGUMENT', `${field} 必须是数组`);
  if (value.length > max) throw serviceError('TOO_MANY_ITEMS', `${field} 最多允许 ${max} 项`);
  return value;
}

function normalizeMessageActivity(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((item) => {
    if (!item || typeof item !== 'object' || item.event !== 'memory_context') return item;
    return { event: 'memory_context', ...normalizeAiMemoryInfluenceMetadata(item) };
  });
}

function normalizeMode(mode) {
  return ['readonly', 'maintain'].includes(mode) ? mode : 'normal';
}

function normalizedOwner(identity) {
  const actorUserId = asString(identity?.actorUserId, 64);
  const subjectUserId = asString(identity?.subjectUserId, 64);
  const adminContextMode = normalizeMode(identity?.adminContextMode);
  if (!actorUserId || !subjectUserId) {
    throw serviceError('AI_IDENTITY_INVALID', 'AI 会话身份上下文无效', 403);
  }
  const submittedContextId = asString(identity?.adminContextId, 64) || null;
  if (adminContextMode === 'normal' && submittedContextId) {
    throw serviceError('AI_IDENTITY_INVALID', '普通会话身份不能携带管理员上下文', 403);
  }
  if (adminContextMode !== 'normal' && !submittedContextId) {
    throw serviceError('AI_IDENTITY_INVALID', '管理员会话身份缺少上下文标识', 403);
  }
  return {
    actorUserId,
    subjectUserId,
    adminContextMode,
    adminContextId: adminContextMode === 'normal' ? null : submittedContextId,
  };
}

export function assertAiConversationWritable(identity) {
  const owner = normalizedOwner(identity);
  if (owner.adminContextMode === 'readonly') {
    throw serviceError('ADMIN_PREVIEW_READONLY', '管理员当前处于只读预览模式，不能修改 AI 持久数据', 403);
  }
  return owner;
}

function normalizeTemporaryExpireAt(value, now = Date.now()) {
  const candidate = value == null || value === '' ? new Date(now + DEFAULT_TEMPORARY_RETENTION_MS) : new Date(value);
  const timestamp = candidate.getTime();
  if (!Number.isFinite(timestamp)) {
    throw serviceError('RETENTION_EXPIRE_AT_INVALID', '临时会话的过期时间无效');
  }
  const ttl = timestamp - now;
  if (ttl < MIN_TEMPORARY_RETENTION_MS) {
    throw serviceError('RETENTION_EXPIRE_AT_INVALID', '临时会话的过期时间必须至少晚于当前时间 1 分钟');
  }
  if (ttl > MAX_TEMPORARY_RETENTION_MS) {
    throw serviceError('RETENTION_EXPIRE_AT_TOO_LATE', '临时会话最长只能保留 30 天');
  }
  return new Date(Math.floor(timestamp / 1000) * 1000);
}

export function resolveAiConversationIdentity(req) {
  const actor = req?.billingUser || req?.user || {};
  const subject = req?.resourceUser || req?.user || {};
  const actorUserId = asString(actor.id, 64, 'visitor');
  const subjectUserId = asString(subject.id, 64, actorUserId);
  const actorRole = asString(actor.role, 24, 'visitor');
  if (!actorUserId || actorUserId === 'visitor' || actorRole === 'visitor') {
    throw serviceError('AI_HISTORY_REQUIRES_ACCOUNT', '登录后才能保存云端 AI 会话', 401);
  }
  return {
    actorUserId,
    subjectUserId,
    actorRole,
    subjectRole: asString(subject.role, 24, actorRole),
    adminContextId: req?.adminContext ? asString(req.adminContext.id, 64) || null : null,
    adminContextMode: normalizeMode(req?.adminContext?.mode),
  };
}

function ownerParams(identity) {
  const owner = normalizedOwner(identity);
  return [owner.actorUserId, owner.subjectUserId, owner.adminContextMode, owner.adminContextId];
}

function mapConversation(row) {
  return {
    id: String(row.id),
    title: row.title || '新会话',
    summary: row.summary || '',
    scopeType: row.scope_type || 'global',
    scope: parseJson(row.scope_json, {}),
    status: row.status || 'active',
    retentionMode: row.retention_mode || 'standard',
    expireAt: row.expire_at || null,
    rootConversationId: row.root_conversation_id || String(row.id),
    parentConversationId: row.parent_conversation_id || null,
    branchFromMessageId: row.branch_from_message_id || null,
    lastMessageAt: row.last_message_at,
    createdAt: row.create_time,
    updatedAt: row.update_time,
  };
}

function mapSource(row) {
  return {
    sourceId: String(row.source_id),
    resourceType: row.resource_type,
    resourceId: row.resource_id == null ? null : String(row.resource_id),
    title: row.display_title || '',
    resourceVersion: row.resource_version || null,
    target: parseJson(row.target_json, null),
    coverage: parseJson(row.coverage_json, null),
    capturedAt: row.captured_at,
  };
}

function mapEvidence(row) {
  return {
    evidenceRef: String(row.evidence_ref),
    sourceId: String(row.source_id),
    citationKey: String(row.citation_key),
    locator: parseJson(row.locator_json, null),
    excerpt: row.excerpt || '',
    excerptHash: row.excerpt_hash,
  };
}

function mapMessage(row, sources = [], evidence = [], feedback = null) {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    parentMessageId: row.parent_message_id || null,
    requestId: row.request_id || null,
    traceId: row.trace_id || null,
    role: row.role,
    content: row.content || '',
    status: row.status || 'completed',
    contextRefs: parseJson(row.context_refs_json, []),
    attachmentRefs: parseJson(row.attachment_refs_json, []),
    activity: normalizeMessageActivity(parseJson(row.activity_json, [])),
    coverage: parseJson(row.coverage_json, null),
    versionGroupId: row.version_group_id || null,
    modelMeta: parseJson(row.model_meta_json, null),
    sources,
    evidence,
    feedback,
    createdAt: row.create_time,
    updatedAt: row.update_time,
  };
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ at: row.last_message_at, id: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!value?.at || !value?.id) throw new Error('invalid');
    return { at: value.at, id: String(value.id) };
  } catch {
    throw serviceError('INVALID_CURSOR', '会话游标无效');
  }
}

async function getOwnedConversationRow(db, identity, conversationId, { includeArchived = true } = {}) {
  const statusSql = includeArchived ? "AND status IN ('active', 'archived')" : "AND status = 'active'";
  const [rows] = await db.query(
    `SELECT * FROM ai_conversations
     WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
       AND admin_context_id <=> ? AND ${LIVE_RETENTION_SQL} ${statusSql}
     LIMIT 1`,
    [asString(conversationId, 36), ...ownerParams(identity)],
  );
  return rows[0] || null;
}

/**
 * 自动云会话创建/续写的服务端门禁。读取 subject 的账号偏好，默认开启；
 * 变更集等显式后台成果可继续直接调用 service，不会被客户端自动同步开关误伤。
 */
export async function assertAiCloudHistoryEnabled(identity, database = pool) {
  const subjectUserId = asString(identity?.subjectUserId, 36);
  if (!subjectUserId) throw serviceError('AI_CLOUD_HISTORY_DISABLED', '云端会话历史已关闭', 409);
  const [rows] = await database.query(
    `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.aiCloudHistory')), 'true') AS enabled
     FROM user WHERE id = ? LIMIT 1`,
    [subjectUserId],
  );
  const enabled = String(rows[0]?.enabled ?? 'false')
    .trim()
    .toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    throw serviceError('AI_CLOUD_HISTORY_DISABLED', '云端会话历史已关闭', 409);
  }
  return true;
}

export async function createAiConversation(identity, input = {}, database = pool, internal = {}) {
  const owner = assertAiConversationWritable(identity);
  const id = asString(input.id, 36) || crypto.randomUUID();
  const title = asString(input.title, 255, '新会话');
  const scopeType = asString(input.scopeType, 32, 'global');
  const retentionMode = RETENTION_MODES.has(input.retentionMode) ? input.retentionMode : 'standard';
  if (retentionMode !== 'temporary' && input.expireAt != null && input.expireAt !== '') {
    throw serviceError('RETENTION_EXPIRE_AT_INVALID', '只有临时会话可以设置过期时间');
  }
  const expireAt = retentionMode === 'temporary' ? normalizeTemporaryExpireAt(input.expireAt) : null;
  const rootConversationId = asString(internal.rootConversationId, 36) || id;
  const parentConversationId = asString(internal.parentConversationId, 36) || null;
  const branchFromMessageId = asString(internal.branchFromMessageId, 36) || null;
  await database.query(
    `INSERT INTO ai_conversations
      (id, actor_user_id, subject_user_id, admin_context_id, admin_context_mode, title, scope_type, scope_json,
       retention_mode, expire_at, root_conversation_id, parent_conversation_id, branch_from_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      owner.actorUserId,
      owner.subjectUserId,
      owner.adminContextId,
      owner.adminContextMode,
      title,
      scopeType,
      jsonValue(input.scope, {}),
      retentionMode,
      expireAt,
      rootConversationId,
      parentConversationId,
      branchFromMessageId,
    ],
  );
  return getAiConversation(identity, id, { messageLimit: 0 }, database);
}

export async function listAiConversations(identity, options = {}, database = pool) {
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 20));
  const status = CONVERSATION_STATUSES.has(options.status) ? options.status : 'active';
  const keyword = asString(options.keyword, 100);
  const cursor = decodeCursor(options.cursor);
  const params = [...ownerParams(identity), status];
  let where = `actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
    AND admin_context_id <=> ? AND ${LIVE_RETENTION_SQL} AND status = ?`;
  if (keyword) {
    where += " AND (title LIKE ? ESCAPE '\\\\' OR summary LIKE ? ESCAPE '\\\\')";
    const escaped = keyword.replace(/[\\%_]/g, '\\$&');
    params.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (cursor) {
    where += ' AND (last_message_at < ? OR (last_message_at = ? AND id < ?))';
    params.push(cursor.at, cursor.at, cursor.id);
  }
  params.push(limit + 1);
  const [rows] = await database.query(
    `SELECT * FROM ai_conversations WHERE ${where}
     ORDER BY last_message_at DESC, id DESC LIMIT ?`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map(mapConversation),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}

function lineageTime(row) {
  const value = new Date(row.create_time || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function orderConversationLineage(rows, currentConversationId) {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const children = new Map();
  const roots = [];
  for (const row of rows) {
    const parentId = row.parent_conversation_id ? String(row.parent_conversation_id) : '';
    if (!parentId || parentId === String(row.id) || !byId.has(parentId)) {
      roots.push(row);
      continue;
    }
    const siblings = children.get(parentId) || [];
    siblings.push(row);
    children.set(parentId, siblings);
  }
  const compare = (left, right) =>
    lineageTime(left) - lineageTime(right) || String(left.id).localeCompare(String(right.id));
  roots.sort(compare);
  for (const siblings of children.values()) siblings.sort(compare);

  const ordered = [];
  const depthById = new Map();
  const visited = new Set();
  const visit = (row, depth) => {
    const id = String(row.id);
    if (visited.has(id)) return;
    visited.add(id);
    depthById.set(id, Math.min(32, Math.max(0, depth)));
    ordered.push(row);
    for (const child of children.get(id) || []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  // 历史脏数据若形成环，仍以独立根展示，不能递归卡死或猜测真实父子。
  for (const row of [...rows].sort(compare)) visit(row, 0);

  return ordered.map((row) => {
    const id = String(row.id);
    const parentId = row.parent_conversation_id ? String(row.parent_conversation_id) : null;
    return {
      ...mapConversation(row),
      depth: depthById.get(id) || 0,
      childCount: (children.get(id) || []).length,
      parentAvailable: Boolean(parentId && byId.has(parentId)),
      current: id === currentConversationId,
    };
  });
}

export async function getAiConversationLineage(identity, conversationId, database = pool) {
  const current = await getOwnedConversationRow(database, identity, conversationId);
  if (!current) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const rootConversationId = asString(current.root_conversation_id, 36) || String(current.id);
  const [rows] = await database.query(
    `SELECT * FROM ai_conversations
     WHERE actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
       AND admin_context_id <=> ? AND (root_conversation_id = ? OR id = ?) AND ${LIVE_RETENTION_SQL}
       AND status IN ('active', 'archived')
     ORDER BY create_time ASC, id ASC LIMIT 201`,
    [...ownerParams(identity), rootConversationId, rootConversationId],
  );
  const truncated = rows.length > 200;
  const bounded = rows.slice(0, 200);
  if (!bounded.some((row) => String(row.id) === String(current.id))) {
    if (bounded.length === 200) bounded[bounded.length - 1] = current;
    else bounded.push(current);
  }
  return {
    rootConversationId,
    currentConversationId: String(current.id),
    nodes: orderConversationLineage(bounded, String(current.id)),
    truncated,
  };
}

export async function getAiConversation(identity, conversationId, options = {}, database = pool) {
  const conversation = await getOwnedConversationRow(database, identity, conversationId);
  if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const messageLimit = Math.max(0, Math.min(200, Number(options.messageLimit ?? 100)));
  if (!messageLimit) return { ...mapConversation(conversation), messages: [] };
  const [rows] = await database.query(
    `SELECT * FROM ai_messages WHERE conversation_id = ?
     ORDER BY create_time ASC, id ASC LIMIT ?`,
    [conversation.id, messageLimit],
  );
  const messageIds = rows.map((row) => row.id);
  if (!messageIds.length) return { ...mapConversation(conversation), messages: [] };
  const placeholders = messageIds.map(() => '?').join(',');
  const [[sourceRows], [evidenceRows], [feedbackRows]] = await Promise.all([
    database.query(
      `SELECT * FROM ai_message_sources WHERE message_id IN (${placeholders}) ORDER BY id ASC`,
      messageIds,
    ),
    database.query(
      `SELECT * FROM ai_message_evidence WHERE message_id IN (${placeholders}) ORDER BY id ASC`,
      messageIds,
    ),
    database.query(
      `SELECT message_id, rating, reason, resolved
       FROM ai_feedback
       WHERE actor_user_id = ? AND conversation_id = ? AND message_id IN (${placeholders})`,
      [identity.actorUserId, conversation.id, ...messageIds],
    ),
  ]);
  const sourcesByMessage = new Map();
  const evidenceByMessage = new Map();
  const feedbackByMessage = new Map();
  for (const source of sourceRows) {
    const list = sourcesByMessage.get(source.message_id) || [];
    list.push(mapSource(source));
    sourcesByMessage.set(source.message_id, list);
  }
  for (const item of evidenceRows) {
    const list = evidenceByMessage.get(item.message_id) || [];
    list.push(mapEvidence(item));
    evidenceByMessage.set(item.message_id, list);
  }
  for (const item of feedbackRows) {
    feedbackByMessage.set(String(item.message_id), {
      rating: item.rating,
      reason: item.reason || undefined,
      resolved: item.resolved == null ? null : Boolean(item.resolved),
    });
  }
  return {
    ...mapConversation(conversation),
    messages: rows.map((row) =>
      mapMessage(
        row,
        sourcesByMessage.get(row.id) || [],
        evidenceByMessage.get(row.id) || [],
        feedbackByMessage.get(String(row.id)) || null,
      ),
    ),
  };
}

export async function listAiMessageVersions(identity, conversationId, messageId, database = pool) {
  const conversation = await getOwnedConversationRow(database, identity, conversationId);
  if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const normalizedMessageId = asString(messageId, 36);
  const [targetRows] = await database.query(
    `SELECT id, version_group_id, status FROM ai_messages
     WHERE id = ? AND conversation_id = ? AND role = 'assistant' LIMIT 1`,
    [normalizedMessageId, conversation.id],
  );
  const target = targetRows[0];
  if (!target) throw serviceError('MESSAGE_NOT_FOUND', '回答不存在或无权访问', 404);
  if (target.status !== 'completed') {
    throw serviceError('MESSAGE_VERSION_NOT_AVAILABLE', '只有已完成的回答可以查看版本', 409);
  }
  const versionGroupId = asString(target.version_group_id, 36) || String(target.id);
  const [rows] = await database.query(
    `SELECT id, request_id, version_group_id, create_time, update_time
     FROM ai_messages
     WHERE conversation_id = ? AND role = 'assistant' AND status = 'completed'
       AND (version_group_id = ? OR id = ?)
     ORDER BY create_time ASC, id ASC LIMIT 51`,
    [conversation.id, versionGroupId, versionGroupId],
  );
  return {
    conversationId: String(conversation.id),
    currentMessageId: String(target.id),
    versionGroupId,
    items: rows.slice(0, 50).map((row) => ({
      messageId: String(row.id),
      requestId: row.request_id || null,
      versionGroupId: row.version_group_id || versionGroupId,
      createdAt: row.create_time,
      updatedAt: row.update_time,
    })),
    truncated: rows.length > 50,
  };
}

export async function prepareAiMessageVersionGroup(identity, conversationId, messageId, database = pool) {
  assertAiConversationWritable(identity);
  const ownsTransaction = typeof database?.getConnection === 'function';
  const connection = ownsTransaction ? await database.getConnection() : database;
  if (!connection || typeof connection.query !== 'function') {
    throw serviceError('AI_DATABASE_UNAVAILABLE', 'AI 会话存储暂时不可用', 503);
  }
  try {
    if (ownsTransaction) await connection.beginTransaction();
    const conversation = await getOwnedConversationRow(connection, identity, conversationId);
    if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
    const normalizedMessageId = asString(messageId, 36);
    const [rows] = await connection.query(
      `SELECT id, version_group_id FROM ai_messages
       WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND status = 'completed'
       LIMIT 1 FOR UPDATE`,
      [normalizedMessageId, conversation.id],
    );
    if (!rows.length) {
      throw serviceError('MESSAGE_VERSION_NOT_AVAILABLE', '只能为当前会话中已完成的回答创建版本组', 404);
    }
    const versionGroupId = asString(rows[0].version_group_id, 36) || String(rows[0].id);
    const [updated] = await connection.query(
      `UPDATE ai_messages SET version_group_id = ?, update_time = CURRENT_TIMESTAMP
       WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND status = 'completed'`,
      [versionGroupId, normalizedMessageId, conversation.id],
    );
    if (Number(updated?.affectedRows || 0) !== 1) {
      throw serviceError('MESSAGE_VERSION_CONFLICT', '回答版本状态已变化，请刷新后重试', 409);
    }
    if (ownsTransaction) await connection.commit();
    return {
      conversationId: String(conversation.id),
      messageId: normalizedMessageId,
      versionGroupId,
    };
  } catch (error) {
    if (ownsTransaction) await connection.rollback();
    throw error;
  } finally {
    if (ownsTransaction) connection.release();
  }
}

function normalizeSources(rawSources) {
  return boundedArray(rawSources, 50, 'sources').map((source, index) => {
    const sourceId = asString(source?.sourceId || source?.id, 96);
    if (!sourceId) throw serviceError('SOURCE_ID_REQUIRED', `第 ${index + 1} 个来源缺少 sourceId`);
    const resourceId = asString(source.resourceId || source.id || source.target?.id, 128) || null;
    let target = source.target || null;
    if (typeof target === 'string') {
      const type = target;
      const path =
        type === 'note-detail' && resourceId
          ? `/noteLibrary/${resourceId}`
          : type === 'bookmark-edit' && resourceId
            ? `/manage/editBookmark/${resourceId}`
            : type === 'bookmark-snapshot' && resourceId
              ? `/manage/bookmarkMg?snapshot=${encodeURIComponent(resourceId)}`
              : type === 'cloud-file' && resourceId
                ? `/cloudSpace?fileId=${encodeURIComponent(source.fileId || resourceId)}`
                : type === 'cloud-folder' && resourceId
                  ? `/cloudSpace?folderId=${encodeURIComponent(resourceId)}`
                  : type === 'tag-detail' && resourceId
                    ? `/tag/${resourceId}`
                    : null;
      target = {
        type,
        id: resourceId,
        ...(path ? { path } : {}),
        ...(source.url ? { url: source.url } : {}),
      };
    }
    return {
      sourceId,
      resourceType: asString(source.resourceType || source.type, 32, 'unknown'),
      resourceId,
      title: asString(source.title || source.name, 255),
      resourceVersion: asString(source.resourceVersion || source.version, 96) || null,
      target,
      coverage: source.coverage || null,
    };
  });
}

function normalizeEvidence(rawEvidence, sourceIds) {
  const seenRefs = new Set();
  const seenKeys = new Set();
  return boundedArray(rawEvidence, 100, 'evidence').map((item, index) => {
    const sourceId = asString(item?.sourceId, 96);
    const evidenceRef = asString(item?.evidenceRef, 96);
    const citationKey = asString(item?.citationKey, 32);
    if (!sourceIds.has(sourceId)) {
      throw serviceError('EVIDENCE_SOURCE_INVALID', `第 ${index + 1} 条证据没有对应的实际来源`);
    }
    if (!evidenceRef || seenRefs.has(evidenceRef)) {
      throw serviceError('EVIDENCE_REF_INVALID', `第 ${index + 1} 条 evidenceRef 缺失或重复`);
    }
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(citationKey) || seenKeys.has(citationKey)) {
      throw serviceError('CITATION_KEY_INVALID', `第 ${index + 1} 条 citationKey 无效或重复`);
    }
    seenRefs.add(evidenceRef);
    seenKeys.add(citationKey);
    const excerpt = String(item.excerpt || '')
      .trim()
      .slice(0, 800);
    return {
      sourceId,
      evidenceRef,
      citationKey,
      locator: item.locator || null,
      excerpt,
      excerptHash: crypto.createHash('sha256').update(excerpt).digest('hex'),
    };
  });
}

export async function saveAiMessage(identity, conversationId, input = {}, database = pool) {
  assertAiConversationWritable(identity);
  const role = MESSAGE_ROLES.has(input.role) ? input.role : null;
  const status = MESSAGE_STATUSES.has(input.status) ? input.status : 'completed';
  if (!role) throw serviceError('MESSAGE_ROLE_INVALID', '消息角色无效');
  const content = String(input.content ?? '');
  if (content.length > 1_000_000) throw serviceError('MESSAGE_TOO_LONG', '消息正文不能超过 100 万字符');
  const contextRefs = boundedArray(input.contextRefs, 50, 'contextRefs');
  const attachmentRefs = boundedArray(input.attachmentRefs, 20, 'attachmentRefs');
  const sources = normalizeSources(input.sources);
  const evidence = normalizeEvidence(input.evidence, new Set(sources.map((source) => source.sourceId)));
  const requestId = asString(input.requestId, 64) || null;
  const ownsTransaction = typeof database?.getConnection === 'function';
  const connection = ownsTransaction ? await database.getConnection() : database;
  if (!connection || typeof connection.query !== 'function') {
    throw serviceError('AI_DATABASE_UNAVAILABLE', 'AI 会话存储暂时不可用', 503);
  }
  try {
    if (ownsTransaction) await connection.beginTransaction();
    const conversation = await getOwnedConversationRow(connection, identity, conversationId);
    if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
    const parentMessageId = asString(input.parentMessageId, 36) || null;
    if (parentMessageId) {
      const [parents] = await connection.query(
        'SELECT id FROM ai_messages WHERE id = ? AND conversation_id = ? LIMIT 1',
        [parentMessageId, conversation.id],
      );
      if (!parents.length) throw serviceError('PARENT_MESSAGE_INVALID', '父消息不属于当前会话');
    }
    const traceId = asString(input.traceId, 64) || null;
    const serializedContextRefs = jsonValue(contextRefs, []);
    const serializedAttachmentRefs = jsonValue(attachmentRefs, []);
    const serializedActivity = jsonValue(normalizeMessageActivity(boundedArray(input.activity, 200, 'activity')), []);
    const serializedCoverage = input.coverage == null ? null : jsonValue(input.coverage, null);
    const versionGroupId = asString(input.versionGroupId, 36) || null;
    const serializedModelMeta = input.modelMeta == null ? null : jsonValue(input.modelMeta, null);
    const updateOwnedMessage = async (id) => {
      await connection.query(
        `UPDATE ai_messages
         SET parent_message_id = ?, trace_id = ?, content = ?, status = ?, context_refs_json = ?,
             attachment_refs_json = ?, activity_json = ?, coverage_json = ?, version_group_id = ?,
             model_meta_json = ?, update_time = CURRENT_TIMESTAMP
         WHERE id = ? AND conversation_id = ?`,
        [
          parentMessageId,
          traceId,
          content,
          status,
          serializedContextRefs,
          serializedAttachmentRefs,
          serializedActivity,
          serializedCoverage,
          versionGroupId,
          serializedModelMeta,
          id,
          conversation.id,
        ],
      );
    };

    let resolvedMessageId = null;
    if (requestId) {
      const [existingRows] = await connection.query(
        'SELECT id FROM ai_messages WHERE conversation_id = ? AND request_id = ? AND role = ? LIMIT 1',
        [conversation.id, requestId, role],
      );
      resolvedMessageId = existingRows[0]?.id || null;
      if (resolvedMessageId) await updateOwnedMessage(resolvedMessageId);
    }
    for (let attempt = 0; !resolvedMessageId && attempt < 3; attempt += 1) {
      const candidateId = crypto.randomUUID();
      try {
        await connection.query(
          `INSERT INTO ai_messages
            (id, conversation_id, parent_message_id, request_id, trace_id, role, content, status,
             context_refs_json, attachment_refs_json, activity_json, coverage_json, version_group_id, model_meta_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            candidateId,
            conversation.id,
            parentMessageId,
            requestId,
            traceId,
            role,
            content,
            status,
            serializedContextRefs,
            serializedAttachmentRefs,
            serializedActivity,
            serializedCoverage,
            versionGroupId,
            serializedModelMeta,
          ],
        );
        resolvedMessageId = candidateId;
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY' && Number(error?.errno) !== 1062) throw error;
        if (requestId) {
          const [concurrentRows] = await connection.query(
            'SELECT id FROM ai_messages WHERE conversation_id = ? AND request_id = ? AND role = ? LIMIT 1',
            [conversation.id, requestId, role],
          );
          resolvedMessageId = concurrentRows[0]?.id || null;
          if (resolvedMessageId) await updateOwnedMessage(resolvedMessageId);
        }
      }
    }
    if (!resolvedMessageId) throw serviceError('MESSAGE_ID_GENERATION_FAILED', '消息标识生成失败，请重试', 503);
    await connection.query(
      `DELETE FROM ai_message_evidence
       WHERE message_id = ? AND EXISTS (
         SELECT 1 FROM ai_messages WHERE id = ? AND conversation_id = ?
       )`,
      [resolvedMessageId, resolvedMessageId, conversation.id],
    );
    await connection.query(
      `DELETE FROM ai_message_sources
       WHERE message_id = ? AND EXISTS (
         SELECT 1 FROM ai_messages WHERE id = ? AND conversation_id = ?
       )`,
      [resolvedMessageId, resolvedMessageId, conversation.id],
    );
    for (const source of sources) {
      await connection.query(
        `INSERT INTO ai_message_sources
          (message_id, source_id, resource_type, resource_id, display_title, resource_version, target_json, coverage_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedMessageId,
          source.sourceId,
          source.resourceType,
          source.resourceId,
          source.title,
          source.resourceVersion,
          source.target == null ? null : jsonValue(source.target, null),
          source.coverage == null ? null : jsonValue(source.coverage, null),
        ],
      );
    }
    for (const item of evidence) {
      await connection.query(
        `INSERT INTO ai_message_evidence
          (message_id, source_id, evidence_ref, citation_key, locator_json, excerpt_hash, excerpt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedMessageId,
          item.sourceId,
          item.evidenceRef,
          item.citationKey,
          item.locator == null ? null : jsonValue(item.locator, null),
          item.excerptHash,
          item.excerpt || null,
        ],
      );
    }
    const nextTitle =
      conversation.title === '新会话' && role === 'user' && content.trim()
        ? content.trim().replace(/\s+/g, ' ').slice(0, 48)
        : conversation.title;
    const [conversationUpdate] = await connection.query(
      `UPDATE ai_conversations
       SET title = ?, last_message_at = CURRENT_TIMESTAMP, update_time = CURRENT_TIMESTAMP
       WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
         AND admin_context_id <=> ? AND ${LIVE_RETENTION_SQL}`,
      [nextTitle, conversation.id, ...ownerParams(identity)],
    );
    if (Number(conversationUpdate?.affectedRows || 0) !== 1) {
      throw serviceError('CONVERSATION_EXPIRED', '临时会话已过期，不能继续保存消息', 410);
    }
    const [savedRows] = await connection.query(
      'SELECT * FROM ai_messages WHERE id = ? AND conversation_id = ? LIMIT 1',
      [resolvedMessageId, conversation.id],
    );
    if (!savedRows.length) throw serviceError('MESSAGE_NOT_FOUND_AFTER_SAVE', '消息保存结果不可用', 500);
    const saved = mapMessage(savedRows[0], sources, evidence);
    if (ownsTransaction) await connection.commit();
    return saved;
  } catch (error) {
    if (ownsTransaction) await connection.rollback();
    throw error;
  } finally {
    if (ownsTransaction) connection.release();
  }
}

export async function updateAiConversation(identity, conversationId, input = {}, database = pool) {
  assertAiConversationWritable(identity);
  const conversation = await getOwnedConversationRow(database, identity, conversationId);
  if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const fields = [];
  const values = [];
  if (input.title !== undefined) {
    const title = asString(input.title, 255);
    if (!title) throw serviceError('TITLE_REQUIRED', '会话标题不能为空');
    fields.push('title = ?');
    values.push(title);
  }
  if (input.summary !== undefined) {
    fields.push('summary = ?');
    values.push(String(input.summary || '').slice(0, 10_000) || null);
  }
  if (input.status !== undefined) {
    if (!CONVERSATION_STATUSES.has(input.status)) throw serviceError('STATUS_INVALID', '会话状态无效');
    fields.push('status = ?');
    values.push(input.status);
  }
  if (input.scopeType !== undefined || input.scope !== undefined) {
    fields.push('scope_type = ?', 'scope_json = ?');
    values.push(asString(input.scopeType, 32, conversation.scope_type || 'global'), jsonValue(input.scope, {}));
  }
  if (input.retentionMode !== undefined || Object.prototype.hasOwnProperty.call(input, 'expireAt')) {
    const retentionMode = input.retentionMode === undefined ? conversation.retention_mode : input.retentionMode;
    if (!RETENTION_MODES.has(retentionMode)) throw serviceError('RETENTION_INVALID', '保留策略无效');
    if (retentionMode !== 'temporary' && input.expireAt != null && input.expireAt !== '') {
      throw serviceError('RETENTION_EXPIRE_AT_INVALID', '只有临时会话可以设置过期时间');
    }
    const currentExpireAt = conversation.retention_mode === 'temporary' ? conversation.expire_at : null;
    const expireAt =
      retentionMode === 'temporary' ? normalizeTemporaryExpireAt(input.expireAt ?? currentExpireAt) : null;
    fields.push('retention_mode = ?', 'expire_at = ?');
    values.push(retentionMode, expireAt);
  }
  if (!fields.length) return mapConversation(conversation);
  values.push(conversation.id, ...ownerParams(identity));
  const [result] = await database.query(
    `UPDATE ai_conversations SET ${fields.join(', ')}, update_time = CURRENT_TIMESTAMP
     WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
       AND admin_context_id <=> ? AND ${LIVE_RETENTION_SQL}`,
    values,
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    throw serviceError('CONVERSATION_EXPIRED', '临时会话已过期，不能继续修改', 410);
  }
  return getAiConversation(identity, conversation.id, { messageLimit: 0 }, database);
}

export async function deleteAiConversation(identity, conversationId, database = pool) {
  assertAiConversationWritable(identity);
  const id = asString(conversationId, 36);
  const [result] = await database.query(
    `UPDATE ai_conversations
     SET status = CASE status WHEN 'archived' THEN 'deleted_archived' ELSE 'deleted_active' END,
         update_time = CURRENT_TIMESTAMP
     WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
       AND admin_context_id <=> ? AND status IN ('active', 'archived') AND ${LIVE_RETENTION_SQL}`,
    [id, ...ownerParams(identity)],
  );
  const deleted = Number(result.affectedRows || 0);
  const undoMs = conversationDeleteUndoMs();
  if (deleted && database === pool) {
    const timer = setTimeout(() => {
      purgeDeletedAiConversation(id).catch((error) =>
        console.error(
          '[ai-conversation] delayed delete failed code=%s',
          String(error?.code || 'AI_CONVERSATION_DELETE_FINALIZE_FAILED'),
        ),
      );
    }, undoMs + 1_000);
    timer.unref?.();
  }
  return {
    deleted,
    undoExpiresAt: deleted ? new Date(Date.now() + undoMs).toISOString() : null,
  };
}

function conversationDeleteUndoMs() {
  const configured = Number(process.env.AI_CONVERSATION_DELETE_UNDO_MS);
  if (!Number.isFinite(configured)) return DEFAULT_DELETE_UNDO_MS;
  return Math.max(MIN_DELETE_UNDO_MS, Math.min(MAX_DELETE_UNDO_MS, Math.trunc(configured)));
}

function conversationDeleteUndoSeconds() {
  return Math.ceil(conversationDeleteUndoMs() / 1000);
}

export async function restoreDeletedAiConversation(identity, conversationId, database = pool) {
  assertAiConversationWritable(identity);
  const [result] = await database.query(
    `UPDATE ai_conversations
     SET status = CASE status WHEN 'deleted_archived' THEN 'archived' ELSE 'active' END,
         update_time = CURRENT_TIMESTAMP
     WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
       AND admin_context_id <=> ? AND status IN ('deleted_active', 'deleted_archived')
       AND update_time > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${conversationDeleteUndoSeconds()} SECOND)`,
    [asString(conversationId, 36), ...ownerParams(identity)],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    throw serviceError('CONVERSATION_DELETE_UNDO_EXPIRED', '撤销删除时间已结束，或会话已被永久删除', 409);
  }
  return { restored: 1 };
}

export async function clearAiConversations(identity, database = pool) {
  assertAiConversationWritable(identity);
  const [result] = await database.query(
    `DELETE FROM ai_conversations
     WHERE actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ? AND admin_context_id <=> ?`,
    ownerParams(identity),
  );
  return { deleted: Number(result.affectedRows || 0) };
}

async function deleteOptionalIdentityRows(connection, key, sql, params) {
  try {
    const [result] = await connection.query(sql, params);
    return [key, Number(result?.affectedRows || 0)];
  } catch (error) {
    if (isMissingAiWorkspaceSchema(error)) {
      throw serviceError(
        'AI_DATA_CLEAR_SCHEMA_UNAVAILABLE',
        'AI 数据结构尚未完成迁移，无法确认全部数据已安全清除',
        503,
      );
    }
    throw error;
  }
}

function aiIdentityClearScope(identity) {
  const subjectWide =
    identity.adminContextMode === 'normal' &&
    identity.actorUserId === identity.subjectUserId &&
    !identity.adminContextId;
  return subjectWide
    ? { sql: 'subject_user_id = ?', params: [identity.subjectUserId], scope: 'subject_user' }
    : {
        sql: 'actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ? AND admin_context_id <=> ?',
        params: ownerParams(identity),
        scope: 'owner_domain',
      };
}

/**
 * 普通账号永久清除以自己为数据主体的全部可控 AI 数据，包括管理员授权上下文中产生的对象；
 * 管理员代管时只清除当前四维 owner 域，不能跨授权上下文扩张范围。
 * 配额账本、请求日志等安全/运营记录不在此范围；普通账号的可重建私人检索镜像会同步清空。
 */
export async function clearAiIdentityData(identity, database = pool) {
  assertAiConversationWritable(identity);
  const clearScope = aiIdentityClearScope(identity);
  const clearsSubjectWide = clearScope.scope === 'subject_user';
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const entries = [];
    entries.push(
      await deleteOptionalIdentityRows(
        connection,
        'memories',
        `DELETE FROM ai_memories WHERE ${clearScope.sql}`,
        clearScope.params,
      ),
    );
    entries.push(
      await deleteOptionalIdentityRows(
        connection,
        'changeSets',
        `DELETE FROM ai_change_sets WHERE ${clearScope.sql}`,
        clearScope.params,
      ),
    );
    entries.push(
      await deleteOptionalIdentityRows(
        connection,
        'responseEvents',
        `DELETE FROM ai_response_events WHERE ${clearScope.sql}`,
        clearScope.params,
      ),
    );
    entries.push(
      await deleteOptionalIdentityRows(
        connection,
        'productEvents',
        `DELETE FROM ai_product_events WHERE ${clearScope.sql}`,
        clearScope.params,
      ),
    );
    entries.push(
      await deleteOptionalIdentityRows(
        connection,
        'conversations',
        `DELETE FROM ai_conversations WHERE ${clearScope.sql}`,
        clearScope.params,
      ),
    );
    if (clearsSubjectWide) {
      try {
        // generation 与私密 chunk 必须和总清除共享同一事务。否则先提交删除、后推进代际失败时，
        // 其他应用实例仍可能短暂信任旧索引快照。
        await connection.query(
          `INSERT INTO ai_content_generations (subject_user_id, generation) VALUES (?, 1)
           ON DUPLICATE KEY UPDATE generation = generation + 1, update_time = CURRENT_TIMESTAMP`,
          [identity.subjectUserId],
        );
      } catch (error) {
        if (isMissingAiWorkspaceSchema(error)) {
          throw serviceError(
            'AI_DATA_CLEAR_SCHEMA_UNAVAILABLE',
            'AI 数据结构尚未完成迁移，无法确认全部数据已安全清除',
            503,
          );
        }
        throw error;
      }
      entries.push(
        await deleteOptionalIdentityRows(
          connection,
          'contentChunks',
          'DELETE FROM ai_content_chunks WHERE subject_user_id = ?',
          [identity.subjectUserId],
        ),
      );
    }
    await connection.commit();
    // 数据库代际已经随上面的事务原子推进；提交后只驱逐当前进程内快照，不再另起数据库事务。
    let documents = { deleted: 0, failed: 0, retryScheduled: 0, retryUnavailable: 0 };
    const excluded = [];
    if (clearsSubjectWide) {
      await invalidatePersonalKnowledgeCache(identity.subjectUserId, { persist: false });
      // AI 文档派生数据(来源/分块/解析任务)与临时上传原文件属该 subject 的可控 AI 数据,一并清除;
      // 云空间永久文件本体不在此列(只删 AI 派生索引)。OBS 删除无法与 MySQL 事务原子,故放主事务提交后单独执行,
      // 失败按是否成功加入删除重试队列分别回执，绝不把“未能排队”说成会自动重试。
      // deleteAllDocumentSources 永不抛错,不会让已提交的主清除因文档清理异常而反回失败。
      // 惰性动态 import:aiDocument/service 连着 obsClient,静态引入会把 OBS 拉进本模块的导入图、
      // 连累所有 import aiConversationService 的测试在无 OBS 环境加载即崩;此处仅在真正清除时才加载。
      const { deleteAllDocumentSources } = await import('./aiDocument/service.js');
      documents = await deleteAllDocumentSources({ userId: identity.subjectUserId });
    } else {
      // owner_domain(管理员代管):文档表仅以 user_id(上传者)归属,无四维 owner 维度,无法精确按 owner 域清理,
      // 为避免跨授权上下文误删,明确排除并在回执披露。
      excluded.push('documents');
    }
    const byType = Object.fromEntries(entries);
    byType.documents = documents.deleted;
    return {
      deleted: Object.values(byType).reduce((sum, value) => sum + Number(value || 0), 0),
      byType,
      scope: clearScope.scope,
      retained: ['agentLogs', 'quotaUsage', 'tokenReservations'],
      documentsFailed: documents.failed,
      documentsRetryScheduled: documents.retryScheduled,
      documentsRetryUnavailable: documents.retryUnavailable,
      excluded,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function isMissingAiWorkspaceSchema(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

async function deleteOptionalConversationDependents(connection, sql, params) {
  try {
    const [result] = await connection.query(sql, params);
    return Number(result?.affectedRows || 0);
  } catch (error) {
    if (isMissingAiWorkspaceSchema(error)) return 0;
    throw error;
  }
}

async function deleteConversationDependentsByIds(connection, ids) {
  if (!ids.length) return { dependentsDeleted: 0, placeholders: '' };
  const placeholders = ids.map(() => '?').join(',');
  let dependentsDeleted = 0;
  dependentsDeleted += await deleteOptionalConversationDependents(
    connection,
    `DELETE FROM ai_memories
     WHERE source_conversation_id IN (${placeholders})
        OR source_message_id IN (SELECT id FROM ai_messages WHERE conversation_id IN (${placeholders}))`,
    [...ids, ...ids],
  );
  dependentsDeleted += await deleteOptionalConversationDependents(
    connection,
    `DELETE FROM ai_change_sets WHERE conversation_id IN (${placeholders})`,
    ids,
  );
  return { dependentsDeleted, placeholders };
}

export async function purgeDeletedAiConversation(conversationId, database = pool, now = new Date()) {
  const id = asString(conversationId, 36);
  if (!id) return { deleted: 0, dependentsDeleted: 0 };
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    let rows;
    try {
      [rows] = await connection.query(
        `SELECT id FROM ai_conversations
         WHERE id = ? AND status IN ('deleted_active', 'deleted_archived')
           AND update_time <= DATE_SUB(?, INTERVAL ${conversationDeleteUndoSeconds()} SECOND)
         FOR UPDATE`,
        [id, now],
      );
    } catch (error) {
      if (!isMissingAiWorkspaceSchema(error)) throw error;
      await connection.rollback();
      return { deleted: 0, dependentsDeleted: 0, skipped: true };
    }
    if (!rows.length) {
      await connection.commit();
      return { deleted: 0, dependentsDeleted: 0, skipped: false };
    }
    const { dependentsDeleted } = await deleteConversationDependentsByIds(connection, [id]);
    const [result] = await connection.query(
      `DELETE FROM ai_conversations
       WHERE id = ? AND status IN ('deleted_active', 'deleted_archived')
         AND update_time <= DATE_SUB(?, INTERVAL ${conversationDeleteUndoSeconds()} SECOND)`,
      [id, now],
    );
    await connection.commit();
    return { deleted: Number(result?.affectedRows || 0), dependentsDeleted, skipped: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cleanupExpiredConversationBatch(database, batchSize) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    let rows;
    try {
      [rows] = await connection.query(
        `SELECT id FROM ai_conversations
         WHERE retention_mode = 'temporary' AND expire_at IS NOT NULL AND expire_at <= CURRENT_TIMESTAMP
         ORDER BY expire_at ASC, id ASC LIMIT ? FOR UPDATE`,
        [batchSize],
      );
    } catch (error) {
      if (!isMissingAiWorkspaceSchema(error)) throw error;
      await connection.rollback();
      return { deleted: 0, dependentsDeleted: 0, skipped: true, exhausted: true };
    }
    const ids = rows.map((row) => String(row.id));
    if (!ids.length) {
      await connection.commit();
      return { deleted: 0, dependentsDeleted: 0, skipped: false, exhausted: true };
    }
    const { dependentsDeleted, placeholders } = await deleteConversationDependentsByIds(connection, ids);
    const [result] = await connection.query(
      `DELETE FROM ai_conversations
       WHERE id IN (${placeholders}) AND retention_mode = 'temporary'
         AND expire_at IS NOT NULL AND expire_at <= CURRENT_TIMESTAMP`,
      ids,
    );
    const deleted = Number(result?.affectedRows || 0);
    await connection.commit();
    return { deleted, dependentsDeleted, skipped: false, exhausted: ids.length < batchSize };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cleanupDeletedConversationBatch(database, batchSize) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    let rows;
    try {
      [rows] = await connection.query(
        `SELECT id FROM ai_conversations
         WHERE status IN ('deleted_active', 'deleted_archived')
           AND update_time <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${conversationDeleteUndoSeconds()} SECOND)
         ORDER BY update_time ASC, id ASC LIMIT ? FOR UPDATE`,
        [batchSize],
      );
    } catch (error) {
      if (!isMissingAiWorkspaceSchema(error)) throw error;
      await connection.rollback();
      return { deleted: 0, dependentsDeleted: 0, skipped: true, exhausted: true };
    }
    const ids = rows.map((row) => String(row.id));
    if (!ids.length) {
      await connection.commit();
      return { deleted: 0, dependentsDeleted: 0, skipped: false, exhausted: true };
    }
    const { dependentsDeleted, placeholders } = await deleteConversationDependentsByIds(connection, ids);
    const [result] = await connection.query(
      `DELETE FROM ai_conversations
       WHERE id IN (${placeholders}) AND status IN ('deleted_active', 'deleted_archived')
         AND update_time <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${conversationDeleteUndoSeconds()} SECOND)`,
      ids,
    );
    const deleted = Number(result?.affectedRows || 0);
    await connection.commit();
    return { deleted, dependentsDeleted, skipped: false, exhausted: ids.length < batchSize };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function cleanupDeletedAiConversations(database = pool, { batchSize = 100, maxBatches = 10 } = {}) {
  const safeBatchSize = Math.max(1, Math.min(500, Math.trunc(Number(batchSize) || 100)));
  const safeMaxBatches = Math.max(1, Math.min(100, Math.trunc(Number(maxBatches) || 10)));
  let deleted = 0;
  let dependentsDeleted = 0;
  for (let batch = 0; batch < safeMaxBatches; batch += 1) {
    const result = await cleanupDeletedConversationBatch(database, safeBatchSize);
    deleted += result.deleted;
    dependentsDeleted += result.dependentsDeleted;
    if (result.skipped || result.exhausted || result.deleted === 0) {
      return { deleted, dependentsDeleted, batches: batch + 1, skipped: result.skipped };
    }
  }
  return { deleted, dependentsDeleted, batches: safeMaxBatches, skipped: false };
}

export async function cleanupExpiredAiConversations(database = pool, { batchSize = 100, maxBatches = 10 } = {}) {
  const safeBatchSize = Math.max(1, Math.min(500, Math.trunc(Number(batchSize) || 100)));
  const safeMaxBatches = Math.max(1, Math.min(100, Math.trunc(Number(maxBatches) || 10)));
  let deleted = 0;
  let dependentsDeleted = 0;
  for (let batch = 0; batch < safeMaxBatches; batch += 1) {
    const result = await cleanupExpiredConversationBatch(database, safeBatchSize);
    deleted += result.deleted;
    dependentsDeleted += result.dependentsDeleted;
    if (result.skipped || result.exhausted || result.deleted === 0) {
      return { deleted, dependentsDeleted, batches: batch + 1, skipped: result.skipped };
    }
  }
  return { deleted, dependentsDeleted, batches: safeMaxBatches, skipped: false };
}

function retentionCleanupIntervalMs() {
  const configured = Number(process.env.AI_CONVERSATION_RETENTION_CLEANUP_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_RETENTION_CLEANUP_INTERVAL_MS;
  return Math.max(
    MIN_RETENTION_CLEANUP_INTERVAL_MS,
    Math.min(MAX_RETENTION_CLEANUP_INTERVAL_MS, Math.trunc(configured)),
  );
}

export async function startAiConversationRetentionScheduler() {
  if (retentionCleanupTimer) return { started: false, intervalMs: retentionCleanupIntervalMs() };
  const runCleanup = async () => {
    try {
      await cleanupExpiredAiConversations();
      await cleanupDeletedAiConversations();
    } catch (error) {
      console.error('[ai-conversation-retention] cleanup failed code=%s', stableAgentErrorCode(error));
    }
  };
  await runCleanup();
  const intervalMs = retentionCleanupIntervalMs();
  retentionCleanupTimer = setInterval(runCleanup, intervalMs);
  retentionCleanupTimer.unref?.();
  return { started: true, intervalMs };
}

export function stopAiConversationRetentionScheduler() {
  if (!retentionCleanupTimer) return false;
  clearInterval(retentionCleanupTimer);
  retentionCleanupTimer = null;
  return true;
}

export async function exportAiConversations(identity, database = pool) {
  const owner = ownerParams(identity);
  const [[conversationRows], [messageRows], [sourceRows], [evidenceRows], [feedbackRows]] = await Promise.all([
    database.query(
      `SELECT * FROM ai_conversations
       WHERE actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
         AND admin_context_id <=> ? AND ${LIVE_RETENTION_SQL}
       ORDER BY create_time ASC, id ASC`,
      owner,
    ),
    database.query(
      `SELECT m.* FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE c.actor_user_id = ? AND c.subject_user_id = ? AND c.admin_context_mode = ?
         AND c.admin_context_id <=> ?
         AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))
       ORDER BY m.create_time ASC, m.id ASC`,
      owner,
    ),
    database.query(
      `SELECT s.* FROM ai_message_sources s
       JOIN ai_messages m ON m.id = s.message_id
       JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE c.actor_user_id = ? AND c.subject_user_id = ? AND c.admin_context_mode = ?
         AND c.admin_context_id <=> ?
         AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))
       ORDER BY s.id ASC`,
      owner,
    ),
    database.query(
      `SELECT e.* FROM ai_message_evidence e
       JOIN ai_messages m ON m.id = e.message_id
       JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE c.actor_user_id = ? AND c.subject_user_id = ? AND c.admin_context_mode = ?
         AND c.admin_context_id <=> ?
         AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))
       ORDER BY e.id ASC`,
      owner,
    ),
    database.query(
      `SELECT f.id, f.conversation_id, f.message_id, f.request_id, f.rating, f.reason,
              f.resolved, f.comment, f.create_time, f.update_time
       FROM ai_feedback f
       JOIN ai_conversations c ON c.id = f.conversation_id
       WHERE c.actor_user_id = ? AND c.subject_user_id = ? AND c.admin_context_mode = ?
         AND c.admin_context_id <=> ?
         AND (c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))
       ORDER BY f.create_time ASC, f.id ASC`,
      owner,
    ),
  ]);
  const sourcesByMessage = new Map();
  const evidenceByMessage = new Map();
  for (const source of sourceRows) {
    const list = sourcesByMessage.get(source.message_id) || [];
    list.push(mapSource(source));
    sourcesByMessage.set(source.message_id, list);
  }
  for (const evidence of evidenceRows) {
    const list = evidenceByMessage.get(evidence.message_id) || [];
    list.push(mapEvidence(evidence));
    evidenceByMessage.set(evidence.message_id, list);
  }
  const messagesByConversation = new Map();
  for (const row of messageRows) {
    const list = messagesByConversation.get(row.conversation_id) || [];
    list.push(mapMessage(row, sourcesByMessage.get(row.id) || [], evidenceByMessage.get(row.id) || []));
    messagesByConversation.set(row.conversation_id, list);
  }
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    conversationCount: conversationRows.length,
    messageCount: messageRows.length,
    conversations: conversationRows.map((row) => ({
      ...mapConversation(row),
      messages: messagesByConversation.get(row.id) || [],
    })),
    feedback: feedbackRows.map((row) => ({
      id: String(row.id),
      conversationId: String(row.conversation_id),
      messageId: String(row.message_id),
      requestId: row.request_id || null,
      rating: row.rating,
      reason: row.reason || null,
      resolved: row.resolved == null ? null : Boolean(row.resolved),
      comment: row.comment || '',
      createdAt: row.create_time,
      updatedAt: row.update_time,
    })),
  };
}

function clonedParentMessageId(message, clonedMessageIds) {
  if (!message?.parentMessageId) return null;
  return clonedMessageIds.get(message.parentMessageId) || null;
}

export async function branchAiConversation(identity, conversationId, input = {}, database = pool) {
  assertAiConversationWritable(identity);
  const ownsTransaction = typeof database?.getConnection === 'function';
  const connection = ownsTransaction ? await database.getConnection() : database;
  if (!connection || typeof connection.query !== 'function') {
    throw serviceError('AI_DATABASE_UNAVAILABLE', 'AI 会话存储暂时不可用', 503);
  }
  try {
    if (ownsTransaction) await connection.beginTransaction();
    const ownedSource = await getOwnedConversationRow(connection, identity, conversationId);
    if (!ownedSource) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
    const [messageCountRows] = await connection.query(
      'SELECT COUNT(*) AS total FROM ai_messages WHERE conversation_id = ?',
      [ownedSource.id],
    );
    const sourceMessageCount = Math.max(0, Number(messageCountRows[0]?.total || 0));
    if (sourceMessageCount > 200) {
      throw serviceError(
        'CONVERSATION_BRANCH_TOO_LARGE',
        '当前会话消息过多，无法安全创建完整分支；请从较短的会话继续',
        409,
      );
    }
    const source = await getAiConversation(identity, conversationId, { messageLimit: 200 }, connection);
    const throughMessageId = asString(input.throughMessageId, 36);
    const index = throughMessageId
      ? source.messages.findIndex((message) => message.id === throughMessageId)
      : source.messages.length - 1;
    if (throughMessageId && index < 0) throw serviceError('MESSAGE_NOT_FOUND', '分支起点不属于当前会话', 404);
    const branchFromMessageId = index >= 0 ? source.messages[index].id : null;
    const branch = await createAiConversation(
      identity,
      {
        title: asString(input.title, 255, `${source.title} · 分支`),
        scopeType: source.scopeType,
        scope: source.scope,
        retentionMode: source.retentionMode,
        expireAt: source.retentionMode === 'temporary' ? source.expireAt : null,
      },
      connection,
      {
        rootConversationId: source.rootConversationId || source.id,
        parentConversationId: source.id,
        branchFromMessageId,
      },
    );
    const clonedMessageIds = new Map();
    for (const message of source.messages.slice(0, index + 1)) {
      const cloned = await saveAiMessage(
        identity,
        branch.id,
        {
          parentMessageId: clonedParentMessageId(message, clonedMessageIds),
          role: message.role,
          content: message.content,
          status: message.status === 'generating' ? 'stopped' : message.status,
          contextRefs: message.contextRefs,
          attachmentRefs: message.attachmentRefs,
          activity: message.activity,
          coverage: message.coverage,
          versionGroupId: message.versionGroupId,
          modelMeta: message.modelMeta,
          sources: message.sources,
          evidence: message.evidence,
        },
        connection,
      );
      clonedMessageIds.set(message.id, cloned.id);
    }
    const result = await getAiConversation(identity, branch.id, { messageLimit: 200 }, connection);
    if (ownsTransaction) await connection.commit();
    return result;
  } catch (error) {
    if (ownsTransaction) await connection.rollback();
    throw error;
  } finally {
    if (ownsTransaction) connection.release();
  }
}

export async function saveAiFeedback(identity, input = {}, database = pool) {
  assertAiConversationWritable(identity);
  const conversationId = asString(input.conversationId, 36);
  const messageId = asString(input.messageId, 36);
  const rating = FEEDBACK_RATINGS.has(input.rating) ? input.rating : null;
  const reason = input.reason == null || input.reason === '' ? null : input.reason;
  if (!rating) throw serviceError('FEEDBACK_RATING_INVALID', '请选择有帮助或没帮助');
  if (reason && !FEEDBACK_REASONS.has(reason)) throw serviceError('FEEDBACK_REASON_INVALID', '反馈原因无效');
  const conversation = await getOwnedConversationRow(database, identity, conversationId);
  if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const [messages] = await database.query(
    'SELECT id, request_id FROM ai_messages WHERE id = ? AND conversation_id = ? AND role = ? LIMIT 1',
    [messageId, conversation.id, 'assistant'],
  );
  if (!messages.length) throw serviceError('MESSAGE_NOT_FOUND', '只能评价当前会话中的助手回答', 404);
  const id = crypto.randomUUID();
  await database.query(
    `INSERT INTO ai_feedback
      (id, actor_user_id, subject_user_id, conversation_id, message_id, request_id, rating, reason, resolved, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), reason = VALUES(reason), resolved = VALUES(resolved),
       comment = VALUES(comment), request_id = VALUES(request_id), update_time = CURRENT_TIMESTAMP`,
    [
      id,
      identity.actorUserId,
      identity.subjectUserId,
      conversation.id,
      messageId,
      messages[0].request_id || null,
      rating,
      reason,
      input.resolved == null ? null : input.resolved ? 1 : 0,
      asString(input.comment, 500) || null,
    ],
  );
  const [rows] = await database.query(
    `SELECT f.* FROM ai_feedback f
     JOIN ai_conversations c ON c.id = f.conversation_id
     WHERE f.actor_user_id = ? AND f.message_id = ?
       AND c.actor_user_id = ? AND c.subject_user_id = ? AND c.admin_context_mode = ?
       AND c.admin_context_id <=> ? AND ${LIVE_RETENTION_SQL} LIMIT 1`,
    [identity.actorUserId, messageId, ...ownerParams(identity)],
  );
  const row = rows[0];
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    rating: row.rating,
    reason: row.reason,
    resolved: row.resolved == null ? null : Boolean(row.resolved),
    comment: row.comment || '',
    updatedAt: row.update_time,
  };
}

export async function getOwnedAiMessage(identity, conversationId, messageId, database = pool) {
  const conversation = await getOwnedConversationRow(database, identity, conversationId);
  if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const [rows] = await database.query('SELECT * FROM ai_messages WHERE id = ? AND conversation_id = ? LIMIT 1', [
    asString(messageId, 36),
    conversation.id,
  ]);
  if (!rows.length) throw serviceError('MESSAGE_NOT_FOUND', '消息不存在或无权访问', 404);
  const [[sourceRows], [evidenceRows]] = await Promise.all([
    database.query('SELECT * FROM ai_message_sources WHERE message_id = ? ORDER BY id ASC', [messageId]),
    database.query('SELECT * FROM ai_message_evidence WHERE message_id = ? ORDER BY id ASC', [messageId]),
  ]);
  return mapMessage(rows[0], sourceRows.map(mapSource), evidenceRows.map(mapEvidence));
}

export const __testing = {
  DEFAULT_TEMPORARY_RETENTION_MS,
  MAX_TEMPORARY_RETENTION_MS,
  decodeCursor,
  encodeCursor,
  normalizeTemporaryExpireAt,
  clonedParentMessageId,
  normalizedOwner,
  normalizeEvidence,
  normalizeSources,
  serviceError,
};
