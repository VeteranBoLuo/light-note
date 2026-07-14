import pool from '../db/index.js';
import { resultData, snakeCaseKeys, mergeExistingProperties, insertData } from '../util/common.js';
import {
  RESOURCE_TYPE,
  insertResourceTagRelations,
  insertTagResourceRelations,
  replaceResourceTagRelations,
  replaceTagResourceRelations,
} from '../util/resourceTags.js';

import { promises as fs } from 'fs';
import path from 'path';
import { ensureNotVisitor } from '../util/auth.js';
import { awardCreate, grantExp, hashRef } from '../util/growth.js';
import { archiveBookmark, getBookmarkSnapshot, summarizeBookmark } from '../util/snapshot.js';
import { checkBookmarkHealth, getHealthSummary, markLinkNormal, startFullCheck, resetHealth } from '../util/linkHealth.js';
import { recordFirstOwnResource } from '../util/conversion.js';
import { suggestBookmarkMeta, suggestTagsFromText, ORGANIZE_MAX_BATCH } from '../util/aiOrganize.js';

// 书签地址允许用户/导入数据不带协议头,统一在落库前补全 https://,
// 避免前端 <a :href="url"> 把裸域名当相对路径解析,拼出 https://boluo66.top/xxx.com 这种坏链接
export const normalizeBookmarkUrl = (url) => {
  const trimmed = String(url || '').trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const queryTagList = (req, res) => {
  const userId = req.user.id;
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
    ) AS fileList,
    COALESCE(
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'id', related.id,
                    'name', related.name
                )
            )
            FROM tag_relations ta
            INNER JOIN tag related ON ta.related_tag_id = related.id
            WHERE ta.tag_id = t.id
        ),
        JSON_ARRAY()
    ) AS relatedTagList
