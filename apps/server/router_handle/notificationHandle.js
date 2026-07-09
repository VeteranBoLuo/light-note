import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { createNotification } from '../util/notification.js';

// POST /notification/list —— 分页列表 + 总数 + 未读数(可按 type 筛选;游客返回空)
export const list = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData({ items: [], total: 0, unreadTotal: 0, currentPage: 1, pageSize: 20 }));
  }
  try {
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 20, 1), 50);
    const currentPage = Math.max(Number(req.body?.currentPage) || 1, 1);
    const offset = (currentPage - 1) * pageSize;
    const type = req.body?.type;

    const where = ['user_id = ?', 'del_flag = 0'];
    const params = [userId];
    if (type && type !== 'all') {
      where.push('type = ?');
      params.push(type);
    }
    const whereSql = where.join(' AND ');

    const [items] = await pool.query(
      `SELECT id, type, title, content, link, meta, is_read, create_time
       FROM notification WHERE ${whereSql}
       ORDER BY create_time DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notification WHERE ${whereSql}`, params);
    const [[{ unreadTotal }]] = await pool.query(
      `SELECT COUNT(*) AS unreadTotal FROM notification WHERE user_id = ? AND is_read = 0 AND del_flag = 0`,
      [userId],
    );
    res.send(resultData({ items, total, unreadTotal, currentPage, pageSize }));
  } catch (e) {
    res.send(resultData(null, 500, '获取通知列表失败: ' + e.message));
  }
};

// POST /notification/unreadCount —— 仅未读数(铃铛角标轮询,轻量)
export const unreadCount = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData({ unreadTotal: 0 }));
  }
  try {
    const [[{ unreadTotal }]] = await pool.query(
      `SELECT COUNT(*) AS unreadTotal FROM notification WHERE user_id = ? AND is_read = 0 AND del_flag = 0`,
      [userId],
    );
    res.send(resultData({ unreadTotal }));
  } catch (e) {
    res.send(resultData(null, 500, '获取未读数失败: ' + e.message));
  }
};

// POST /notification/markRead —— 标记指定通知已读(body.ids 数组;仅限本人)
export const markRead = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  const { ids = [] } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.send(resultData({ updated: 0 }));
  }
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE notification SET is_read = 1, read_time = NOW()
       WHERE user_id = ? AND is_read = 0 AND del_flag = 0 AND id IN (${placeholders})`,
      [userId, ...ids],
    );
    res.send(resultData({ updated: result.affectedRows || 0 }));
  } catch (e) {
    res.send(resultData(null, 500, '标记已读失败: ' + e.message));
  }
};

// POST /notification/markAllRead —— 全部已读(仅本人未读)
export const markAllRead = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const [result] = await pool.query(
      `UPDATE notification SET is_read = 1, read_time = NOW()
       WHERE user_id = ? AND is_read = 0 AND del_flag = 0`,
      [req.user.id],
    );
    res.send(resultData({ updated: result.affectedRows || 0 }));
  } catch (e) {
    res.send(resultData(null, 500, '标记全部已读失败: ' + e.message));
  }
};

// POST /notification/send —— 管理员给指定用户或全体发通知(仅 root)
export const send = async (req, res) => {
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }
  const { userId, toAll = false, type = 'system', title, content = null, link = null } = req.body || {};
  if (!title || !title.trim()) {
    return res.send(resultData(null, 400, '通知标题不能为空'));
  }
  try {
    if (toAll) {
      // 群发:发给所有非游客用户(用户量小,循环写入即可)
      const [users] = await pool.query("SELECT id FROM user WHERE del_flag = 0 AND role != 'visitor'");
      for (const u of users) {
        await createNotification(u.id, { type, title: title.trim(), content, link });
      }
      return res.send(resultData({ sent: users.length }));
    }
    if (!userId) {
      return res.send(resultData(null, 400, '缺少接收用户'));
    }
    await createNotification(userId, { type, title: title.trim(), content, link });
    res.send(resultData({ sent: 1 }));
  } catch (e) {
    res.send(resultData(null, 500, '发送通知失败: ' + e.message));
  }
};
