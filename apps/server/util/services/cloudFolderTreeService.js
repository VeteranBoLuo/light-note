import pool from '../../db/index.js';
import { softDeleteOwnedCloudFiles } from './cloudFileDeletionService.js';

export const MAX_CLOUD_FOLDER_DEPTH = 8;
const CLOUD_FOLDER_MUTATION_BATCH_SIZE = 200;

function serviceError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

export function normalizeCloudFolderName(value) {
  const name = String(value || '')
    .normalize('NFC')
    .trim();
  if (!name) throw serviceError('FOLDER_NAME_REQUIRED', '文件夹名称不能为空');
  if (name.length > 255) throw serviceError('FOLDER_NAME_INVALID', '文件夹名称不能超过 255 个字符');
  return name;
}

export function normalizeCloudFolderId(value, { nullable = false } = {}) {
  if (value == null || String(value).trim() === '') {
    if (nullable) return null;
    throw serviceError('FOLDER_ID_INVALID', '文件夹 ID 无效');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw serviceError('FOLDER_ID_INVALID', '文件夹 ID 无效');
  return id;
}

function normalizeOwnerId(value) {
  const userId = String(value || '').trim();
  if (!userId) throw serviceError('USER_REQUIRED', '缺少用户信息', 401);
  return userId;
}

function normalizeParentId(row) {
  return row?.parent_id == null ? null : String(row.parent_id);
}

function namesEqual(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'zh-CN', { sensitivity: 'base', usage: 'search' }) === 0;
}

function rowById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

function siblingRows(rows, parentId, excludeId = '') {
  const normalizedParentId = parentId == null ? null : String(parentId);
  return rows.filter(
    (row) => normalizeParentId(row) === normalizedParentId && (!excludeId || String(row.id) !== String(excludeId)),
  );
}

function assertSiblingNameAvailable(rows, parentId, name, excludeId = '') {
  if (siblingRows(rows, parentId, excludeId).some((row) => namesEqual(row.name, name))) {
    throw serviceError('FOLDER_NAME_CONFLICT', '同一层级已存在同名文件夹', 409);
  }
}

function nextSiblingSort(rows, parentId, excludeId = '') {
  const values = siblingRows(rows, parentId, excludeId).map((row) => Number(row.sort || 0));
  return values.length ? Math.max(...values) + 1 : 0;
}

export function decorateCloudFolderRows(rows, { maxDepth = MAX_CLOUD_FOLDER_DEPTH } = {}) {
  const items = Array.isArray(rows)
    ? rows.map((row) => ({
        ...row,
        id: String(row.id),
        parent_id: row.parent_id == null ? null : String(row.parent_id),
      }))
    : [];
  const byId = rowById(items);
  const resolved = new Map();
  const resolving = new Set();

  function resolve(item) {
    const id = String(item.id);
    if (resolved.has(id)) return resolved.get(id);
    if (resolving.has(id)) throw serviceError('FOLDER_TREE_CORRUPT', '文件夹目录存在循环关系', 500);
    resolving.add(id);

    const parentId = normalizeParentId(item);
    let depth = 1;
    let pathNames = [item.name || '未命名文件夹'];
    if (parentId) {
      const parent = byId.get(parentId);
      if (!parent) throw serviceError('FOLDER_TREE_CORRUPT', '文件夹目录存在无效父级', 500);
      const parentMeta = resolve(parent);
      depth = parentMeta.depth + 1;
      pathNames = [...parentMeta.pathNames, item.name || '未命名文件夹'];
    }
    if (depth > maxDepth) throw serviceError('FOLDER_TREE_CORRUPT', '文件夹目录层级超过系统限制', 500);

    resolving.delete(id);
    const meta = { depth, pathNames };
    resolved.set(id, meta);
    return meta;
  }

  const childCountById = new Map(items.map((item) => [String(item.id), 0]));
  for (const item of items) {
    const parentId = normalizeParentId(item);
    if (parentId && childCountById.has(parentId)) {
      childCountById.set(parentId, Number(childCountById.get(parentId) || 0) + 1);
    }
  }

  return items.map((item) => {
    const meta = resolve(item);
    const childCount = Number(item.child_count ?? childCountById.get(String(item.id)) ?? 0);
    return {
      ...item,
      parent_id: item.parent_id,
      depth: meta.depth,
      path: meta.pathNames,
      full_path: meta.pathNames.join(' / '),
      child_count: childCount,
      has_children: childCount > 0,
      direct_file_count: Number(item.direct_file_count || 0),
    };
  });
}

