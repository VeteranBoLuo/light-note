import crypto from 'node:crypto';
import pool from '../db/index.js';
import { createTodo, deleteTodo } from './services/todoService.js';
import { applyOwnedNoteContentChange } from './services/noteService.js';
import { RESOURCE_TYPE, replaceResourceTagRelations, validateUserResources, validateUserTags } from './resourceTags.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

const OPERATIONS = new Set([
  'set_tags',
  'move_file',
  'update_note_metadata',
  'update_note_content',
  'update_bookmark_metadata',
  'create_todo',
]);
const CHANGE_SET_STATUSES = new Set(['draft', 'applied', 'undone', 'expired']);
const RETRY_STATES = new Set(['failed', 'ready']);
const RETRY_PHASES = new Set(['validation', 'item_apply', 'finalize']);

function changeError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  error.isAiChangeError = true;
  return error;
}

function text(value, max, fallback = '') {
  const normalized = String(value ?? '').trim();
  return (normalized || fallback).slice(0, max);
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function stateHash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function stableFailureCode(error) {
  const code = String(error?.code || '');
  const status = Number(error?.status || 500);
  if ((status < 500 || error?.isAiChangeError === true) && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;
  return 'AI_CHANGE_APPLY_FAILED';
}

async function invalidateSearchInTransaction(connection, subjectUserId) {
  const result = await invalidatePersonalKnowledgeCache(subjectUserId, {
    database: connection,
    persist: true,
  });
  if (!result?.generationAdvanced || result?.skipped) {
    throw changeError(
      'AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE',
      '个人知识索引失效状态不可用，变更未提交，请先完成数据库迁移后重试',
      503,
    );
  }
  return result;
}

function normalizeRetrySnapshot(value, row = {}) {
  const retry = parseJson(value, null);
  if (!retry || typeof retry !== 'object' || !RETRY_STATES.has(retry.state)) return null;
  const selectedItemIds = Array.isArray(retry.selectedItemIds)
    ? [...new Set(retry.selectedItemIds.map((item) => text(item, 36)).filter(Boolean))].slice(0, 100)
    : [];
  if (!selectedItemIds.length) return null;
  const failedItemId = text(retry.failedItemId, 36) || null;
  const phase = RETRY_PHASES.has(retry.phase) ? retry.phase : 'validation';
  const errorCode = text(retry.errorCode, 64) || null;
  const previewRevision = Number(retry.previewRevision || row.preview_revision || 1);
  return {
    version: 1,
    state: retry.state,
    selectedItemIds,
    selectedCount: selectedItemIds.length,
    processedCount: Math.max(0, Math.min(selectedItemIds.length, Number(retry.processedCount) || 0)),
    failedItemId: failedItemId && selectedItemIds.includes(failedItemId) ? failedItemId : null,
    errorCode,
    phase,
    failedAt: retry.failedAt || null,
    revalidatedAt: retry.revalidatedAt || null,
    previewRevision: Number.isSafeInteger(previewRevision) && previewRevision > 0 ? previewRevision : 1,
  };
}

export function hashAiChangeState(value) {
  return stateHash(value);
}

function normalizedOwner(identity) {
  const actorUserId = text(identity?.actorUserId, 64);
  const subjectUserId = text(identity?.subjectUserId, 64);
  const adminContextMode = ['readonly', 'maintain'].includes(identity?.adminContextMode)
    ? identity.adminContextMode
    : 'normal';
  const submittedContextId = text(identity?.adminContextId, 64) || null;
  if (!actorUserId || !subjectUserId) throw changeError('AI_IDENTITY_INVALID', 'AI 变更身份上下文无效', 403);
  if (adminContextMode === 'normal' && submittedContextId) {
    throw changeError('AI_IDENTITY_INVALID', '普通变更身份不能携带管理员上下文', 403);
  }
  if (adminContextMode !== 'normal' && !submittedContextId) {
    throw changeError('AI_IDENTITY_INVALID', '管理员变更身份缺少上下文标识', 403);
  }
  return {
    actorUserId,
    subjectUserId,
    adminContextMode,
    adminContextId: adminContextMode === 'normal' ? null : submittedContextId,
  };
}

function owner(identity) {
  const value = normalizedOwner(identity);
  return [value.actorUserId, value.subjectUserId, value.adminContextMode, value.adminContextId];
}

export function assertAiChangeSetWritable(identity) {
  const value = normalizedOwner(identity);
  if (value.adminContextMode === 'readonly') {
    throw changeError('ADMIN_PREVIEW_READONLY', '管理员当前处于只读预览模式，不能修改 AI 变更集', 403);
  }
  return value;
}

function normalizeTagIds(value) {
  if (!Array.isArray(value)) throw changeError('TAG_IDS_INVALID', '标签列表格式无效');
  const ids = [...new Set(value.map((item) => text(item, 64)).filter(Boolean))];
  if (ids.length > 20) throw changeError('TOO_MANY_TAGS', '一次最多设置 20 个标签');
  return ids.sort();
}

function normalizeAfter(operation, after) {
  const value = after && typeof after === 'object' ? after : {};
  if (operation === 'set_tags') return { tagIds: normalizeTagIds(value.tagIds || []) };
  if (operation === 'move_file') {
    const folderId = value.folderId == null || value.folderId === '' ? null : Number(value.folderId);
    if (folderId !== null && (!Number.isSafeInteger(folderId) || folderId <= 0)) {
      throw changeError('FOLDER_ID_INVALID', '文件夹 ID 无效');
    }
    return { folderId };
  }
  if (operation === 'update_note_metadata') {
    const title = text(value.title, 255);
    if (!title) throw changeError('TITLE_REQUIRED', '笔记标题不能为空');
    return { title };
  }
  if (operation === 'update_note_content') {
    const type = value.type === 'md' ? 'markdown' : String(value.type || '');
    if (!['html', 'markdown'].includes(type)) throw changeError('INVALID_NOTE_TYPE', '笔记类型仅支持 html 或 markdown');
    const title = text(value.title, 255);
    if (!title) throw changeError('TITLE_REQUIRED', '笔记标题不能为空');
    const content = String(value.content ?? '');
    if (content.length > 1_000_000) throw changeError('CONTENT_TOO_LONG', '笔记正文不能超过 100 万字符');
    return { title, type, content };
  }
  if (operation === 'update_bookmark_metadata') {
    const name = text(value.name, 255);
    if (!name) throw changeError('TITLE_REQUIRED', '书签名称不能为空');
    return { name, description: text(value.description, 255) };
  }
  if (operation === 'create_todo') {
    const titleValue = text(value.title, 200);
    if (!titleValue) throw changeError('TITLE_REQUIRED', '待办标题不能为空');
    return {
      title: titleValue,
      description: text(value.description, 2000),
      priority: [0, 1, 2].includes(Number(value.priority)) ? Number(value.priority) : 1,
      dueAt: value.dueAt || null,
      checklist: Array.isArray(value.checklist) ? value.checklist.slice(0, 50) : [],
    };
  }
  throw changeError('OPERATION_UNSUPPORTED', '不支持的变更类型');
}

async function loadTags(connection, identity, resourceType, resourceId, lock = false) {
  await validateUserResources(connection, {
    userId: identity.subjectUserId,
    resourceType,
    resourceIds: [resourceId],
  });
  const [rows] = await connection.query(
    `SELECT r.tag_id
       FROM resource_tag_relations r
       JOIN tag t ON t.id = r.tag_id AND t.user_id = ? AND t.del_flag = 0
      WHERE r.resource_type = ? AND r.resource_id = ? AND r.user_id = ?
      ORDER BY r.tag_id${lock ? ' FOR UPDATE' : ''}`,
    [identity.subjectUserId, resourceType, resourceId, identity.subjectUserId],
  );
  return { tagIds: rows.map((row) => String(row.tag_id)).sort() };
}

async function loadCurrentState(connection, identity, item, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  if (item.operation === 'set_tags') {
    if (![RESOURCE_TYPE.NOTE, RESOURCE_TYPE.BOOKMARK, RESOURCE_TYPE.FILE].includes(item.resourceType)) {
      throw changeError('RESOURCE_TYPE_INVALID', '该资源不支持标签变更');
    }
    return loadTags(connection, identity, item.resourceType, item.resourceId, lock);
  }
  if (item.operation === 'move_file') {
    const [rows] = await connection.query(
      `SELECT folder_id FROM files WHERE id = ? AND create_by = ? AND del_flag = 0${suffix}`,
      [item.resourceId, identity.subjectUserId],
    );
    if (!rows.length) throw changeError('RESOURCE_NOT_FOUND', '文件不存在或无权操作', 404);
    return { folderId: rows[0].folder_id == null ? null : Number(rows[0].folder_id) };
  }
  if (item.operation === 'update_note_metadata') {
    const [rows] = await connection.query(
      `SELECT title FROM note WHERE id = ? AND create_by = ? AND del_flag = 0${suffix}`,
      [item.resourceId, identity.subjectUserId],
    );
    if (!rows.length) throw changeError('RESOURCE_NOT_FOUND', '笔记不存在或无权操作', 404);
    return { title: rows[0].title || '' };
  }
  if (item.operation === 'update_note_content') {
    const [rows] = await connection.query(
      `SELECT title, content, type FROM note WHERE id = ? AND create_by = ? AND del_flag = 0${suffix}`,
      [item.resourceId, identity.subjectUserId],
    );
    if (!rows.length) throw changeError('RESOURCE_NOT_FOUND', '笔记不存在或无权操作', 404);
    return {
      title: rows[0].title || '',
      content: rows[0].content || '',
      type: rows[0].type === 'md' ? 'markdown' : rows[0].type || 'html',
    };
  }
  if (item.operation === 'update_bookmark_metadata') {
    const [rows] = await connection.query(
      `SELECT name, description FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0${suffix}`,
      [item.resourceId, identity.subjectUserId],
    );
    if (!rows.length) throw changeError('RESOURCE_NOT_FOUND', '书签不存在或无权操作', 404);
    return { name: rows[0].name || '', description: rows[0].description || '' };
  }
  if (item.operation === 'create_todo') return null;
  throw changeError('OPERATION_UNSUPPORTED', '不支持的变更类型');
}

function mapItem(row) {
  return {
    id: row.id,
    order: Number(row.item_order || 0),
    operation: row.operation,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    before: parseJson(row.before_json, null),
    after: parseJson(row.after_json, {}),
    beforeHash: row.before_hash,
    reason: row.reason || '',
    status: row.status,
    receipt: parseJson(row.receipt_json, null),
    error: row.error_code ? { code: row.error_code, message: row.error_message || '' } : null,
  };
}

function mapChangeSet(row, items = []) {
  return {
    id: row.id,
    conversationId: row.conversation_id || null,
    requestId: row.request_id || null,
    title: row.title,
    summary: row.summary || '',
    status: row.status,
    riskLevel: row.risk_level,
    selection: parseJson(row.selection_json, null),
    previewRevision: Math.max(1, Number(row.preview_revision) || 1),
    retry: normalizeRetrySnapshot(row.retry_json, row),
    attemptCount: Math.max(0, Number(row.attempt_count) || 0),
    lastAttemptAt: row.last_attempt_at || null,
    expiresAt: row.expires_at,
    appliedAt: row.applied_at,
    undoneAt: row.undone_at,
    createdAt: row.create_time,
    updatedAt: row.update_time,
    items,
  };
}

async function getOwnedChangeSetRow(db, identity, id, lock = false) {
  const [rows] = await db.query(
    `SELECT * FROM ai_change_sets
     WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
       AND admin_context_id <=> ?${lock ? ' FOR UPDATE' : ''}`,
    [text(id, 36), ...owner(identity)],
  );
  return rows[0] || null;
}

export async function getAiChangeSet(identity, id, database = pool) {
  const row = await getOwnedChangeSetRow(database, identity, id);
  if (!row) throw changeError('CHANGE_SET_NOT_FOUND', '变更集不存在或无权访问', 404);
  const [items] = await database.query(
    'SELECT * FROM ai_change_items WHERE change_set_id = ? ORDER BY item_order ASC, id ASC',
    [row.id],
  );
  return mapChangeSet(row, items.map(mapItem));
}

export async function listAiChangeSets(identity, options = {}, database = pool) {
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 20));
  const status = CHANGE_SET_STATUSES.has(options.status) ? options.status : null;
  const params = [...owner(identity)];
  let where = 'actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ? AND admin_context_id <=> ?';
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  params.push(limit);
  const [rows] = await database.query(
    `SELECT * FROM ai_change_sets WHERE ${where} ORDER BY update_time DESC, id DESC LIMIT ?`,
    params,
  );
  return { items: rows.map((row) => mapChangeSet(row)), total: rows.length };
}

