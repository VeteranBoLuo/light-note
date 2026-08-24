import pool from '../db/index.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

/**
 * 旧通用助手的会话只作为用户可控档案保留。
 * 本服务只允许读取、导出、删除和保留期清理；禁止创建会话、续写消息、恢复本机历史或写入反馈。
 */

const CONVERSATION_STATUSES = new Set(['active', 'archived']);
const LEGACY_MEMORY_TYPES = new Set(['preference', 'fact', 'topic', 'workflow', 'temporary_state']);
const LEGACY_MEMORY_SCOPES = new Set(['global', 'conversation', 'resource']);
const LEGACY_MEMORY_REASONS = new Set([
  'temporary_session',
  'disabled',
  'translation',
  'visitor',
  'admin_context',
  'no_match',
  'unavailable',
]);

// 旧会话档案仍需安全读取已经持久化的 memory_context 活动，但新产品不再加载或写入用户记忆。
function normalizeLegacyMemoryInfluence(value) {
  const status = value?.status === 'used' ? 'used' : 'not_used';
  if (status !== 'used') {
    return {
      status,
      count: 0,
      types: [],
      scopes: [],
      reason: LEGACY_MEMORY_REASONS.has(value?.reason) ? value.reason : 'unavailable',
    };
  }
  const count = Math.max(1, Math.min(20, Number.isSafeInteger(value?.count) ? value.count : 1));
  const types = Array.isArray(value?.types)
    ? [...new Set(value.types.filter((item) => LEGACY_MEMORY_TYPES.has(item)))].slice(0, LEGACY_MEMORY_TYPES.size)
    : [];
  const scopes = Array.isArray(value?.scopes)
    ? [...new Set(value.scopes.filter((item) => LEGACY_MEMORY_SCOPES.has(item)))].slice(0, LEGACY_MEMORY_SCOPES.size)
    : [];
  return { status, count, types, scopes };
}
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

function normalizeMessageActivity(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((item) => {
    if (!item || typeof item !== 'object' || item.event !== 'memory_context') return item;
    return { event: 'memory_context', ...normalizeLegacyMemoryInfluence(item) };
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
    isPinned: Boolean(row.is_pinned),
    retentionMode: row.retention_mode || 'standard',
    expireAt: row.expire_at || null,
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
  return Buffer.from(
    JSON.stringify({ pinned: Number(row.is_pinned || 0), at: row.last_message_at, id: row.id }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!value?.at || !value?.id) throw new Error('invalid');
    return { pinned: value.pinned ? 1 : 0, at: value.at, id: String(value.id) };
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
    where += ` AND (
      is_pinned < ?
      OR (is_pinned = ? AND (last_message_at < ? OR (last_message_at = ? AND id < ?)))
    )`;
    params.push(cursor.pinned, cursor.pinned, cursor.at, cursor.at, cursor.id);
  }
  params.push(limit + 1);
  const [rows] = await database.query(
    `SELECT * FROM ai_conversations WHERE ${where}
     ORDER BY is_pinned DESC, last_message_at DESC, id DESC LIMIT ?`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map(mapConversation),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getAiConversation(identity, conversationId, options = {}, database = pool) {
  const conversation = await getOwnedConversationRow(database, identity, conversationId);
  if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', '会话不存在或无权访问', 404);
  const messageLimit = Math.max(0, Math.min(200, Number(options.messageLimit ?? 100)));
  if (!messageLimit) return { ...mapConversation(conversation), messages: [] };
  const [rows] = await database.query(
    `SELECT * FROM (
       SELECT * FROM ai_messages WHERE conversation_id = ?
       ORDER BY create_time DESC, id DESC LIMIT ?
     ) AS recent_messages
     ORDER BY create_time ASC, id ASC`,
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
        'skillThreads',
        `DELETE FROM ai_skill_threads WHERE ${clearScope.sql}`,
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

export const __testing = Object.freeze({
  decodeCursor,
  encodeCursor,
  normalizedOwner,
  serviceError,
});