async function loadOwnedFolderSnapshot(connection, userId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT id, name, parent_id, sort, create_time
       FROM folders
      WHERE create_by = ? AND del_flag = 0
      ORDER BY sort ASC, create_time DESC, id ASC${lock ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  decorateCloudFolderRows(rows);
  return rows;
}

async function runLockedMutation({ userId, database = pool, mutate }) {
  const normalizedUserId = normalizeOwnerId(userId);
  const connection = await database.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [userRows] = await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [
      normalizedUserId,
    ]);
    if (!userRows.length) throw serviceError('USER_NOT_FOUND', '用户不存在', 404);
    const rows = await loadOwnedFolderSnapshot(connection, normalizedUserId, { lock: true });
    const result = await mutate({ connection, rows, userId: normalizedUserId });
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // 回滚失败不能覆盖原始业务/数据库错误。
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

function requireOwnedFolder(rows, id) {
  const folder = rowById(rows).get(String(id));
  if (!folder) throw serviceError('FOLDER_NOT_FOUND', '文件夹不存在或无权限', 404);
  return folder;
}

function collectDescendantIds(rows, folderId) {
  const children = new Map();
  for (const row of rows) {
    const parentId = normalizeParentId(row);
    if (!parentId) continue;
    const list = children.get(parentId) || [];
    list.push(String(row.id));
    children.set(parentId, list);
  }
  const result = new Set();
  const queue = [...(children.get(String(folderId)) || [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) || []));
  }
  return result;
}

function chunkItems(items, size = CLOUD_FOLDER_MUTATION_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function loadActiveFileIdsForFolders(connection, userId, folderIds) {
  const fileIds = [];
  for (const ids of chunkItems(folderIds)) {
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(
      `SELECT id
         FROM files
        WHERE create_by = ?
          AND del_flag = 0
          AND folder_id IN (${placeholders})
        ORDER BY id ASC
        FOR UPDATE`,
      [userId, ...ids],
    );
    fileIds.push(...rows.map((row) => Number(row.id)));
  }
  return fileIds;
}

export async function listOwnedCloudFolders({ userId, filters = {}, database = pool } = {}) {
  const normalizedUserId = normalizeOwnerId(userId);
  const [[rows], [fileCountRows]] = await Promise.all([
    database.query(
      `SELECT folders.id, folders.name, folders.parent_id, folders.sort, folders.create_time,
              COUNT(DISTINCT child.id) AS child_count,
              COUNT(DISTINCT files.id) AS direct_file_count
         FROM folders
         LEFT JOIN folders child ON child.parent_id = folders.id
                                AND child.create_by = folders.create_by
                                AND child.del_flag = 0
         LEFT JOIN files ON files.folder_id = folders.id
                        AND files.create_by = folders.create_by
                        AND files.del_flag = 0
        WHERE folders.create_by = ? AND folders.del_flag = 0
        GROUP BY folders.id, folders.name, folders.parent_id, folders.sort, folders.create_time
        ORDER BY folders.sort ASC, folders.create_time DESC, folders.id ASC`,
      [normalizedUserId],
    ),
    database.query(
      `SELECT COUNT(*) AS all_file_count
         FROM files
        WHERE create_by = ? AND del_flag = 0`,
      [normalizedUserId],
    ),
  ]);
  const decorated = decorateCloudFolderRows(rows);
  const keyword = String(filters?.name || '')
    .trim()
    .toLocaleLowerCase();
  const items = keyword
    ? decorated.filter((item) =>
        String(item.full_path || item.name || '')
          .toLocaleLowerCase()
          .includes(keyword),
      )
    : decorated;
  return {
    items,
    total: items.length,
    maxDepth: MAX_CLOUD_FOLDER_DEPTH,
    allFileCount: Math.max(0, Number(fileCountRows?.[0]?.all_file_count || 0)),
  };
}

export async function createOwnedCloudFolder({ userId, name, parentId = null, database = pool } = {}) {
  const normalizedName = normalizeCloudFolderName(name);
  const normalizedParentId = normalizeCloudFolderId(parentId, { nullable: true });
  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      let parentDepth = 0;
      if (normalizedParentId !== null) {
        const parent = requireOwnedFolder(rows, normalizedParentId);
        parentDepth = decorateCloudFolderRows(rows).find((item) => item.id === String(parent.id))?.depth || 0;
      }
      if (parentDepth + 1 > MAX_CLOUD_FOLDER_DEPTH) {
        throw serviceError('FOLDER_DEPTH_EXCEEDED', `文件夹最多支持 ${MAX_CLOUD_FOLDER_DEPTH} 层`);
      }
      assertSiblingNameAvailable(rows, normalizedParentId, normalizedName);
      const sort = nextSiblingSort(rows, normalizedParentId);
      const [insertResult] = await connection.query('INSERT INTO folders SET ?', [
        {
          name: normalizedName,
          create_by: ownerId,
          parent_id: normalizedParentId,
          del_flag: 0,
          sort,
        },
      ]);
      return {
        id: String(insertResult.insertId),
        name: normalizedName,
        parentId: normalizedParentId == null ? null : String(normalizedParentId),
        depth: parentDepth + 1,
      };
    },
  });
}

