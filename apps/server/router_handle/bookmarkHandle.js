import pool from '../db/index.js';
import { resultData, snakeCaseKeys, mergeExistingProperties, insertData } from '../util/common.js';
import { getDerivedRelatedTags } from '../util/services/tagRelationService.js';
import {
  RESOURCE_TYPE,
  insertResourceTagRelations,
  insertTagResourceRelations,
  replaceResourceTagRelations,
  replaceTagResourceRelations,
  validateUserTags,
  validateUserResources,
} from '../util/resourceTags.js';

import { promises as fs } from 'fs';
import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import { grantExp } from '../util/growth.js';
import {
  archiveAndSummarizeBookmark,
  archiveBookmark,
  getBookmarkSnapshot,
  summarizeBookmark,
} from '../util/snapshot.js';
import {
  checkBookmarkHealth,
  getHealthSummary,
  markLinkNormal,
  startFullCheck,
  resetHealth,
} from '../util/linkHealth.js';
import { suggestBookmarkMeta, suggestTagsFromText, ORGANIZE_MAX_BATCH } from '../util/aiOrganize.js';
import { attachPendingStatus } from '../util/resourceInbox.js';
import { createBookmark, normalizeBookmarkUrl, shouldResetBookmarkIcon } from '../util/services/bookmarkService.js';
import { runBookmarkImportTransaction } from '../util/services/bookmarkImportService.js';
import { createIconBatch } from '../util/bookmarkIconBatchService.js';
import { getIconBatchStatus, retryIconBatchFailures } from '../util/bookmarkIconBatchService.js';
import { createTag as createTagService, normalizeTagDescription } from '../util/services/tagService.js';
import {
  BookmarkUrlError,
  bookmarkUrlErrorPayload,
  inspectBookmarkUrl,
  resolveBookmarkUrlForClient,
} from '../util/bookmarkUrl.js';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { buildPagedResult, normalizeOptionalPagination } from '../util/pagination.js';
import { AnchoredSortError, moveOwnedResourceByAnchors } from '../util/anchoredSort.js';
import { completeGrowthTask } from '../util/growthTaskCompletion.js';
import crypto from 'node:crypto';
import { createUserAiExecutionConfig } from '../util/aiBillingCatalog.js';
import { runAiExecution } from '../util/aiExecution/service.js';
import { resolvePublicAiExecutionError } from '../util/aiExecution/publicError.js';
import { createRequestAbortContext } from '../util/requestAbort.js';
import { createBookmarkExactUrlHash } from '../util/services/bookmarkExactUrlService.js';
import { runResourceDeleteSideEffects, softDeleteResources } from '../util/services/resourceDeleteService.js';

function resolveBookmarkAiResultOutcome(result) {
  if (result?.ok !== false) return null;
  const reason = String(result.reason || 'failed')
    .trim()
    .toLowerCase();
  if (reason === 'quota_exceeded') {
    return { status: 'quota_blocked', errorCode: 'AI_QUOTA_EXCEEDED' };
  }
  if (reason === 'ai_error') return { status: 'failed', errorCode: 'AI_PROVIDER_ERROR' };
  if (reason === 'empty') return { status: 'failed', errorCode: 'AI_SKILL_OUTPUT_EMPTY' };
  const stableReason = reason.replace(/[^a-z0-9_]+/g, '_').slice(0, 40) || 'failed';
  return { status: 'failed', errorCode: `BOOKMARK_SUMMARY_${stableReason.toUpperCase()}` };
}

function resolveOrganizeAiResultOutcome(result) {
  if (result?.quotaLimited) return { status: 'quota_blocked', errorCode: 'AI_QUOTA_EXCEEDED' };
  const failedItems = Math.max(0, Number(result?.failedItems || 0));
  const successfulItems = Math.max(0, Number(result?.successfulItems || 0));
  if (!failedItems) return null;
  if (!successfulItems) return { status: 'failed', errorCode: 'AI_ORGANIZE_ALL_ITEMS_FAILED' };
  return { status: 'partial', errorCode: 'AI_ORGANIZE_PARTIAL' };
}
// ── 全局 ──────────────────────────────────────────────────
const MAX_EXCEL_BOOKMARK_IMPORT_ITEMS = 1000;

/**
 * 查询指定 ID 的书签中哪些尚无图标，返回 {id, url} 列表
 */
async function getBookmarksForIcon(ids, userId) {
  if (!ids?.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, url FROM bookmark
     WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})
       AND (icon_url IS NULL OR icon_url = '')`,
    [userId, ...ids],
  );
  return rows;
}

async function createImportIconBatch(stats, userId) {
  const ids = stats?.createdBookmarkIds || [];
  if (ids.length === 0) return undefined;
  const bookmarksForIcon = await getBookmarksForIcon(ids, userId);
  if (bookmarksForIcon.length === 0) return undefined;
  const batch = await createIconBatch(userId, bookmarksForIcon);
  return {
    ...batch,
    // 导入产生的书签 ID 都是新的；只有整批任务均成功入队时才用于首屏加载态，
    // 极少数 INSERT IGNORE 部分命中时交给首次状态轮询返回精确集合。
    bookmarkIds:
      batch.total === bookmarksForIcon.length
        ? bookmarksForIcon.map((bookmark) => String(bookmark.id || '')).filter(Boolean)
        : [],
  };
}

// ──
export { normalizeBookmarkUrl };

function sendBookmarkUrlError(res, error, fallbackStatus = 500) {
  const payload = bookmarkUrlErrorPayload(error);
  if (payload) return res.send(resultData(payload.data, payload.status, payload.message));
  return res.send(resultData(null, fallbackStatus, String(error?.message || error)));
}

export const resolveBookmarkUrl = async (req, res) => {
  try {
    const resolution = await resolveBookmarkUrlForClient(req.body?.url, {
      allowTextExtraction: req.body?.allowTextExtraction !== false,
      checkLiveness: req.body?.checkLiveness === true,
    });
    res.send(resultData(resolution));
  } catch (error) {
    sendBookmarkUrlError(res, error);
  }
};

export const queryTagList = (req, res) => {
  const userId = (req.resourceUser || req.user).id;
  try {
    let sql = `SELECT
    t.*,
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', b.id,
                'name', b.name,
                'url', b.url
            )
        )
        FROM bookmark b
        INNER JOIN resource_tag_relations r ON b.id = r.resource_id AND r.resource_type = 'bookmark'
        WHERE r.tag_id = t.id AND b.del_flag = 0
    ) AS bookmarkList,
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', n.id,
                'name', n.title
            )
        )
        FROM note n
        INNER JOIN resource_tag_relations r ON n.id = r.resource_id AND r.resource_type = 'note'
        WHERE r.tag_id = t.id AND n.del_flag = 0
    ) AS noteList,
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', f.id,
                'name', f.file_name
            )
        )
        FROM files f
        INNER JOIN resource_tag_relations r ON f.id = r.resource_id AND r.resource_type = 'file'
        WHERE r.tag_id = t.id AND f.del_flag = 0
    ) AS fileList
FROM
    tag t
      WHERE
      t.user_id = ? AND t.del_flag = 0
      GROUP BY
    t.id
      ORDER BY
      t.sort,
      t.create_time DESC;
