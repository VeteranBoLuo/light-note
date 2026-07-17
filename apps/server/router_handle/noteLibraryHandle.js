import pool from '../db/index.js';
import { snakeCaseKeys, resultData, mergeExistingProperties, insertData } from '../util/common.js';
import { RESOURCE_TYPE, replaceResourceTagRelations, validateUserTags } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';
import { attachPendingStatus, removeInboxRelations } from '../util/resourceInbox.js';
import { createNote } from '../util/services/noteService.js';
import { createTag } from '../util/services/tagService.js';
import { cleanupOrphanNoteImages, extractNoteImageUrls, filterOwnedImageUrls } from '../util/noteImages.js';
import { promises as fsP } from 'node:fs';

// multer 先落盘后进 handler:任何登记失败分支都必须丢弃已落盘文件,
// 否则登录用户反复提交无效 noteId 即可持续向磁盘写入孤儿文件
const discardUploadedFile = (file) => {
  if (file?.path) fsP.unlink(file.path).catch(() => {});
};

// 模板接口的 500 统一收口:原始错误只进服务端日志,不把 e.message(可能含 SQL/表名)回给前端
const sendTemplateServerError = (res, scene, error) => {
  console.error(`[noteTemplate] ${scene}失败:`, error);
  res.send(resultData(null, 500, '服务器暂时无法处理,请稍后重试'));
};

// 笔记图片上传登记(multer 已将文件落盘,这里负责归属校验与建档)。
// note_images 的归属可信度是图片引用计数体系的地基:
// - 传入 noteId 必须校验属于当前用户,否则可向他人笔记挂图污染归属;
// - 未传 noteId 时服务端用 insertData 先生成笔记 id(禁止 ORDER BY LIMIT 1 全局取最新),
//   笔记与图片登记在同一事务内提交。
export const uploadNoteImage = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    if (!req.file) {
      return res.send(resultData(null, 400, '没有上传文件'));
    }
    const userId = req.user.id;
    const fileUrl = `https://boluo66.top/uploads/${req.file.filename}`;
    const noteId = String(req.body.noteId || '').trim();

    if (noteId) {
      const [own] = await pool.query('SELECT id FROM note WHERE id = ? AND create_by = ?', [noteId, userId]);
      if (own.length === 0) {
        discardUploadedFile(req.file);
        return res.send(resultData(null, 404, '笔记不存在'));
      }
      await pool.query('INSERT INTO note_images SET ?', [insertData({ noteId, url: fileUrl })]);
      return res.send(resultData({ url: fileUrl }));
    }

    const noteData = insertData({ title: '未命名文档', createBy: userId });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('INSERT INTO note SET ?', [noteData]);
      await connection.query('INSERT INTO note_images SET ?', [insertData({ noteId: noteData.id, url: fileUrl })]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.send(resultData({ url: fileUrl, noteId: noteData.id }));
  } catch (e) {
    // 登记失败(归属查询/写库/事务回滚)统一丢弃已落盘文件,不留孤儿
    discardUploadedFile(req.file);
    console.error('[noteImage] 上传登记失败:', e);
    res.send(resultData(null, 500, '服务器暂时无法处理,请稍后重试'));
  }
};

export const addNote = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const { addToInbox = false, inboxSource = 'quick_capture', ...noteBody } = req.body || {};
    const result = await createNote({
      userId,
      userRole: req.user.role,
      note: noteBody,
      addToInbox: addToInbox === true,
      inboxSource,
      request: req,
      suppressUserRewards: req.suppressUserRewards || req.isVisitorWorkspace,
    });
    res.send(resultData({ id: result.id, addedToInbox: result.addedToInbox }));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// —— 笔记历史版本快照配置 ——
// 正文自动保存是高频操作(停敲 500ms 即存),无脑存快照会撑爆版本表,故加三重闸门:
// 1) 内容去重:正文无变化不存 2) 时间合并:距上一条版本不足窗口则并入 3) 每篇保留上限,超出删最旧
const NOTE_VERSION_MERGE_WINDOW_MS = 3 * 60 * 1000; // 连续编辑每 3 分钟落一个还原点
const NOTE_VERSION_KEEP = 20; // 每篇笔记最多保留的历史版本数

// 历史版本字数改由前端按"渲染后展示文本"计算(html: DOM textContent; md: marked 渲染后取 textContent),
// 后端只回传 content + type,不再在 SQL/JS 层估算(见前端 utils/common.ts 的 noteDisplayText)。