FROM
    tag t
    LEFT JOIN tag_relations ta ON t.id = ta.tag_id
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
export const getRelatedTag = (req, res) => {
  const userId = req.user.id;
  try {
    const type = req.body.filters.type;
    let sql = `SELECT t.* FROM tag t LEFT JOIN tag_relations a on t.id=a.related_tag_id
WHERE t.user_id=? AND a.tag_id=? AND t.del_flag=0`;
    const validTypes = [RESOURCE_TYPE.BOOKMARK, RESOURCE_TYPE.NOTE, RESOURCE_TYPE.FILE];
    if (validTypes.includes(type)) {
      sql = `SELECT t.* FROM tag t LEFT JOIN resource_tag_relations tb
        ON t.id=tb.tag_id AND tb.resource_type='${type}'
WHERE t.user_id=? AND tb.resource_id=? AND t.del_flag=0`;
    }
    pool
      .query(sql, [userId, req.body.filters.id])
      .then(([result]) => {
        res.send(resultData(result));
      })
      .catch((e) => {
        return res.send(resultData(null, 500, '服务器内部错误: ' + e));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};

export const updateTagSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务
    const userId = req.user.id;
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
    const userId = req.user.id;
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
      const params = {
        ...req.body,
        userId: userId,
      };
      const sqlCheck = 'SELECT * FROM tag WHERE user_id=? AND name = ? AND del_flag = 0';
      const [checkRes] = await connection.query(sqlCheck, [userId, params.name]);
      if (checkRes.length > 0) {
        throw new Error('标签已存在');
      }
      // 插入新的标签
      const insertParams = mergeExistingProperties(
        insertData(params),
        [undefined, '', []],
        ['related_tag_ids', 'bookmark_list', 'note_list', 'file_list'],
      );
      const insertedTagId = insertParams.id;
      let sql = `INSERT INTO tag SET ?`;
      const [insertResult] = await connection.query(sql, [insertParams]);
      // 处理关联标签数量限制
      const { relatedTagIds, bookmarkList, noteList, fileList } = req.body;
      if (relatedTagIds && relatedTagIds.length > 4) {
        throw new Error('最多选择4个相关标签');
      }
      // 如果有相关标签，则插入新的关联
      if (relatedTagIds && relatedTagIds.length > 0) {
        for (const relatedTagId of relatedTagIds) {
          const insertAssociationSql = `INSERT INTO tag_relations (tag_id, related_tag_id) VALUES (?, ?), (?, ?)`;
          await connection.query(insertAssociationSql, [insertedTagId, relatedTagId, relatedTagId, insertedTagId]);
        }
      }

      // 处理各类资源关联
      if (bookmarkList && bookmarkList.length > 0) {
        await insertTagResourceRelations(connection, {
          tagId: insertedTagId,
          resourceType: RESOURCE_TYPE.BOOKMARK,
          resourceIds: bookmarkList,
          userId,
        });
      }
      if (noteList && noteList.length > 0) {
        await insertTagResourceRelations(connection, {
          tagId: insertedTagId,
          resourceType: RESOURCE_TYPE.NOTE,
          resourceIds: noteList,
          userId,
        });
      }
      // 游客维护工作区当前不开放云空间；即使前端携带 fileList，也不得改动文件标签关系。
      if (!req.isVisitorWorkspace && fileList && fileList.length > 0) {
        await insertTagResourceRelations(connection, {
          tagId: insertedTagId,
          resourceType: RESOURCE_TYPE.FILE,
          resourceIds: fileList,
          userId,
        });
      }
      await connection.commit(); // 提交事务
      res.send(resultData(insertResult)); // 发送成功响应
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
    const { relatedTagIds, id: id1, bookmarkList, noteList, fileList } = req.body;
    const id = id1; // 获取标签ID
    const paramsData = JSON.parse(JSON.stringify(req.body));
    const params = {
      name: paramsData.name,
      iconUrl: paramsData.iconUrl,
    };
    const userId = req.user.id;
    const sqlCheck = 'SELECT * FROM tag WHERE user_id=? AND name = ? AND del_flag = 0';
    const [checkRes] = await connection.query(sqlCheck, [userId, params.name]);
    if (checkRes.length > 0 && checkRes[0].id !== id) {
      throw new Error('标签已存在');
    }

    if (relatedTagIds && relatedTagIds.length > 4) {
      throw new Error('最多选择4个相关标签');
    }
    // 归属校验：确认标签属于当前用户，避免越权改动及破坏关系表
    const [own] = await connection.query('SELECT id FROM tag WHERE id = ? AND user_id = ? AND del_flag = 0', [id, userId]);
    if (own.length === 0) {
      await connection.rollback();
      return res.send(resultData(null, 403, '无权限操作'));
    }
    // 更新tag表
    const updateTagSql = `UPDATE tag SET ? WHERE id = ?`;
    const [updateResult] = await connection.query(updateTagSql, [snakeCaseKeys(mergeExistingProperties(params)), id]);
    // 只要传了relatedTagIds，就需要重新处理
    if (relatedTagIds !== undefined) {
      // 清空所有关联
      const deleteAssociationsSql = `DELETE FROM tag_relations WHERE tag_id = ? OR related_tag_id = ?`;
      await connection.query(deleteAssociationsSql, [id, id]);

      // 如果有相关标签，则插入新的关联
      if (relatedTagIds) {
        for (const relatedTagId of relatedTagIds) {
          const insertAssociationSql = `INSERT INTO tag_relations (tag_id, related_tag_id) VALUES (?, ?), (?, ?)`;
          await connection.query(insertAssociationSql, [id, relatedTagId, relatedTagId, id]);
        }
      }
    }

    // 只要传了bookmarkList，就需要重新处理
    if (bookmarkList !== undefined) {
      await replaceTagResourceRelations(connection, {
        tagId: id,
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceIds: bookmarkList || [],
        userId,
      });
    }
    if (noteList !== undefined) {
      await replaceTagResourceRelations(connection, {
        tagId: id,
        resourceType: RESOURCE_TYPE.NOTE,
        resourceIds: noteList || [],
        userId,
      });
    }
    // 游客维护工作区只维护书签、笔记和标签本身，保留既有文件关联不动。
    if (!req.isVisitorWorkspace && fileList !== undefined) {
      await replaceTagResourceRelations(connection, {
        tagId: id,
        resourceType: RESOURCE_TYPE.FILE,
        resourceIds: fileList || [],
        userId,
      });
    }

    await connection.commit(); // 提交事务
    res.send(resultData(updateResult)); // 发送成功响应
  } catch (error) {
    await connection.rollback(); // 回滚事务
    res.send(resultData(null, 500, '服务器内部错误: ' + error.message)); // 设置状态码为500
  } finally {
    await connection.release(); // 释放连接
  }
};
export const getBookmarkList = (req, res) => {
  const userId = req.user.id; // 获取用户ID
  const tagId = req.body.filters.tagId; // 获取标签ID
  let sql = `SELECT b.*,(
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', t.id,
                'name', t.name
            )
        )
        FROM tag t
        INNER JOIN resource_tag_relations tb
          ON t.id = tb.tag_id AND tb.resource_type = 'bookmark'
        WHERE tb.resource_id = b.id AND t.del_flag = 0
    ) AS tagList
FROM bookmark b
JOIN resource_tag_relations tbr ON b.id = tbr.resource_id AND tbr.resource_type = 'bookmark'
WHERE b.user_id=? AND tbr.tag_id = ? AND  b.del_flag=0   ORDER BY b.is_top DESC, b.sort, b.create_time DESC`;
  let params = [userId, tagId];
  const type = req.body.filters.type;
  if (type === 'all') {
    sql = `SELECT 
    b.*,
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', t.id,
                'name', t.name
            )
        )
        FROM tag t
        INNER JOIN resource_tag_relations tb
          ON t.id = tb.tag_id AND tb.resource_type = 'bookmark'
        WHERE tb.resource_id = b.id AND t.del_flag = 0
    ) AS tagList
FROM 
    bookmark b
      WHERE
      b.user_id = ? AND b.del_flag = 0
      ORDER BY
      b.is_top DESC, b.sort, b.create_time DESC;

`;
    params = [userId];
  } else if (type === 'search') {
    sql = `SELECT 
    b.*, 
    (
        SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'id', t.id,
                'name', t.name
            )
        )
        FROM tag t
        INNER JOIN resource_tag_relations tb
          ON t.id = tb.tag_id AND tb.resource_type = 'bookmark'
        WHERE tb.resource_id = b.id AND t.del_flag = 0
    ) AS tagList
FROM 
    bookmark b
LEFT JOIN 
    resource_tag_relations tb ON b.id = tb.resource_id AND tb.resource_type = 'bookmark'
LEFT JOIN 
    tag t ON tb.tag_id = t.id AND t.name LIKE CONCAT('%', ?, '%') AND t.del_flag = 0
WHERE 
    b.user_id = ? AND 
    b.del_flag = 0 AND
    (
        b.name LIKE CONCAT('%', ?, '%') OR
        b.description LIKE CONCAT('%', ?, '%') OR
        t.id IS NOT NULL
    )
GROUP BY

    b.id
ORDER BY
    b.is_top DESC, b.sort, b.create_time DESC;
`;
    params = [req.body.filters.value, userId, req.body.filters.value, req.body.filters.value];
  }
  pool
    .query(sql, params)
    .then(async ([result]) => {
      const totalSql = `SELECT COUNT(*) FROM bookmark WHERE user_id=? and del_flag = 0`;
      const [totalRes] = await pool.query(totalSql, [userId]);
      // 回填「正文存档 / AI 摘要」角标:单查一次快照表按 id 注入,不改主查询;
      // try/catch 兜底,即便快照表缺失或异常也只是没角标,绝不拖垮书签列表本身。
      try {
        const ids = (result || []).map((r) => r.id).filter(Boolean);
        if (ids.length) {
          const [snaps] = await pool.query(
            `SELECT bookmark_id,
                    (content IS NOT NULL AND content <> '') AS hasSnapshot,
                    (summary IS NOT NULL AND summary <> '') AS hasSummary
               FROM bookmark_snapshot WHERE bookmark_id IN (?)`,
            [ids],
          );
          const map = new Map(snaps.map((s) => [s.bookmark_id, s]));
          for (const r of result) {
            const s = map.get(r.id);
            r.hasSnapshot = !!(s && Number(s.hasSnapshot));
            r.hasSummary = !!(s && Number(s.hasSummary));
          }
        }
      } catch (e) {
        console.warn('[书签角标] 快照标记回填失败(忽略):', e.message);
      }
      res.send(
        resultData({
          items: result,
          total: totalRes[0]['COUNT(*)'],
        }),
      );
    })
    .catch((e) => {
      res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
    });
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
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id, force } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    const result = await summarizeBookmark(req.user.id, id, { force: force === true });
    res.send(resultData(result));
  } catch (error) {
    console.error('AI 摘要失败:', error);
    res.send(resultData(null, 500, 'AI 摘要失败: ' + error.message));
  }
};

