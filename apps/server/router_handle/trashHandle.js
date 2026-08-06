import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { deleteObjectFromObs, buildObjectKey } from '../util/obsClient.js';
import { ensureNotVisitor } from '../util/auth.js';
import { restoreTrashResources } from '../util/services/trashService.js';
import { purgeDocumentSourcesForCloudFiles } from '../util/aiDocument/service.js';
import { cleanupOrphanNoteImages } from '../util/noteImages.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { deleteNoteResourceRefsForNotes } from '../util/services/noteReferenceService.js';
import { cleanupBookmarkIconFiles } from '../util/bookmarkIconService.js';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import { NoteTreeError, prepareOwnedNotePhysicalDelete } from '../util/services/noteTreeService.js';

// 彻底删除笔记时:删 note_images 行,返回其图片 URL(供事务提交后删磁盘文件)。
// note_images 原本只增不删,笔记永久删除后图片文件会残留成孤儿。
async function purgeNoteImages(connection, noteIds) {
  if (!noteIds || noteIds.length === 0) return [];
  const ph = noteIds.map(() => '?').join(',');
  const [imgs] = await connection.query(`SELECT url FROM note_images WHERE note_id IN (${ph})`, noteIds);
  if (imgs.length) await connection.query(`DELETE FROM note_images WHERE note_id IN (${ph})`, noteIds);
  return imgs.map((r) => r.url).filter(Boolean);
}

// 彻底删除笔记时连带清理其历史版本,避免 note_versions 残留孤儿
async function purgeNoteVersions(connection, noteIds) {
  if (!noteIds || noteIds.length === 0) return;
  const ph = noteIds.map(() => '?').join(',');
  await connection.query(`DELETE FROM note_versions WHERE note_id IN (${ph})`, noteIds);
}

// 物理文件清理统一走 util/noteImages.js 的 cleanupOrphanNoteImages:
// 仅当 URL 既无其他笔记引用(note_images)、也无模板正文引用(note_template)时才删磁盘文件,
// 且必须在删除事务提交之后调用(残留的 note_images 行=其他笔记仍在引用)。

const RESOURCE_TYPES = ['bookmark', 'note', 'file'];

const TABLE_CONFIG = {
  bookmark: { table: 'bookmark', userIdField: 'user_id', nameField: 'name' },
  note: { table: 'note', userIdField: 'create_by', nameField: 'title' },
  file: { table: 'files', userIdField: 'create_by', nameField: 'file_name' },
};