`;
    pool
      .query(sql, [userId])
      .then(([result]) => {
        const tagsWithResources = result.map((tag) => {
          const bookmarkList = tag.bookmarkList ? tag.bookmarkList : [];
          const noteList = tag.noteList ? tag.noteList : [];
          const fileList = tag.fileList ? tag.fileList : [];
          return {
            ...tag,
            bookmarkList,
            noteList,
            fileList,
          };
        });
        res.send(resultData(tagsWithResources));
      })
      .catch((e) => {
        return res.send(resultData(null, 500, '服务器内部错误: ' + e));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};
/**
 * 双模式:
 * - 资源模式(type 为 bookmark/note/file):查该资源挂了哪些标签,行为不变。
 * - 标签模式:返回「相关标签」。已由手工 tag_relations 改为共同资源自动推导,
 *   与单标签图谱、全局知识地图共用同一评分口径(tagRelationScore)。
 */
export const getRelatedTag = async (req, res) => {
  const userId = req.user.id;
  try {
    const type = req.body?.filters?.type;
    const targetId = req.body?.filters?.id;
    const validTypes = [RESOURCE_TYPE.BOOKMARK, RESOURCE_TYPE.NOTE, RESOURCE_TYPE.FILE];

    if (validTypes.includes(type)) {
      const [result] = await pool.query(
        `SELECT t.* FROM tag t LEFT JOIN resource_tag_relations tb
            ON t.id=tb.tag_id AND tb.resource_type=?
          WHERE t.user_id=? AND tb.resource_id=? AND t.del_flag=0`,
        [type, userId, targetId],
      );
      return res.send(resultData(result));
    }

    const related = await getDerivedRelatedTags(pool, { userId, tagId: targetId });
    // 保持既有调用方的字段形态(id/name/icon_url),额外附带推导依据供前端展示强度。
    return res.send(
      resultData(
        related.map((item) => ({
          id: item.id,
          name: item.name,
          icon_url: item.iconUrl,
          iconUrl: item.iconUrl,
          sharedCount: item.sharedCount,
          similarity: item.similarity,
          reason: item.reason,
        })),
      ),
    );
  } catch (e) {
    console.error('[tag-relation] getRelatedTag failed:', e);
    res.send(resultData(null, 500, '服务器内部错误'));
  }
};

export const updateTagSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务
    const userId = (req.resourceUser || req.user).id;
    const { tags } = req.body;
    for (const tag of tags) {
      const { id, sort } = tag;
      const sql = 'UPDATE tag SET sort = ? WHERE id = ? AND user_id = ?';
      await connection.query(sql, [sort, id, userId]);
    }
    await connection.commit(); // 提交事务
    res.send(resultData(null, 200, 'Sort updated successfully'));
  } catch (e) {
    await connection.rollback(); // 如果发生错误，回滚事务
    res.send(resultData(null, 500, '服务器内部错误' + e)); // 设置状态码为400
  } finally {
    connection.release(); // 释放连接回连接池
  }
};

export const getTagDetail = (req, res) => {
  try {
    const userId = (req.resourceUser || req.user).id;
    const { filters } = req.body;
    // 归属校验:只能读自己的标签,防止传他人 tag id 越权读取;越权/不存在统一 404
    pool
      .query(`SELECT * FROM tag WHERE id=? AND user_id=? AND del_flag=0`, [filters.id, userId])
      .then(([result]) => {
        if (result.length === 0) {
          return res.send(resultData(null, 404, '标签不存在'));
        }
        res.send(resultData(result[0]));
      })
      .catch((e) => {
        return res.send(resultData(null, 500, '服务器内部错误: ' + e));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};

export const addTag = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction(); // 开始事务
      const userId = req.user.id;
      const createdTag = await createTagService({
        userId,
        name: req.body?.name,
        description: req.body?.description,
        iconUrl: req.body?.iconUrl,
        sort: req.body?.sort,
        connection,
      });
      const insertedTagId = createdTag.id;
      // 相关标签已改为按共同资源自动推导,不再接受也不再写入手工 tag_relations。
      const { bookmarkList, noteList, fileList } = req.body;

      // 处理各类资源关联
      if (bookmarkList && bookmarkList.length > 0) {
        const resourceIds = await validateUserResources(connection, {
          resourceIds: bookmarkList,
          resourceType: RESOURCE_TYPE.BOOKMARK,
          userId,
        });
        await insertTagResourceRelations(connection, {
          tagId: insertedTagId,
          resourceType: RESOURCE_TYPE.BOOKMARK,
          resourceIds,
          userId,
        });
      }
      if (noteList && noteList.length > 0) {
        const resourceIds = await validateUserResources(connection, {
          resourceIds: noteList,
          resourceType: RESOURCE_TYPE.NOTE,
          userId,
        });
        await insertTagResourceRelations(connection, {
          tagId: insertedTagId,
          resourceType: RESOURCE_TYPE.NOTE,
          resourceIds,
          userId,
        });
      }
      if (fileList && fileList.length > 0) {
        const resourceIds = await validateUserResources(connection, {
          resourceIds: fileList,
          resourceType: RESOURCE_TYPE.FILE,
          userId,
        });
        await insertTagResourceRelations(connection, {
          tagId: insertedTagId,
          resourceType: RESOURCE_TYPE.FILE,
          resourceIds,
          userId,
        });
      }
      await connection.commit(); // 提交事务
      res.send(resultData({ id: insertedTagId })); // 发送成功响应
    } catch (error) {
      await connection.rollback(); // 回滚事务
      res.send(resultData(null, 500, '服务器内部错误: ' + error.message)); // 设置状态码为500
    } finally {
      connection.release(); // 释放连接
    }
  } catch (error) {
    res.send(resultData(null, 400, '客户端请求异常: ' + error.message)); // 设置状态码为400
  }
};

export const delTag = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const id = req.body.id;
    pool
      .query(`DELETE FROM tag WHERE id = ? AND user_id = ?`, [id, userId])
      .then(([result]) => {
        res.send(resultData(result));
      })
      .catch((e) => {
        return res.send(resultData(null, 500, '服务器内部错误: ' + e));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const updateTag = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务
    const { id: id1, bookmarkList, noteList, fileList } = req.body;
    const id = id1; // 获取标签ID
    const paramsData = JSON.parse(JSON.stringify(req.body));
    const params = {
      name: paramsData.name,
      description: normalizeTagDescription(paramsData.description),
      iconUrl: paramsData.iconUrl,
    };
    const userId = req.user.id;
    const sqlCheck = 'SELECT * FROM tag WHERE user_id=? AND name = ? AND del_flag = 0';
    const [checkRes] = await connection.query(sqlCheck, [userId, params.name]);
    if (checkRes.length > 0 && checkRes[0].id !== id) {
      throw new Error('标签已存在');
    }

    // 归属校验：确认标签属于当前用户，避免越权改动及破坏关系表
    const [own] = await connection.query('SELECT id FROM tag WHERE id = ? AND user_id = ? AND del_flag = 0', [
      id,
      userId,
    ]);
    if (own.length === 0) {
      await connection.rollback();
      return res.send(resultData(null, 403, '无权限操作'));
    }
    // 更新tag表
    const updateTagSql = `UPDATE tag SET ? WHERE id = ?`;
    const [updateResult] = await connection.query(updateTagSql, [snakeCaseKeys(mergeExistingProperties(params)), id]);

    // 只要传了bookmarkList，就需要重新处理
    if (bookmarkList !== undefined) {
      const resourceIds = await validateUserResources(connection, {
        resourceIds: bookmarkList || [],
        resourceType: RESOURCE_TYPE.BOOKMARK,
        userId,
      });
      await replaceTagResourceRelations(connection, {
        tagId: id,
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceIds,
        userId,
      });
    }
    if (noteList !== undefined) {
      const resourceIds = await validateUserResources(connection, {
        resourceIds: noteList || [],
        resourceType: RESOURCE_TYPE.NOTE,
        userId,
      });
      await replaceTagResourceRelations(connection, {
        tagId: id,
        resourceType: RESOURCE_TYPE.NOTE,
        resourceIds,
        userId,
      });
    }
    if (fileList !== undefined) {
      const resourceIds = await validateUserResources(connection, {
        resourceIds: fileList || [],
        resourceType: RESOURCE_TYPE.FILE,
        userId,
      });
      await replaceTagResourceRelations(connection, {
        tagId: id,
        resourceType: RESOURCE_TYPE.FILE,
        resourceIds,
        userId,
      });
    }

    await connection.commit(); // 提交事务
    await invalidatePersonalKnowledgeCache(userId);
    res.send(resultData(updateResult)); // 发送成功响应
  } catch (error) {
    await connection.rollback(); // 回滚事务
    res.send(resultData(null, 500, '服务器内部错误: ' + error.message)); // 设置状态码为500
  } finally {
    await connection.release(); // 释放连接
  }
};
export const getBookmarkList = async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = req.body?.filters || {};
    const type = filters.type || 'all';
    const pagination = normalizeOptionalPagination(req.body);
    const where = ['b.user_id = ?', 'b.del_flag = 0'];
    const params = [userId];

    if (type === 'normal' && filters.tagId) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM resource_tag_relations tbr
          WHERE tbr.resource_type = 'bookmark'
            AND tbr.resource_id = b.id
            AND tbr.tag_id = ?
        )
      `);
      params.push(filters.tagId);
    } else if (type === 'search') {
      const keyword = String(filters.value || '')
        .trim()
        .slice(0, 200);
      const like = `%${keyword}%`;
      where.push(`
        (
          b.name LIKE ?
          OR b.description LIKE ?
          OR EXISTS (
            SELECT 1
            FROM resource_tag_relations tb2
            INNER JOIN tag t2 ON t2.id = tb2.tag_id
            WHERE tb2.resource_type = 'bookmark'
              AND tb2.resource_id = b.id
              AND t2.del_flag = 0
              AND t2.name LIKE ?
          )
        )
      `);
      params.push(like, like, like);
    }

    const whereSql = where.join(' AND ');
    let listSql = `
      SELECT
        b.*,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
          FROM tag t
          INNER JOIN resource_tag_relations tb
            ON t.id = tb.tag_id AND tb.resource_type = 'bookmark'
          WHERE tb.resource_id = b.id AND t.del_flag = 0
        ) AS tagList
      FROM bookmark b
      WHERE ${whereSql}
      ORDER BY b.is_top DESC, b.sort, b.create_time DESC, b.id DESC
    `;
    const listParams = [...params];
    if (pagination.enabled) {
      listSql += ' LIMIT ? OFFSET ?';
      listParams.push(pagination.pageSize, pagination.offset);
    }

    const [[result], [totalRows]] = await Promise.all([
      pool.query(listSql, listParams),
      pool.query(`SELECT COUNT(*) AS total FROM bookmark b WHERE ${whereSql}`, params),
    ]);
    const total = Number(totalRows?.[0]?.total || 0);

    // 回填「正文存档 / AI 摘要」角标:只处理当前页，避免辅助查询随账号资源量线性增长。
    try {
      const ids = (result || []).map((item) => item.id).filter(Boolean);
      if (ids.length) {
        const [snaps] = await pool.query(
          `SELECT bookmark_id,
                  (content IS NOT NULL AND content <> '') AS hasSnapshot,
                  (summary IS NOT NULL AND summary <> '') AS hasSummary
             FROM bookmark_snapshot WHERE bookmark_id IN (?)`,
          [ids],
        );
        const snapshotMap = new Map(snaps.map((snapshot) => [snapshot.bookmark_id, snapshot]));
        for (const item of result) {
          const snapshot = snapshotMap.get(item.id);
          item.hasSnapshot = !!(snapshot && Number(snapshot.hasSnapshot));
          item.hasSummary = !!(snapshot && Number(snapshot.hasSummary));
        }
      }
    } catch (error) {
      console.warn('[书签角标] 快照标记回填失败(忽略):', error.message);
    }

    try {
      await attachPendingStatus(pool, { userId, resourceType: 'bookmark', items: result });
    } catch (error) {
      console.warn('[待整理角标] 书签状态回填失败(忽略):', error.message);
    }

    const data = pagination.enabled
      ? buildPagedResult(result, total, pagination)
      : {
          items: result,
          total,
        };
    return res.send(resultData(data));
  } catch (error) {
    console.error('[bookmark] list failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '服务器暂时无法处理，请稍后重试'));
  }
};