// POST /bookmark/health/check —— 检测一批链接死活(增量,最久未测优先)
export const doCheckHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const result = await checkBookmarkHealth(req.user.id);
    res.send(resultData(result));
  } catch (error) {
    console.error('死链检测失败:', error);
    res.send(resultData(null, 500, '检测失败: ' + error.message));
  }
};

// POST /bookmark/health/reset —— 清空体检记录,从头重新检测
export const doResetHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const r = await resetHealth(req.user.id);
    res.send(resultData(r.ok ? await getHealthSummary(req.user.id) : r));
  } catch (error) {
    console.error('重置体检失败:', error);
    res.send(resultData(null, 500, '重置失败: ' + error.message));
  }
};

// POST /bookmark/health/checkAll —— 启动一次全量后台检测(前端随后轮询 GET /health 看进度)
export const doCheckAllHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    res.send(resultData(await startFullCheck(req.user.id)));
  } catch (error) {
    console.error('启动全量检测失败:', error);
    res.send(resultData(null, 500, '启动失败: ' + error.message));
  }
};

// GET /bookmark/health —— 当前健康概览(总数/已测/疑似失效列表 + running)
export const getHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    res.send(resultData(await getHealthSummary(req.user.id)));
  } catch (error) {
    console.error('获取健康概览失败:', error);
    res.send(resultData(null, 500, '获取失败: ' + error.message));
  }
};

