import pool from '../db/index.js';
import { snakeCaseKeys, resultData, mergeExistingProperties, insertData } from '../util/common.js';
import { RESOURCE_TYPE, replaceResourceTagRelations, validateUserTags } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';

export const addNote = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const params = {
      ...req.body,
      createBy: userId,
    };
    const noteData = insertData(params);
    pool
      .query('INSERT INTO note SET ?', [noteData])
      .then(() => {
        res.send(resultData({ id: noteData.id }));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const updateNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const params = {
      ...req.body,
      updateBy: userId,
    };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // 更新 note 表，排除 tags
      const updateParams = mergeExistingProperties(params, [], ['id', 'tags']);
      await connection.query('update note set ? where id=? and create_by=?', [snakeCaseKeys(updateParams), req.body.id, userId]);
      if (params.tags && Array.isArray(params.tags)) {
        const tagIds = await validateUserTags(connection, { tagIds: params.tags, userId });
        await replaceResourceTagRelations(connection, {
          tagIds,
          resourceType: RESOURCE_TYPE.NOTE,
          resourceId: req.body.id,
          userId,
        });
      }
      await connection.commit();
      res.send(resultData('更新笔记成功'));
    } catch (error) {
      await connection.rollback();
      res.send(resultData(null, 500, '服务器内部错误: ' + error.message));
    } finally {
      connection.release();
    }
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const queryNoteList = (req, res) => {
  try {
    const userId = req.user.id;
    const tagId = req.body.tagId;
    let sql = `SELECT n.*,
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
            FROM resource_tag_relations r
            INNER JOIN tag t ON r.tag_id = t.id
            WHERE r.resource_type = 'note'
              AND r.resource_id = n.id
              AND t.del_flag = 0
          ) AS tags
         FROM note n
         WHERE n.create_by = ? AND n.del_flag = 0`;
    const params = [userId];
    if (tagId) {
      sql += ` AND n.id IN (SELECT resource_id FROM resource_tag_relations WHERE tag_id = ? AND resource_type = 'note')`;
      params.push(tagId);
    }
    sql += ` GROUP BY n.id ORDER BY n.sort, n.update_time DESC`;
    pool
      .query(sql, params)
      .then(([result]) => {
        // 处理 tags 为数组，如果 NULL 或包含无效标签则为空数组
        result.forEach((note) => {
          note.tags =
            note.tags && Array.isArray(note.tags) && note.tags.every((tag) => tag && tag.id !== null) ? note.tags : [];
        });
        res.send(resultData(result));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const getNoteDetail = (req, res) => {
  try {
    pool
      .query('select * from note where id=?', [req.body.id])
      .then(([result]) => {
        res.send(resultData(result[0]));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const delNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.send(resultData(null, 400, '无效的请求参数'));
    }

    const userId = req.user.id;
    const placeholders = ids.map(() => '?').join(',');
    const [updateResult] = await pool.query(
      `UPDATE note SET del_flag = 1, deleted_at = NOW() WHERE id IN (${placeholders}) AND create_by = ?`,
      [...ids, userId],
    );

    res.send(resultData(updateResult));
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常: ' + e.message));
  }
};

export const updateNoteSort = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // 开始事务
    const { notes } = req.body;
    for (const note of notes) {
      const { id, sort } = note;
      const sql = 'UPDATE note SET sort = ?, update_time = update_time WHERE id = ? AND create_by = ?';
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

export const addNoteTag = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.send(resultData(null, 400, '标签名称不能为空'));
    }
    const params = {
      name,
      userId: userId,
    };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [checkRes] = await connection.query('SELECT id FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0', [
        userId,
        name,
      ]);
      if (checkRes.length > 0) {
        throw new Error('标签已存在');
      }
      const tagData = insertData(params);
      await connection.query('INSERT INTO tag SET ?', [tagData]);
      const createdTag = { id: tagData.id, name: tagData.name };
      await connection.commit();
      res.send(resultData(createdTag || '添加标签成功'));
    } catch (err) {
      await connection.rollback();
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    } finally {
      connection.release();
    }
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const editNoteTag = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.send(resultData(null, 400, '标签名称不能为空'));
    }
    const params = {
      name,
    };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [checkRes] = await connection.query('SELECT id FROM tag WHERE user_id = ? AND name = ? AND del_flag = 0', [
        userId,
        name,
      ]);
      if (checkRes.length > 0 && checkRes[0].id !== req.body.id) {
        throw new Error('标签已存在');
      }
      const [result] = await connection.query('update tag set ? where id=? and user_id=?', [
        snakeCaseKeys(mergeExistingProperties(params, [], ['id'])),
        req.body.id,
        userId,
      ]);
      await connection.commit();
      res.send(resultData(result));
    } catch (err) {
      await connection.rollback();
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    } finally {
      connection.release();
    }
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const queryNoteTagList = (req, res) => {
  try {
    const userId = req.user.id;
    pool
      .query(
        `
          SELECT
            t.*,
            (
              SELECT COUNT(*)
              FROM resource_tag_relations r
              INNER JOIN note n ON n.id = r.resource_id AND n.del_flag = 0
              WHERE r.tag_id = t.id AND r.resource_type = 'note'
            ) AS noteCount
          FROM tag t
          WHERE t.user_id = ? AND t.del_flag = 0
          ORDER BY t.sort, t.create_time DESC
        `,
        [userId],
      )
      .then(([result]) => {
        res.send(resultData(result));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const getNoteTags = (req, res) => {
  try {
    const noteId = req.body.id;
    pool
      .query(
        `SELECT t.*
         FROM tag t
         JOIN resource_tag_relations r ON t.id = r.tag_id
         WHERE r.resource_type = 'note' AND r.resource_id = ? AND t.del_flag = 0
         ORDER BY t.sort, t.create_time DESC`,
        [noteId],
      )
      .then(([result]) => {
        res.send(resultData(result));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const delNoteTag = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const tagId = req.body.id;
    pool
      .query('DELETE FROM tag WHERE id = ? AND user_id = ?', [tagId, userId])
      .then(() => {
        res.send(resultData('删除标签成功'));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

export const updateNoteTags = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const { noteId, tags } = req.body;
    if (!noteId || !Array.isArray(tags)) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // 验证笔记属于用户
      const [noteResult] = await connection.query('SELECT id FROM note WHERE id = ? AND create_by = ?', [
        noteId,
        userId,
      ]);
      if (noteResult.length === 0) {
        await connection.rollback();
        return res.send(resultData(null, 403, '无权限操作此笔记'));
      }
      // 验证所有标签属于用户
      if (tags.length > 0) {
        await validateUserTags(connection, { tagIds: tags, userId });
      }
      await replaceResourceTagRelations(connection, {
        tagIds: tags,
        resourceType: RESOURCE_TYPE.NOTE,
        resourceId: noteId,
        userId,
      });
      await connection.commit();
      res.send(resultData('更新标签成功'));
    } catch (error) {
      await connection.rollback();
      res.send(resultData(null, 500, '服务器内部错误: ' + error.message));
    } finally {
      connection.release();
    }
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e));
  }
};