// 置顶 / 取消置顶书签(翻转 is_top;归属校验防越权)。列表 ORDER BY 已 is_top DESC 优先
export const toggleBookmarkTop = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    const userId = req.user.id;
    if (!id) return res.send(resultData(null, 400, '缺少书签ID'));
    const [own] = await pool.query('SELECT is_top FROM bookmark WHERE id=? AND user_id=? AND del_flag=0', [id, userId]);
    if (!own.length) return res.send(resultData(null, 403, '无权限操作'));
    const next = own[0].is_top ? 0 : 1;
    await pool.query('UPDATE bookmark SET is_top=? WHERE id=? AND user_id=?', [next, id, userId]);
    res.send(resultData({ id, isTop: next }));
  } catch (e) {
    res.send(resultData(null, 500, '操作失败: ' + e.message));
  }
};

// POST /bookmark/summarize —— AI 基于网页快照正文生成摘要(缓存;force 重新生成)
export const doSummarizeBookmark = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['ai_use'])) return;
  const abortContext = createRequestAbortContext(req, res);
  try {
    const { id, force } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    const persistSummary = req.adminContext?.mode !== 'readonly';
    const requestId = crypto.randomUUID();
    const result = await runAiExecution(
      createUserAiExecutionConfig('bookmark.summarize_page', {
        requestId,
        request: req,
        identity: req.billingUser || req.user,
        subjectIdentity: req.resourceUser || req.user,
        taskType: 'bookmark_summary',
        skillVersion: 1,
        surface: 'bookmark_detail',
        // 缓存缺失、额度阻断和 Provider 故障仍保持既有业务返回；账本必须反映真实结果，不能误记成功。
        resolveResultOutcome: resolveBookmarkAiResultOutcome,
      }),
      () =>
        summarizeBookmark(req.user.id, id, {
          force: force === true,
          persist: persistSummary,
          // 网页正文归档是免费核心能力，AI 摘要只读取已经存在的存档；两者不再静默捆绑。
          archiveIfMissing: false,
          signal: abortContext.signal,
          trace: { traceId: requestId, taskType: 'bookmark_summary', stage: 'bookmark_summary' },
        }),
    );
    if (result?.reason === 'quota_exceeded') {
      return res.status(429).send(resultData(result, 429, result.msg));
    }
    res.send(resultData(result));
  } catch (error) {
    const failure = resolvePublicAiExecutionError(error, 'AI 摘要暂时不可用，请稍后重试');
    if (failure.status >= 500) console.error('[bookmark] AI summary failed code=%s', failure.code);
    return res.status(failure.status).send(resultData({ code: failure.code }, failure.status, failure.message));
  } finally {
    abortContext.complete();
  }
};