// POST /bookmark/health/ignore —— 「标记正常」:消除疑似失效误报(SPA/需登录等浏览器能开的)
export const doIgnoreHealth = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.send(resultData(null, 400, '缺少书签 id'));
    res.send(resultData(await markLinkNormal(req.user.id, id)));
  } catch (error) {
    console.error('标记正常失败:', error);
    res.send(resultData(null, 500, '操作失败: ' + error.message));
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.id;
    // saveSnapshot 是前端表单开关,不是书签字段:先摘出去,避免混进 INSERT(表里无此列)
    const { saveSnapshot = true, ...bmBody } = req.body || {};
    const params = {
      ...bmBody,
      userId: userId,
      url: normalizeBookmarkUrl(req.body.url),
    };
    // 自动补协议，避免相对路径跳转
    if (params.url && !params.url.startsWith('http://') && !params.url.startsWith('https://')) {
      params.url = 'https://' + params.url;
    }
    const sqlCheck = 'SELECT * FROM bookmark WHERE user_id=? AND name = ? AND del_flag = 0';
    const [checkRes] = await connection.query(sqlCheck, [userId, params.name]);
    if (checkRes.length > 0) {
      throw new Error(`书签${checkRes[0].name}已存在`);
    }
    // URL 去重:同一用户下相同网址不重复收藏(url 已归一化 + 补协议);导入逐条走此处也自动去重
    if (params.url) {
      const [urlDup] = await connection.query('SELECT name FROM bookmark WHERE user_id=? AND url=? AND del_flag=0', [userId, params.url]);
      if (urlDup.length > 0) {
        throw new Error(`该网址已收藏为「${urlDup[0].name}」`);
      }
    }

    const insertParams = mergeExistingProperties(insertData(params), [undefined, '', []], ['related_tags']);
    const insertBookmarkId = insertParams.id;
    let sql = `INSERT INTO bookmark SET ?`;
    const [result] = await connection.query(sql, [insertParams]);
    if (req.body.relatedTags && req.body.relatedTags.length > 4) {
      throw new Error('最多选择4个关联标签');
    }
    if (req.body.relatedTags && req.body.relatedTags.length > 0) {
      const tagIds = req.body.relatedTags;
      await insertResourceTagRelations(connection, {
        tagIds,
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceId: insertBookmarkId,
        userId,
      });
    }
    await connection.commit();
    res.send(resultData(result));
    if (!req.isVisitorWorkspace) {
      recordFirstOwnResource(req, 'bookmark'); // 激活里程碑:首次自建书签(不 await,失败不影响响应)
      awardCreate(userId, 'bookmark', hashRef(params.url), { userRole: req.user.role }).catch(() => {}); // 创造类发经验(当日衰减 + url 判重)
    }
    if (params.url && saveSnapshot !== false) archiveBookmark(userId, insertBookmarkId).catch(() => {}); // 用户勾选时异步存档网页正文(防死链),失败静默,不阻断响应
  } catch (err) {
    await connection.rollback();
    res.send(resultData(null, 500, err.message));
  } finally {
    connection.release();
  }
};

