import { removeInboxRelations } from '../resourceInbox.js';

const FILE_DELETE_BATCH_SIZE = 200;

function normalizeOwnedFileIds(fileIds) {
  if (!Array.isArray(fileIds)) return [];
  const ids = [];
  const seen = new Set();
  for (const value of fileIds) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function chunkItems(items, size = FILE_DELETE_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * 在调用方事务中把当前用户的文件移入回收站。
 *
 * OBS 对象、标签等可恢复数据继续保留；待整理关系会移除，已生效的分享会撤销。
 * 该函数不自行开启/提交事务，便于单文件删除与整棵目录清空复用同一事实源。
 */
export async function softDeleteOwnedCloudFiles(connection, { userId, fileIds } = {}) {
  const ownerId = String(userId || '').trim();
  if (!connection?.query || !ownerId) throw new Error('FILE_DELETE_CONTEXT_INVALID: 文件删除上下文无效');
  const normalizedIds = normalizeOwnedFileIds(fileIds);
  let deletedFileCount = 0;

  for (const ids of chunkItems(normalizedIds)) {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await connection.query(
      `UPDATE files
          SET del_flag = 1, deleted_at = NOW()
        WHERE id IN (${placeholders})
          AND create_by = ?
          AND del_flag = 0`,
      [...ids, ownerId],
    );
    deletedFileCount += Number(result.affectedRows || 0);

    await removeInboxRelations(connection, {
      userId: ownerId,
      items: ids.map((fileId) => ({ resourceType: 'file', resourceId: String(fileId) })),
    });
    await connection.query(
      `UPDATE file_shares
          SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()), update_time = NOW()
        WHERE file_id IN (${placeholders})
          AND owner_user_id = ?
          AND status = 'active'`,
      [...ids, ownerId],
    );
  }

  return { fileIds: normalizedIds, deletedFileCount };
}

export const __testing = { chunkItems, normalizeOwnedFileIds };