// POST /bookmark/archive-summary —— 显式生成同一版本的网页正文存档与 AI 摘要
export const doArchiveAndSummarizeBookmark = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['ai_use'])) return;
  const abortContext = createRequestAbortContext(req, res);
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    const persist = req.adminContext?.mode !== 'readonly';
    const requestId = crypto.randomUUID();
    const result = await runAiExecution(
      createUserAiExecutionConfig('bookmark.summarize_page', {
        requestId,
        request: req,
        identity: req.billingUser || req.user,
        subjectIdentity: req.resourceUser || req.user,
        taskType: 'bookmark_archive_summary',
        skillVersion: 1,
        surface: 'bookmark_detail',
        resolveResultOutcome: resolveBookmarkAiResultOutcome,
      }),
      () =>
        archiveAndSummarizeBookmark(req.user.id, id, {
          persist,
          signal: abortContext.signal,
          trace: {
            traceId: requestId,
            taskType: 'bookmark_archive_summary',
            stage: 'bookmark_archive_summary',
          },
        }),
    );
    if (result?.reason === 'quota_exceeded') {
      return res.status(429).send(resultData(result, 429, result.msg));
    }
    return res.send(resultData(result));
  } catch (error) {
    const failure = resolvePublicAiExecutionError(error, '网页存档暂时无法生成，请稍后重试');
    if (failure.status >= 500) console.error('[bookmark] archive summary failed code=%s', failure.code);
    return res.status(failure.status).send(resultData({ code: failure.code }, failure.status, failure.message));
  } finally {
    abortContext.complete();
  }
};

// POST /bookmark/health/check —— 检测一批链接死活(增量,最久未测优先)
export const doCheckHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await checkBookmarkHealth((req.resourceUser || req.user).id);
    res.send(resultData(result));
  } catch (error) {
    console.error('[bookmark-health] batch check failed code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '检测失败，请稍后重试'));
  }
};

// POST /bookmark/health/reset —— 清空体检记录,从头重新检测
export const doResetHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = (req.resourceUser || req.user).id;
    const r = await resetHealth(userId);
    res.send(resultData(r.ok ? await getHealthSummary(userId) : r));
  } catch (error) {
    console.error('[bookmark-health] reset failed code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '重置失败，请稍后重试'));
  }
};

// POST /bookmark/health/checkAll —— 启动一次全量后台检测(前端随后轮询 GET /health 看进度)
export const doCheckAllHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    res.send(resultData(await startFullCheck((req.resourceUser || req.user).id)));
  } catch (error) {
    console.error('[bookmark-health] full check failed code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '启动失败，请稍后重试'));
  }
};

// GET /bookmark/health —— 当前健康概览(总数/已测/疑似失效列表 + running)
export const getHealth = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['read'])) return;
  try {
    res.send(resultData(await getHealthSummary((req.resourceUser || req.user).id)));
  } catch (error) {
    console.error('[bookmark-health] summary failed code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '获取失败，请稍后重试'));
  }
};

// POST /bookmark/health/ignore —— 「标记正常」:消除疑似失效误报(SPA/需登录等浏览器能开的)
export const doIgnoreHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    res.send(resultData(await markLinkNormal((req.resourceUser || req.user).id, id)));
  } catch (error) {
    console.error('[bookmark-health] mark normal failed code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, '操作失败，请稍后重试'));
  }
};

// POST /bookmark/archive —— 手动(重新)归档网页正文,防死链
export const doArchiveBookmark = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    const result = await archiveBookmark(req.user.id, id);
    res.send(resultData(result));
  } catch (error) {
    console.error('归档网页失败:', error);
    res.send(resultData(null, 500, '归档失败: ' + error.message));
  }
};

// POST /bookmark/snapshot —— 读取书签的网页快照(存档正文)
export const getSnapshot = async (req, res) => {
  // 只读接口:查看已存网页快照。游客(共享 visitor 账号)也应能看示例书签的正文存档,故不加 ensureNotVisitor;
  // 归属仍由 getBookmarkSnapshot 内 WHERE user_id 隔离(游客只读到游客账号自己的快照)。
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    const snap = await getBookmarkSnapshot(req.user?.id, id);
    res.send(resultData(snap));
  } catch (error) {
    console.error('获取快照失败:', error);
    res.send(resultData(null, 500, '获取快照失败: ' + error.message));
  }
};

export const addBookmark = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = (req.resourceUser || req.user).id;
    // saveSnapshot 是前端表单开关,不是书签字段:先摘出去,避免混进 INSERT(表里无此列)
    const {
      saveSnapshot = true,
      addToInbox = false,
      inboxSource = 'quick_capture',
      relatedTags = [],
      relatedTagNames = [],
      tagSource: rawTagSource = 'manual',
      idempotencyKey: rawIdempotencyKey = null,
      ...bmBody
    } = req.body || {};
    const idempotencyKey =
      typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim().slice(0, 512) || null : null;
    const tagSource = rawTagSource === 'browser_extension' ? 'browser_extension' : 'manual';
    const result = await createBookmark({
      userId,
      userRole: req.user.role,
      bookmark: bmBody,
      tagIds: relatedTags,
      tagNames: relatedTagNames,
      tagSource,
      addToInbox: addToInbox === true,
      inboxSource,
      duplicateToInbox: addToInbox === true,
      saveSnapshot: saveSnapshot !== false,
      request: req,
      suppressUserRewards: req.suppressUserRewards || req.isVisitorWorkspace,
      idempotencyKey,
    });
    res.send(resultData(result));
  } catch (err) {
    if (err instanceof BookmarkUrlError) return sendBookmarkUrlError(res, err);
    if (err?.code && Number.isInteger(err.httpStatus)) {
      return res.send(
        resultData(
          { errorCode: err.code, ...(err.details || {}) },
          err.httpStatus || 400,
          String(err.message || err).replace(/^[A-Z_]+:\s*/, ''),
        ),
      );
    }
    console.error('[bookmark] add failed code=%s', stableAgentErrorCode(err));
    return res.send(resultData(null, 500, '服务器内部错误'));
  }
};

