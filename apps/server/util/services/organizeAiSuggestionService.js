import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { AI_QUOTA_ERROR_CODES, isAiQuotaErrorCode } from '@lightnote/shared/ai-quota-protocol';
import { createUserAiExecutionConfig } from '../aiBillingCatalog.js';
import { runAiExecution } from '../aiExecution/service.js';
import { suggestBookmarkMeta, suggestTagsFromText } from '../aiOrganize.js';
import { lockActiveUserForUpdate, withActiveUserAiDispatch } from '../aiOutboundDispatchGuard.js';
import { isOrganizeAiSuggestionsEnabled } from '../organizeAiSuggestionFeature.js';
import { insertResourceTagRelations } from '../resourceTags.js';
import { getActiveSecurityRestrictions } from '../security/services/securityRestrictionService.js';
import { ensureTag } from './tagService.js';

export const ORGANIZE_AI_SUGGESTION_MAX_ITEMS = 20;
const ORGANIZE_AI_SUGGESTION_MAX_TAGS = 3;
const RESOURCE_TYPES = new Set(['bookmark', 'note']);
const SCOPE_MODES = new Set(['selected', 'untagged']);
const BATCH_STATUSES = new Set(['queued', 'running', 'ready', 'partial', 'failed', 'completed', 'cancelled']);
const EDITABLE_SUGGESTION_STATUSES = new Set(['pending', 'no_suggestion']);
const LEASE_SECONDS = 10 * 60;
// documentWorker 同时服务文档解析、文件预览和知识工坊；每次只处理一项，
// 让现有轮转调度在两次可能较慢的网页抓取 / Provider 调用之间获得执行权。
const WORKER_SLICE_ITEMS = 1;
// 持久批次按单资源切片创建独立 Execution。这里仅提供单条调用的保守底线；
// Gateway 仍会按本次真实 prompt + maxTokens 的更高估算值原子占位。
const WORKER_ITEM_RESERVATION_TOKENS = 5_000;

function organizeAiError(code, message, status = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details) error.details = details;
  return error;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeResourceType(value) {
  const type = String(value || '').trim();
  if (!RESOURCE_TYPES.has(type)) throw organizeAiError('ORGANIZE_AI_RESOURCE_TYPE_INVALID', '仅支持整理书签或笔记');
  return type;
}

function normalizeScope(value) {
  const scope = String(value || '').trim();
  if (!SCOPE_MODES.has(scope)) throw organizeAiError('ORGANIZE_AI_SCOPE_INVALID', '整理范围无效');
  return scope;
}

function normalizeIds(value, { required = false } = {}) {
  if (value == null && !required) return [];
  if (!Array.isArray(value)) throw organizeAiError('ORGANIZE_AI_RESOURCE_IDS_INVALID', '资源 ID 必须是数组');
  const ids = [...new Set(value.map((id) => String(id || '').trim()))];
  if (ids.some((id) => !id || id.length > 128) || ids.length > ORGANIZE_AI_SUGGESTION_MAX_ITEMS) {
    throw organizeAiError(
      'ORGANIZE_AI_RESOURCE_IDS_INVALID',
      `每个批次最多选择 ${ORGANIZE_AI_SUGGESTION_MAX_ITEMS} 项资源`,
    );
  }
  if (required && !ids.length) throw organizeAiError('ORGANIZE_AI_RESOURCE_IDS_REQUIRED', '请至少选择一项资源');
  return ids;
}

function normalizeGroupId(value) {
  if (value == null || value === '') return null;
  const id = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
    throw organizeAiError('ORGANIZE_AI_GROUP_ID_INVALID', 'groupId 必须是 UUID');
  }
  return id;
}

function normalizeRequest(input, { requireRequestId = false } = {}) {
  const resourceType = normalizeResourceType(input?.resourceType);
  const scopeMode = normalizeScope(input?.scope);
  const resourceIds = normalizeIds(input?.resourceIds, { required: scopeMode === 'selected' });
  if (scopeMode === 'untagged' && resourceIds.length) {
    throw organizeAiError('ORGANIZE_AI_RESOURCE_IDS_FORBIDDEN', '无标签范围不能同时指定资源 ID');
  }
  const requestId = String(input?.requestId || '').trim();
  if (
    requireRequestId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(requestId)
  ) {
    throw organizeAiError('ORGANIZE_AI_REQUEST_ID_INVALID', 'requestId 必须是 UUID');
  }
  const groupId = normalizeGroupId(input?.groupId);
  return Object.freeze({ resourceType, scopeMode, resourceIds: Object.freeze(resourceIds), requestId, groupId });
}

function normalizeTagNames(value) {
  if (!Array.isArray(value)) throw organizeAiError('ORGANIZE_AI_TAGS_INVALID', '标签名称必须是数组');
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const name = String(item || '')
      .normalize('NFKC')
      .trim();
    const key = name.toLocaleLowerCase();
    if (!name || name.length > 32 || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  if (!result.length || result.length > ORGANIZE_AI_SUGGESTION_MAX_TAGS) {
    throw organizeAiError('ORGANIZE_AI_TAGS_INVALID', `请选择 1～${ORGANIZE_AI_SUGGESTION_MAX_TAGS} 个有效标签`);
  }
  return result;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function snapshotPayload(type, row) {
  if (type === 'note') {
    return {
      title: String(row.title || ''),
      content: row.type === 'drawing' ? '' : stripHtml(row.content).slice(0, 2_800),
      noteType: String(row.type || 'html'),
      revision: Math.max(1, Number(row.revision || 1)),
    };
  }
  return {
    title: String(row.name || ''),
    description: String(row.description || ''),
    url: String(row.url || ''),
  };
}

function snapshotHash(type, resourceId, payload, tags) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        type,
        resourceId: String(resourceId),
        payload,
        tags: tags.map((tag) => [String(tag.id), String(tag.name)]).sort((a, b) => a[0].localeCompare(b[0])),
      }),
    )
    .digest('hex');
}

async function loadTagMap(database, userId, type, ids) {
  if (!ids.length) return new Map();
  const [rows] = await database.query(
    `SELECT r.resource_id AS resourceId, t.id, t.name
       FROM resource_tag_relations r
       INNER JOIN tag t ON t.id = r.tag_id AND t.user_id = ? AND t.del_flag = 0
      WHERE r.user_id = ? AND r.resource_type = ? AND r.resource_id IN (?)
      ORDER BY t.sort, t.create_time DESC`,
    [userId, userId, type, ids],
  );
  const map = new Map(ids.map((id) => [String(id), []]));
  for (const row of rows) map.get(String(row.resourceId))?.push({ id: String(row.id), name: String(row.name || '') });
  return map;
}

