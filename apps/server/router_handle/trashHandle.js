import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { deleteObjectFromObs, buildObjectKey } from '../util/obsClient.js';
import { ensureNotVisitor } from '../util/auth.js';

const RESOURCE_TYPES = ['bookmark', 'note', 'file'];
const TRASH_EXPIRY_DAYS = 30;

const TABLE_CONFIG = {
  bookmark: { table: 'bookmark', userIdField: 'user_id', nameField: 'name' },
  note: { table: 'note', userIdField: 'create_by', nameField: 'title' },
  file: { table: 'files', userIdField: 'create_by', nameField: 'file_name' },
};

// ---- 清理过期数据 ----

const EXPIRY_CONDITION = `del_flag = 1 AND deleted_at < DATE_SUB(NOW(), INTERVAL ${TRASH_EXPIRY_DAYS} DAY)`;
const NOT_ROOT_CONDITION = (idField) =>
  `${idField} NOT IN (SELECT id FROM \`user\` WHERE role = 'root')`;

async function cleanupExpiredFiles(connection, userId = null) {
  const userCond = userId ? ` AND create_by = ${pool.escape(userId)}` : ` AND ${NOT_ROOT_CONDITION('create_by')}`;
  const [rows] = await connection.query(
    `SELECT id, obs_key, create_by, file_name FROM files WHERE ${EXPIRY_CONDITION}${userCond}`,
  );

  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  await connection.query(`DELETE FROM resource_tag_relations WHERE resource_type = 'file' AND resource_id IN (${placeholders})`, ids);
  await connection.query(`DELETE FROM files WHERE id IN (${placeholders})`, ids);

  // 异步删 OBS，不阻塞
  for (const f of rows) {
    const key = f.obs_key || buildObjectKey(f.create_by, f.file_name);
    deleteObjectFromObs(key).catch((e) => console.error(`[回收站] OBS 清理失败: ${e.message}`));
  }
  return rows.length;
}

async function cleanupExpiredNotes(connection, userId = null) {
  const userCond = userId ? ` AND create_by = ${pool.escape(userId)}` : ` AND ${NOT_ROOT_CONDITION('create_by')}`;
  const [result] = await connection.query(`DELETE FROM note WHERE ${EXPIRY_CONDITION}${userCond}`);
  return result.affectedRows;
}

async function cleanupExpiredBookmarks(connection, userId = null) {
  const userCond = userId ? ` AND user_id = ${pool.escape(userId)}` : ` AND ${NOT_ROOT_CONDITION('user_id')}`;

  // 先清 resource_tag_relations（bookmark 的多态字段无 FK CASCADE）
  await connection.query(
    `DELETE rtr FROM resource_tag_relations rtr
     INNER JOIN bookmark b ON rtr.resource_id = b.id AND rtr.resource_type = 'bookmark'
     WHERE b.${EXPIRY_CONDITION}${userCond ? ` AND b.user_id = ${pool.escape(userId)}` : ''}`,
  );

  const [result] = await connection.query(`DELETE FROM bookmark WHERE ${EXPIRY_CONDITION}${userCond}`);
  return result.affectedRows;
}

/** 全局清理（定时任务调用，无 userId 限制） */
export async function cleanupAllExpiredTrash() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const bookmarkCount = await cleanupExpiredBookmarks(connection);
    const noteCount = await cleanupExpiredNotes(connection);
    const fileCount = await cleanupExpiredFiles(connection);
    await connection.commit();
    console.log(`[回收站定时清理] 书签${bookmarkCount} 笔记${noteCount} 文件${fileCount}`);
  } catch (e) {
    await connection.rollback();
    console.error('[回收站定时清理] 失败:', e.message);
  } finally {
    connection.release();
  }
}

/** 单用户清理（打开回收站时调用） */
async function purgeExpiredItems(userId) {
  // root 用户的过期数据永不清除
  const [userRows] = await pool.query('SELECT role FROM `user` WHERE id = ?', [userId]);
  if (userRows[0]?.role === 'root') return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await cleanupExpiredBookmarks(connection, userId);
    await cleanupExpiredNotes(connection, userId);
    await cleanupExpiredFiles(connection, userId);
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    console.error(`[回收站] 用户${userId}过期清理失败:`, e.message);
  } finally {
    connection.release();
  }
}

// ---- API ----

export const getTrashList = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    // 先清理当前用户过期数据
    purgeExpiredItems(userId).catch(() => {});

    const { resourceType, keyword, pageSize = 20, currentPage = 1 } = req.body || {};

    const types = resourceType ? [resourceType] : RESOURCE_TYPES;
    const queries = [];
    const countQueries = [];

    for (const type of types) {
      const cfg = TABLE_CONFIG[type];
      if (!cfg) continue;

      const kwCond = keyword ? ` AND ${cfg.nameField} LIKE ${pool.escape(`%${keyword}%`)}` : '';
      const sizeField = type === 'file' ? ', file_size' : '';

      queries.push(
        pool.query(
          `SELECT id, ${cfg.nameField} AS name, ? AS resourceType, deleted_at${sizeField}
           FROM \`${cfg.table}\`
           WHERE ${cfg.userIdField} = ? AND del_flag = 1${kwCond}
           ORDER BY deleted_at DESC`,
          [type, userId],
        ),
      );

      countQueries.push(
        pool.query(
          `SELECT COUNT(*) AS cnt FROM \`${cfg.table}\` WHERE ${cfg.userIdField} = ? AND del_flag = 1${kwCond}`,
          [userId],
        ),
      );
    }

    const [queryResults, countResults] = await Promise.all([Promise.all(queries), Promise.all(countQueries)]);

    let allItems = [];
    for (const [rows] of queryResults) {
      allItems = allItems.concat(rows);
    }
    allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    const offset = Number(pageSize) * (Number(currentPage) - 1);
    const items = allItems.slice(offset, offset + Number(pageSize));

    let total = 0;
    for (const [rows] of countResults) {
      total += Number(rows[0]?.cnt || 0);
    }

    res.send(resultData({ items, total }));
  } catch (e) {
    res.send(resultData(null, 500, '获取回收站列表失败: ' + e.message));
  }
};