export const updateBookmark = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = req.body.id;
    const userId = (req.resourceUser || req.user).id;
    const sqlCheck = 'SELECT * FROM bookmark WHERE user_id=? AND name = ? AND del_flag = 0';
    const [checkRes] = await connection.query(sqlCheck, [userId, req.body.name]);
    if (checkRes.length > 0 && checkRes[0].id != id) {
      throw new Error('书签已存在');
    }
    // 归属校验：确认书签属于当前用户，避免越权改动及破坏关系表
    const [own] = await connection.query(
      'SELECT id, url, icon_url FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0',
      [id, userId],
    );
    if (own.length === 0) {
      await connection.rollback();
      return res.send(resultData(null, 403, '无权限操作'));
    }
    // 只在调用方确实传了 url 时才做权威校验与规范化；缺省表示保留原地址，显式空值则直接拒绝。
    if (req.body.url !== undefined) {
      req.body.url = normalizeBookmarkUrl(req.body.url);
      const [urlDuplicates] = await connection.query(
        'SELECT id, name FROM bookmark WHERE user_id = ? AND url = ? AND id <> ? AND del_flag = 0 LIMIT 1',
        [userId, req.body.url, id],
      );
      if (urlDuplicates.length) throw new Error(`该网址已收藏为「${urlDuplicates[0].name}」`);
    }
    // 仅网址真正变化时清理旧 favicon。名称、描述、标签等普通编辑必须保留已经落库的图标，
    // 否则每次保存都会先显示默认地球，再等待异步抓图，造成明显闪烁和无意义的网络/写入。
    if (req.body.url && shouldResetBookmarkIcon(own[0].url, req.body.url)) {
      req.body.iconUrl = null;
      req.body.iconCheckedAt = null;
    } else {
      delete req.body.iconUrl;
      delete req.body.iconCheckedAt;
    }
    const updateFields = mergeExistingProperties(snakeCaseKeys(req.body), [], [
      'related_tags',
      'id',
      'user_id',
      'del_flag',
      'deleted_at',
      'create_time',
      'update_time',
      'url_exact_hash',
    ]);
    if (req.body.url !== undefined) updateFields.url_exact_hash = createBookmarkExactUrlHash(req.body.url);
    const sql = `update bookmark set ? where id=? and user_id=? and del_flag=0`;
    const [updateResult] = await connection.query(sql, [
      updateFields,
      id,
      userId,
    ]);
    if (req.body.relatedTags && req.body.relatedTags.length > 4) {
      throw new Error('最多选择4个关联标签');
    }
    if (req.body.relatedTags && req.body.relatedTags.length > 0) {
      const tagIds = req.body.relatedTags;
      await replaceResourceTagRelations(connection, {
        tagIds,
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceId: id,
        userId,
      });
    } else {
      await replaceResourceTagRelations(connection, {
        tagIds: [],
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceId: id,
        userId,
      });
    }
    await connection.commit(); // 提交事务
    await invalidatePersonalKnowledgeCache(userId);
    res.send(resultData(updateResult)); // 发送成功响应
  } catch (error) {
    await connection.rollback(); // 回滚事务
    if (error instanceof BookmarkUrlError) return sendBookmarkUrlError(res, error);
    const publicValidationError =
      error?.message === '书签已存在' ||
      error?.message === '最多选择4个关联标签' ||
      String(error?.message || '').startsWith('该网址已收藏为');
    if (publicValidationError) return res.send(resultData(null, 400, error.message));
    console.error('[bookmark] update failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '服务器内部错误'));
  } finally {
    await connection.release(); // 释放连接
  }
};

export const getBookmarkDetail = (req, res) => {
  try {
    const userId = (req.resourceUser || req.user).id;
    // 归属校验:只能读自己的书签,防止传他人 bookmark id 越权读取;越权/不存在统一 404
    let sql = `SELECT * FROM bookmark WHERE id=? AND user_id=? AND del_flag=0`;
    pool
      .query(sql, [req.body.filters.id, userId])
      .then(([result]) => {
        if (result.length === 0) {
          return res.send(resultData(null, 404, '书签不存在'));
        }
        res.send(resultData(result[0]));
      })
      .catch((e) => {
        return res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};

export const delBookmark = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = (req.resourceUser || req.user).id;
    const id = String(req.body.id || '').trim();
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    await connection.beginTransaction();
    const deletion = await softDeleteResources(connection, {
      userId,
      items: [{ type: 'bookmark', id }],
    });
    if (!deletion.affectedItemCount) {
      await connection.rollback();
      return res.send(resultData(null, 404, '书签不存在'));
    }
    await connection.commit();
    await runResourceDeleteSideEffects(deletion.sideEffects);
    res.send(resultData({ affectedRows: deletion.affectedItemCount }));
  } catch (e) {
    await connection.rollback();
    console.error('[bookmark] delete failed code=%s', String(e?.code || 'BOOKMARK_DELETE_FAILED'));
    res.send(resultData(null, 500, '删除书签失败，请稍后重试'));
  } finally {
    connection.release();
  }
};

export const getCommonBookmarks = async (req, res) => {
  try {
    const [result] = await pool.query(
      `SELECT b.id, b.url, REPLACE(ol.operation, '点击书签卡片', '') AS name, COUNT(*) AS count
         FROM operation_logs ol
         LEFT JOIN bookmark b
           ON b.user_id = ol.create_by
          AND CONVERT(b.name USING utf8mb4) COLLATE utf8mb4_general_ci =
              CONVERT(REPLACE(ol.operation, '点击书签卡片', '') USING utf8mb4) COLLATE utf8mb4_general_ci
          AND b.del_flag = 0
        WHERE ol.create_by = ? AND ol.operation LIKE '点击书签卡片%'
        GROUP BY ol.operation, b.id, b.url
        ORDER BY count DESC
        LIMIT 10`,
      [req.user.id],
    );
    res.send(
      resultData({
        items: result,
        total: 10,
      }),
    );
  } catch (e) {
    // 此前把错误文本当 200 业务数据返回:前端会把 SQL 错误串当书签列表渲染
    console.error('[bookmark] 获取常用书签失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '获取常用书签失败'));
  }
};

export const updateBookmarkSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务
    const userId = (req.resourceUser || req.user).id;
    if (req.body?.move) {
      const result = await moveOwnedResourceByAnchors(connection, {
        ...req.body.move,
        resourceType: 'bookmark',
        userId,
      });
      await connection.commit();
      return res.send(resultData(result, 200, 'Sort updated successfully'));
    }

    const { bookmarks } = req.body;
    if (!Array.isArray(bookmarks)) {
      await connection.rollback();
      return res.send(resultData(null, 400, '排序参数无效'));
    }
    for (const bookmark of bookmarks) {
      const { id, sort } = bookmark;
      const sql = 'UPDATE bookmark SET sort = ? WHERE id = ? AND user_id = ?';
      await connection.query(sql, [sort, id, userId]);
    }
    await connection.commit(); // 提交事务
    res.send(resultData(null, 200, 'Sort updated successfully'));
  } catch (e) {
    await connection.rollback(); // 如果发生错误，回滚事务
    if (e instanceof AnchoredSortError) {
      return res.send(resultData(null, e.code === 'RESOURCE_NOT_FOUND' ? 404 : 400, e.message));
    }
    console.error('[bookmark] update sort failed code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 500, '服务器暂时无法处理，请稍后重试'));
  } finally {
    connection.release(); // 释放连接回连接池
  }
};

// 解析 Netscape 书签 HTML，提取文件夹（标签）与书签
function decodeBookmarkHtmlText(value = '') {
  return String(value)
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

const parseBookmarksFromHtml = (html = '') => {
  const bookmarks = [];
  const folderStack = [];
  const lines = html.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const folderMatch = line.match(/<DT><H3[^>]*>(.*?)<\/H3>/i);
    if (folderMatch) {
      folderStack.push(decodeBookmarkHtmlText(folderMatch[1]).trim());
      continue;
    }

    if (/<\/DL>/i.test(line) && folderStack.length) {
      folderStack.pop();
      continue;
    }

    const linkMatch = line.match(/<DT><A[^>]*HREF="([^"]+)"[^>]*>(.*?)<\/A>/i);
    if (linkMatch) {
      const currentFolder = folderStack[folderStack.length - 1] || '';
      bookmarks.push({
        name: decodeBookmarkHtmlText(linkMatch[2]).trim(),
        url: decodeBookmarkHtmlText(linkMatch[1]).trim(),
        folder: currentFolder,
      });
    }
  }

  return bookmarks;
};