async function loadSelectedRows(database, userId, type, ids) {
  if (!ids.length) return [];
  if (type === 'note') {
    const [rows] = await database.query(
      `SELECT id, title, type, content, revision
         FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)`,
      [userId, ids],
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }
  const [rows] = await database.query(
    `SELECT id, name, url, description
       FROM bookmark WHERE user_id = ? AND del_flag = 0 AND id IN (?)`,
    [userId, ids],
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function countUntagged(database, userId, type) {
  const table = type === 'note' ? 'note' : 'bookmark';
  const alias = type === 'note' ? 'n' : 'b';
  const owner = type === 'note' ? 'create_by' : 'user_id';
  const [rows] = await database.query(
    `SELECT COUNT(*) AS total FROM ${table} ${alias}
      WHERE ${alias}.${owner} = ? AND ${alias}.del_flag = 0
        AND NOT EXISTS (
          SELECT 1 FROM resource_tag_relations r
          INNER JOIN tag t ON t.id = r.tag_id AND t.user_id = ? AND t.del_flag = 0
          WHERE r.user_id = ? AND r.resource_type = ? AND r.resource_id = ${alias}.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM organize_issue_suppressions s
          WHERE s.user_id = ? AND s.issue_type = 'untagged.ignore'
            AND s.subject_key = CONCAT(?, ':', ${alias}.id)
        )`,
    [userId, userId, userId, type, userId, type],
  );
  return Math.max(0, Number(rows[0]?.total || 0));
}

async function loadUntaggedRows(database, userId, type, limit = ORGANIZE_AI_SUGGESTION_MAX_ITEMS) {
  const table = type === 'note' ? 'note' : 'bookmark';
  const alias = type === 'note' ? 'n' : 'b';
  const owner = type === 'note' ? 'create_by' : 'user_id';
  const columns =
    type === 'note' ? 'n.id, n.title, n.type, n.content, n.revision' : 'b.id, b.name, b.url, b.description';
  const [rows] = await database.query(
    `SELECT ${columns} FROM ${table} ${alias}
      WHERE ${alias}.${owner} = ? AND ${alias}.del_flag = 0
        AND NOT EXISTS (
          SELECT 1 FROM resource_tag_relations r
          INNER JOIN tag t ON t.id = r.tag_id AND t.user_id = ? AND t.del_flag = 0
          WHERE r.user_id = ? AND r.resource_type = ? AND r.resource_id = ${alias}.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM organize_issue_suppressions s
          WHERE s.user_id = ? AND s.issue_type = 'untagged.ignore'
            AND s.subject_key = CONCAT(?, ':', ${alias}.id)
        )
      ORDER BY ${alias}.create_time DESC, ${alias}.id DESC LIMIT ?`,
    [userId, userId, userId, type, userId, type, limit],
  );
  return rows;
}

async function loadSnapshots(database, userId, normalized) {
  const rows =
    normalized.scopeMode === 'selected'
      ? await loadSelectedRows(database, userId, normalized.resourceType, normalized.resourceIds)
      : await loadUntaggedRows(database, userId, normalized.resourceType);
  const ids = rows.map((row) => String(row.id));
  const tagsById = await loadTagMap(database, userId, normalized.resourceType, ids);
  return rows.map((row) => {
    const id = String(row.id);
    const payload = snapshotPayload(normalized.resourceType, row);
    const tags = tagsById.get(id) || [];
    return Object.freeze({
      resourceType: normalized.resourceType,
      resourceId: id,
      title: payload.title,
      version:
        normalized.resourceType === 'note'
          ? String(payload.revision)
          : snapshotHash(normalized.resourceType, id, payload, tags),
      sourceHash: snapshotHash(normalized.resourceType, id, payload, tags),
      sourceText: JSON.stringify(payload),
      currentTags: Object.freeze(tags),
    });
  });
}

function payloadHash(normalized) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        resourceType: normalized.resourceType,
        scope: normalized.scopeMode,
        resourceIds: [...normalized.resourceIds].sort(),
        ...(normalized.groupId ? { groupId: normalized.groupId } : {}),
      }),
    )
    .digest('hex');
}

function batchStatusFromCounts(counts) {
  const pendingWork = counts.queued + counts.running;
  if (pendingWork) return counts.processed ? 'running' : 'queued';
  if (counts.pending) return counts.failed || counts.conflicted ? 'partial' : 'ready';
  if (counts.failed || counts.conflicted) return counts.processed === counts.failed ? 'failed' : 'partial';
  return 'completed';
}

function countSuggestionStatuses(rows) {
  const counts = {
    processed: 0,
    pending: 0,
    queued: 0,
    running: 0,
    failed: 0,
    accepted: 0,
    ignored: 0,
    conflicted: 0,
  };
  for (const row of rows) {
    const status = String(row.status || '');
    if (status === 'conflict') counts.conflicted += 1;
    else if (Object.hasOwn(counts, status)) counts[status] += 1;
    if (['pending', 'no_suggestion', 'failed', 'accepted', 'ignored', 'conflict'].includes(status)) {
      counts.processed += 1;
    }
  }
  return counts;
}

function mapBatch(row) {
  const total = Math.max(0, Number(row.total || 0));
  const processed = Math.max(0, Number(row.processed || 0));
  return {
    id: String(row.id),
    groupId: row.groupId ?? row.group_id ?? null,
    resourceType: String(row.resourceType ?? row.resource_type),
    scopeMode: String(row.scopeMode ?? row.scope_mode),
    status: String(row.status),
    progress: {
      total,
      processed,
      ready: Math.max(0, Number((row.ready ?? row.ready_count) || 0)),
      failed: Math.max(0, Number((row.failed ?? row.failed_count) || 0)),
      accepted: Math.max(0, Number((row.accepted ?? row.accepted_count) || 0)),
      ignored: Math.max(0, Number((row.ignored ?? row.ignored_count) || 0)),
      conflicted: Math.max(0, Number((row.conflicted ?? row.conflicted_count) || 0)),
      percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 100,
    },
    createdAt: row.createdAt ?? row.create_time,
    startedAt: row.startedAt ?? row.started_at ?? null,
    finishedAt: row.finishedAt ?? row.finished_at ?? null,
    lastErrorCode: row.lastErrorCode ?? row.last_error_code ?? null,
  };
}

function mapSuggestion(row) {
  return {
    id: String(row.id),
    resource: {
      type: String(row.resourceType ?? row.resource_type),
      id: String(row.resourceId ?? row.resource_id),
      title: String((row.resourceTitle ?? row.resource_title) || ''),
      version: String((row.resourceVersion ?? row.resource_version) || ''),
    },
    currentTags: parseJson(row.currentTags ?? row.current_tags_json, []),
    recommendedTags: parseJson(row.recommendedTags ?? row.recommended_tags_json, []),
    reason: String(row.reason || ''),
    status: String(row.status),
    ...(row.acceptedTags != null || row.accepted_tags_json != null
      ? { acceptedTags: parseJson(row.acceptedTags ?? row.accepted_tags_json, []) }
      : {}),
    updatedAt: row.updatedAt ?? row.update_time ?? null,
    lastErrorCode: row.lastErrorCode ?? row.last_error_code ?? null,
  };
}