export const updateBookmark = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = req.body.id;
    const userId = req.user.id;
    const sqlCheck = 'SELECT * FROM bookmark WHERE user_id=? AND name = ? AND del_flag = 0';
    const [checkRes] = await connection.query(sqlCheck, [userId, req.body.name]);
    if (checkRes.length > 0 && checkRes[0].id != id) {
      throw new Error('书签已存在');
    }
    // 归属校验：确认书签属于当前用户，避免越权改动及破坏关系表
    const [own] = await connection.query('SELECT id FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0', [id, userId]);
    if (own.length === 0) {
      await connection.rollback();
      return res.send(resultData(null, 403, '无权限操作'));
    }
    // 只在调用方确实传了 url 时才补协议头;不能无条件赋值,否则 url 缺省时会把 SET 子句里的 url 覆盖成空
    if (req.body.url) {
      req.body.url = normalizeBookmarkUrl(req.body.url);
    }
    req.body.iconUrl = null;
    const sql = `update bookmark set ? where id=?`;
    const [updateResult] = await connection.query(sql, [
      mergeExistingProperties(snakeCaseKeys(req.body), [], ['related_tags', 'related_tags']),
      id,
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
    res.send(resultData(updateResult)); // 发送成功响应
  } catch (error) {
    await connection.rollback(); // 回滚事务
    res.send(resultData(null, 500, error.message)); // 设置状态码为500
  } finally {
    await connection.release(); // 释放连接
  }
};

export const getBookmarkDetail = (req, res) => {
  try {
    const userId = req.user.id;
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
  try {
    const userId = req.user.id;
    const id = req.body.id;

    const [result] = await pool.query(`SELECT * FROM bookmark WHERE id=? AND user_id=?`, [id, userId]);
    if (result.length === 0) {
      return res.send(resultData(null, 404, '书签不存在'));
    }

    const iconUrl = result[0].icon_url;

    // 删除图标文件
    if (iconUrl) {
      try {
        const url = new URL(iconUrl);
        const fileName = url.pathname.split('/').pop();
        const filePath = path.join('/www/wwwroot/images/', fileName);
        await fs.unlink(filePath);
      } catch (e) {
        console.error('删除文件失败:', e);
      }
    }

    const params = {
      del_flag: 1,
      icon_url: null,
      deleted_at: new Date(),
    };

    const [updateResult] = await pool.query(`UPDATE bookmark SET ? WHERE id=? AND user_id=?`, [params, id, userId]);

    res.send(resultData(updateResult));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const getCommonBookmarks = async (req, res) => {
  try {
    const [result] = await pool.query(
      "SELECT b.id, b.url, REPLACE(ol.operation, '点击书签卡片', '') AS name, COUNT(*) as count FROM `operation_logs` ol LEFT JOIN bookmark b ON b.user_id = ol.create_by AND b.name = REPLACE(ol.operation, '点击书签卡片', '') AND b.del_flag = 0 WHERE ol.create_by = ? AND ol.operation LIKE '点击书签卡片%' GROUP BY ol.operation, b.id, b.url ORDER BY count DESC LIMIT 10",
      [req.user.id],
    );
    res.send(
      resultData({
        items: result,
        total: 10,
      }),
    );
  } catch (e) {
    res.send(resultData(e.message, 200));
  }
};

export const updateBookmarkSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务
    const userId = req.user.id;
    const { bookmarks } = req.body;
    for (const bookmark of bookmarks) {
      const { id, sort } = bookmark;
      const sql = 'UPDATE bookmark SET sort = ? WHERE id = ? AND user_id = ?';
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

// 解析 Netscape 书签 HTML，提取文件夹（标签）与书签
const parseBookmarksFromHtml = (html = '') => {
  const bookmarks = [];
  const folderStack = [];
  const lines = html.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const folderMatch = line.match(/<DT><H3[^>]*>(.*?)<\/H3>/i);
    if (folderMatch) {
      folderStack.push(folderMatch[1].trim());
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
        name: linkMatch[2].trim(),
        url: linkMatch[1].trim(),
        folder: currentFolder,
      });
    }
  }

  return bookmarks;
};

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

  console.log(`解析到 ${parsedBookmarks.length} 条书签`, parsedBookmarks);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 预加载现有标签和书签
    const [tagRows] = await connection.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
    const [bookmarkRows] = await connection.query('SELECT id, name FROM bookmark WHERE user_id = ? AND del_flag = 0', [
      userId,
    ]);
    const tagMap = new Map(tagRows.map((row) => [row.name, row.id]));
    const bookmarkMap = new Map(bookmarkRows.map((row) => [row.name, row.id]));

    let createdTags = 0;
    let createdBookmarks = 0;
    let boundRelations = 0;

    for (const item of parsedBookmarks) {
      const tagName = (item.folder || '').trim();
      let tagId = null;

      if (tagName) {
        if (!tagMap.has(tagName)) {
          const tagPayload = insertData({
            name: tagName,
            userId,
          });
          await connection.query('INSERT INTO tag SET ?', [tagPayload]);
          tagId = tagPayload.id;
          tagMap.set(tagName, tagId);
          createdTags++;
        } else {
          console.log('标签已存在:', tagName);
          tagId = tagMap.get(tagName);
        }
      }
      let bookmarkId = bookmarkMap.get(item.name);
      if (!bookmarkId) {
        const bookmarkPayload = insertData({
          name: item.name,
          userId,
          url: normalizeBookmarkUrl(item.url),
          description: '',
        });
        await connection.query('INSERT INTO bookmark SET ?', [bookmarkPayload]);
        bookmarkId = bookmarkPayload.id;
        bookmarkMap.set(item.name, bookmarkId);
        createdBookmarks++;
      }
      if (tagId && bookmarkId) {
        const inserted = await insertResourceTagRelations(connection, {
          tagIds: [tagId],
          resourceType: RESOURCE_TYPE.BOOKMARK,
          resourceId: bookmarkId,
          userId,
          source: 'import',
        });
        if (inserted > 0) {
          boundRelations++;
        }
      }
    }

    await connection.commit();
    res.send(
      resultData({
        parsedTotal: parsedBookmarks.length,
        createdTags,
        createdBookmarks,
        boundRelations,
      }),
    );
    // 批量导入整批只发一次固定经验(防按条刷;grantExp 内日顶 200 仍兜底)
    if (createdBookmarks > 0) {
      grantExp(userId, 'bookmark_import', { refId: `import_${userId}_${Date.now()}`, amount: 15, userRole: req.user.role }).catch(() => {});
    }
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
  }
};