function finishBookmarkImport(req, userId, stats) {
  if (stats.createdBookmarks > 0 || stats.boundRelations > 0) {
    // 业务事务已提交，索引失效作为旁路执行，避免占用导入事务连接。
    void invalidatePersonalKnowledgeCache(userId);
  }
  // 批量导入整批只发一次固定经验(防按条刷;grantExp 内日顶 200 仍兜底)
  if (stats.createdBookmarks > 0 && !req.suppressUserRewards) {
    completeGrowthTask(userId, 'first_bookmark', { userRole: req.user.role }).catch((e) =>
      console.warn('[growth] 首个书签成长任务补全失败 code=%s', stableAgentErrorCode(e)),
    );
    grantExp(userId, 'bookmark_import', {
      refId: `import_${userId}_${Date.now()}`,
      amount: 15,
      userRole: req.user.role,
    }).catch((e) => console.warn('[growth] 导入书签奖励发放失败 code=%s', stableAgentErrorCode(e)));
  }
}

// HTML 书签导入：新增缺失的标签/书签，并建立关联
export const importBookmarksHtml = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;

  if (!userId) {
    return res.send(resultData(null, 401, '缺少用户身份')); // 无法继续
  }

  if (!req.file) {
    return res.send(resultData(null, 400, '未上传文件'));
  }

  let html;
  try {
    html = await fs.readFile(req.file.path, 'utf8');
  } catch (err) {
    return res.send(resultData(null, 500, '读取文件失败'));
  } finally {
    // 删除临时文件
    try {
      await fs.unlink(req.file.path);
    } catch (e) {
      console.error('删除临时文件失败:', e);
    }
  }

  if (!html || typeof html !== 'string') {
    return res.send(resultData(null, 400, 'html 内容为空'));
  }

  const parsedBookmarks = parseBookmarksFromHtml(html);
  if (!parsedBookmarks.length) {
    return res.send(resultData(null, 400, '未解析到书签数据'));
  }

  // 只记条数:完整书签数组含用户收藏内容(URL/标题),不进服务器日志
  console.log(`解析到 ${parsedBookmarks.length} 条书签`);

  let stats;
  try {
    stats = await runBookmarkImportTransaction(pool, {
      userId,
      items: parsedBookmarks,
    });
  } catch (e) {
    console.error('[bookmark] HTML 导入失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '书签导入失败，请稍后重试'));
    return;
  }
  finishBookmarkImport(req, userId, stats);
  // 图标批次创建：独立于事务，失败不影响导入结果
  let iconBatch;
  try {
    iconBatch = await createImportIconBatch(stats, userId);
  } catch (iconErr) {
    console.error('[icon-batch] 创建图标批次失败（不影响导入）: %s', stableAgentErrorCode(iconErr));
  }
  res.send(
    resultData({
      ...stats,
      iconBatch:
        iconBatch?.total > 0
          ? {
              batchId: iconBatch.batchId,
              total: iconBatch.total,
              status: iconBatch.status,
              bookmarkIds: iconBatch.bookmarkIds,
            }
          : undefined,
    }),
  );
};

// Excel 已在浏览器端解析，服务端只接收结构化行数据；与 HTML 导入共用同一去重和标签关联事务。
export const importBookmarksExcel = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user?.id;
  if (!userId) return res.send(resultData(null, 401, '缺少用户身份'));

  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.send(resultData(null, 400, '未解析到书签数据'));
  }
  if (items.length > MAX_EXCEL_BOOKMARK_IMPORT_ITEMS) {
    return res.send(resultData(null, 400, `单次最多导入 ${MAX_EXCEL_BOOKMARK_IMPORT_ITEMS} 条书签`));
  }

  let stats;
  try {
    stats = await runBookmarkImportTransaction(pool, {
      userId,
      items,
    });
  } catch (error) {
    console.error('[bookmark] Excel 导入失败 code=%s', stableAgentErrorCode(error));
    res.send(resultData(null, 500, 'Excel 书签导入失败，请稍后重试'));
    return;
  }
  finishBookmarkImport(req, userId, stats);
  let iconBatch;
  try {
    iconBatch = await createImportIconBatch(stats, userId);
  } catch (iconErr) {
    console.error('[icon-batch] 创建图标批次失败（不影响导入）: %s', stableAgentErrorCode(iconErr));
  }
  res.send(
    resultData({
      ...stats,
      iconBatch:
        iconBatch?.total > 0
          ? {
              batchId: iconBatch.batchId,
              total: iconBatch.total,
              status: iconBatch.status,
              bookmarkIds: iconBatch.bookmarkIds,
            }
          : undefined,
    }),
  );
};

// ============================================================================
// AI 自动整理（批量打标签）：统一进入 AI Execution 并按 Provider 实际用量结算。
// ============================================================================

// 并发池(单核服务器友好):最多 n 个 worker 同时跑
async function organizePool(items, n, worker) {
  let i = 0;
  let stopped = false;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (!stopped && i < items.length) {
      const shouldContinue = await worker(items[i++]);
      if (shouldContinue === false) stopped = true;
    }
  });
  await Promise.all(runners);
}

