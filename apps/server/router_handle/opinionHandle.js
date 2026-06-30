import pool from '../db/index.js';
import { snakeCaseKeys, resultData, insertData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';

const OPINION_STATUS = {
  PENDING: 'pending',
  REPLIED: 'replied',
  VIEWED: 'viewed',
};

export const recordOpinion = async (req, res) => {
  const connection = await pool.getConnection();
  const userId = req.user?.id;
  const insertSql = 'INSERT INTO opinion SET ?';
  const params = req.body;
  params.userId = userId;
  params.status = OPINION_STATUS.PENDING;
  params.replyViewed = 0;
  try {
    pool
      .query(insertSql, [insertData(params)])
      .then(() => {
        res.send(resultData('反馈成功'));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (err) {
    res.send(resultData(null, 400, '客户端请求异常: ' + err.message));
  } finally {
    connection.release();
  }
};

export const getOpinionList = async (req, res) => {
  const connection = await pool.getConnection();
  const { pageSize, currentPage, userId, filters = {} } = req.body;
  const currentUserId = req.user?.id;
  const role = req.user?.role;
  const targetUserId = role === 'root' ? userId : currentUserId;
  const skip = pageSize * (currentPage - 1);

  if (!pageSize || !currentPage) {
    connection.release();
    return res.send(resultData(null, 400, '缺少分页参数'));
  }

  if (role !== 'root' && !currentUserId) {
    connection.release();
    return res.send(resultData(null, 400, '缺少用户信息'));
  }

  try {
    let query = 'SELECT o.*, u.alias FROM opinion o LEFT JOIN user u ON o.user_id = u.id WHERE o.del_flag = 0';
    const params = [];
    const whereClauses = [];

    if (targetUserId !== undefined) {
      whereClauses.push('o.user_id = ?');
      params.push(targetUserId);
    }

    if (filters.key) {
      whereClauses.push(
        '(u.alias LIKE ? OR o.phone LIKE ? OR o.content LIKE ? OR o.type LIKE ? OR COALESCE(o.reply_content, \'\') LIKE ?)',
      );
      const keyValue = `%${filters.key}%`;
      params.push(keyValue, keyValue, keyValue, keyValue, keyValue);
    }

    if (filters.status) {
      whereClauses.push('o.status = ?');
      params.push(filters.status);
    }

    if (whereClauses.length > 0) {
      query += ` AND ${whereClauses.join(' AND ')}`;
    }

    query += ' ORDER BY o.create_time DESC LIMIT ? OFFSET ? ';
    params.push(pageSize, skip);
    pool
      .query(query, params)
      .then(async ([result]) => {
        let totalQuery = 'SELECT COUNT(*) FROM opinion o LEFT JOIN user u ON o.user_id = u.id WHERE o.del_flag = 0';
        const totalParams = [];

        if (targetUserId !== undefined) {
          totalQuery += ' AND o.user_id = ?';
          totalParams.push(targetUserId);
        }

        if (filters.key) {
          totalQuery +=
            ' AND (u.alias LIKE ? OR o.phone LIKE ? OR o.content LIKE ? OR o.type LIKE ? OR COALESCE(o.reply_content, \'\') LIKE ?)';
          const keyValue = `%${filters.key}%`;
          totalParams.push(keyValue, keyValue, keyValue, keyValue, keyValue);
        }

        if (filters.status) {
          totalQuery += ' AND o.status = ?';
          totalParams.push(filters.status);
        }

        const [totalRes] = await pool.query(totalQuery, totalParams);
        let summaryQuery = `
          SELECT
            SUM(CASE WHEN o.status = '${OPINION_STATUS.PENDING}' THEN 1 ELSE 0 END) AS pending_total,
            SUM(CASE WHEN o.status = '${OPINION_STATUS.REPLIED}' THEN 1 ELSE 0 END) AS replied_total,
            SUM(CASE WHEN o.status = '${OPINION_STATUS.VIEWED}' THEN 1 ELSE 0 END) AS viewed_total
          FROM opinion o
          WHERE o.del_flag = 0
        `;
        const summaryParams = [];
        if (targetUserId !== undefined) {
          summaryQuery += ' AND o.user_id = ?';
          summaryParams.push(targetUserId);
        }
        const [summaryRes] = await pool.query(summaryQuery, summaryParams);
        res.send(
          resultData({
            items: result,
            total: totalRes[0]['COUNT(*)'],
            summary: summaryRes[0],
          }),
        );
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (err) {
    res.send(resultData(null, 500, '客户端请求异常: ' + err.message));
  } finally {
    connection.release();
  }
};

export const replyOpinion = async (req, res) => {
  const role = req.user?.role;
  if (role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }

  const { id, replyContent } = req.body;
  if (!id || !replyContent?.trim()) {
    return res.send(resultData(null, 400, '回复内容不能为空'));
  }

  try {
    const sql = `
      UPDATE opinion
      SET
        reply_content = ?,
        reply_time = NOW(),
        reply_viewed = 0,
        viewed_time = NULL,
        status = ?
      WHERE id = ? AND del_flag = 0
    `;
    const [result] = await pool.query(sql, [replyContent.trim(), OPINION_STATUS.REPLIED, id]);
    res.send(resultData(result));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const markOpinionReplyViewed = async (req, res) => {
  const userId = req.user?.id;
  const { ids = [] } = req.body || {};

  if (!userId) {
    return res.send(resultData(null, 400, '缺少用户信息'));
  }

  try {
    let sql = `
      UPDATE opinion
      SET
        reply_viewed = 1,
        viewed_time = NOW(),
        status = ?
      WHERE user_id = ?
        AND del_flag = 0
        AND status = ?
        AND reply_viewed = 0
    `;
    const params = [OPINION_STATUS.VIEWED, userId, OPINION_STATUS.REPLIED];

    if (Array.isArray(ids) && ids.length > 0) {
      sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }

    const [result] = await pool.query(sql, params);
    res.send(resultData(result));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const getOpinionNotice = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;

  if (!userId) {
    return res.send(resultData(null, 400, '缺少用户信息'));
  }

  try {
    if (role === 'root') {
      const [rows] = await pool.query(
        `
          SELECT COUNT(*) AS pending_total
          FROM opinion
          WHERE del_flag = 0 AND status = ?
        `,
        [OPINION_STATUS.PENDING],
      );

      return res.send(
        resultData({
          pendingTotal: rows[0].pending_total || 0,
          unreadReplyTotal: 0,
        }),
      );
    }

    const [countRows] = await pool.query(
      `
        SELECT COUNT(*) AS unread_reply_total
        FROM opinion
        WHERE user_id = ?
          AND del_flag = 0
          AND status = ?
          AND reply_viewed = 0
      `,
      [userId, OPINION_STATUS.REPLIED],
    );
    const [latestRows] = await pool.query(
      `
        SELECT id, type, content, reply_content, reply_time
        FROM opinion
        WHERE user_id = ?
          AND del_flag = 0
          AND status = ?
          AND reply_viewed = 0
        ORDER BY reply_time DESC, create_time DESC
        LIMIT 1
      `,
      [userId, OPINION_STATUS.REPLIED],
    );

    res.send(
      resultData({
        pendingTotal: 0,
        unreadReplyTotal: countRows[0].unread_reply_total || 0,
        latestReply: latestRows[0] || null,
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const delOpinion = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const id = req.body.id; // 获取标签ID
    let sql;
    let params;
    if (req.user?.role === 'root') {
      sql = `UPDATE opinion SET del_flag=1  WHERE id=?`;
      params = [id];
    } else {
      sql = `UPDATE opinion SET del_flag=1  WHERE id=? AND user_id = ?`;
      params = [id, req.user.id];
    }
    pool
      .query(sql, params)
      .then(([result]) => {
        if (result.affectedRows === 0) {
          return res.send(resultData(null, 404, '反馈不存在或无权限'));
        }
        res.send(resultData(result));
      })
      .catch((e) => {
        return res.send(resultData(null, 500, '服务器内部错误: ' + e));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};