export async function createAiChangeSet(identity, input = {}, database = pool) {
  const ownerIdentity = assertAiChangeSetWritable(identity);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length || rawItems.length > 100) throw changeError('CHANGE_ITEMS_INVALID', '变更项数量必须为 1～100');
  const id = text(input.id, 36) || crypto.randomUUID();
  const requestId = text(input.requestId, 64) || null;
  if (requestId) {
    const [existing] = await database.query(
      `SELECT id FROM ai_change_sets
       WHERE actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
         AND admin_context_id <=> ? AND request_id = ? LIMIT 1`,
      [...owner(identity), requestId],
    );
    if (existing.length) return getAiChangeSet(identity, existing[0].id, database);
  }
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const conversationId = text(input.conversationId, 36) || null;
    if (conversationId) {
      const [conversations] = await connection.query(
        `SELECT id FROM ai_conversations
         WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
           AND admin_context_id <=> ?
           AND (retention_mode <> 'temporary' OR (expire_at IS NOT NULL AND expire_at > CURRENT_TIMESTAMP))
           AND status IN ('active','archived') LIMIT 1`,
        [conversationId, ...owner(identity)],
      );
      if (!conversations.length) throw changeError('CONVERSATION_NOT_FOUND', '关联会话不存在或无权访问', 404);
    }
    const items = [];
    for (let index = 0; index < rawItems.length; index += 1) {
      const raw = rawItems[index] || {};
      const operation = text(raw.operation, 48);
      if (!OPERATIONS.has(operation)) throw changeError('OPERATION_UNSUPPORTED', `第 ${index + 1} 项操作不受支持`);
      const itemId = text(raw.id, 36) || crypto.randomUUID();
      const resourceType = operation === 'create_todo' ? 'todo' : text(raw.resourceType, 32);
      const resourceId = operation === 'create_todo' ? `new:${itemId}` : text(raw.resourceId, 128);
      if (!resourceId) throw changeError('RESOURCE_ID_REQUIRED', `第 ${index + 1} 项缺少资源 ID`);
      const item = { id: itemId, operation, resourceType, resourceId };
      const before = await loadCurrentState(connection, identity, item);
      const expectedBeforeHash = text(raw.expectedBeforeHash, 64) || null;
      if (expectedBeforeHash && stateHash(before) !== expectedBeforeHash) {
        throw changeError('CHANGE_CONFLICT', `第 ${index + 1} 项资源在生成预览时已发生变化，请重新选择`, 409);
      }
      const after = normalizeAfter(operation, raw.after);
      // 内容操作不改标题:after 沿用当前标题,避免仅标题不同却被判为需变更,并与 applyItem 的 afterHash 口径一致。
      if (operation === 'update_note_content' && before) after.title = before.title;
      if (before != null && stateHash(before) === stateHash(after)) continue;
      items.push({
        ...item,
        before,
        beforeHash: before == null ? null : stateHash(before),
        after,
        reason: text(raw.reason, 500),
      });
    }
    if (!items.length) throw changeError('CHANGE_SET_EMPTY', '没有实际需要执行的变更');
    const riskLevel = items.some((item) => ['create_todo', 'update_note_content'].includes(item.operation))
      ? 'medium'
      : 'low';
    await connection.query(
      `INSERT INTO ai_change_sets
        (id, actor_user_id, subject_user_id, admin_context_id, admin_context_mode, conversation_id, request_id,
         title, summary, risk_level, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerIdentity.actorUserId,
        ownerIdentity.subjectUserId,
        ownerIdentity.adminContextId,
        ownerIdentity.adminContextMode,
        conversationId,
        requestId,
        text(input.title, 255, 'AI 整理建议'),
        text(input.summary, 10_000) || null,
        riskLevel,
        input.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
      ],
    );
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await connection.query(
        `INSERT INTO ai_change_items
          (id, change_set_id, item_order, operation, resource_type, resource_id, before_hash, before_json, after_json, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          id,
          index,
          item.operation,
          item.resourceType,
          item.resourceId,
          item.beforeHash,
          item.before == null ? null : JSON.stringify(item.before),
          JSON.stringify(item.after),
          item.reason || null,
        ],
      );
    }
    await connection.commit();
    return getAiChangeSet(identity, id, database);
  } catch (error) {
    await connection.rollback();
    if (requestId && (error?.code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062)) {
      const [existing] = await database.query(
        `SELECT id FROM ai_change_sets
         WHERE actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
           AND admin_context_id <=> ? AND request_id = ? LIMIT 1`,
        [...owner(identity), requestId],
      );
      if (existing.length) return getAiChangeSet(identity, existing[0].id, database);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAiChangeSet(identity, id, input = {}, database = pool) {
  assertAiChangeSetWritable(identity);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const row = await getOwnedChangeSetRow(connection, identity, id, true);
    if (!row) throw changeError('CHANGE_SET_NOT_FOUND', '变更集不存在或无权访问', 404);
    if (row.status !== 'draft') throw changeError('CHANGE_SET_NOT_EDITABLE', '只有待确认的变更集可以修改', 409);
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      throw changeError('CHANGE_SET_EXPIRED', '变更预览已过期，请重新生成', 409);
    }
    let didMutate = false;
    if (input.title !== undefined || input.summary !== undefined) {
      const titleValue = input.title === undefined ? row.title : text(input.title, 255);
      if (!titleValue) throw changeError('TITLE_REQUIRED', '变更集标题不能为空');
      await connection.query(
        `UPDATE ai_change_sets SET title = ?, summary = ?
         WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
           AND admin_context_id <=> ?`,
        [
          titleValue,
          input.summary === undefined ? row.summary : text(input.summary, 10_000) || null,
          row.id,
          ...owner(identity),
        ],
      );
      didMutate = true;
    }
    if (input.items !== undefined) {
      if (!Array.isArray(input.items) || input.items.length > 100) {
        throw changeError('CHANGE_ITEMS_INVALID', '变更项修改格式无效');
      }
      const [existingItems] = await connection.query(
        'SELECT * FROM ai_change_items WHERE change_set_id = ? FOR UPDATE',
        [row.id],
      );
      const byId = new Map(existingItems.map((item) => [String(item.id), item]));
      for (const patch of input.items) {
        const item = byId.get(text(patch?.id, 36));
        if (!item) throw changeError('CHANGE_ITEM_NOT_FOUND', '修改中包含不属于当前变更集的项目', 404);
        const nextAfter =
          patch.after === undefined ? parseJson(item.after_json, {}) : normalizeAfter(item.operation, patch.after);
        const reason = patch.reason === undefined ? item.reason : text(patch.reason, 500) || null;
        await connection.query(
          'UPDATE ai_change_items SET after_json = ?, reason = ? WHERE id = ? AND change_set_id = ?',
          [JSON.stringify(nextAfter), reason, item.id, row.id],
        );
        didMutate = true;
      }
    }
    if (didMutate) {
      await connection.query(
        `UPDATE ai_change_sets
            SET preview_revision = preview_revision + 1, retry_json = NULL
          WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
            AND admin_context_id <=> ?`,
        [row.id, ...owner(identity)],
      );
      await connection.query(
        `UPDATE ai_change_items
            SET status = 'pending', receipt_json = NULL, error_code = NULL, error_message = NULL
          WHERE change_set_id = ? AND status = 'failed'`,
        [row.id],
      );
    }
    await connection.commit();
    return getAiChangeSet(identity, row.id, database);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function applyItem(connection, identity, item) {
  const after = normalizeAfter(item.operation, item.after);
  const before = await loadCurrentState(connection, identity, item, true);
  // update_note_content 只写正文与类型、不改标题;after 沿用当前标题,保证 noop 判定与 receipt.afterHash
  // 反映真实写入后的库态(否则 afterHash 含未写入的标题,undo 用 loadCurrentState 比对时永久 UNDO_CONFLICT)。
  if (item.operation === 'update_note_content' && before) after.title = before.title;
  if (item.beforeHash && stateHash(before) !== item.beforeHash) {
    throw changeError('CHANGE_CONFLICT', `“${item.reason || item.resourceId}”自预览后已发生变化，请重新生成预览`, 409);
  }
  if (before != null && stateHash(before) === stateHash(after)) {
    return { before, after, afterHash: stateHash(after), noop: true };
  }
  if (item.operation === 'set_tags') {
    const tagIds = await validateUserTags(connection, { userId: identity.subjectUserId, tagIds: after.tagIds });
    await replaceResourceTagRelations(connection, {
      userId: identity.subjectUserId,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      tagIds,
      source: 'ai_change_set',
    });
    return { before, after: { tagIds }, afterHash: stateHash({ tagIds }) };
  }
  if (item.operation === 'move_file') {
    if (after.folderId !== null) {
      const [folders] = await connection.query(
        'SELECT id FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1',
        [after.folderId, identity.subjectUserId],
      );
      if (!folders.length) throw changeError('FOLDER_NOT_FOUND', '目标文件夹不存在或无权访问', 404);
    }
    await connection.query('UPDATE files SET folder_id = ? WHERE id = ? AND create_by = ? AND del_flag = 0', [
      after.folderId,
      item.resourceId,
      identity.subjectUserId,
    ]);
    return { before, after, afterHash: stateHash(after) };
  }
  if (item.operation === 'update_note_metadata') {
    await connection.query('UPDATE note SET title = ?, update_by = ? WHERE id = ? AND create_by = ? AND del_flag = 0', [
      after.title,
      identity.actorUserId,
      item.resourceId,
      identity.subjectUserId,
    ]);
    return { before, after, afterHash: stateHash(after) };
  }
  if (item.operation === 'update_note_content') {
    await applyOwnedNoteContentChange(connection, {
      userId: identity.subjectUserId,
      actorUserId: identity.actorUserId,
      noteId: item.resourceId,
      before,
      after,
    });
    return { before, after, afterHash: stateHash(after), undoSupported: true };
  }
  if (item.operation === 'update_bookmark_metadata') {
    const [duplicates] = await connection.query(
      'SELECT id FROM bookmark WHERE user_id = ? AND name = ? AND id <> ? AND del_flag = 0 LIMIT 1',
      [identity.subjectUserId, after.name, item.resourceId],
    );
    if (duplicates.length) throw changeError('DUPLICATE_NAME', `书签“${after.name}”已存在`, 409);
    await connection.query(
      'UPDATE bookmark SET name = ?, description = ? WHERE id = ? AND user_id = ? AND del_flag = 0',
      [after.name, after.description, item.resourceId, identity.subjectUserId],
    );
    return { before, after, afterHash: stateHash(after) };
  }
  if (item.operation === 'create_todo') {
    const created = await createTodo(connection, identity.subjectUserId, after, { invalidateSearch: false });
    return { before: null, after, afterHash: stateHash(after), createdResourceId: created.id };
  }
  throw changeError('OPERATION_UNSUPPORTED', '不支持的变更类型');
}

function selectedItemIdList(selection, itemRows) {
  if (selection !== null && selection !== undefined && !Array.isArray(selection)) {
    throw changeError('CHANGE_SELECTION_INVALID', '变更选择必须是项目 ID 列表');
  }
  if (Array.isArray(selection) && selection.length > 100) {
    throw changeError('CHANGE_SELECTION_INVALID', '一次最多选择 100 项变更');
  }
  const ids =
    selection == null
      ? itemRows.map((item) => String(item.id))
      : [...new Set(selection.map((item) => text(item, 36)).filter(Boolean))];
  if (!ids.length) throw changeError('CHANGE_SELECTION_EMPTY', '请至少选择一项变更');
  const itemIds = new Set(itemRows.map((item) => String(item.id)));
  if (ids.some((itemId) => !itemIds.has(itemId))) {
    throw changeError('CHANGE_SELECTION_INVALID', '选择中包含不属于当前预览的项目');
  }
  return ids;
}

async function persistApplyFailure(identity, id, attempt, error, database) {
  let connection;
  try {
    connection = await database.getConnection();
    await connection.beginTransaction();
    const row = await getOwnedChangeSetRow(connection, identity, id, true);
    if (!row || row.status !== 'draft' || Number(row.preview_revision || 1) !== Number(attempt.previewRevision || 1)) {
      await connection.commit();
      return false;
    }
    const [items] = await connection.query(
      'SELECT id FROM ai_change_items WHERE change_set_id = ? ORDER BY item_order ASC, id ASC FOR UPDATE',
      [row.id],
    );
    const currentIds = new Set(items.map((item) => String(item.id)));
    if (attempt.selectedItemIds.some((itemId) => !currentIds.has(itemId))) {
      await connection.rollback();
      return false;
    }
    const errorCode = stableFailureCode(error);
    const failedItemId = currentIds.has(attempt.failedItemId) ? attempt.failedItemId : null;
    const snapshot = {
      version: 1,
      state: 'failed',
      selectedItemIds: attempt.selectedItemIds,
      selectedCount: attempt.selectedItemIds.length,
      processedCount: attempt.processedCount,
      failedItemId,
      errorCode,
      phase: RETRY_PHASES.has(attempt.phase) ? attempt.phase : 'validation',
      failedAt: new Date().toISOString(),
      revalidatedAt: null,
      previewRevision: Number(row.preview_revision || 1),
    };
    await connection.query(
      `UPDATE ai_change_items
          SET status = 'pending', receipt_json = NULL, error_code = NULL, error_message = NULL
        WHERE change_set_id = ? AND status = 'failed'`,
      [row.id],
    );
    if (failedItemId) {
      await connection.query(
        `UPDATE ai_change_items
            SET status = 'failed', receipt_json = NULL, error_code = ?, error_message = NULL
          WHERE id = ? AND change_set_id = ?`,
        [errorCode, failedItemId, row.id],
      );
    }
    const [result] = await connection.query(
      `UPDATE ai_change_sets
          SET retry_json = ?, attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP
        WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
          AND admin_context_id <=> ? AND status = 'draft' AND preview_revision = ?`,
      [JSON.stringify(snapshot), row.id, ...owner(identity), Number(row.preview_revision || 1)],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      await connection.rollback();
      return false;
    }
    await connection.commit();
    return true;
  } catch (diagnosticError) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // The original apply error remains authoritative even if diagnostic persistence is unavailable.
      }
    }
    console.error('[ai-change-set] retry diagnostic persist failed code=%s', stableFailureCode(diagnosticError));
    return false;
  } finally {
    connection?.release();
  }
}