function normalizeOrganizeIds(value) {
  const seen = new Set();
  const ids = [];
  for (const rawId of Array.isArray(value) ? value : []) {
    if (typeof rawId !== 'string' && typeof rawId !== 'number') continue;
    const id = String(rawId).trim();
    if (!id || id.length > 128 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return {
    ids: ids.slice(0, ORGANIZE_MAX_BATCH),
    requestedTotal: ids.length,
    requestTruncated: ids.length > ORGANIZE_MAX_BATCH,
  };
}

// 解析候选:resourceType='bookmark'|'note';scope='selected'(指定 ids,校验归属)/ 'untagged'(未打标签)
async function resolveOrganizeCandidates(userId, scope, ids, resourceType = 'bookmark') {
  if (resourceType === 'note') {
    if (scope === 'selected') {
      if (!Array.isArray(ids) || !ids.length) return [];
      const [rows] = await pool.query(
        "SELECT id, title, IF(type = 'drawing', '', content) AS content FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)",
        [userId, ids],
      );
      return rows;
    }
    const [rows] = await pool.query(
      `SELECT n.id, n.title, IF(n.type = 'drawing', '', n.content) AS content FROM note n
       LEFT JOIN resource_tag_relations r ON r.resource_id = n.id AND r.resource_type = 'note'
       WHERE n.create_by = ? AND n.del_flag = 0 AND r.tag_id IS NULL
       ORDER BY n.create_time DESC`,
      [userId],
    );
    return rows;
  }
  if (scope === 'selected') {
    if (!Array.isArray(ids) || !ids.length) return [];
    const [rows] = await pool.query(
      "SELECT id, name, url, description FROM bookmark WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> '' AND id IN (?)",
      [userId, ids],
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.url, b.description FROM bookmark b
     LEFT JOIN resource_tag_relations r ON r.resource_id = b.id AND r.resource_type = 'bookmark'
     WHERE b.user_id = ? AND b.del_flag = 0 AND b.url IS NOT NULL AND b.url <> '' AND r.tag_id IS NULL
     ORDER BY b.create_time DESC`,
    [userId],
  );
  return rows;
}

// 去 HTML 标签,取纯文本摘录(笔记正文是富文本 HTML)
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNoteTaggingText(note) {
  const raw = String(note?.content || '');
  const outline = [];
  for (const match of raw.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    const heading = stripHtml(match[1]);
    if (heading && !outline.includes(heading)) outline.push(heading);
    if (outline.length >= 12) break;
  }
  for (const line of raw.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (heading && !outline.includes(heading)) outline.push(heading);
    if (outline.length >= 12) break;
  }
  const body = stripHtml(raw).slice(0, 2200);
  return [
    `标题:${note?.title || '(无)'}`,
    outline.length ? `内容提纲:${outline.join(' / ')}` : '',
    body ? `正文摘录:${body}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// POST /bookmark/ai/organize/quote —— 预估本次可整理数(免费;不跑 AI)
export const doOrganizeQuote = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['ai_use'])) return;
  try {
    const userId = req.user.id;
    const { scope = 'untagged', ids = [], resourceType = 'bookmark' } = req.body || {};
    const normalizedScope = scope === 'selected' ? 'selected' : 'untagged';
    const selectedRequest =
      normalizedScope === 'selected'
        ? normalizeOrganizeIds(ids)
        : { ids: [], requestedTotal: 0, requestTruncated: false };
    const candidates = await resolveOrganizeCandidates(userId, normalizedScope, selectedRequest.ids, resourceType);
    const batchCap = Math.min(candidates.length, ORGANIZE_MAX_BATCH);
    res.send(
      resultData({
        scope: normalizedScope,
        candidateTotal: candidates.length,
        batchCap,
        batchIds: candidates.slice(0, batchCap).map((c) => c.id),
        maxBatch: ORGANIZE_MAX_BATCH,
        canRun: batchCap > 0,
        requestIds: selectedRequest.ids,
        requestedTotal: selectedRequest.requestedTotal,
        requestTruncated: selectedRequest.requestTruncated,
      }),
    );
  } catch (e) {
    // 不把原始异常(可能含 SQL/模型/OBS 内部信息)返回客户端;只记服务端日志 + 稳定文案
    console.error('[bookmark] 智能打标签预估失败 code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 500, '智能打标签预估失败，请稍后重试'));
  }
};

// POST /bookmark/ai/organize/run —— 对指定 ids 跑 AI，返回建议供复审
export const doOrganizeRun = async (req, res) => {
  if (!ensureUserOrAdminPolicy(req, res, ['ai_use'])) return;
  const abortContext = createRequestAbortContext(req, res);
  try {
    const userId = req.user.id;
    const resourceType = req.body?.resourceType === 'note' ? 'note' : 'bookmark';
    const raw = normalizeOrganizeIds(req.body?.ids).ids;
    if (!raw.length) return res.send(resultData(null, 400, '未选择要整理的内容'));
    const [tagRows] = await pool.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
    const toMatched = (ids) => tagRows.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, name: t.name }));
    const suggestions = [];
    let quotaLimited = false;
    let attemptedItems = 0;
    let successfulItems = 0;
    let failedItems = 0;
    const requestId = crypto.randomUUID();
    const actionId = resourceType === 'note' ? 'note.organize_tags' : 'bookmark.organize';
    const executionConfig = createUserAiExecutionConfig(actionId, {
      requestId,
      request: req,
      identity: req.billingUser || req.user,
      subjectIdentity: req.resourceUser || req.user,
      taskType: resourceType === 'note' ? 'organize_note_tags' : 'organize_bookmark_meta',
      skillVersion: 1,
      surface: resourceType === 'note' ? 'note_library' : 'bookmark_library',
      resolveResultOutcome: resolveOrganizeAiResultOutcome,
    });

    let batchResult;

    if (resourceType === 'note') {
      const [rows] = await pool.query(
        "SELECT id, title, IF(type = 'drawing', '', content) AS content FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)",
        [userId, raw],
      );
      const targets = rows.slice(0, ORGANIZE_MAX_BATCH);
      if (!targets.length) return res.send(resultData({ ok: true, processed: 0, suggestions: [] }));
      batchResult = await runAiExecution(executionConfig, async () => {
        await organizePool(targets, 3, async (n) => {
          attemptedItems += 1;
          try {
            const text = buildNoteTaggingText(n);
            const r = await suggestTagsFromText({
              text,
              userTags: tagRows,
              signal: abortContext.signal,
              trace: { traceId: requestId, taskType: 'organize_note_tags', stage: 'organize_note_tags' },
            });
            if (!r) {
              failedItems += 1;
              return true;
            }
            successfulItems += 1;
            if (!r.matchedTagIds.length && !r.newTags.length) return true;
            suggestions.push({
              id: n.id,
              url: '',
              currentName: n.title || '',
              currentDesc: '',
              suggestName: '',
              suggestDesc: '',
              matchedTags: toMatched(r.matchedTagIds),
              newTags: r.newTags || [],
            });
            return true;
          } catch (error) {
            if (error?.code === 'AI_QUOTA_EXCEEDED') {
              quotaLimited = true;
              return false;
            }
            if (error?.name === 'AbortError') throw error;
            failedItems += 1;
            /* 单条 Provider 失败保留其余安全建议，根执行仍汇总所有已产生用量。 */
            return true;
          }
        });
        return { quotaLimited, attemptedItems, successfulItems, failedItems };
      });
    } else {
      const [rows] = await pool.query(
        "SELECT id, name, url, description FROM bookmark WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> '' AND id IN (?)",
        [userId, raw],
      );
      const targets = rows.slice(0, ORGANIZE_MAX_BATCH);
      if (!targets.length) return res.send(resultData({ ok: true, processed: 0, suggestions: [] }));
      batchResult = await runAiExecution(executionConfig, async () => {
        await organizePool(targets, 3, async (b) => {
          attemptedItems += 1;
          try {
            const r = await suggestBookmarkMeta({
              url: b.url,
              name: b.name,
              description: b.description,
              userTags: tagRows,
              signal: abortContext.signal,
              trace: { traceId: requestId, taskType: 'organize_bookmark_meta', stage: 'organize_bookmark_meta' },
            });
            if (!r) {
              failedItems += 1;
              return true;
            }
            successfulItems += 1;
            if (!r.matchedTagIds.length && !r.newTags.length && !r.name && !r.description) return true;
            suggestions.push({
              id: b.id,
              url: b.url,
              currentName: b.name || '',
              currentDesc: b.description || '',
              suggestName: r.name || '',
              suggestDesc: r.description || '',
              matchedTags: toMatched(r.matchedTagIds),
              newTags: r.newTags || [],
            });
            return true;
          } catch (error) {
            if (error?.code === 'AI_QUOTA_EXCEEDED') {
              quotaLimited = true;
              return false;
            }
            if (error?.name === 'AbortError') throw error;
            failedItems += 1;
            /* 单条 Provider 失败保留其余安全建议，根执行仍汇总所有已产生用量。 */
            return true;
          }
        });
        return { quotaLimited, attemptedItems, successfulItems, failedItems };
      });
    }
    if (quotaLimited) {
      return res
        .status(429)
        .send(
          resultData(
            { ok: false, code: 'AI_QUOTA_EXCEEDED', processed: suggestions.length, suggestions },
            429,
            suggestions.length ? '额度不足，已保留本次完成的建议' : '今日 AI 额度不足',
          ),
        );
    }
    if (batchResult.failedItems > 0 && batchResult.successfulItems === 0) {
      return res
        .status(503)
        .send(
          resultData(
            { ok: false, code: 'AI_ORGANIZE_ALL_ITEMS_FAILED', processed: 0, suggestions: [] },
            503,
            '智能打标签暂时未生成可用结果，请稍后重试',
          ),
        );
    }
    res.send(
      resultData({
        ok: true,
        partial: batchResult.failedItems > 0,
        failedItems: batchResult.failedItems,
        processed: suggestions.length,
        suggestions,
      }),
    );
  } catch (e) {
    const failure = resolvePublicAiExecutionError(e, '智能打标签暂时不可用，请稍后重试');
    if (failure.status >= 500) console.error('[bookmark] AI organize failed code=%s', stableAgentErrorCode(e));
    return res
      .status(failure.status)
      .send(resultData({ ok: false, code: failure.code }, failure.status, failure.message));
  } finally {
    abortContext.complete();
  }
};