export async function renameOwnedCloudFolder({ userId, id, name, database = pool } = {}) {
  const normalizedId = normalizeCloudFolderId(id);
  const normalizedName = normalizeCloudFolderName(name);
  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      const folder = requireOwnedFolder(rows, normalizedId);
      assertSiblingNameAvailable(rows, normalizeParentId(folder), normalizedName, normalizedId);
      await connection.query('UPDATE folders SET name = ? WHERE id = ? AND create_by = ? AND del_flag = 0', [
        normalizedName,
        normalizedId,
        ownerId,
      ]);
      return { id: String(normalizedId), name: normalizedName };
    },
  });
}

export async function moveOwnedCloudFolder({
  userId,
  id,
  parentId = null,
  anchorId = null,
  position = null,
  database = pool,
} = {}) {
  const normalizedId = normalizeCloudFolderId(id);
  const normalizedParentId = normalizeCloudFolderId(parentId, { nullable: true });
  const normalizedAnchorId = normalizeCloudFolderId(anchorId, { nullable: true });
  const normalizedPosition = position == null || String(position).trim() === '' ? null : String(position).trim();
  if (
    (normalizedAnchorId == null) !== (normalizedPosition == null) ||
    (normalizedPosition != null && !['before', 'after'].includes(normalizedPosition))
  ) {
    throw serviceError('FOLDER_MOVE_POSITION_INVALID', '文件夹移动位置参数无效');
  }
  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      const folder = requireOwnedFolder(rows, normalizedId);
      const currentParentId = normalizeParentId(folder);
      const targetParentId = normalizedParentId == null ? null : String(normalizedParentId);
      if (currentParentId === targetParentId && normalizedAnchorId == null) {
        return { id: String(normalizedId), parentId: targetParentId, moved: false };
      }
      if (String(normalizedId) === targetParentId) {
        throw serviceError('FOLDER_CYCLE', '不能把文件夹移动到自身');
      }

      const decorated = decorateCloudFolderRows(rows);
      const byId = new Map(decorated.map((item) => [String(item.id), item]));
      const descendants = collectDescendantIds(rows, normalizedId);
      if (targetParentId && descendants.has(targetParentId)) {
        throw serviceError('FOLDER_CYCLE', '不能把文件夹移动到自己的子文件夹中');
      }

      let targetParentDepth = 0;
      if (targetParentId) {
        requireOwnedFolder(rows, targetParentId);
        targetParentDepth = Number(byId.get(targetParentId)?.depth || 0);
      }
      const sourceDepth = Number(byId.get(String(normalizedId))?.depth || 1);
      let subtreeRelativeDepth = 0;
      for (const descendantId of descendants) {
        subtreeRelativeDepth = Math.max(
          subtreeRelativeDepth,
          Number(byId.get(descendantId)?.depth || sourceDepth) - sourceDepth,
        );
      }
      if (targetParentDepth + 1 + subtreeRelativeDepth > MAX_CLOUD_FOLDER_DEPTH) {
        throw serviceError('FOLDER_DEPTH_EXCEEDED', `移动后会超过 ${MAX_CLOUD_FOLDER_DEPTH} 层限制`);
      }

      assertSiblingNameAvailable(rows, targetParentId, folder.name, normalizedId);
      const targetSiblings = siblingRows(rows, targetParentId, normalizedId);
      let insertIndex = targetSiblings.length;
      if (normalizedAnchorId != null) {
        const anchorIndex = targetSiblings.findIndex((row) => String(row.id) === String(normalizedAnchorId));
        if (anchorIndex < 0) {
          throw serviceError('FOLDER_MOVE_POSITION_INVALID', '排序锚点不属于目标层级');
        }
        insertIndex = normalizedPosition === 'before' ? anchorIndex : anchorIndex + 1;
      }
      targetSiblings.splice(insertIndex, 0, folder);

      const previousOrder = siblingRows(rows, currentParentId).map((row) => String(row.id));
      const nextOrder = targetSiblings.map((row) => String(row.id));
      const orderChanged =
        currentParentId !== targetParentId ||
        previousOrder.length !== nextOrder.length ||
        previousOrder.some((folderId, index) => folderId !== nextOrder[index]);
      if (!orderChanged) return { id: String(normalizedId), parentId: targetParentId, moved: false };

      for (let index = 0; index < targetSiblings.length; index += 1) {
        await connection.query(
          'UPDATE folders SET parent_id = ?, sort = ? WHERE id = ? AND create_by = ? AND del_flag = 0',
          [normalizedParentId, index, targetSiblings[index].id, ownerId],
        );
      }
      return { id: String(normalizedId), parentId: targetParentId, moved: true };
    },
  });
}