const BATCH_SELECT = `SELECT id, group_id AS groupId, resource_type AS resourceType, scope_mode AS scopeMode, status,
  total, processed, ready_count AS ready, failed_count AS failed, accepted_count AS accepted,
  ignored_count AS ignored, conflicted_count AS conflicted, create_time AS createdAt,
  started_at AS startedAt, finished_at AS finishedAt, last_error_code AS lastErrorCode`;
const SUGGESTION_SELECT = `SELECT id, batch_id AS batchId, resource_type AS resourceType,
  resource_id AS resourceId, resource_title AS resourceTitle, resource_version AS resourceVersion,
  source_hash AS sourceHash, current_tags_json AS currentTags,
  recommended_tags_json AS recommendedTags, accepted_tags_json AS acceptedTags,
  reason, status, update_time AS updatedAt, last_error_code AS lastErrorCode`;

async function getBatchRow(database, userId, batchId) {
  const [rows] = await database.query(
    `${BATCH_SELECT} FROM organize_ai_tag_batches WHERE id = ? AND user_id = ? LIMIT 1`,
    [batchId, userId],
  );
  return rows[0] || null;
}

export async function estimateOrganizeAiSuggestions(database = pool, { userId, input, env = process.env } = {}) {
  const normalized = normalizeRequest(input);
  const featureEnabled = isOrganizeAiSuggestionsEnabled(env);
  let requestedCount;
  let eligibleCount;
  if (normalized.scopeMode === 'selected') {
    requestedCount = normalized.resourceIds.length;
    eligibleCount = (await loadSelectedRows(database, userId, normalized.resourceType, normalized.resourceIds)).length;
  } else {
    requestedCount = await countUntagged(database, userId, normalized.resourceType);
    eligibleCount = Math.min(requestedCount, ORGANIZE_AI_SUGGESTION_MAX_ITEMS);
  }
  const skippedCount = Math.max(0, requestedCount - eligibleCount);
  return {
    featureEnabled,
    maxItemsPerBatch: ORGANIZE_AI_SUGGESTION_MAX_ITEMS,
    scope: {
      mode: normalized.scopeMode,
      resourceType: normalized.resourceType,
      requestedCount,
      eligibleCount,
      skippedCount,
    },
    estimate: { estimatedTokensLower: eligibleCount * 800, estimatedTokensUpper: eligibleCount * 1_800 },
    canCreate: featureEnabled && eligibleCount > 0,
  };
}