// 删除超出保留上限的最旧版本(须在事务连接上执行)
async function pruneNoteVersions(connection, noteId) {
  const [cntRows] = await connection.query('SELECT COUNT(*) AS n FROM note_versions WHERE note_id=?', [noteId]);
  const overflow = cntRows[0].n - NOTE_VERSION_KEEP;
  if (overflow <= 0) return;
  const [oldRows] = await connection.query(
    'SELECT id FROM note_versions WHERE note_id=? ORDER BY create_time ASC, id ASC LIMIT ?',
    [noteId, overflow],
  );
  if (oldRows.length === 0) return;
  const ids = oldRows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  await connection.query(`DELETE FROM note_versions WHERE id IN (${placeholders})`, ids);
}

// 覆盖笔记前,把"改动前"的旧内容存为一个历史版本(按闸门策略决定是否真正落库)
async function snapshotNoteVersion(connection, { noteId, userId, newContent }) {
  // 本次未提交正文(仅改标题/标签等)则不快照
  if (newContent === undefined || newContent === null) return;
  const [rows] = await connection.query('SELECT title, content, type FROM note WHERE id=? AND create_by=?', [
    noteId,
    userId,
  ]);
  if (rows.length === 0) return; // 笔记不存在或非本人,交由后续 update 的 where 兜底
  const oldContent = rows[0].content ?? '';
  if (oldContent === newContent) return; // 正文无变化,去重
  // 时间合并:距该笔记上一条版本不足窗口则并入,不新增
  const [lastRows] = await connection.query(
    'SELECT create_time FROM note_versions WHERE note_id=? ORDER BY create_time DESC, id DESC LIMIT 1',
    [noteId],
  );
  if (lastRows.length > 0 && Date.now() - new Date(lastRows[0].create_time).getTime() < NOTE_VERSION_MERGE_WINDOW_MS) {
    return;
  }
  const versionData = insertData({
    noteId,
    title: rows[0].title,
    content: oldContent,
    type: rows[0].type,
    createBy: userId,
  });
  await connection.query('INSERT INTO note_versions SET ?', [versionData]);
  await pruneNoteVersions(connection, noteId);
}

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
      // 覆盖前先存历史版本快照(改动前旧内容;含去重/时间合并/保留上限)
      await snapshotNoteVersion(connection, { noteId: req.body.id, userId, newContent: req.body.content });
      // 更新 note 表，排除 tags
      const updateParams = mergeExistingProperties(params, [], ['id', 'tags']);
      await connection.query('update note set ? where id=? and create_by=?', [
        snakeCaseKeys(updateParams),
        req.body.id,
        userId,
      ]);
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
      .then(async ([result]) => {
        // 处理 tags 为数组，如果 NULL 或包含无效标签则为空数组
        result.forEach((note) => {
          note.tags =
            note.tags && Array.isArray(note.tags) && note.tags.every((tag) => tag && tag.id !== null) ? note.tags : [];
        });
        try {
          await attachPendingStatus(pool, { userId, resourceType: 'note', items: result });
        } catch (error) {
          console.warn('[待整理角标] 笔记状态回填失败(忽略):', error.message);
        }
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
    const userId = req.user.id;
    // 归属校验:只能读自己的笔记(游客=共享 visitor 账号),防止传他人 note id 越权读取;越权/不存在统一 404 不泄露存在性
    pool
      .query('select * from note where id=? and create_by=? and del_flag=?', [req.body.id, userId, '0'])
      .then(([result]) => {
        if (result.length === 0) {
          return res.send(resultData(null, 404, '笔记不存在'));
        }
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
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [updateResult] = await connection.query(
        `UPDATE note SET del_flag = 1, deleted_at = NOW() WHERE id IN (${placeholders}) AND create_by = ?`,
        [...ids, userId],
      );
      await removeInboxRelations(connection, {
        userId,
        items: ids.map((id) => ({ resourceType: 'note', resourceId: String(id) })),
      });
      await connection.commit();
      res.send(resultData(updateResult));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
    try {
      const createdTag = await createTag({ userId, name });
      res.send(resultData({ id: createdTag.id, name: createdTag.name }));
    } catch (err) {
      res.send(resultData(null, 500, '服务器内部错误: ' + String(err.message || err).replace(/^[A-Z_]+:\s*/, '')));
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

export const getNoteTags = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.body.id;
    // 归属校验:先确认该笔记属于当前用户,防止传他人 note id 枚举其标签
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=? AND del_flag=?', [
      noteId,
      userId,
      '0',
    ]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '笔记不存在'));
    }
    const [result] = await pool.query(
      `SELECT t.*
       FROM tag t
       JOIN resource_tag_relations r ON t.id = r.tag_id
       WHERE r.resource_type = 'note' AND r.resource_id = ? AND t.del_flag = 0
       ORDER BY t.sort, t.create_time DESC`,
      [noteId],
    );
    res.send(resultData(result));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
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

// 历史版本列表(轻量:不含 content,只回标题/时间/字数,避免一次拉回大字段)
export const getNoteVersions = async (req, res) => {
  try {
    const userId = req.user.id;
    const noteId = req.body.id;
    if (!noteId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    // 归属校验:只能看自己笔记的版本
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=? AND del_flag=?', [
      noteId,
      userId,
      '0',
    ]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '笔记不存在'));
    }
    const [rows] = await pool.query(
      `SELECT id, title, type, content, create_by, create_time
       FROM note_versions
       WHERE note_id = ?
       ORDER BY create_time DESC, id DESC`,
      [noteId],
    );
    // 回传 content + type,字数与预览渲染都交给前端(按渲染后展示文本计,html/md 口径一致)
    res.send(resultData(rows));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// 单个版本内容(预览用)