export async function revalidateAiChangeSetRetry(identity, id, database = pool) {
  assertAiChangeSetWritable(identity);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const row = await getOwnedChangeSetRow(connection, identity, id, true);
    if (!row) throw changeError('CHANGE_SET_NOT_FOUND', '变更集不存在或无权访问', 404);
    if (row.status !== 'draft') throw changeError('CHANGE_SET_NOT_RETRYABLE', '当前变更集不能重新校验', 409);
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      throw changeError('CHANGE_SET_EXPIRED', '变更预览已过期，请重新生成', 409);
    }
    const retry = normalizeRetrySnapshot(row.retry_json, row);
    if (row.retry_json != null && !retry) {
      throw changeError('CHANGE_RETRY_STATE_INVALID', '失败重试状态不可用，请修复数据后重新加载', 503);
    }
    if (!retry) throw changeError('CHANGE_RETRY_NOT_AVAILABLE', '当前没有可重新校验的失败批次', 409);
    if (retry.previewRevision !== Number(row.preview_revision || 1)) {
      throw changeError('CHANGE_RETRY_STALE', '失败批次已被编辑，请重新选择并确认', 409);
    }
    const [itemRows] = await connection.query(
      'SELECT * FROM ai_change_items WHERE change_set_id = ? ORDER BY item_order ASC, id ASC FOR UPDATE',
      [row.id],
    );
    const selectedIds = selectedItemIdList(retry.selectedItemIds, itemRows);
    const selected = new Set(selectedIds);
    for (const rowItem of itemRows) {
      if (!selected.has(String(rowItem.id))) continue;
      const item = mapItem(rowItem);
      const before = await loadCurrentState(connection, identity, item, true);
      normalizeAfter(item.operation, item.after);
      await connection.query(
        `UPDATE ai_change_items
            SET before_json = ?, before_hash = ?, status = 'pending', receipt_json = NULL,
                error_code = NULL, error_message = NULL
          WHERE id = ? AND change_set_id = ?`,
        [before == null ? null : JSON.stringify(before), before == null ? null : stateHash(before), item.id, row.id],
      );
    }
    const nextRevision = Number(row.preview_revision || 1) + 1;
    const nextRetry = {
      ...retry,
      state: 'ready',
      processedCount: 0,
      revalidatedAt: new Date().toISOString(),
      previewRevision: nextRevision,
    };
    const [result] = await connection.query(
      `UPDATE ai_change_sets
          SET retry_json = ?, preview_revision = ?
        WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
          AND admin_context_id <=> ? AND status = 'draft' AND preview_revision = ?`,
      [JSON.stringify(nextRetry), nextRevision, row.id, ...owner(identity), Number(row.preview_revision || 1)],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      throw changeError('CHANGE_RETRY_STALE', '变更集已被并发修改，请重新加载', 409);
    }
    await connection.commit();
    return getAiChangeSet(identity, row.id, database);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function executeAiChangeSet(identity, id, selection, database, retryRevision = null) {
  assertAiChangeSetWritable(identity);
  const connection = await database.getConnection();
  let attempt = null;
  try {
    await connection.beginTransaction();
    const row = await getOwnedChangeSetRow(connection, identity, id, true);
    if (!row) throw changeError('CHANGE_SET_NOT_FOUND', '变更集不存在或无权访问', 404);
    if (row.status === 'applied') {
      await connection.commit();
      return getAiChangeSet(identity, row.id, database);
    }
    if (row.status !== 'draft') throw changeError('CHANGE_SET_NOT_APPLICABLE', '当前变更集不能执行', 409);
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await connection.query(
        `UPDATE ai_change_sets SET status = 'expired'
         WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
           AND admin_context_id <=> ?`,
        [row.id, ...owner(identity)],
      );
      await connection.commit();
      throw changeError('CHANGE_SET_EXPIRED', '变更预览已过期，请重新生成', 409);
    }
    const retry = normalizeRetrySnapshot(row.retry_json, row);
    if (row.retry_json != null && !retry) {
      throw changeError('CHANGE_RETRY_STATE_INVALID', '失败重试状态不可用，请修复数据后重新加载', 503);
    }
    if (retryRevision == null && retry) {
      throw changeError(
        retry.state === 'failed' ? 'CHANGE_RETRY_REVALIDATION_REQUIRED' : 'CHANGE_RETRY_CONFIRMATION_REQUIRED',
        retry.state === 'failed' ? '失败批次必须先重新校验预览' : '请使用重新校验后的冻结范围确认重试',
        409,
      );
    }
    if (retryRevision != null) {
      if (!Number.isSafeInteger(retryRevision) || retryRevision <= 0) {
        throw changeError('CHANGE_RETRY_REVISION_INVALID', '重试预览版本无效');
      }
      if (!retry || retry.state !== 'ready') {
        throw changeError('CHANGE_RETRY_REVALIDATION_REQUIRED', '失败批次必须先重新校验预览', 409);
      }
      if (retry.previewRevision !== retryRevision || Number(row.preview_revision || 1) !== retryRevision) {
        throw changeError('CHANGE_RETRY_STALE', '重试预览已变化，请重新校验', 409);
      }
      selection = retry.selectedItemIds;
    }
    const [itemRows] = await connection.query(
      'SELECT * FROM ai_change_items WHERE change_set_id = ? ORDER BY item_order ASC, id ASC FOR UPDATE',
      [row.id],
    );
    const selectedIds = selectedItemIdList(selection, itemRows);
    const selected = new Set(selectedIds);
    attempt = {
      selectedItemIds: selectedIds,
      processedCount: 0,
      failedItemId: null,
      phase: 'validation',
      previewRevision: Number(row.preview_revision || 1),
    };
    for (const rowItem of itemRows) {
      if (!selected.has(String(rowItem.id))) {
        await connection.query("UPDATE ai_change_items SET status = 'rejected' WHERE id = ? AND change_set_id = ?", [
          rowItem.id,
          row.id,
        ]);
        continue;
      }
      const item = mapItem(rowItem);
      attempt.phase = 'item_apply';
      attempt.failedItemId = item.id;
      const receipt = await applyItem(connection, identity, item);
      attempt.processedCount += 1;
      await connection.query(
        `UPDATE ai_change_items SET status = 'applied', receipt_json = ?, error_code = NULL, error_message = NULL
         WHERE id = ? AND change_set_id = ?`,
        [JSON.stringify(receipt), item.id, row.id],
      );
    }
    attempt.phase = 'finalize';
    attempt.failedItemId = null;
    await invalidateSearchInTransaction(connection, identity.subjectUserId);
    const [finalized] = await connection.query(
      `UPDATE ai_change_sets
          SET status = 'applied', selection_json = ?, retry_json = NULL,
              attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP,
              applied_at = CURRENT_TIMESTAMP
        WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
          AND admin_context_id <=> ?`,
      [JSON.stringify(selectedIds), row.id, ...owner(identity)],
    );
    if (Number(finalized?.affectedRows || 0) !== 1) {
      throw changeError('CHANGE_SET_FINALIZE_CONFLICT', '变更集状态已变化，整批执行未提交', 409);
    }
    await connection.commit();
    await invalidatePersonalKnowledgeCache(identity.subjectUserId, { persist: false });
    return getAiChangeSet(identity, row.id, database);
  } catch (error) {
    await connection.rollback();
    if (attempt) {
      const recorded = await persistApplyFailure(identity, id, attempt, error, database);
      if (recorded && error && typeof error === 'object') error.retryRecorded = true;
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function applyAiChangeSet(identity, id, selection = null, database = pool) {
  return executeAiChangeSet(identity, id, selection, database);
}

export async function retryAiChangeSet(identity, id, previewRevision, database = pool) {
  const revision = Number(previewRevision);
  return executeAiChangeSet(identity, id, null, database, revision);
}

async function undoItem(connection, identity, item) {
  const receipt = item.receipt;
  if (!receipt) throw changeError('CHANGE_RECEIPT_MISSING', '缺少撤销所需的执行回执', 409);
  if (item.operation === 'create_todo') {
    if (!receipt.createdResourceId) throw changeError('CHANGE_RECEIPT_MISSING', '缺少已创建待办的 ID', 409);
    const [rows] = await connection.query(
      `SELECT title, description, checklist, priority, due_at
       FROM todo_items WHERE id = ? AND user_id = ? AND del_flag = 0 FOR UPDATE`,
      [receipt.createdResourceId, identity.subjectUserId],
    );
    if (!rows.length) throw changeError('UNDO_CONFLICT', '已创建的待办不存在，无法自动撤销', 409);
    const current = {
      title: rows[0].title || '',
      description: rows[0].description || '',
      priority: Number(rows[0].priority || 1),
      dueAt: rows[0].due_at ? new Date(rows[0].due_at).toISOString() : null,
      checklist: parseJson(rows[0].checklist, []),
    };
    const expected = {
      ...receipt.after,
      dueAt: receipt.after?.dueAt ? new Date(receipt.after.dueAt).toISOString() : null,
    };
    if (stateHash(current) !== stateHash(expected)) {
      throw changeError('UNDO_CONFLICT', '待办创建后已被修改，不能自动删除', 409);
    }
    await deleteTodo(connection, identity.subjectUserId, receipt.createdResourceId, { invalidateSearch: false });
    return;
  }
  const current = await loadCurrentState(connection, identity, item, true);
  if (stateHash(current) !== receipt.afterHash) {
    throw changeError('UNDO_CONFLICT', `“${item.reason || item.resourceId}”执行后又被修改，不能自动撤销`, 409);
  }
  const before = receipt.before;
  if (item.operation === 'set_tags') {
    const tagIds = await validateUserTags(connection, { userId: identity.subjectUserId, tagIds: before.tagIds });
    await replaceResourceTagRelations(connection, {
      userId: identity.subjectUserId,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      tagIds,
      source: 'ai_change_set_undo',
    });
  } else if (item.operation === 'move_file') {
    await connection.query('UPDATE files SET folder_id = ? WHERE id = ? AND create_by = ? AND del_flag = 0', [
      before.folderId,
      item.resourceId,
      identity.subjectUserId,
    ]);
  } else if (item.operation === 'update_note_metadata') {
    await connection.query('UPDATE note SET title = ?, update_by = ? WHERE id = ? AND create_by = ? AND del_flag = 0', [
      before.title,
      identity.actorUserId,
      item.resourceId,
      identity.subjectUserId,
    ]);
  } else if (item.operation === 'update_note_content') {
    await applyOwnedNoteContentChange(connection, {
      userId: identity.subjectUserId,
      actorUserId: identity.actorUserId,
      noteId: item.resourceId,
      before: current,
      after: before,
    });
  } else if (item.operation === 'update_bookmark_metadata') {
    await connection.query(
      'UPDATE bookmark SET name = ?, description = ? WHERE id = ? AND user_id = ? AND del_flag = 0',
      [before.name, before.description, item.resourceId, identity.subjectUserId],
    );
  }
}

export async function undoAiChangeSet(identity, id, database = pool) {
  assertAiChangeSetWritable(identity);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const row = await getOwnedChangeSetRow(connection, identity, id, true);
    if (!row) throw changeError('CHANGE_SET_NOT_FOUND', '变更集不存在或无权访问', 404);
    if (row.status === 'undone') {
      await connection.commit();
      return getAiChangeSet(identity, row.id, database);
    }
    if (row.status !== 'applied') throw changeError('CHANGE_SET_NOT_UNDOABLE', '当前变更集不能撤销', 409);
    const [itemRows] = await connection.query(
      `SELECT * FROM ai_change_items WHERE change_set_id = ? AND status = 'applied'
       ORDER BY item_order DESC, id DESC FOR UPDATE`,
      [row.id],
    );
    for (const rowItem of itemRows) {
      const item = mapItem(rowItem);
      await undoItem(connection, identity, item);
      await connection.query("UPDATE ai_change_items SET status = 'undone' WHERE id = ?", [item.id]);
    }
    await invalidateSearchInTransaction(connection, identity.subjectUserId);
    const [finalized] = await connection.query(
      `UPDATE ai_change_sets SET status = 'undone', undone_at = CURRENT_TIMESTAMP
       WHERE id = ? AND actor_user_id = ? AND subject_user_id = ? AND admin_context_mode = ?
         AND admin_context_id <=> ?`,
      [row.id, ...owner(identity)],
    );
    if (Number(finalized?.affectedRows || 0) !== 1) {
      throw changeError('CHANGE_UNDO_FINALIZE_CONFLICT', '变更集状态已变化，撤销未提交', 409);
    }
    await connection.commit();
    await invalidatePersonalKnowledgeCache(identity.subjectUserId, { persist: false });
    return getAiChangeSet(identity, row.id, database);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const __testing = {
  applyItem,
  canonical,
  loadCurrentState,
  invalidateSearchInTransaction,
  normalizeAfter,
  normalizeRetrySnapshot,
  normalizedOwner,
  selectedItemIdList,
  stableFailureCode,
  stateHash,
  undoItem,
};