export async function createOrganizeAiSuggestionBatch(database = pool, { userId, input, env = process.env } = {}) {
  if (!isOrganizeAiSuggestionsEnabled(env)) {
    throw organizeAiError('ORGANIZE_AI_SUGGESTIONS_DISABLED', 'AI 整理建议当前未开放', 503);
  }
  const normalized = normalizeRequest(input, { requireRequestId: true });
  const hash = payloadHash(normalized);
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  const ownsConnection = connection !== database;
  const batchId = crypto.randomUUID();
  let snapshots = [];
  try {
    await connection.beginTransaction?.();
    // 批次创建也与注销入口共用 user 行锁，避免注销清理完成后才插入孤儿批次。
    await lockActiveUserForUpdate(connection, userId);
    const [existingRows] = await connection.query(
      `${BATCH_SELECT}, payload_hash AS payloadHash FROM organize_ai_tag_batches
        WHERE user_id = ? AND client_request_id = ? LIMIT 1`,
      [userId, normalized.requestId],
    );
    if (existingRows.length) {
      if (existingRows[0].payloadHash !== hash) {
        throw organizeAiError('ORGANIZE_AI_REQUEST_REUSED', '同一 requestId 不能创建不同批次', 409);
      }
      await connection.commit?.();
      return mapBatch(existingRows[0]);
    }
    snapshots = await loadSnapshots(connection, userId, normalized);
    if (!snapshots.length) throw organizeAiError('ORGANIZE_AI_NO_ELIGIBLE_RESOURCES', '当前没有可整理的内容', 409);
    await connection.query(
      `INSERT INTO organize_ai_tag_batches
        (id, user_id, client_request_id, payload_hash, resource_type, scope_mode, status, total, group_id)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
      [batchId, userId, normalized.requestId, hash, normalized.resourceType, normalized.scopeMode, snapshots.length, normalized.groupId],
    );
    const values = snapshots.map((snapshot) => [
      crypto.randomUUID(),
      batchId,
      userId,
      snapshot.resourceType,
      snapshot.resourceId,
      snapshot.title.slice(0, 255),
      snapshot.version,
      snapshot.sourceHash,
      JSON.stringify(snapshot.currentTags),
    ]);
    await connection.query(
      `INSERT INTO organize_ai_tag_suggestions
        (id, batch_id, user_id, resource_type, resource_id, resource_title, resource_version,
         source_hash, current_tags_json) VALUES ?`,
      [values],
    );
    await connection.commit?.();
  } catch (error) {
    await connection.rollback?.().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') {
      const [rows] = await connection.query(
        `${BATCH_SELECT}, payload_hash AS payloadHash FROM organize_ai_tag_batches
          WHERE user_id = ? AND client_request_id = ? LIMIT 1`,
        [userId, normalized.requestId],
      );
      if (rows[0]?.payloadHash === hash) return mapBatch(rows[0]);
      throw organizeAiError('ORGANIZE_AI_REQUEST_REUSED', '同一 requestId 不能创建不同批次', 409);
    }
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
  return mapBatch({
    id: batchId,
    groupId: normalized.groupId,
    resourceType: normalized.resourceType,
    scopeMode: normalized.scopeMode,
    status: 'queued',
    total: snapshots.length,
    processed: 0,
    ready: 0,
    failed: 0,
    accepted: 0,
    ignored: 0,
    conflicted: 0,
    createdAt: new Date().toISOString(),
  });
}

function encodeBatchCursor(row) {
  return Buffer.from(JSON.stringify({ v: 1, t: row.createdAt, id: row.id }), 'utf8').toString('base64url');
}

function decodeBatchCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (parsed?.v !== 1 || !parsed.t || !parsed.id) throw new Error('invalid');
    return parsed;
  } catch {
    throw organizeAiError('ORGANIZE_CURSOR_INVALID', '分页位置已失效，请重新加载');
  }
}

export async function listOrganizeAiSuggestionBatches(
  database = pool,
  { userId, cursor: rawCursor, limit: rawLimit = 20, status: rawStatus, groupId: rawGroupId } = {},
) {
  const limit = Math.min(50, Math.max(1, Math.floor(Number(rawLimit) || 20)));
  const cursor = decodeBatchCursor(rawCursor);
  const status = String(rawStatus || '').trim();
  if (status && !BATCH_STATUSES.has(status)) throw organizeAiError('ORGANIZE_AI_BATCH_STATUS_INVALID', '批次状态无效');
  const where = ['user_id = ?'];
  const params = [userId];
  const groupId = normalizeGroupId(rawGroupId);
  if (groupId) {
    where.push('group_id = ?');
    params.push(groupId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (cursor) {
    where.push('(create_time < ? OR (create_time = ? AND id < ?))');
    params.push(cursor.t, cursor.t, cursor.id);
  }
  params.push(limit + 1);
  const [rows] = await database.query(
    `${BATCH_SELECT} FROM organize_ai_tag_batches WHERE ${where.join(' AND ')}
      ORDER BY create_time DESC, id DESC LIMIT ?`,
    params,
  );
  const items = rows.slice(0, limit).map(mapBatch);
  return { items, nextCursor: rows.length > limit && items.length ? encodeBatchCursor(items.at(-1)) : null };
}

export async function getOrganizeAiSuggestionBatch(database = pool, { userId, batchId } = {}) {
  const row = await getBatchRow(database, userId, batchId);
  if (!row) throw organizeAiError('ORGANIZE_AI_BATCH_NOT_FOUND', '整理建议批次不存在', 404);
  const [suggestionRows] = await database.query(
    `${SUGGESTION_SELECT} FROM organize_ai_tag_suggestions
      WHERE batch_id = ? AND user_id = ? ORDER BY create_time ASC, id ASC`,
    [batchId, userId],
  );
  return { ...mapBatch(row), suggestions: suggestionRows.map(mapSuggestion), nextCursor: null };
}

async function lockOwnedBatch(connection, batchId, userId, { leaseToken } = {}) {
  const where = ['id = ?', 'user_id = ?'];
  const params = [batchId, userId];
  if (leaseToken !== undefined) {
    where.push("status = 'running'", 'lease_token = ?');
    params.push(leaseToken);
  }
  const [rows] = await connection.query(
    `SELECT id FROM organize_ai_tag_batches WHERE ${where.join(' AND ')} LIMIT 1 FOR UPDATE`,
    params,
  );
  return rows[0] || null;
}

async function refreshBatchProgress(database, batchId, userId, { leaseToken } = {}) {
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  const ownsConnection = connection !== database;
  try {
    if (ownsConnection) await connection.beginTransaction();
    const batch = await lockOwnedBatch(connection, batchId, userId, {
      ...(leaseToken !== undefined ? { leaseToken } : {}),
    });
    if (!batch) {
      if (leaseToken !== undefined) throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
      throw organizeAiError('ORGANIZE_AI_BATCH_NOT_FOUND', '整理建议批次不存在', 404);
    }
    // 先锁批次，再以锁定读取得同批次全部建议状态。不能在 RR 事务里用普通 SUM
    // 一致性快照，否则两个接受/忽略事务可能各自把旧计数写回批次。
    const [suggestionRows] = await connection.query(
      `SELECT id, status FROM organize_ai_tag_suggestions
        WHERE batch_id = ? AND user_id = ? ORDER BY id FOR UPDATE`,
      [batchId, userId],
    );
    const counts = countSuggestionStatuses(suggestionRows);
    const status = batchStatusFromCounts(counts);
    const updateWhere = ['id = ?', 'user_id = ?'];
    const updateParams = [
      status,
      counts.processed,
      counts.pending,
      counts.failed,
      counts.accepted,
      counts.ignored,
      counts.conflicted,
      status,
      batchId,
      userId,
    ];
    if (leaseToken !== undefined) {
      updateWhere.push("status = 'running'", 'lease_token = ?');
      updateParams.push(leaseToken);
    }
    const [updateResult] = await connection.query(
      `UPDATE organize_ai_tag_batches
          SET status = ?, processed = ?, ready_count = ?, failed_count = ?, accepted_count = ?,
              ignored_count = ?, conflicted_count = ?,
              finished_at = IF(? IN ('ready','partial','failed','completed'), COALESCE(finished_at, NOW()), NULL)
        WHERE ${updateWhere.join(' AND ')}`,
      updateParams,
    );
    if (leaseToken !== undefined && Number(updateResult?.affectedRows || 0) !== 1) {
      throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    }
    if (ownsConnection) await connection.commit();
    return { status, counts };
  } catch (error) {
    if (ownsConnection) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function loadOwnedSuggestionForUpdate(connection, userId, batchId, suggestionId) {
  const [rows] = await connection.query(
    `${SUGGESTION_SELECT} FROM organize_ai_tag_suggestions
      WHERE id = ? AND batch_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
    [suggestionId, batchId, userId],
  );
  if (!rows.length) throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_FOUND', '整理建议不存在', 404);
  return rows[0];
}

async function resolveRecommendedTags(database, userId, tagNames) {
  const [rows] = await database.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
  const byName = new Map(rows.map((tag) => [String(tag.name).normalize('NFKC').trim().toLocaleLowerCase(), tag]));
  return tagNames.map((name) => {
    const existing = byName.get(name.toLocaleLowerCase());
    return existing
      ? { id: String(existing.id), name: String(existing.name), source: 'existing' }
      : { id: null, name, source: 'new' };
  });
}

export async function editOrganizeAiSuggestion(database = pool, { userId, batchId, suggestionId, tagNames } = {}) {
  const normalizedNames = normalizeTagNames(tagNames);
  const tags = await resolveRecommendedTags(database, userId, normalizedNames);
  const [result] = await database.query(
    `UPDATE organize_ai_tag_suggestions
        SET recommended_tags_json = ?, reason = '由你调整，确认后才会写入标签'
      WHERE id = ? AND batch_id = ? AND user_id = ? AND status = 'pending'`,
    [JSON.stringify(tags), suggestionId, batchId, userId],
  );
  if (!Number(result?.affectedRows || 0))
    throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_EDITABLE', '该建议当前不能编辑', 409);
  const [rows] = await database.query(
    `${SUGGESTION_SELECT} FROM organize_ai_tag_suggestions WHERE id = ? AND batch_id = ? AND user_id = ? LIMIT 1`,
    [suggestionId, batchId, userId],
  );
  return mapSuggestion(rows[0]);
}

export async function ignoreOrganizeAiSuggestion(database = pool, { userId, batchId, suggestionId } = {}) {
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  const ownsConnection = connection !== database;
  try {
    await connection.beginTransaction?.();
    const batch = await lockOwnedBatch(connection, batchId, userId);
    if (!batch) throw organizeAiError('ORGANIZE_AI_BATCH_NOT_FOUND', '整理建议批次不存在', 404);
    const suggestion = await loadOwnedSuggestionForUpdate(connection, userId, batchId, suggestionId);
    if (suggestion.status !== 'ignored') {
      if (suggestion.status !== 'pending') {
        throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_EDITABLE', '该建议当前不能忽略', 409);
      }
      const [result] = await connection.query(
        `UPDATE organize_ai_tag_suggestions SET status = 'ignored'
          WHERE id = ? AND batch_id = ? AND user_id = ? AND status = 'pending'`,
        [suggestionId, batchId, userId],
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_EDITABLE', '该建议当前不能忽略', 409);
      }
    }
    await refreshBatchProgress(connection, batchId, userId);
    const [updatedRows] = await connection.query(
      `${SUGGESTION_SELECT} FROM organize_ai_tag_suggestions
        WHERE id = ? AND batch_id = ? AND user_id = ? LIMIT 1`,
      [suggestionId, batchId, userId],
    );
    await connection.commit?.();
    return mapSuggestion(updatedRows[0]);
  } catch (error) {
    await connection.rollback?.().catch(() => {});
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function loadCurrentSnapshot(database, userId, type, resourceId) {
  const normalized = { resourceType: type, scopeMode: 'selected', resourceIds: [String(resourceId)] };
  return (await loadSnapshots(database, userId, normalized))[0] || null;
}

async function lockOwnedResourceForUpdate(connection, userId, type, resourceId) {
  const resourceQuery =
    type === 'note'
      ? 'SELECT id, title, type, content, revision FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1 FOR UPDATE'
      : 'SELECT id, name, url, description FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE';
  const [resources] = await connection.query(resourceQuery, [resourceId, userId]);
  return resources[0] || null;
}

async function loadCurrentSnapshotForUpdate(
  connection,
  userId,
  type,
  resourceId,
  { resourceRow: lockedResourceRow, selectedTagNames = [] } = {},
) {
  const resourceRow = lockedResourceRow || (await lockOwnedResourceForUpdate(connection, userId, type, resourceId));
  if (!resourceRow) return null;

  // 全部接受路径统一使用 resource → tag/name gap → relation。标签编辑本身是
  // tag → relation；先锁标签及待创建名称的唯一键间隙，避免 relation → tag 反序死锁。
  const [tagRows] = await connection.query(
    'SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0 ORDER BY id FOR UPDATE',
    [userId],
  );
  const namesToLock = [...new Set(selectedTagNames.map((item) => String(item || '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  for (const name of namesToLock) {
    await connection.query('SELECT id, name FROM tag WHERE user_id = ? AND active_name = ? LIMIT 1 FOR UPDATE', [
      userId,
      name,
    ]);
  }
  const [relations] = await connection.query(
    `SELECT tag_id FROM resource_tag_relations
      WHERE resource_type = ? AND resource_id = ? AND user_id = ? FOR UPDATE`,
    [type, String(resourceId), userId],
  );
  const tagsById = new Map(
    tagRows.map((tag) => [String(tag.id), { id: String(tag.id), name: String(tag.name || '') }]),
  );
  const currentTags = [
    ...new Set(relations.map((row) => String(row.tag_id || '')).filter((id) => id && tagsById.has(id))),
  ].map((id) => tagsById.get(id));
  const payload = snapshotPayload(type, resourceRow);
  return Object.freeze({
    resourceType: type,
    resourceId: String(resourceId),
    title: payload.title,
    version: type === 'note' ? String(payload.revision) : snapshotHash(type, resourceId, payload, currentTags),
    sourceHash: snapshotHash(type, resourceId, payload, currentTags),
    sourceText: JSON.stringify(payload),
    currentTags: Object.freeze(currentTags),
  });
}

async function lockStoredRecommendedTags(connection, userId, rawTags) {
  if (!Array.isArray(rawTags) || !rawTags.length || rawTags.length > ORGANIZE_AI_SUGGESTION_MAX_TAGS) {
    throw organizeAiError('ORGANIZE_AI_RECOMMENDATION_STALE', '建议标签已经失效，请重新生成建议', 409);
  }
  const seenNames = new Set();
  const descriptors = rawTags.map((rawTag) => {
    const name = String(rawTag?.name || '')
      .normalize('NFKC')
      .trim();
    const id = rawTag?.id == null ? null : String(rawTag.id || '').trim();
    const source = String(rawTag?.source || (id ? 'existing' : 'new'));
    const nameKey = name.toLocaleLowerCase();
    if (
      !name ||
      name.length > 32 ||
      !['existing', 'new'].includes(source) ||
      (source === 'existing') !== Boolean(id) ||
      seenNames.has(nameKey)
    ) {
      throw organizeAiError('ORGANIZE_AI_RECOMMENDATION_STALE', '建议标签已经失效，请重新生成建议', 409);
    }
    seenNames.add(nameKey);
    return { id, name, source };
  });
  const existingIds = [...new Set(descriptors.map((tag) => tag.id).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!existingIds.length) return descriptors;
  const [rows] = await connection.query(
    'SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0 AND id IN (?) FOR UPDATE',
    [userId, existingIds],
  );
  const byId = new Map(rows.map((tag) => [String(tag.id), String(tag.name || '')]));
  for (const tag of descriptors) {
    if (!tag.id) continue;
    const currentName = byId.get(tag.id);
    if (currentName === undefined || currentName.normalize('NFKC').trim() !== tag.name) {
      throw organizeAiError('ORGANIZE_AI_RECOMMENDATION_STALE', '建议引用的标签已删除或改名', 409);
    }
  }
  return descriptors;
}

async function markSuggestionConflict(connection, { userId, batchId, suggestionId, errorCode }) {
  const [result] = await connection.query(
    `UPDATE organize_ai_tag_suggestions SET status = 'conflict', last_error_code = ?
      WHERE id = ? AND batch_id = ? AND user_id = ? AND status IN ('pending', 'no_suggestion')`,
    [errorCode, suggestionId, batchId, userId],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_EDITABLE', '该建议当前不能接受', 409);
  }
  await refreshBatchProgress(connection, batchId, userId);
}

export async function acceptOrganizeAiSuggestion(database = pool, { userId, batchId, suggestionId, tagNames, tags } = {}) {
  if (tags !== undefined && tagNames !== undefined) {
    throw organizeAiError('ORGANIZE_AI_TAGS_INVALID', '只能提交一种标签选择方式');
  }
  const manual = tags !== undefined || tagNames !== undefined;
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  const ownsConnection = connection !== database;
  try {
    await connection.beginTransaction?.();
    const batch = await lockOwnedBatch(connection, batchId, userId);
    if (!batch) throw organizeAiError('ORGANIZE_AI_BATCH_NOT_FOUND', '整理建议批次不存在', 404);
    const suggestion = await loadOwnedSuggestionForUpdate(connection, userId, batchId, suggestionId);
    if (suggestion.status === 'accepted') {
      await connection.commit?.();
      return mapSuggestion(suggestion);
    }
    if (!EDITABLE_SUGGESTION_STATUSES.has(suggestion.status) || (suggestion.status === 'no_suggestion' && !manual)) {
      throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_EDITABLE', '该建议当前不能接受', 409);
    }
    const resourceRow = await lockOwnedResourceForUpdate(
      connection,
      userId,
      suggestion.resourceType,
      suggestion.resourceId,
    );
    if (!resourceRow) {
      await markSuggestionConflict(connection, {
        userId,
        batchId,
        suggestionId,
        errorCode: 'RESOURCE_CHANGED',
      });
      await connection.commit?.();
      throw organizeAiError('ORGANIZE_AI_RESOURCE_CHANGED', '资源或标签已经变化，请重新生成建议', 409);
    }
    let selectedTags;
    if (tags !== undefined || tagNames === undefined) {
      try {
        selectedTags = await lockStoredRecommendedTags(
          connection,
          userId,
          tags !== undefined ? tags : parseJson(suggestion.recommendedTags, []),
        );
      } catch (error) {
        if (error?.code !== 'ORGANIZE_AI_RECOMMENDATION_STALE') throw error;
        await markSuggestionConflict(connection, {
          userId,
          batchId,
          suggestionId,
          errorCode: 'TAG_CHANGED',
        });
        await connection.commit?.();
        throw error;
      }
    } else {
      selectedTags = normalizeTagNames(tagNames).map((name) => ({ id: null, name, source: 'edited' }));
    }
    const current = await loadCurrentSnapshotForUpdate(
      connection,
      userId,
      suggestion.resourceType,
      suggestion.resourceId,
      {
        resourceRow,
        selectedTagNames: selectedTags.map((tag) => tag.name),
      },
    );
    if (!current || current.sourceHash !== suggestion.sourceHash) {
      await markSuggestionConflict(connection, {
        userId,
        batchId,
        suggestionId,
        errorCode: 'RESOURCE_CHANGED',
      });
      await connection.commit?.();
      throw organizeAiError('ORGANIZE_AI_RESOURCE_CHANGED', '资源或标签已经变化，请重新生成建议', 409);
    }
    const existingByName = new Map(
      current.currentTags.map((tag) => [tag.name.normalize('NFKC').toLocaleLowerCase(), tag]),
    );
    const accepted = [];
    const newTagIds = [];
    const cap = suggestion.resourceType === 'note' ? 3 : 4;
    let room = Math.max(0, cap - current.currentTags.length);
    if (manual && selectedTags.filter((tag) => !existingByName.has(tag.name.toLocaleLowerCase())).length > room) {
      throw organizeAiError('ORGANIZE_AI_TAG_LIMIT_REACHED', '所选标签超过当前资源可添加的数量', 409);
    }
    for (const selectedTag of selectedTags) {
      const name = selectedTag.name;
      const existing = existingByName.get(name.toLocaleLowerCase());
      if (existing) {
        accepted.push(existing);
        continue;
      }
      if (!room) continue;
      const tag = selectedTag.id
        ? { id: selectedTag.id, name: selectedTag.name }
        : await ensureTag({ userId, name, connection });
      newTagIds.push(String(tag.id));
      accepted.push({ id: String(tag.id), name: String(tag.name) });
      existingByName.set(name.toLocaleLowerCase(), tag);
      room -= 1;
    }
    if (!accepted.length) throw organizeAiError('ORGANIZE_AI_TAG_LIMIT_REACHED', '当前资源的标签数量已达上限', 409);
    if (newTagIds.length) {
      await insertResourceTagRelations(connection, {
        tagIds: newTagIds,
        resourceType: suggestion.resourceType,
        resourceId: suggestion.resourceId,
        userId,
        source: manual ? 'manual' : 'ai',
      });
    }
    const [acceptResult] = await connection.query(
      `UPDATE organize_ai_tag_suggestions
          SET status = 'accepted', accepted_tags_json = ?, last_error_code = NULL
        WHERE id = ? AND batch_id = ? AND user_id = ? AND status IN ('pending', 'no_suggestion')`,
      [JSON.stringify(accepted), suggestionId, batchId, userId],
    );
    if (Number(acceptResult?.affectedRows || 0) !== 1) {
      throw organizeAiError('ORGANIZE_AI_SUGGESTION_NOT_EDITABLE', '该建议当前不能接受', 409);
    }
    await refreshBatchProgress(connection, batchId, userId);
    await connection.commit?.();
    return { ...mapSuggestion(suggestion), status: 'accepted', acceptedTags: accepted, lastErrorCode: null };
  } catch (error) {
    await connection.rollback?.().catch(() => {});
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function loadWorkerIdentity(database, userId) {
  const [rows] = await database.query('SELECT id, role, del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
  const user = rows[0];
  if (!user || Number(user.del_flag || 0) !== 0 || !['user', 'test', 'root'].includes(String(user.role || ''))) {
    throw organizeAiError('ORGANIZE_AI_ACCOUNT_UNAVAILABLE', '账号当前不可用', 403);
  }
  const restrictions = await getActiveSecurityRestrictions(userId);
  if (
    restrictions.some((item) => ['full_lock', 'login_lock', 'ai_lock'].includes(String(item.restriction_type || '')))
  ) {
    throw organizeAiError('AI_ACCESS_RESTRICTED', '当前账号的 AI 使用权限已被限制', 403);
  }
  return { user: { id: String(user.id), role: String(user.role), isAuthenticated: true }, restrictions };
}

async function claimNextBatch(database, workerId) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, user_id AS userId, resource_type AS resourceType FROM organize_ai_tag_batches
        WHERE status = 'queued'
           OR (status = 'running' AND (lease_token IS NULL OR lease_expires_at < NOW()))
        ORDER BY create_time ASC, id ASC LIMIT 1 FOR UPDATE`,
    );
    if (!rows.length) {
      await connection.commit();
      return null;
    }
    const leaseToken = crypto.randomUUID();
    await connection.query(
      `UPDATE organize_ai_tag_batches
          SET status = 'running', lease_owner = ?, lease_token = ?,
              lease_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), started_at = COALESCE(started_at, NOW())
        WHERE id = ?`,
      [String(workerId || 'organize-ai-worker').slice(0, 128), leaseToken, LEASE_SECONDS, rows[0].id],
    );
    await connection.commit();
    return { ...rows[0], leaseToken };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizedRecommendations(result, tags) {
  const byId = new Map(tags.map((tag) => [String(tag.id), tag]));
  if (Array.isArray(result?.suggestions)) {
    return result.suggestions.slice(0, ORGANIZE_AI_SUGGESTION_MAX_TAGS).map((item) => ({
      id: item.id ? String(item.id) : null,
      name: String(item.name || ''),
      source: item.id ? 'existing' : 'new',
      ...(Number.isFinite(Number(item.confidence)) ? { confidence: Number(item.confidence) } : {}),
    }));
  }
  return [
    ...(result?.matchedTagIds || []).map((id) => ({
      id: String(id),
      name: String(byId.get(String(id))?.name || ''),
      source: 'existing',
    })),
    ...(result?.newTags || []).map((name) => ({ id: null, name: String(name), source: 'new' })),
  ]
    .filter((tag) => tag.name)
    .slice(0, ORGANIZE_AI_SUGGESTION_MAX_TAGS);
}

function validateSuggestionModelResult(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    !Array.isArray(result.matchedTagIds) ||
    !Array.isArray(result.newTags) ||
    !Array.isArray(result.suggestions)
  ) {
    throw organizeAiError('ORGANIZE_AI_OUTPUT_INVALID', 'AI 整理建议返回格式无效', 502);
  }
  return result;
}

function suggestionReason(recommendations) {
  if (!recommendations.length) return '没有发现置信度足够高的核心主题标签。';
  const names = recommendations
    .map((tag) => String(tag.name || ''))
    .filter(Boolean)
    .join('、');
  return `内容核心主题与“${names}”相关，确认后才会写入。`.slice(0, 500);
}

async function runSuggestionModel(snapshot, tags, dependencies, trace) {
  const payload = parseJson(snapshot.sourceText, {});
  if (snapshot.resourceType === 'note') {
    return (dependencies.suggestTagsFromText || suggestTagsFromText)({
      text: [`标题:${payload.title || '(无)'}`, payload.content ? `正文摘录:${payload.content}` : '']
        .filter(Boolean)
        .join('\n'),
      userTags: tags,
      trace,
      includeSuggestionDetails: true,
    });
  }
  return (dependencies.suggestBookmarkMeta || suggestBookmarkMeta)({
    url: payload.url,
    name: payload.title,
    description: payload.description,
    userTags: tags,
    trace,
    includeSuggestionDetails: true,
  });
}

async function renewOrganizeAiLease(database, job) {
  const [leaseResult] = await database.query(
    `UPDATE organize_ai_tag_batches SET lease_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
      WHERE id = ? AND status = 'running' AND lease_token = ?`,
    [LEASE_SECONDS, job.id, job.leaseToken],
  );
  if (Number(leaseResult?.affectedRows || 0) !== 1) {
    throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
  }
}

async function updateWorkerSuggestion(database, job, itemId, setClause, setParams, allowedStatuses) {
  const statuses = Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses];
  const placeholders = statuses.map(() => '?').join(',');
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  const ownsConnection = connection !== database;
  try {
    await connection.beginTransaction?.();
    const batch = await lockOwnedBatch(connection, job.id, job.userId, { leaseToken: job.leaseToken });
    if (!batch) throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    const [rows] = await connection.query(
      `SELECT id, status FROM organize_ai_tag_suggestions
        WHERE id = ? AND batch_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [itemId, job.id, job.userId],
    );
    if (!rows.length || !statuses.includes(String(rows[0].status || ''))) {
      throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    }
    const [result] = await connection.query(
      `UPDATE organize_ai_tag_suggestions SET ${setClause}
        WHERE id = ? AND batch_id = ? AND user_id = ?
          AND status IN (${placeholders})`,
      [...setParams, itemId, job.id, job.userId, ...statuses],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    }
    await connection.commit?.();
    return result;
  } catch (error) {
    await connection.rollback?.().catch(() => {});
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function failRemainingWorkerSuggestions(database, job, errorCode) {
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  const ownsConnection = connection !== database;
  try {
    await connection.beginTransaction?.();
    const batch = await lockOwnedBatch(connection, job.id, job.userId, { leaseToken: job.leaseToken });
    if (!batch) throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    await connection.query(
      `SELECT id FROM organize_ai_tag_suggestions
        WHERE batch_id = ? AND user_id = ? AND status = 'queued' ORDER BY id FOR UPDATE`,
      [job.id, job.userId],
    );
    const [result] = await connection.query(
      `UPDATE organize_ai_tag_suggestions
          SET status = 'failed', last_error_code = ?
        WHERE batch_id = ? AND user_id = ? AND status = 'queued'`,
      [errorCode, job.id, job.userId],
    );
    await connection.commit?.();
    return Math.max(0, Number(result?.affectedRows || 0));
  } catch (error) {
    await connection.rollback?.().catch(() => {});
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function processClaimedBatch(database, job, identity, dependencies = {}) {
  const [tagRows] = await database.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [job.userId]);
  const [items] = await database.query(
    `${SUGGESTION_SELECT} FROM organize_ai_tag_suggestions
      WHERE batch_id = ? AND user_id = ? AND status IN ('queued','running')
      ORDER BY create_time ASC, id ASC LIMIT ?`,
    [job.id, job.userId, WORKER_SLICE_ITEMS],
  );
  const actionId = job.resourceType === 'note' ? 'note.organize_tags' : 'bookmark.organize';
  const syntheticRequest = {
    user: identity.user,
    billingUser: identity.user,
    resourceUser: identity.user,
    securityRestrictions: identity.restrictions,
    headers: {},
    body: {},
    path: '/organize/ai-suggestions/worker',
    method: 'POST',
    ip: 'organize-ai-worker',
  };
  const runExecution = dependencies.runAiExecution || runAiExecution;
  return runExecution(
    createUserAiExecutionConfig(actionId, {
      requestId: job.leaseToken,
      request: syntheticRequest,
      identity: identity.user,
      subjectIdentity: identity.user,
      surface: 'organize_center',
      reservationTokens: WORKER_ITEM_RESERVATION_TOKENS,
      maxUserProviderCalls: WORKER_SLICE_ITEMS,
      resolveResultOutcome: (result) =>
        result.failed > 0
          ? {
              status: result.succeeded > 0 ? 'partial' : 'failed',
              errorCode: result.errorCode || 'ORGANIZE_AI_ITEM_FAILED',
            }
          : { status: 'success' },
    }),
    async () => {
      let succeeded = 0;
      let failed = 0;
      let errorCode = null;
      for (const item of items) {
        await renewOrganizeAiLease(database, job);
        const current = await loadCurrentSnapshot(database, job.userId, item.resourceType, item.resourceId);
        if (!current || current.sourceHash !== item.sourceHash) {
          await updateWorkerSuggestion(
            database,
            job,
            item.id,
            "status = 'conflict', last_error_code = 'RESOURCE_CHANGED', attempts = attempts + 1",
            [],
            ['queued', 'running'],
          );
          continue;
        }
        await updateWorkerSuggestion(
          database,
          job,
          item.id,
          "status = 'running', attempts = attempts + 1",
          [],
          ['queued', 'running'],
        );
        try {
          // Provider 外发必须与账号注销使用同一 user 行锁。单纯“调用前再 SELECT”仍有
          // 检查后注销提交、随后外发的竞态；行锁覆盖调用才能在多实例间真正封住窗口。
          const withDispatch = dependencies.withActiveUserAiDispatch || withActiveUserAiDispatch;
          const result = validateSuggestionModelResult(
            await withDispatch(database, job.userId, async () => {
              await (dependencies.loadWorkerIdentity || loadWorkerIdentity)(database, job.userId);
              await renewOrganizeAiLease(database, job);
              return runSuggestionModel(current, tagRows, dependencies, {
                traceId: job.id,
                taskType: job.resourceType === 'note' ? 'organize_note_tags' : 'organize_bookmark_meta',
                stage: job.resourceType === 'note' ? 'organize_note_tags' : 'organize_bookmark_meta',
              });
            }),
          );
          await renewOrganizeAiLease(database, job);
          const recommendations = result ? normalizedRecommendations(result, tagRows) : [];
          await updateWorkerSuggestion(
            database,
            job,
            item.id,
            'status = ?, recommended_tags_json = ?, reason = ?, last_error_code = NULL',
            [
              recommendations.length ? 'pending' : 'no_suggestion',
              JSON.stringify(recommendations),
              suggestionReason(recommendations),
            ],
            'running',
          );
          succeeded += 1;
        } catch (error) {
          if (
            [
              'ORGANIZE_AI_LEASE_LOST',
              'ORGANIZE_AI_ACCOUNT_UNAVAILABLE',
              'AI_ACCOUNT_UNAVAILABLE',
              'AI_ACCESS_RESTRICTED',
            ].includes(error?.code)
          ) {
            throw error;
          }
          await renewOrganizeAiLease(database, job);
          errorCode = String(error?.code || 'ORGANIZE_AI_ITEM_FAILED').slice(0, 64);
          await updateWorkerSuggestion(
            database,
            job,
            item.id,
            "status = 'failed', last_error_code = ?",
            [errorCode],
            'running',
          );
          failed += 1;
          if (isAiQuotaErrorCode(error?.code)) {
            failed += await failRemainingWorkerSuggestions(database, job, errorCode);
            break;
          }
        }
      }
      return { succeeded, failed, errorCode };
    },
  );
}

async function closeClaimedBatch(database, job, errorCode, { cancelled = false } = {}) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const batch = await lockOwnedBatch(connection, job.id, job.userId, { leaseToken: job.leaseToken });
    if (!batch) {
      await connection.rollback();
      return false;
    }
    await connection.query(
      `SELECT id FROM organize_ai_tag_suggestions
        WHERE batch_id = ? AND user_id = ? AND status IN ('queued','running') ORDER BY id FOR UPDATE`,
      [job.id, job.userId],
    );
    const [suggestionResult] = await connection.query(
      `UPDATE organize_ai_tag_suggestions
          SET status = 'failed', last_error_code = ?
        WHERE batch_id = ? AND user_id = ? AND status IN ('queued','running')`,
      [errorCode, job.id, job.userId],
    );
    // affectedRows 可以为 0（例如异常发生在最后一项交付之后），但必须读取并纳入
    // 当前事务，不能忽略一个未执行或形状异常的写结果。
    Number(suggestionResult?.affectedRows || 0);
    await refreshBatchProgress(connection, job.id, job.userId, { leaseToken: job.leaseToken });
    const [batchResult] = await connection.query(
      `UPDATE organize_ai_tag_batches
          SET status = IF(?, 'cancelled', status), last_error_code = ?,
              lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
              finished_at = IF(?, COALESCE(finished_at, NOW()), finished_at)
        WHERE id = ? AND user_id = ? AND status IN ('running','failed','partial') AND lease_token = ?`,
      [cancelled ? 1 : 0, errorCode, cancelled ? 1 : 0, job.id, job.userId, job.leaseToken],
    );
    if (Number(batchResult?.affectedRows || 0) !== 1) {
      throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ORGANIZE_AI_LEASE_LOST') return false;
    throw error;
  } finally {
    connection.release();
  }
}

export async function runSingleOrganizeAiSuggestionBatch(workerId, database = pool, dependencies = {}) {
  if (!isOrganizeAiSuggestionsEnabled(dependencies.env || process.env)) return false;
  const job = await claimNextBatch(database, workerId);
  if (!job) return false;
  try {
    const identity = await (dependencies.loadWorkerIdentity || loadWorkerIdentity)(database, job.userId);
    await processClaimedBatch(database, job, identity, dependencies);
    await refreshBatchProgress(database, job.id, job.userId, { leaseToken: job.leaseToken });
    const [releaseResult] = await database.query(
      `UPDATE organize_ai_tag_batches SET lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
        WHERE id = ? AND user_id = ? AND lease_token = ?`,
      [job.id, job.userId, job.leaseToken],
    );
    if (Number(releaseResult?.affectedRows || 0) !== 1) {
      throw organizeAiError('ORGANIZE_AI_LEASE_LOST', '整理建议处理租约已失效', 409);
    }
  } catch (error) {
    // 旧 Worker 必须在失去租约后立即停止，不得覆盖新 Worker 的状态或结果。
    if (error?.code === 'ORGANIZE_AI_LEASE_LOST') return true;
    const code = String(error?.code || 'ORGANIZE_AI_BATCH_FAILED').slice(0, 64);
    await closeClaimedBatch(database, job, code, {
      cancelled: ['ORGANIZE_AI_ACCOUNT_UNAVAILABLE', 'AI_ACCOUNT_UNAVAILABLE'].includes(error?.code),
    });
  }
  return true;
}

export const organizeAiSuggestionServiceInternals = Object.freeze({
  AI_QUOTA_ERROR_CODES,
  batchStatusFromCounts,
  claimNextBatch,
  LEASE_SECONDS,
  WORKER_ITEM_RESERVATION_TOKENS,
  WORKER_SLICE_ITEMS,
  loadCurrentSnapshotForUpdate,
  loadSnapshots,
  mapBatch,
  mapSuggestion,
  normalizeRequest,
  normalizeTagNames,
  payloadHash,
  processClaimedBatch,
  refreshBatchProgress,
  renewOrganizeAiLease,
  snapshotHash,
  updateWorkerSuggestion,
  validateSuggestionModelResult,
});