export const getNoteVersionDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const versionId = req.body.id;
    if (!versionId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const [rows] = await pool.query('SELECT id, note_id, title, content, create_time FROM note_versions WHERE id=?', [
      versionId,
    ]);
    if (rows.length === 0) {
      return res.send(resultData(null, 404, '版本不存在'));
    }
    // 归属校验:该版本所属笔记须属于当前用户(两步查询,规避跨表字符集比较)
    const [own] = await pool.query('SELECT id FROM note WHERE id=? AND create_by=?', [rows[0].note_id, userId]);
    if (own.length === 0) {
      return res.send(resultData(null, 404, '版本不存在'));
    }
    res.send(resultData(rows[0]));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// 恢复到指定版本:先把当前内容存为一版(后悔药),再覆盖为目标版本
export const restoreNoteVersion = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const versionId = req.body.id;
    if (!versionId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [verRows] = await connection.query('SELECT note_id, title, content, type FROM note_versions WHERE id=?', [
        versionId,
      ]);
      if (verRows.length === 0) {
        await connection.rollback();
        return res.send(resultData(null, 404, '版本不存在'));
      }
      const noteId = verRows[0].note_id;
      const verTitle = verRows[0].title;
      const verContent = verRows[0].content ?? '';
      const verType = verRows[0].type || 'html';
      // 归属校验 + 取当前值(未删除的、属于自己的笔记)
      const [curRows] = await connection.query(
        'SELECT title, content, type FROM note WHERE id=? AND create_by=? AND del_flag=?',
        [noteId, userId, '0'],
      );
      if (curRows.length === 0) {
        await connection.rollback();
        return res.send(resultData(null, 404, '笔记不存在'));
      }
      // 后悔药:恢复前把当前内容强制存为一版(不受时间合并限制),恢复错了还能回来
      const curSnap = insertData({
        noteId,
        title: curRows[0].title,
        content: curRows[0].content ?? '',
        type: curRows[0].type,
        createBy: userId,
      });
      await connection.query('INSERT INTO note_versions SET ?', [curSnap]);
      // 覆盖为目标版本(含 type:恢复时 md/html 模式一并回到该版本)
      await connection.query('UPDATE note SET title=?, content=?, type=?, update_by=? WHERE id=? AND create_by=?', [
        verTitle,
        verContent,
        verType,
        userId,
        noteId,
        userId,
      ]);
      await pruneNoteVersions(connection, noteId);
      await connection.commit();
      res.send(resultData({ id: noteId, title: verTitle, content: verContent, type: verType }));
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

// —— 笔记模板(用户自存;内置模板由前端常量提供,不进库) ——
const NOTE_TEMPLATE_LIMIT = 20; // 每人最多保存的模板数
const NOTE_TEMPLATE_CONTENT_MAX = 1_000_000; // 与笔记正文同一上限
const NOTE_TEMPLATE_TYPES = new Set(['html', 'markdown']);

// 模板列表(轻量:不含 content,选择器只需要元信息;实例化时再按 id 取正文)
export const queryNoteTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT id, name, title_template, description, type, update_time
       FROM note_template
       WHERE create_by = ?
       ORDER BY update_time DESC, id DESC`,
      [userId],
    );
    res.send(resultData(rows));
  } catch (e) {
    sendTemplateServerError(res, '查询模板列表', e);
  }
};

// 单个模板内容(实例化用;归属校验防枚举他人模板)
export const getNoteTemplateDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const templateId = req.body.id;
    if (!templateId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    const [rows] = await pool.query(
      'SELECT id, name, title_template, description, type, content FROM note_template WHERE id = ? AND create_by = ?',
      [templateId, userId],
    );
    if (rows.length === 0) {
      return res.send(resultData(null, 404, '模板不存在'));
    }
    res.send(resultData(rows[0]));
  } catch (e) {
    sendTemplateServerError(res, '查询模板详情', e);
  }
};

// 存为模板(来自当前笔记的标题/正文/类型)
export const addNoteTemplate = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const name = String(req.body.name || '').trim();
    const titleTemplate = String(req.body.titleTemplate || '').trim();
    const description = String(req.body.description || '').trim();
    const type = req.body.type === 'md' ? 'markdown' : String(req.body.type || 'html');
    const content = String(req.body.content || '');
    if (!name) {
      return res.send(resultData(null, 400, '模板名称不能为空'));
    }
    if (name.length > 60) {
      return res.send(resultData(null, 400, '模板名称不能超过 60 个字符'));
    }
    if (titleTemplate.length > 255) {
      return res.send(resultData(null, 400, '默认标题不能超过 255 个字符'));
    }
    if (description.length > 255) {
      return res.send(resultData(null, 400, '模板描述不能超过 255 个字符'));
    }
    if (!NOTE_TEMPLATE_TYPES.has(type)) {
      return res.send(resultData(null, 400, '模板类型仅支持 html 或 markdown'));
    }
    if (content.length > NOTE_TEMPLATE_CONTENT_MAX) {
      return res.send(resultData(null, 400, '模板内容过长'));
    }
    // 正文引用本站上传图片时,校验全部属于当前用户(经其笔记登记于 note_images),
    // 防止把他人图片 URL 写进模板绕过归属;外链图片不校验、不追踪。
    const imageUrls = extractNoteImageUrls(content);
    if (imageUrls.length) {
      const ownedUrls = await filterOwnedImageUrls({ urls: imageUrls, userId });
      if (ownedUrls.length !== imageUrls.length) {
        return res.send(resultData(null, 400, '模板包含无权使用的图片,请先移除后重试'));
      }
    }
    const [cntRows] = await pool.query('SELECT COUNT(*) AS n FROM note_template WHERE create_by = ?', [userId]);
    if (cntRows[0].n >= NOTE_TEMPLATE_LIMIT) {
      return res.send(resultData(null, 400, `最多保存 ${NOTE_TEMPLATE_LIMIT} 个模板,请先删除不用的模板`));
    }
    const data = insertData({
      name,
      titleTemplate: titleTemplate || null,
      description: description || null,
      type,
      content,
      createBy: userId,
    });
    await pool.query('INSERT INTO note_template SET ?', [data]);
    res.send(resultData({ id: data.id, name }));
  } catch (e) {
    sendTemplateServerError(res, '保存模板', e);
  }
};

// 删除模板(硬删除:模板是轻量可再生数据,不接回收站)
export const delNoteTemplate = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const userId = req.user.id;
    const templateId = req.body.id;
    if (!templateId) {
      return res.send(resultData(null, 400, '参数错误'));
    }
    // 先取正文提取图片 URL:模板可能是这些文件的最后一个引用,删除成功后需触发孤儿清理
    const [rows] = await pool.query('SELECT content FROM note_template WHERE id = ? AND create_by = ?', [
      templateId,
      userId,
    ]);
    if (rows.length === 0) {
      return res.send(resultData(null, 404, '模板不存在'));
    }
    const imageUrls = extractNoteImageUrls(rows[0].content);
    const [result] = await pool.query('DELETE FROM note_template WHERE id = ? AND create_by = ?', [
      templateId,
      userId,
    ]);
    if (result.affectedRows === 0) {
      return res.send(resultData(null, 404, '模板不存在'));
    }
    cleanupOrphanNoteImages(imageUrls);
    res.send(resultData('删除模板成功'));
  } catch (e) {
    sendTemplateServerError(res, '删除模板', e);
  }
};