async function purgeInboxRelations(connection, resourceType, ids, userId = null) {
  if (!ids?.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const userCondition = userId ? ' AND user_id = ?' : '';
  await connection.query(
    `DELETE FROM resource_inbox
      WHERE resource_type = ? AND resource_id IN (${placeholders})${userCondition}`,
    userId ? [resourceType, ...ids, userId] : [resourceType, ...ids],
  );
}

async function purgeDeletedInboxRelationsForUser(connection, resourceType, userId) {
  const cfg = TABLE_CONFIG[resourceType];
  await connection.query(
    `DELETE i FROM resource_inbox i
      INNER JOIN \`${cfg.table}\` t ON i.resource_id = CAST(t.id AS CHAR)
       AND i.resource_type = ?
      WHERE i.user_id = ? AND t.${cfg.userIdField} = ? AND t.del_flag = 1`,
    [resourceType, userId, userId],
  );
}

// ---- 清理过期数据 ----

// 回收站保留天数按成长等级(低级维持 30 天,高级递增到满级 90 天):引用连接的 user_growth g.exp。
// 阈值 = RANKS 的 cumExp(Lv5=2700 / Lv10=14500 / Lv15=50000),与 growth.js 单一事实源保持一致。
const RETAIN_DAYS_CASE = `CASE
  WHEN COALESCE(g.exp, 0) >= 50000 THEN 36500
  WHEN COALESCE(g.exp, 0) >= 14500 THEN 180
  WHEN COALESCE(g.exp, 0) >= 2700 THEN 60
  ELSE 30 END`;
// 过期条件:资源表用别名 alias,调用方须 LEFT JOIN user_growth g;按所有者等级算保留天数
const expiryWhere = (alias) =>
  `${alias}.del_flag = 1 AND ${alias}.deleted_at < DATE_SUB(NOW(), INTERVAL (${RETAIN_DAYS_CASE}) DAY)`;
const NOT_ROOT_CONDITION = (idField) => `${idField} NOT IN (SELECT id FROM \`user\` WHERE role = 'root')`;

async function cleanupExpiredFiles(connection, userId = null) {
  const userCond = userId ? ` AND f.create_by = ${pool.escape(userId)}` : ` AND ${NOT_ROOT_CONDITION('f.create_by')}`;
  const [rows] = await connection.query(
    `SELECT f.id, f.obs_key, f.create_by, f.file_name FROM files f
     LEFT JOIN user_growth g ON g.user_id = f.create_by
     WHERE ${expiryWhere('f')}${userCond}`,
  );

  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  await purgeInboxRelations(connection, 'file', ids);
  await connection.query(
    `DELETE FROM resource_tag_relations WHERE resource_type = 'file' AND resource_id IN (${placeholders})`,
    ids,
  );
  const byUser = new Map();
  for (const row of rows) {
    const list = byUser.get(row.create_by) || [];
    list.push(row.id);
    byUser.set(row.create_by, list);
  }
  for (const [ownerId, ownerFileIds] of byUser) {
    await purgeDocumentSourcesForCloudFiles(connection, ownerId, ownerFileIds);
  }
  await connection.query(`DELETE FROM files WHERE id IN (${placeholders})`, ids);

  // 异步删 OBS，不阻塞
  for (const f of rows) {
    const key = f.obs_key || buildObjectKey(f.create_by, f.file_name);
    deleteObjectFromObs(key).catch((e) =>
      console.error('[trash] expired OBS cleanup failed code=%s', stableAgentErrorCode(e)),
    );
  }
  return rows.length;
}

async function cleanupExpiredNotes(connection, userId = null) {
  const userCond = userId ? ` AND n.create_by = ${pool.escape(userId)}` : ` AND ${NOT_ROOT_CONDITION('n.create_by')}`;
  const [notes] = await connection.query(
    `SELECT n.id, n.create_by FROM note n LEFT JOIN user_growth g ON g.user_id = n.create_by WHERE ${expiryWhere('n')}${userCond}`,
  );
  if (notes.length === 0) return { count: 0, imageUrls: [], userIds: [] };
  const candidatesByUser = new Map();
  for (const note of notes) {
    const ownerId = String(note.create_by || '').trim();
    if (!ownerId) continue;
    if (!candidatesByUser.has(ownerId)) candidatesByUser.set(ownerId, []);
    candidatesByUser.get(ownerId).push(note.id);
  }
  const resolvedIds = new Set();
  for (const [ownerId, candidateIds] of candidatesByUser) {
    const prepared = await prepareOwnedNotePhysicalDelete(connection, { userId: ownerId, ids: candidateIds });
    prepared.ids.forEach((id) => resolvedIds.add(id));
  }
  const ids = [...resolvedIds];
  if (ids.length === 0) return { count: 0, imageUrls: [], userIds: [...candidatesByUser.keys()] };
  const ph = ids.map(() => '?').join(',');
  await purgeInboxRelations(connection, 'note', ids);
  const urls = await purgeNoteImages(connection, ids);
  await purgeNoteVersions(connection, ids);
  // 笔记内联提及(N0):永久清理笔记时,同事务删除其全部出边引用关系(§4 生命周期:永久清理须显式删关系)。
  await deleteNoteResourceRefsForNotes(connection, ids);
  const [result] = await connection.query(`DELETE FROM note WHERE id IN (${ph})`, ids);
  // 物理文件清理交由调用方在事务提交后执行(此处事务未提交,引用检查会读到旧数据)
  return { count: result.affectedRows, imageUrls: urls, userIds: [...candidatesByUser.keys()] };
}

async function cleanupExpiredBookmarks(connection, userId = null) {
  const userCond = userId ? ` AND b.user_id = ${pool.escape(userId)}` : ` AND ${NOT_ROOT_CONDITION('b.user_id')}`;

  const [bookmarks] = await connection.query(
    `SELECT b.id, b.icon_url AS iconUrl FROM bookmark b LEFT JOIN user_growth g ON g.user_id = b.user_id
     WHERE ${expiryWhere('b')}${userCond}`,
  );
  await purgeInboxRelations(
    connection,
    'bookmark',
    bookmarks.map((bookmark) => bookmark.id),
  );

  // 先清 resource_tag_relations（bookmark 的多态字段无 FK CASCADE）
  await connection.query(
    `DELETE rtr FROM resource_tag_relations rtr
     INNER JOIN bookmark b ON rtr.resource_id = b.id AND rtr.resource_type = 'bookmark'
     LEFT JOIN user_growth g ON g.user_id = b.user_id
     WHERE ${expiryWhere('b')}${userCond}`,
  );

  const [result] = await connection.query(
    `DELETE b FROM bookmark b LEFT JOIN user_growth g ON g.user_id = b.user_id WHERE ${expiryWhere('b')}${userCond}`,
  );
  return { count: result.affectedRows, icons: bookmarks };
}

/** 全局清理（定时任务调用，无 userId 限制） */
export async function cleanupAllExpiredTrash() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { count: bookmarkCount, icons: bookmarkIcons } = await cleanupExpiredBookmarks(connection);
    const { count: noteCount, imageUrls, userIds: noteUserIds } = await cleanupExpiredNotes(connection);
    const fileCount = await cleanupExpiredFiles(connection);
    await connection.commit();
    await cleanupBookmarkIconFiles(bookmarkIcons, { db: connection }).catch(() => {});
    cleanupOrphanNoteImages(imageUrls);
    await Promise.all(noteUserIds.map((userId) => invalidatePersonalKnowledgeCache(userId)));
    console.log(`[回收站定时清理] 书签${bookmarkCount} 笔记${noteCount} 文件${fileCount}`);
  } catch (e) {
    await connection.rollback();
    console.error('[trash] scheduled cleanup failed code=%s', stableAgentErrorCode(e));
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
    const { icons: bookmarkIcons } = await cleanupExpiredBookmarks(connection, userId);
    const { imageUrls, userIds: noteUserIds } = await cleanupExpiredNotes(connection, userId);
    await cleanupExpiredFiles(connection, userId);
    await connection.commit();
    await cleanupBookmarkIconFiles(bookmarkIcons, { db: connection }).catch(() => {});
    cleanupOrphanNoteImages(imageUrls);
    await Promise.all(noteUserIds.map((ownerId) => invalidatePersonalKnowledgeCache(ownerId)));
  } catch (e) {
    await connection.rollback();
    console.error('[trash] user expiry cleanup failed code=%s', stableAgentErrorCode(e));
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
    purgeExpiredItems(userId).catch((e) => console.warn('[trash] 过期清理失败 code=%s', stableAgentErrorCode(e)));

    const { resourceType, keyword, pageSize = 20, currentPage = 1 } = req.body || {};
    const normalizedKeyword = String(keyword || '').trim();
    const keywordPattern = `%${normalizedKeyword}%`;

    const types = resourceType ? [resourceType] : RESOURCE_TYPES;
    const queries = [];

    for (const type of types) {
      const cfg = TABLE_CONFIG[type];
      if (!cfg) continue;

      if (type === 'note') {
        const keywordCondition = normalizedKeyword
          ? ` AND (
                n.title LIKE ?
                OR (
                  n.tree_delete_batch_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                      FROM note keyword_member
                     WHERE keyword_member.create_by = n.create_by
                       AND keyword_member.del_flag = 1
                       AND keyword_member.tree_delete_batch_id = n.tree_delete_batch_id
                       AND keyword_member.title LIKE ?
                  )
                )
              )`
          : '';
        const params = [type, userId];
        if (normalizedKeyword) params.push(keywordPattern, keywordPattern);
        queries.push(
          pool.query(
            `SELECT n.id,
                    n.title AS name,
                    ? AS resourceType,
                    n.deleted_at,
                    CASE
                      WHEN n.tree_delete_batch_id IS NULL THEN 1
                      ELSE (
                        SELECT COUNT(*)
                          FROM note batch_member
                         WHERE batch_member.create_by = n.create_by
                           AND batch_member.del_flag = 1
                           AND batch_member.tree_delete_batch_id = n.tree_delete_batch_id
                      )
                    END AS batch_count
               FROM note n
              WHERE n.create_by = ?
                AND n.del_flag = 1
                AND (
                  n.tree_delete_batch_id IS NULL
                  OR NOT EXISTS (
                    SELECT 1
                      FROM note batch_parent
                     WHERE batch_parent.id = n.parent_id
                       AND batch_parent.create_by = n.create_by
                       AND batch_parent.del_flag = 1
                       AND batch_parent.tree_delete_batch_id = n.tree_delete_batch_id
                  )
                )${keywordCondition}
              ORDER BY n.deleted_at DESC`,
            params,
          ),
        );
        continue;
      }

      const keywordCondition = normalizedKeyword ? ` AND ${cfg.nameField} LIKE ?` : '';
      const sizeField = type === 'file' ? ', file_size' : '';
      const params = [type, userId];
      if (normalizedKeyword) params.push(keywordPattern);
      queries.push(
        pool.query(
          `SELECT id, ${cfg.nameField} AS name, ? AS resourceType, deleted_at${sizeField}
           FROM \`${cfg.table}\`
           WHERE ${cfg.userIdField} = ? AND del_flag = 1${keywordCondition}
           ORDER BY deleted_at DESC`,
          params,
        ),
      );
    }

    const queryResults = await Promise.all(queries);

    let allItems = [];
    for (const [rows] of queryResults) {
      allItems = allItems.concat(rows);
    }
    allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    const offset = Number(pageSize) * (Number(currentPage) - 1);
    const items = allItems.slice(offset, offset + Number(pageSize));

    // total 直接取全量结果长度:原先另发 3 条 COUNT 与主查询同条件,纯冗余(全量本就已拉回内存)
    res.send(resultData({ items, total: allItems.length }));
  } catch (e) {
    console.error('[trash] list failed code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '获取回收站列表失败，请稍后重试'));
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
    console.error('[trash] file size failed code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '获取回收站文件大小失败，请稍后重试'));
  }
};

export const restoreTrash = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
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

    const results = await restoreTrashResources({ userId, filters: { resourceType, ids } });
    const restored = results.reduce((sum, item) => sum + Number(item.count || 0), 0);
    res.send(resultData({ restored }, 200, '恢复成功'));
  } catch (e) {
    if (e instanceof NoteTreeError) {
      return res.send(resultData({ code: e.code, details: e.details || null }, e.status || 400, '恢复范围已变化'));
    }
    console.error('[trash] restore failed code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 500, '恢复失败，请稍后重试'));
  }
};