/** 回收站文件大小统计 */
export const getTrashFileSize = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(file_size), 0) AS totalSize, COUNT(*) AS fileCount
       FROM files WHERE create_by = ? AND del_flag = 1`,
      [userId],
    );

    res.send(
      resultData({
        totalSize: Number(rows[0]?.totalSize || 0),
        fileCount: Number(rows[0]?.fileCount || 0),
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '获取回收站文件大小失败: ' + e.message));
  }
};

export const restoreTrash = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    const { resourceType, ids } = req.body || {};
    if (!resourceType || !RESOURCE_TYPES.includes(resourceType)) {
      return res.send(resultData(null, 400, '无效的资源类型'));
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.send(resultData(null, 400, '无效的ID列表'));
    }

    const cfg = TABLE_CONFIG[resourceType];
    const placeholders = ids.map(() => '?').join(',');

    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE \`${cfg.table}\` SET del_flag = 0, deleted_at = NULL
       WHERE id IN (${placeholders}) AND ${cfg.userIdField} = ? AND del_flag = 1`,
      [...ids, userId],
    );
    await connection.commit();

    res.send(resultData({ restored: result.affectedRows }, 200, '恢复成功'));
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '恢复失败: ' + e.message));
  } finally {
    connection.release();
  }
};

export const permanentDelete = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    const { resourceType, ids } = req.body || {};
    if (!resourceType || !RESOURCE_TYPES.includes(resourceType)) {
      return res.send(resultData(null, 400, '无效的资源类型'));
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.send(resultData(null, 400, '无效的ID列表'));
    }

    const cfg = TABLE_CONFIG[resourceType];
    const placeholders = ids.map(() => '?').join(',');

    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM resource_tag_relations WHERE resource_type = ? AND resource_id IN (${placeholders})`,
      [resourceType, ...ids],
    );

    let objsToDelete = [];
    if (resourceType === 'file') {
      const [files] = await connection.query(
        `SELECT id, obs_key, create_by, file_name FROM \`${cfg.table}\`
         WHERE id IN (${placeholders}) AND ${cfg.userIdField} = ? AND del_flag = 1`,
        [...ids, userId],
      );
      objsToDelete = files;
    }

    const [result] = await connection.query(
      `DELETE FROM \`${cfg.table}\` WHERE id IN (${placeholders}) AND ${cfg.userIdField} = ? AND del_flag = 1`,
      [...ids, userId],
    );

    await connection.commit();

    for (const f of objsToDelete) {
      const key = f.obs_key || buildObjectKey(f.create_by, f.file_name);
      deleteObjectFromObs(key).catch((e) => console.error(`[回收站] OBS 删除失败: ${e.message}`));
    }

    res.send(resultData({ deleted: result.affectedRows }, 200, '彻底删除成功'));
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '彻底删除失败: ' + e.message));
  } finally {
    connection.release();
  }
};

export const restoreAllTrash = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    await connection.beginTransaction();

    let total = 0;
    for (const type of RESOURCE_TYPES) {
      const cfg = TABLE_CONFIG[type];
      const [result] = await connection.query(
        `UPDATE \`${cfg.table}\` SET del_flag = 0, deleted_at = NULL
         WHERE ${cfg.userIdField} = ? AND del_flag = 1`,
        [userId],
      );
      total += result.affectedRows;
    }

    await connection.commit();
    res.send(resultData({ restored: total }, 200, `已恢复 ${total} 项`));
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '一键恢复失败: ' + e.message));
  } finally {
    connection.release();
  }
};

export const emptyTrash = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    await connection.beginTransaction();

    // 先拿文件列表（事务内）
    const [files] = await connection.query(
      `SELECT id, obs_key, create_by, file_name FROM files WHERE create_by = ? AND del_flag = 1`,
      [userId],
    );

    let total = 0;
    for (const type of RESOURCE_TYPES) {
      const cfg = TABLE_CONFIG[type];

      await connection.query(
        `DELETE rtr FROM resource_tag_relations rtr
         INNER JOIN \`${cfg.table}\` t ON rtr.resource_id = t.id AND rtr.resource_type = ?
         WHERE t.${cfg.userIdField} = ? AND t.del_flag = 1`,
        [type, userId],
      );

      const [result] = await connection.query(
        `DELETE FROM \`${cfg.table}\` WHERE ${cfg.userIdField} = ? AND del_flag = 1`,
        [userId],
      );
      total += result.affectedRows;
    }

    await connection.commit();

    // 事务提交后删 OBS
    for (const f of files) {
      const key = f.obs_key || buildObjectKey(f.create_by, f.file_name);
      deleteObjectFromObs(key).catch((e) => console.error(`[回收站] OBS 删除失败: ${e.message}`));
    }

    res.send(resultData({ deleted: total }, 200, '回收站已清空'));
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '清空回收站失败: ' + e.message));
  } finally {
    connection.release();
  }
};
