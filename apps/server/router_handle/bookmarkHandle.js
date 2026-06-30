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
    const { filters } = req.body;
    pool
      .query(`SELECT * FROM tag WHERE  id=? AND del_flag=0`, [filters.id])
      .then(([result]) => {
        if (result.length === 0) {
          throw '标签不存在';
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
      if (fileList && fileList.length > 0) {
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
    if (fileList !== undefined) {
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
WHERE b.user_id=? AND tbr.tag_id = ? AND  b.del_flag=0   ORDER BY b.sort, b.create_time DESC`;
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
      b.sort, b.create_time DESC;

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
    b.sort, b.create_time DESC;
`;
    params = [req.body.filters.value, userId, req.body.filters.value, req.body.filters.value];
  }
  pool
    .query(sql, params)
    .then(async ([result]) => {
      const totalSql = `SELECT COUNT(*) FROM bookmark WHERE user_id=? and del_flag = 0`;
      const [totalRes] = await pool.query(totalSql, [userId]);
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

export const addBookmark = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = req.user.id;
    const params = {
      ...req.body,
      userId: userId,
    };
    const sqlCheck = 'SELECT * FROM bookmark WHERE user_id=? AND name = ? AND del_flag = 0';
    const [checkRes] = await connection.query(sqlCheck, [userId, params.name]);
    if (checkRes.length > 0) {
      throw new Error(`书签${checkRes[0].name}已存在`);
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
    let sql = `SELECT * FROM bookmark WHERE  id=? AND del_flag=0`;
    pool
      .query(sql, [req.body.filters.id])
      .then(([result]) => {
        if (result.length === 0) {
          throw new Error('书签不存在');
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
          url: item.url,
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
  } catch (e) {
    await connection.rollback();
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  } finally {
    connection.release();
  }
};