export async function reorderOwnedCloudFolders({ userId, parentId = null, items, database = pool } = {}) {
  const normalizedParentId = normalizeCloudFolderId(parentId, { nullable: true });
  if (!Array.isArray(items) || !items.length) throw serviceError('FOLDER_SORT_INVALID', '文件夹排序参数无效');
  const ids = items.map((item) => String(normalizeCloudFolderId(item?.id)));
  if (new Set(ids).size !== ids.length) throw serviceError('FOLDER_SORT_INVALID', '文件夹排序包含重复项');

  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      const siblings = siblingRows(rows, normalizedParentId);
      const siblingIds = new Set(siblings.map((row) => String(row.id)));
      if (siblingIds.size !== ids.length || ids.some((id) => !siblingIds.has(id))) {
        throw serviceError('FOLDER_SORT_INVALID', '只能对同一层级的全部文件夹进行排序');
      }
      for (let index = 0; index < ids.length; index += 1) {
        await connection.query(
          'UPDATE folders SET sort = ? WHERE id = ? AND create_by = ? AND parent_id <=> ? AND del_flag = 0',
          [index, ids[index], ownerId, normalizedParentId],
        );
      }
      return { parentId: normalizedParentId == null ? null : String(normalizedParentId), items: ids };
    },
  });
}