// POST /bookmark/ai/organize/apply —— 应用复审后的建议(加标签/新建标签/仅在原为空时补名称描述)
export const doOrganizeApply = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const resourceType = req.body?.resourceType === 'note' ? 'note' : 'bookmark';
  const isNote = resourceType === 'note';
  const relType = isNote ? RESOURCE_TYPE.NOTE : RESOURCE_TYPE.BOOKMARK;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.send(resultData({ applied: 0 }));
  const userId = req.user.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tagRows] = await conn.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
    const norm = (s) =>
      String(s || '')
        .trim()
        .toLowerCase();
    const nameToId = new Map(tagRows.map((t) => [norm(t.name), t.id]));
    const ownTagIds = new Set(tagRows.map((t) => t.id));
    let applied = 0;
    for (const it of items) {
      const id = String(it?.id || '');
      if (!id) continue;
      // 归属校验:书签按 user_id、笔记按 create_by
      const [own] = isNote
        ? await conn.query('SELECT id FROM note WHERE id = ? AND create_by = ? AND del_flag = 0', [id, userId])
        : await conn.query('SELECT id, name, description FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0', [
            id,
            userId,
          ]);
      if (!own.length) continue;
      const relationCap = isNote ? 3 : 4;
      const [existingRelations] = await conn.query(
        'SELECT tag_id FROM resource_tag_relations WHERE resource_type = ? AND resource_id = ? AND user_id = ?',
        [relType, id, userId],
      );
      const existingRelationIds = new Set(existingRelations.map((row) => row.tag_id));
      const room = Math.max(0, relationCap - existingRelationIds.size);
      const finalTagIds = [];
      for (const tid of Array.isArray(it.tagIds) ? it.tagIds : []) {
        if (
          finalTagIds.length < room &&
          ownTagIds.has(tid) &&
          !existingRelationIds.has(tid) &&
          !finalTagIds.includes(tid)
        ) {
          finalTagIds.push(tid);
        }
      }
      for (const rawName of Array.isArray(it.newTagNames) ? it.newTagNames : []) {
        // 没有可关联名额时不能继续创建账号级标签，避免生成“已创建但未关联”的孤立标签。
        if (finalTagIds.length >= room) break;
        const nm = String(rawName || '').trim();
        if (!nm) continue;
        const key = norm(nm);
        let tid = nameToId.get(key);
        if (!tid) {
          const payload = insertData({ name: nm, userId });
          await conn.query('INSERT INTO tag SET ?', [payload]);
          tid = payload.id;
          nameToId.set(key, tid);
          ownTagIds.add(tid);
        }
        if (!existingRelationIds.has(tid) && !finalTagIds.includes(tid)) finalTagIds.push(tid);
      }
      // 资源上限与各自编辑器保持一致：书签最多 4 个，笔记最多 3 个。
      if (finalTagIds.length) {
        await insertResourceTagRelations(conn, {
          tagIds: finalTagIds,
          resourceType: relType,
          resourceId: id,
          userId,
          source: 'ai',
        });
      }
      // 仅书签补空名称/描述;笔记不改标题正文
      if (!isNote) {
        const setName = it.name && !own[0].name ? String(it.name).trim() : null;
        const setDesc = it.description && !own[0].description ? String(it.description).trim() : null;
        if (setName || setDesc) {
          await conn.query(
            'UPDATE bookmark SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ? AND user_id = ?',
            [setName, setDesc, id, userId],
          );
        }
      }
      applied++;
    }
    await conn.commit();
    res.send(resultData({ applied }));
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    console.error('[bookmark] 应用整理结果失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '应用整理结果失败，请稍后重试'));
  } finally {
    conn.release();
  }
};

// ============================================================================
// 书签图标批处理进度与重试接口
// ============================================================================

export const getIconBatchStatusHandler = async (req, res) => {
  if (!req.user?.id) return res.send(resultData(null, 401, '请先登录'));
  const batchId = String(req.body?.batchId || '').trim();
  if (!batchId) return res.send(resultData(null, 400, '缺少 batchId'));
  if (batchId.length > 64) return res.send(resultData(null, 400, 'batchId 无效'));
  try {
    const cursor = req.body?.cursor || {};
    const status = await getIconBatchStatus(batchId, req.user.id, cursor);
    res.send(resultData(status));
  } catch (err) {
    console.error('[icon-batch] 查询状态失败 code=%s', stableAgentErrorCode(err));
    res.send(resultData(null, 500, '查询失败'));
  }
};

export const retryIconBatchFailuresHandler = async (req, res) => {
  if (!req.user?.id) return res.send(resultData(null, 401, '请先登录'));
  const batchId = String(req.body?.batchId || '').trim();
  const includeNotFound = req.body?.includeNotFound === true;
  if (!batchId) return res.send(resultData(null, 400, '缺少 batchId'));
  if (batchId.length > 64) return res.send(resultData(null, 400, 'batchId 无效'));
  try {
    const result = await retryIconBatchFailures(batchId, req.user.id, includeNotFound);
    res.send(resultData(result));
  } catch (err) {
    console.error('[icon-batch] 重试失败 code=%s', stableAgentErrorCode(err));
    res.send(resultData(null, 500, '重试失败'));
  }
};