// ============================================================================
// AI 自动整理(批量打标签):免费额度随等级 + 超额扣积分。核心逻辑见 util/aiOrganize.js
// ============================================================================

// 并发池(单核服务器友好):最多 n 个 worker 同时跑
async function organizePool(items, n, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      await worker(items[i++]);
    }
  });
  await Promise.all(runners);
}

// 解析候选:resourceType='bookmark'|'note';scope='selected'(指定 ids,校验归属)/ 'untagged'(未打标签)
async function resolveOrganizeCandidates(userId, scope, ids, resourceType = 'bookmark') {
  if (resourceType === 'note') {
    if (scope === 'selected' && Array.isArray(ids) && ids.length) {
      const [rows] = await pool.query(
        'SELECT id, title, content FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)',
        [userId, ids],
      );
      return rows;
    }
    const [rows] = await pool.query(
      `SELECT n.id, n.title, n.content FROM note n
       LEFT JOIN resource_tag_relations r ON r.resource_id = n.id AND r.resource_type = 'note'
       WHERE n.create_by = ? AND n.del_flag = 0 AND r.tag_id IS NULL
       ORDER BY n.create_time DESC`,
      [userId],
    );
    return rows;
  }
  if (scope === 'selected' && Array.isArray(ids) && ids.length) {
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

// POST /bookmark/ai/organize/quote —— 预估本次可整理数(免费;不跑 AI)
export const doOrganizeQuote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const { scope = 'untagged', ids = [], resourceType = 'bookmark' } = req.body || {};
    const candidates = await resolveOrganizeCandidates(userId, scope, ids, resourceType);
    const batchCap = Math.min(candidates.length, ORGANIZE_MAX_BATCH);
    res.send(
      resultData({
        candidateTotal: candidates.length,
        batchCap,
        batchIds: candidates.slice(0, batchCap).map((c) => c.id),
        maxBatch: ORGANIZE_MAX_BATCH,
        canRun: batchCap > 0,
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, 'AI 整理预估失败: ' + e.message));
  }
};

// POST /bookmark/ai/organize/run —— 对指定 ids 跑 AI(并发 3,免费),返回建议供复审
export const doOrganizeRun = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const resourceType = req.body?.resourceType === 'note' ? 'note' : 'bookmark';
    const raw = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
    if (!raw.length) return res.send(resultData(null, 400, '未选择要整理的内容'));
    const [tagRows] = await pool.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [userId]);
    const toMatched = (ids) => tagRows.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, name: t.name }));
    const suggestions = [];

    if (resourceType === 'note') {
      const [rows] = await pool.query('SELECT id, title, content FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)', [userId, raw]);
      const targets = rows.slice(0, ORGANIZE_MAX_BATCH);
      if (!targets.length) return res.send(resultData({ ok: true, processed: 0, suggestions: [] }));
      await organizePool(targets, 3, async (n) => {
        try {
          const text = `标题:${n.title || '(无)'}\n正文:${stripHtml(n.content).slice(0, 1200)}`;
          const r = await suggestTagsFromText({ text, userTags: tagRows });
          if (!r || (!r.matchedTagIds.length && !r.newTags.length)) return;
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
        } catch {
          /* 单条失败跳过 */
        }
      });
    } else {
      const [rows] = await pool.query(
        "SELECT id, name, url, description FROM bookmark WHERE user_id = ? AND del_flag = 0 AND url IS NOT NULL AND url <> '' AND id IN (?)",
        [userId, raw],
      );
      const targets = rows.slice(0, ORGANIZE_MAX_BATCH);
      if (!targets.length) return res.send(resultData({ ok: true, processed: 0, suggestions: [] }));
      await organizePool(targets, 3, async (b) => {
        try {
          const r = await suggestBookmarkMeta({ url: b.url, name: b.name, description: b.description, userTags: tagRows });
          if (!r) return;
          if (!r.matchedTagIds.length && !r.newTags.length && !r.name && !r.description) return;
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
        } catch {
          /* 单条失败跳过 */
        }
      });
    }
    res.send(resultData({ ok: true, processed: suggestions.length, suggestions }));
  } catch (e) {
    res.send(resultData(null, 500, 'AI 整理失败: ' + e.message));
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
    const norm = (s) => String(s || '').trim().toLowerCase();
    const nameToId = new Map(tagRows.map((t) => [norm(t.name), t.id]));
    const ownTagIds = new Set(tagRows.map((t) => t.id));
    let applied = 0;
    for (const it of items) {
      const id = String(it?.id || '');
      if (!id) continue;
      // 归属校验:书签按 user_id、笔记按 create_by
      const [own] = isNote
        ? await conn.query('SELECT id FROM note WHERE id = ? AND create_by = ? AND del_flag = 0', [id, userId])
        : await conn.query('SELECT id, name, description FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0', [id, userId]);
      if (!own.length) continue;
      const finalTagIds = [];
      for (const tid of Array.isArray(it.tagIds) ? it.tagIds : []) {
        if (ownTagIds.has(tid)) finalTagIds.push(tid);
      }
      for (const rawName of Array.isArray(it.newTagNames) ? it.newTagNames : []) {
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
        finalTagIds.push(tid);
      }
      // 4 标签上限:算上已有关联,只补到 4
      const [[cnt]] = await conn.query('SELECT COUNT(*) AS c FROM resource_tag_relations WHERE resource_type = ? AND resource_id = ?', [relType, id]);
      const room = Math.max(0, 4 - Number(cnt.c || 0));
      const toAdd = [...new Set(finalTagIds)].slice(0, room);
      if (toAdd.length) {
        await insertResourceTagRelations(conn, { tagIds: toAdd, resourceType: relType, resourceId: id, userId, source: 'ai' });
      }
      // 仅书签补空名称/描述;笔记不改标题正文
      if (!isNote) {
        const setName = it.name && !own[0].name ? String(it.name).trim() : null;
        const setDesc = it.description && !own[0].description ? String(it.description).trim() : null;
        if (setName || setDesc) {
          await conn.query('UPDATE bookmark SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ? AND user_id = ?', [
            setName,
            setDesc,
            id,
            userId,
          ]);
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
    res.send(resultData(null, 500, '应用整理结果失败: ' + e.message));
  } finally {
    conn.release();
  }
};