export async function deleteEmptyOwnedCloudFolder({ userId, id, database = pool } = {}) {
  const normalizedId = normalizeCloudFolderId(id);
  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      requireOwnedFolder(rows, normalizedId);
      if (rows.some((row) => normalizeParentId(row) === String(normalizedId))) {
        throw serviceError('FOLDER_NOT_EMPTY', '文件夹包含子文件夹，请先移动或删除子文件夹', 409);
      }
      const [fileRows] = await connection.query(
        'SELECT id FROM files WHERE folder_id = ? AND create_by = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
        [normalizedId, ownerId],
      );
      if (fileRows.length) throw serviceError('FOLDER_NOT_EMPTY', '文件夹中还有文件，请先移出文件', 409);
      const [result] = await connection.query('DELETE FROM folders WHERE id = ? AND create_by = ? AND del_flag = 0', [
        normalizedId,
        ownerId,
      ]);
      if (!result.affectedRows) throw serviceError('FOLDER_NOT_FOUND', '文件夹不存在或无权限', 404);
      return { id: String(normalizedId) };
    },
  });
}

export async function deleteOwnedCloudFolderTree({ userId, id, database = pool } = {}) {
  const normalizedId = normalizeCloudFolderId(id);
  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      requireOwnedFolder(rows, normalizedId);
      const deletedFolderIds = [String(normalizedId), ...collectDescendantIds(rows, normalizedId)];
      const placeholders = deletedFolderIds.map(() => '?').join(',');
      const numericFolderIds = deletedFolderIds.map(Number);
      const [fileResult] = await connection.query(
        `UPDATE files
            SET folder_id = NULL
          WHERE create_by = ?
            AND folder_id IN (${placeholders})`,
        [ownerId, ...numericFolderIds],
      );
      const [folderResult] = await connection.query(
        `DELETE FROM folders
          WHERE create_by = ?
            AND del_flag = 0
            AND id IN (${placeholders})`,
        [ownerId, ...numericFolderIds],
      );
      if (Number(folderResult.affectedRows || 0) !== deletedFolderIds.length) {
        throw serviceError('FOLDER_DELETE_CONFLICT', '文件夹目录已发生变化，请刷新后重试', 409);
      }
      return {
        id: String(normalizedId),
        deletedFolderIds,
        movedFileCount: Number(fileResult.affectedRows || 0),
      };
    },
  });
}

export async function clearOwnedCloudFolderFiles({ userId, id, deleteFolders = false, database = pool } = {}) {
  const normalizedId = normalizeCloudFolderId(id);
  const shouldDeleteFolders = deleteFolders === true;
  return runLockedMutation({
    userId,
    database,
    async mutate({ connection, rows, userId: ownerId }) {
      requireOwnedFolder(rows, normalizedId);
      const folderIds = [String(normalizedId), ...collectDescendantIds(rows, normalizedId)].map(Number);
      const fileIds = await loadActiveFileIdsForFolders(connection, ownerId, folderIds);
      const { deletedFileCount } = await softDeleteOwnedCloudFiles(connection, { userId: ownerId, fileIds });
      if (deletedFileCount !== fileIds.length) {
        throw serviceError('FOLDER_CLEAR_CONFLICT', '目录中的文件已发生变化，请刷新后重试', 409);
      }

      let deletedFolderCount = 0;
      if (shouldDeleteFolders) {
        for (const ids of chunkItems(folderIds)) {
          const placeholders = ids.map(() => '?').join(',');
          await connection.query(
            `UPDATE files
                SET folder_id = NULL
              WHERE create_by = ?
                AND folder_id IN (${placeholders})`,
            [ownerId, ...ids],
          );
          const [folderResult] = await connection.query(
            `DELETE FROM folders
              WHERE create_by = ?
                AND del_flag = 0
                AND id IN (${placeholders})`,
            [ownerId, ...ids],
          );
          deletedFolderCount += Number(folderResult.affectedRows || 0);
        }
        if (deletedFolderCount !== folderIds.length) {
          throw serviceError('FOLDER_DELETE_CONFLICT', '文件夹目录已发生变化，请刷新后重试', 409);
        }
      }

      return {
        id: String(normalizedId),
        deletedFileCount,
        deletedFolderCount,
        deleteFolders: shouldDeleteFolders,
      };
    },
  });
}

export const __testing = {
  chunkItems,
  collectDescendantIds,
  namesEqual,
  serviceError,
  siblingRows,
};
