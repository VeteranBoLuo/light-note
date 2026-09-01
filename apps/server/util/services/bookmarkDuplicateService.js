import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { createBookmarkExactUrlHash, normalizeBookmarkGroupKey } from './bookmarkExactUrlService.js';
import { queryBookmarkRelationGuards } from './bookmarkRelationGuardService.js';
import { mergeBookmarkTags } from './resourceTagWriteService.js';
import { runResourceDeleteSideEffects, softDeleteResources } from './resourceDeleteService.js';
import {
  deleteOrganizeSuppression,
  ORGANIZE_SUPPRESSION_TYPES,
  queryOrganizeSuppressions,
  upsertOrganizeSuppression,
} from './organizeSuppressionService.js';

const MAX_SUMMARY_GROUPS = 200;

function serviceError(code, message, status = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (parsed?.v !== 1 || !parsed?.time || !normalizeBookmarkGroupKey(parsed?.groupKey)) throw new Error();
    const time = new Date(parsed.time);
    if (Number.isNaN(time.getTime())) throw new Error();
    return { ...parsed, time };
  } catch {
    throw serviceError('ORGANIZE_CURSOR_INVALID', '分页位置已失效，请重新加载');
  }
}

function normalizeLimit(value, fallback = 20, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

async function queryMemberTags(db, { userId, bookmarkIds, lock = false }) {
  if (!bookmarkIds.length) return new Map();
  const placeholders = bookmarkIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT relations.resource_id AS bookmarkId, tag.id, tag.name
       FROM resource_tag_relations relations
       INNER JOIN tag ON tag.id = relations.tag_id AND tag.user_id = ? AND tag.del_flag = 0
      WHERE relations.user_id = ? AND relations.resource_type = 'bookmark'
        AND relations.resource_id IN (${placeholders})
      ORDER BY tag.sort, tag.create_time DESC${lock ? ' FOR UPDATE' : ''}`,
    [userId, userId, ...bookmarkIds],
  );
  const tags = new Map(bookmarkIds.map((id) => [id, []]));
  rows.forEach((row) => {
    const list = tags.get(String(row.bookmarkId));
    if (list) list.push({ id: String(row.id), name: row.name || '' });
  });
  return tags;
}

function recommendKeepMember(members) {
  return [...members].sort((left, right) => {
    if (right.guard.blockerCount !== left.guard.blockerCount) return right.guard.blockerCount - left.guard.blockerCount;
    if (right.tags.length !== left.tags.length) return right.tags.length - left.tags.length;
    const time = new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
    return time || left.id.localeCompare(right.id);
  })[0];
}

function buildContext(groupKey, members) {
  const payload = {
    groupKey,
    members: [...members]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((member) => ({
        id: member.id,
        delFlag: 0,
        tags: member.tags.map((tag) => tag.id).sort(),
        guards: {
          snapshot: member.guard.snapshot,
          noteReference: member.guard.noteReference,
          todoReference: member.guard.todoReference,
          todoSeriesReference: member.guard.todoSeriesReference,
        },
      })),
  };
  return sha256(stableJson(payload));
}

function buildDuplicatePreview({ groupKey, rows, tags, guards }) {
  const verified = rows.filter((row) => createBookmarkExactUrlHash(row.url)?.toString('hex') === groupKey);
  const urls = new Set(verified.map((row) => String(row.url)));
  if (urls.size > 1) throw serviceError('DUPLICATE_HASH_COLLISION', '网址分组校验失败，请稍后重试', 409);
  if (verified.length < 2) throw serviceError('DUPLICATE_GROUP_CHANGED', '这组书签已经发生变化，请重新加载', 409);

  const members = verified.map((row) => {
    const id = String(row.id);
    const guard = guards.get(id);
    if (!guard) throw serviceError('DUPLICATE_GUARD_INCOMPLETE', '重复书签关系检查暂时不可用', 500);
    return {
      id,
      name: row.name || '',
      url: row.url || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tags: tags.get(id) || [],
      guard,
    };
  });
  const recommended = recommendKeepMember(members);
  const contextHash = buildContext(groupKey, members);
  return {
    groupKey,
    url: members[0].url,
    memberCount: members.length,
    contextHash,
    recommendedKeepBookmarkId: recommended.id,
    recommendationReason:
      recommended.guard.blockerCount > 0
        ? '优先保留已有快照或引用关系的书签'
        : recommended.tags.length > 0
          ? '优先保留标签更完整的书签'
          : '优先保留最早创建的书签',
    members,
    canResolve: members.some((keep) => members.every((member) => member.id === keep.id || member.guard.blockerCount === 0)),
  };
}

async function loadDuplicatePreview(db, { userId, groupKey: rawGroupKey, lock = false }) {
  const groupKey = normalizeBookmarkGroupKey(rawGroupKey);
  if (!groupKey) throw serviceError('DUPLICATE_GROUP_INVALID', '重复书签分组无效');
  const [rows] = await db.query(
    `SELECT id, name, url, create_time AS createdAt, create_time AS updatedAt, del_flag AS delFlag
       FROM bookmark
      WHERE user_id = ? AND del_flag = 0 AND url_exact_hash = UNHEX(?)
      ORDER BY create_time ASC, id ASC${lock ? ' FOR UPDATE' : ''}`,
    [userId, groupKey],
  );
  const ids = rows.map((row) => String(row.id));
  // db 也可能是单个事务连接，顺序查询避免同一连接上并发命令导致驱动状态交错。
  const tags = await queryMemberTags(db, { userId, bookmarkIds: ids, lock });
  const guards = await queryBookmarkRelationGuards(db, { userId, bookmarkIds: ids, lock });
  return buildDuplicatePreview({ groupKey, rows, tags, guards });
}

async function loadDuplicatePreviews(db, { userId, candidates }) {
  const groupKeys = [...new Set(candidates.map((candidate) => normalizeBookmarkGroupKey(candidate.group_key)).filter(Boolean))];
  if (!groupKeys.length) return [];
  const [rows] = await db.query(
    `SELECT id, name, url, create_time AS createdAt, create_time AS updatedAt, del_flag AS delFlag,
            LOWER(HEX(url_exact_hash)) AS groupKey
       FROM bookmark
      WHERE user_id = ? AND del_flag = 0
        AND url_exact_hash IN (${groupKeys.map(() => 'UNHEX(?)').join(', ')})
      ORDER BY create_time ASC, id ASC`,
    [userId, ...groupKeys],
  );
  const rowsByGroup = new Map(groupKeys.map((groupKey) => [groupKey, []]));
  rows.forEach((row) => {
    const groupKey = normalizeBookmarkGroupKey(row.groupKey);
    if (rowsByGroup.has(groupKey)) rowsByGroup.get(groupKey).push(row);
  });
  const ids = rows.map((row) => String(row.id));
  // 列表页一次批量读取成员标签和四类关系，避免每个重复组各自产生五次数据库往返。
  const tags = await queryMemberTags(db, { userId, bookmarkIds: ids });
  const guards = await queryBookmarkRelationGuards(db, { userId, bookmarkIds: ids });
  const previews = [];
  for (const candidate of candidates) {
    const groupKey = normalizeBookmarkGroupKey(candidate.group_key);
    try {
      previews.push({
        candidate,
        preview: buildDuplicatePreview({ groupKey, rows: rowsByGroup.get(groupKey) || [], tags, guards }),
      });
    } catch (error) {
      if (error?.code !== 'DUPLICATE_GROUP_CHANGED') throw error;
    }
  }
  return previews;
}

export async function getDuplicateBookmarkPreview(db, options) {
  return loadDuplicatePreview(db, options);
}

async function queryGroupCandidates(db, { userId, cursor, limit }) {
  const params = [userId];
  const where = [];
  if (cursor) {
    where.push('(groups.updated_at < ? OR (groups.updated_at = ? AND groups.group_key > ?))');
    params.push(cursor.time, cursor.time, cursor.groupKey);
  }
  params.push(limit + 1);
  const [rows] = await db.query(
    `SELECT groups.*
       FROM (
         SELECT LOWER(HEX(url_exact_hash)) AS group_key,
                COUNT(*) AS member_count,
                MAX(create_time) AS updated_at
           FROM bookmark
          WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> '' AND url_exact_hash IS NOT NULL
          GROUP BY url_exact_hash, BINARY url
         HAVING COUNT(*) > 1
       ) groups
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY groups.updated_at DESC, groups.group_key ASC
      LIMIT ?`,
    params,
  );
  return rows;
}

export async function listDuplicateBookmarkGroups(
  db,
  { userId, cursor: rawCursor, limit: rawLimit, includeMembers = true, maxLimit = 50 } = {},
) {
  const normalizedMaxLimit = Math.min(Math.max(Number(maxLimit) || 50, 1), MAX_SUMMARY_GROUPS);
  const limit = normalizeLimit(rawLimit, 20, normalizedMaxLimit);
  const cursor = decodeCursor(rawCursor);
  // 忽略项需要按当前 contextHash 复核；多取一批，避免已忽略项占满本页。
  const candidateLimit = limit * 3;
  const rawCandidates = await queryGroupCandidates(db, { userId, cursor, limit: candidateLimit });
  const rawHasMore = rawCandidates.length > candidateLimit;
  const candidates = rawCandidates.slice(0, candidateLimit);
  const previews = await loadDuplicatePreviews(db, { userId, candidates });
  const suppressions = await queryOrganizeSuppressions(db, {
    userId,
    issueType: ORGANIZE_SUPPRESSION_TYPES.DUPLICATE,
    subjectKeys: previews.map(({ preview }) => preview.groupKey),
  });
  const visible = previews.filter(
    ({ preview }) => suppressions.get(preview.groupKey) !== preview.contextHash,
  );
  const returned = visible.slice(0, limit);
  const items = returned.map(({ preview }) =>
    includeMembers
      ? preview
      : {
          groupKey: preview.groupKey,
          url: preview.url,
          memberCount: preview.memberCount,
          contextHash: preview.contextHash,
          recommendedKeepBookmarkId: preview.recommendedKeepBookmarkId,
          canResolve: preview.canResolve,
        },
  );
  const hasMore = visible.length > limit || rawHasMore;
  const lastCandidate = returned[returned.length - 1]?.candidate || candidates[candidates.length - 1];
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && lastCandidate
        ? encodeCursor({
            v: 1,
            time:
              lastCandidate.updated_at instanceof Date
                ? lastCandidate.updated_at.toISOString()
                : String(lastCandidate.updated_at),
            groupKey: String(lastCandidate.group_key),
          })
        : null,
  };
}

export async function getDuplicateBookmarkSummary(db, { userId, maxGroups = MAX_SUMMARY_GROUPS } = {}) {
  const result = await listDuplicateBookmarkGroups(db, {
    userId,
    limit: Math.min(maxGroups, MAX_SUMMARY_GROUPS),
    maxLimit: MAX_SUMMARY_GROUPS,
    includeMembers: true,
  });
  const items = result.items;
  const resourceKeys = items.flatMap((group) => group.members.map((member) => `bookmark:${member.id}`));
  return {
    groupCount: items.length,
    findingCount: items.length,
    affectedResourceCount: new Set(resourceKeys).size,
    resourceKeys: [...new Set(resourceKeys)],
    exact: !result.hasMore,
    hasMore: result.hasMore,
  };
}

function normalizeResolvePayload(payload = {}) {
  const keepBookmarkId = String(payload.keepBookmarkId || '').trim();
  const deleteBookmarkIds = [...new Set((Array.isArray(payload.deleteBookmarkIds) ? payload.deleteBookmarkIds : []).map(String).filter(Boolean))].sort();
  const expectedContextHash = String(payload.expectedContextHash || '').trim().toLowerCase();
  const clientRequestId = String(payload.clientRequestId || '').trim().toLowerCase();
  if (!keepBookmarkId || !deleteBookmarkIds.length) throw serviceError('DUPLICATE_SELECTION_INVALID', '请选择要保留的书签');
  if (!/^[a-f0-9]{64}$/.test(expectedContextHash)) throw serviceError('ORGANIZE_CONTEXT_INVALID', '问题上下文无效');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(clientRequestId)) {
    throw serviceError('ORGANIZE_REQUEST_ID_INVALID', '请求标识无效');
  }
  return {
    keepBookmarkId,
    deleteBookmarkIds,
    mergeTags: payload.mergeTags !== false,
    expectedContextHash,
    clientRequestId,
  };
}

export async function resolveDuplicateBookmarkGroup({ userId, groupKey: rawGroupKey, payload }) {
  const groupKey = normalizeBookmarkGroupKey(rawGroupKey);
  if (!groupKey) throw serviceError('DUPLICATE_GROUP_INVALID', '重复书签分组无效');
  const normalized = normalizeResolvePayload(payload);
  const payloadHash = sha256(
    stableJson({
      groupKey,
      keepBookmarkId: normalized.keepBookmarkId,
      deleteBookmarkIds: normalized.deleteBookmarkIds,
      mergeTags: normalized.mergeTags,
      expectedContextHash: normalized.expectedContextHash,
    }),
  );
  let connection;
  let sideEffects = null;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      `SELECT action_type AS actionType, payload_hash AS payloadHash, status, response_json AS responseJson
         FROM organize_action_requests
        WHERE user_id = ? AND client_request_id = ? FOR UPDATE`,
      [userId, normalized.clientRequestId],
    );
    const existing = existingRows[0];
    if (existing) {
      if (existing.actionType !== 'duplicate.resolve' || existing.payloadHash !== payloadHash) {
        throw serviceError('ORGANIZE_IDEMPOTENCY_CONFLICT', '相同请求标识对应了不同操作', 409);
      }
      if (existing.status === 'succeeded' && existing.responseJson) {
        await connection.commit();
        const response =
          typeof existing.responseJson === 'string' ? JSON.parse(existing.responseJson) : existing.responseJson;
        return { ...response, idempotentReplay: true };
      }
    } else {
      await connection.query(
        `INSERT INTO organize_action_requests
           (user_id, client_request_id, action_type, payload_hash, status)
         VALUES (?, ?, 'duplicate.resolve', ?, 'pending')`,
        [userId, normalized.clientRequestId, payloadHash],
      );
    }

    const preview = await loadDuplicatePreview(connection, { userId, groupKey, lock: true });
    if (preview.contextHash !== normalized.expectedContextHash) {
      throw serviceError('DUPLICATE_GROUP_CHANGED', '这组书签已经发生变化，请重新确认', 409, {
        currentContextHash: preview.contextHash,
      });
    }
    const memberIds = preview.members.map((member) => member.id).sort();
    const expectedDeletes = memberIds.filter((id) => id !== normalized.keepBookmarkId).sort();
    if (
      !memberIds.includes(normalized.keepBookmarkId) ||
      expectedDeletes.length !== normalized.deleteBookmarkIds.length ||
      expectedDeletes.some((id, index) => id !== normalized.deleteBookmarkIds[index])
    ) {
      throw serviceError('DUPLICATE_SELECTION_INVALID', '保留项与当前分组不一致', 409);
    }
    const blocked = preview.members.filter(
      (member) => normalized.deleteBookmarkIds.includes(member.id) && member.guard.blockerCount > 0,
    );
    if (blocked.length) {
      throw serviceError('DUPLICATE_GROUP_BLOCKED', '待删除书签仍有快照或引用，无法自动处理', 409, {
        blocked: blocked.map((member) => ({ id: member.id, blockers: member.guard.blockers })),
      });
    }
    if (normalized.mergeTags) {
      const mergedTagIds = new Set(preview.members.flatMap((member) => member.tags.map((tag) => tag.id)));
      if (mergedTagIds.size > 4) {
        throw serviceError(
          'DUPLICATE_TAG_LIMIT_EXCEEDED',
          '合并后将超过 4 个标签，请先调整标签或取消合并标签',
          409,
          { tagCount: mergedTagIds.size, maxTagCount: 4 },
        );
      }
    }
    const mergedTagCount = normalized.mergeTags
      ? await mergeBookmarkTags(connection, {
          userId,
          keepBookmarkId: normalized.keepBookmarkId,
          sourceBookmarkIds: normalized.deleteBookmarkIds,
        })
      : 0;
    const deletion = await softDeleteResources(connection, {
      userId,
      items: normalized.deleteBookmarkIds.map((id) => ({ type: 'bookmark', id })),
    });
    if (deletion.affectedItemCount !== normalized.deleteBookmarkIds.length) {
      throw serviceError('DUPLICATE_GROUP_CHANGED', '这组书签已经发生变化，请重新加载', 409);
    }
    await deleteOrganizeSuppression(connection, {
      userId,
      issueType: ORGANIZE_SUPPRESSION_TYPES.DUPLICATE,
      subjectKey: groupKey,
    });
    const response = {
      groupKey,
      keepBookmarkId: normalized.keepBookmarkId,
      deletedBookmarkIds: normalized.deleteBookmarkIds,
      deletedCount: deletion.affectedItemCount,
      mergedTagCount,
      movedToTrash: true,
      idempotentReplay: false,
    };
    await connection.query(
      `UPDATE organize_action_requests
          SET status = 'succeeded', response_json = ?, update_time = CURRENT_TIMESTAMP
        WHERE user_id = ? AND client_request_id = ?`,
      [JSON.stringify(response), userId, normalized.clientRequestId],
    );
    sideEffects = deletion.sideEffects;
    await connection.commit();
    await runResourceDeleteSideEffects(sideEffects);
    return response;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    connection?.release();
  }
}

export async function ignoreDuplicateBookmarkGroup(db, { userId, groupKey }) {
  const preview = await loadDuplicatePreview(db, { userId, groupKey });
  return upsertOrganizeSuppression(db, {
    userId,
    issueType: ORGANIZE_SUPPRESSION_TYPES.DUPLICATE,
    subjectKey: preview.groupKey,
    contextHash: preview.contextHash,
  });
}

export async function unignoreDuplicateBookmarkGroup(db, { userId, groupKey }) {
  const normalized = normalizeBookmarkGroupKey(groupKey);
  if (!normalized) throw serviceError('DUPLICATE_GROUP_INVALID', '重复书签分组无效');
  return deleteOrganizeSuppression(db, {
    userId,
    issueType: ORGANIZE_SUPPRESSION_TYPES.DUPLICATE,
    subjectKey: normalized,
  });
}
