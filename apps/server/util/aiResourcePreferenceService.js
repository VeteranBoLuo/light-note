import pool from '../db/index.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

const RESOURCE_CONFIG = {
  bookmark: { table: 'bookmark', owner: 'user_id', deleted: 'del_flag = 0' },
  note: { table: 'note', owner: 'create_by', deleted: "del_flag = '0'" },
  file: { table: 'files', owner: 'create_by', deleted: 'del_flag = 0' },
};

function preferenceError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  error.isAiResourcePreferenceError = true;
  return error;
}

function normalizeResource(input = {}) {
  const resourceType = String(input.resourceType || input.type || '').trim();
  const resourceId = String(input.resourceId || input.id || '').trim();
  if (!RESOURCE_CONFIG[resourceType]) {
    throw preferenceError('AI_RESOURCE_TYPE_INVALID', '仅支持书签、笔记和云空间文件');
  }
  if (!resourceId || resourceId.length > 64) {
    throw preferenceError('AI_RESOURCE_ID_INVALID', '资源 ID 无效');
  }
  return { resourceType, resourceId };
}

function assertWritable(identity) {
  if (!identity?.subjectUserId) throw preferenceError('AI_RESOURCE_IDENTITY_INVALID', '资源身份无效', 403);
  if (identity.adminContextMode === 'readonly') {
    throw preferenceError('ADMIN_PREVIEW_READONLY', '只读预览模式不能修改资源 AI 设置', 403);
  }
}

async function assertOwnedResource(connection, userId, resourceType, resourceId, { lock = false } = {}) {
  const config = RESOURCE_CONFIG[resourceType];
  const [rows] = await connection.query(
    `SELECT id FROM ${config.table}
     WHERE id = ? AND ${config.owner} = ? AND ${config.deleted}
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [resourceId, userId],
  );
  if (!rows.length) throw preferenceError('AI_RESOURCE_NOT_FOUND', '资源不存在或无权访问', 404);
}

export async function listAiResourcePreferences(identity, input = {}, database = pool) {
  const items = Array.isArray(input.items) ? input.items.slice(0, 100).map(normalizeResource) : [];
  if (!items.length) return { items: [] };
  const clauses = items.map(() => '(resource_type = ? AND resource_id = ?)').join(' OR ');
  const params = [identity.subjectUserId, ...items.flatMap((item) => [item.resourceType, item.resourceId])];
  const [rows] = await database.query(
    `SELECT resource_type AS resourceType, resource_id AS resourceId, ai_excluded AS aiExcluded
     FROM ai_resource_preferences
     WHERE user_id = ? AND ai_excluded = 1 AND (${clauses})`,
    params,
  );
  const excluded = new Set(rows.map((row) => `${row.resourceType}:${row.resourceId}`));
  return {
    items: items.map((item) => ({
      ...item,
      aiExcluded: excluded.has(`${item.resourceType}:${item.resourceId}`),
    })),
  };
}

export async function updateAiResourcePreference(identity, input = {}, database = pool) {
  assertWritable(identity);
  const { resourceType, resourceId } = normalizeResource(input);
  if (typeof input.aiExcluded !== 'boolean') {
    throw preferenceError('AI_RESOURCE_PREFERENCE_INVALID', 'aiExcluded 必须是布尔值');
  }
  const userId = String(identity.subjectUserId);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await assertOwnedResource(connection, userId, resourceType, resourceId, { lock: true });
    if (input.aiExcluded) {
      await connection.query(
        `INSERT INTO ai_resource_preferences
          (user_id, resource_type, resource_id, ai_excluded)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE ai_excluded = 1, update_time = CURRENT_TIMESTAMP`,
        [userId, resourceType, resourceId],
      );
    } else {
      await connection.query(
        `DELETE FROM ai_resource_preferences
         WHERE user_id = ? AND resource_type = ? AND resource_id = ?`,
        [userId, resourceType, resourceId],
      );
    }
    // 偏好修改属于隐私边界变化：与写入同事务推进跨实例检索代际，并物理清掉旧分块。
    await connection.query(
      `INSERT INTO ai_content_generations (subject_user_id, generation) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE generation = generation + 1, update_time = CURRENT_TIMESTAMP`,
      [userId],
    );
    await connection.query(
      `DELETE FROM ai_content_chunks
       WHERE subject_user_id = ? AND resource_type = ? AND resource_id = ?`,
      [userId, resourceType, resourceId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await invalidatePersonalKnowledgeCache(userId, { persist: false });
  return { resourceType, resourceId, aiExcluded: input.aiExcluded };
}

export const __testing = { normalizeResource };