export const permanentDelete = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    const { resourceType } = req.body || {};
    const ids = [...
      new Set(
        (Array.isArray(req.body?.ids) ? req.body.ids : [])
          .map((id) => String(id ?? '').trim())
          .filter(Boolean),
      ),
    ];
    if (!resourceType || !RESOURCE_TYPES.includes(resourceType)) {
      return res.send(resultData(null, 400, '无效的资源类型'));
    }
    if (ids.length === 0 || ids.length > 100) {
      return res.send(resultData(null, 400, '无效的ID列表'));
    }

    const cfg = TABLE_CONFIG[resourceType];
    await connection.beginTransaction();

    let targetIds = ids;
    if (resourceType === 'note') {
      const prepared = await prepareOwnedNotePhysicalDelete(connection, { userId, ids });
      targetIds = prepared.ids;
    }
    if (targetIds.length === 0) {
      await connection.commit();
      return res.send(resultData({ deleted: 0 }, 200, '彻底删除成功'));
    }
    const placeholders = targetIds.map(() => '?').join(',');

    await connection.query(
      `DELETE FROM resource_tag_relations
        WHERE resource_type = ? AND user_id = ? AND resource_id IN (${placeholders})`,
      [resourceType, userId, ...targetIds],
    );
    await purgeInboxRelations(connection, resourceType, targetIds, userId);

    let objsToDelete = [];
    let noteImageUrls = [];
    let bookmarkIcons = [];
    if (resourceType === 'file') {
      const [files] = await connection.query(
        `SELECT id, obs_key, create_by, file_name FROM \`${cfg.table}\`
         WHERE id IN (${placeholders}) AND ${cfg.userIdField} = ? AND del_flag = 1`,
        [...targetIds, userId],
      );
      objsToDelete = files;
      await purgeDocumentSourcesForCloudFiles(
        connection,
        userId,
        files.map((file) => file.id),
      );
    } else if (resourceType === 'note') {
      noteImageUrls = await purgeNoteImages(connection, targetIds);
      await purgeNoteVersions(connection, targetIds);
      // 笔记内联提及(N0):永久删除笔记时,同事务删除其全部出边引用关系。
      await deleteNoteResourceRefsForNotes(connection, targetIds);
    } else if (resourceType === 'bookmark') {
      const [bookmarks] = await connection.query(
        `SELECT id, icon_url AS iconUrl
         FROM bookmark
         WHERE id IN (${placeholders}) AND ${cfg.userIdField} = ? AND del_flag = 1`,
        [...targetIds, userId],
      );
      bookmarkIcons = bookmarks || [];
    }

    const [result] = await connection.query(
      `DELETE FROM \`${cfg.table}\` WHERE id IN (${placeholders}) AND ${cfg.userIdField} = ? AND del_flag = 1`,
      [...targetIds, userId],
    );

    await connection.commit();
    await cleanupBookmarkIconFiles(bookmarkIcons, { db: connection }).catch(() => {});

    for (const f of objsToDelete) {
      const key = f.obs_key || buildObjectKey(f.create_by, f.file_name);
      deleteObjectFromObs(key).catch((e) =>
        console.error('[trash] OBS delete failed code=%s', stableAgentErrorCode(e)),
      );
    }
    cleanupOrphanNoteImages(noteImageUrls);
    if (resourceType === 'note') await invalidatePersonalKnowledgeCache(userId);

    res.send(resultData({ deleted: result.affectedRows }, 200, '彻底删除成功'));
  } catch (e) {
    await connection.rollback();
    console.error('[trash] permanent delete failed code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '彻底删除失败，请稍后重试'));
  } finally {
    connection.release();
  }
};

export const restoreAllTrash = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));
    const results = await restoreTrashResources({ userId, filters: { all: true } });
    const total = results.reduce((sum, item) => sum + Number(item.count || 0), 0);
    res.send(resultData({ restored: total }, 200, `已恢复 ${total} 项`));
  } catch (e) {
    console.error('[trash] restore all failed code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '一键恢复失败，请稍后重试'));
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
    await purgeDocumentSourcesForCloudFiles(
      connection,
      userId,
      files.map((file) => file.id),
    );
    // 笔记图片:先拿待清笔记的图片 URL 并删 note_images 行(下面循环会删 note 行)
    const [delNotes] = await connection.query(`SELECT id FROM note WHERE create_by = ? AND del_flag = 1`, [userId]);
    const preparedNotes = delNotes.length
      ? await prepareOwnedNotePhysicalDelete(connection, {
          userId,
          ids: delNotes.map((note) => note.id),
        })
      : { ids: [] };
    const delNoteIds = preparedNotes.ids;
    const noteImageUrls = await purgeNoteImages(connection, delNoteIds);
    await purgeNoteVersions(connection, delNoteIds);
    // 笔记内联提及(N0):清空回收站时,同事务删除这些笔记的全部出边引用关系。
    await deleteNoteResourceRefsForNotes(connection, delNoteIds);
    const [bookmarkIcons] = await connection.query(
      `SELECT id, icon_url AS iconUrl
       FROM bookmark
       WHERE user_id = ? AND del_flag = 1`,
      [userId],
    );

    let total = 0;
    for (const type of RESOURCE_TYPES) {
      const cfg = TABLE_CONFIG[type];

      await purgeDeletedInboxRelationsForUser(connection, type, userId);

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
    await cleanupBookmarkIconFiles(bookmarkIcons, { db: connection }).catch(() => {});

    // 事务提交后删 OBS
    for (const f of files) {
      const key = f.obs_key || buildObjectKey(f.create_by, f.file_name);
      deleteObjectFromObs(key).catch((e) =>
        console.error('[trash] OBS delete failed code=%s', stableAgentErrorCode(e)),
      );
    }
    cleanupOrphanNoteImages(noteImageUrls);
    if (delNoteIds.length) await invalidatePersonalKnowledgeCache(userId);

    res.send(resultData({ deleted: total }, 200, '回收站已清空'));
  } catch (e) {
    await connection.rollback();
    console.error('[trash] empty failed code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '清空回收站失败，请稍后重试'));
  } finally {
    connection.release();
  }
};
