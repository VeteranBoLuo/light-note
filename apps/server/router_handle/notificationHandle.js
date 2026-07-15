import crypto from 'crypto';
import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { createNotification } from '../util/notification.js';

// 后台「通知中心」聚合口径:只统计 root 主动下发的通知(system/other),
// 排除升级 / 反馈回复等系统自动通知。单条 legacy(无 batch_id)按自身 id 独立成组。
const ADMIN_TYPES = ['system', 'other'];
const GROUP_KEY = 'COALESCE(batch_id, id)';

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
      if (type === 'other') {
        // 「其他」tab 作兜底:除三大已知类型外的所有(如 streak_risk 签到提醒),避免新增类型无处归类
        where.push("type NOT IN ('level_up', 'opinion_reply', 'system')");
      } else {
        where.push('type = ?');
        params.push(type);
      }
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

// POST /notification/unreadCount —— 未读总数 + 分类型未读数(铃铛角标 + 各 tab 角标)
export const unreadCount = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData({ unreadTotal: 0, byType: {} }));
  }
  try {
    const [rows] = await pool.query(
      `SELECT type, COUNT(*) AS c FROM notification
       WHERE user_id = ? AND is_read = 0 AND del_flag = 0 GROUP BY type`,
      [userId],
    );
    const byType = {};
    let unreadTotal = 0;
    for (const r of rows) {
      byType[r.type] = Number(r.c || 0);
      unreadTotal += Number(r.c || 0);
    }
    res.send(resultData({ unreadTotal, byType }));
  } catch (e) {
    res.send(resultData(null, 500, '获取未读数失败: ' + e.message));
  }
};

// POST /notification/delete —— 删除(软删)自己的通知(body.ids 数组)
// 用户删除 = 视为已读(顺带 is_read=1),但绝不置 recalled —— 撤回是管理员行为,二者语义不同。
export const remove = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = req.user.id;
  const { ids = [] } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.send(resultData({ deleted: 0 }));
  }
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE notification
       SET del_flag = 1, is_read = 1, read_time = COALESCE(read_time, NOW())
       WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
      [userId, ...ids],
    );
    res.send(resultData({ deleted: result.affectedRows || 0 }));
  } catch (e) {
    res.send(resultData(null, 500, '删除通知失败: ' + e.message));
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

// POST /notification/send —— 管理员发通知(仅 root)
// 接收人四选一:toAll(全体非游客) / role(按角色) / userIds(多选) / userId(单发)。
// 同一次发送共享 batch_id,便于后台按批查看已读率与撤回。
export const send = async (req, res) => {
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }
  const { userId, userIds, toAll = false, role = null, type = 'system', title, content = null, link = null } = req.body || {};
  if (!title || !title.trim()) {
    return res.send(resultData(null, 400, '通知标题不能为空'));
  }
  if (!ADMIN_TYPES.includes(type)) {
    return res.send(resultData(null, 400, '通知类型不合法'));
  }
  try {
    let recipients = [];
    if (toAll) {
      const [users] = await pool.query("SELECT id FROM user WHERE del_flag = 0 AND role != 'visitor'");
      recipients = users.map((u) => u.id);
    } else if (role) {
      const [users] = await pool.query('SELECT id FROM user WHERE del_flag = 0 AND role = ?', [role]);
      recipients = users.map((u) => u.id);
    } else if (Array.isArray(userIds) && userIds.length) {
      recipients = [...new Set(userIds.filter(Boolean))];
    } else if (userId) {
      recipients = [userId];
    } else {
      return res.send(resultData(null, 400, '缺少接收用户'));
    }
    if (!recipients.length) {
      return res.send(resultData(null, 400, '没有匹配的接收用户'));
    }
    const batchId = crypto.randomUUID();
    const payload = { type, title: title.trim(), content, link, batchId };
    // 用户量小,循环写入即可(与原实现一致)
    for (const uid of recipients) {
      await createNotification(uid, payload);
    }
    res.send(resultData({ sent: recipients.length, batchId }));
  } catch (e) {
    res.send(resultData(null, 500, '发送通知失败: ' + e.message));
  }
};

// POST /notification/admin/stats —— 后台通知中心概览(仅 root)
export const adminStats = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const typeIn = `type IN (${ADMIN_TYPES.map(() => '?').join(',')})`;
    const [[s]] = await pool.query(
      `SELECT COUNT(*) AS totalSent, COALESCE(SUM(is_read), 0) AS totalRead, COALESCE(SUM(recalled), 0) AS totalRecalled
       FROM notification WHERE ${typeIn}`,
      ADMIN_TYPES,
    );
    const [[b]] = await pool.query(
      `SELECT COUNT(*) AS batches FROM (SELECT ${GROUP_KEY} g FROM notification WHERE ${typeIn} GROUP BY ${GROUP_KEY}) t`,
      ADMIN_TYPES,
    );
    res.send(
      resultData({
        totalSent: Number(s.totalSent || 0),
        totalRead: Number(s.totalRead || 0),
        totalRecalled: Number(s.totalRecalled || 0),
        batches: Number(b.batches || 0),
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '获取通知概览失败: ' + e.message));
  }
};

// POST /notification/admin/list —— 后台发送记录(按批聚合 + 已读率 + 撤回态;仅 root)
export const adminList = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 10, 1), 50);
    const currentPage = Math.max(Number(req.body?.currentPage) || 1, 1);
    const offset = (currentPage - 1) * pageSize;
    const typeIn = `type IN (${ADMIN_TYPES.map(() => '?').join(',')})`;
    const [items] = await pool.query(
      `SELECT ${GROUP_KEY} AS batchId, MIN(type) AS type, MIN(title) AS title, MIN(content) AS content, MIN(link) AS link,
              COUNT(*) AS recipients, COALESCE(SUM(is_read), 0) AS readCount, MAX(recalled) AS recalled, MIN(create_time) AS createTime
       FROM notification WHERE ${typeIn}
       GROUP BY ${GROUP_KEY}
       ORDER BY createTime DESC
       LIMIT ? OFFSET ?`,
      [...ADMIN_TYPES, pageSize, offset],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (SELECT ${GROUP_KEY} FROM notification WHERE ${typeIn} GROUP BY ${GROUP_KEY}) t`,
      ADMIN_TYPES,
    );
    res.send(resultData({ items, total, currentPage, pageSize }));
  } catch (e) {
    res.send(resultData(null, 500, '获取发送记录失败: ' + e.message));
  }
};

// POST /notification/admin/recall —— 撤回一个批次(软删该批全部;仅 root)
export const adminRecall = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  const { batchId } = req.body || {};
  if (!batchId) return res.send(resultData(null, 400, '缺少批次标识'));
  try {
    // 撤回 = 置 recalled=1 + 软删。兼容 legacy 单条(无 batch_id,批次键即自身 id):batch_id 命中 或 id 命中。
    const [r] = await pool.query(
      'UPDATE notification SET recalled = 1, del_flag = 1 WHERE (batch_id = ? OR id = ?) AND recalled = 0',
      [batchId, batchId],
    );
    res.send(resultData({ recalled: r.affectedRows || 0 }));
  } catch (e) {
    res.send(resultData(null, 500, '撤回失败: ' + e.message));
  }
};

// POST /notification/admin/delete —— 删除一个管理员发送批次(同时具备撤回效果;仅 root)
export const adminDelete = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  const { batchId } = req.body || {};
  if (!batchId) return res.send(resultData(null, 400, '缺少批次标识'));
  try {
    const typePlaceholders = ADMIN_TYPES.map(() => '?').join(',');
    // 硬删除整批记录即可原子完成「撤回 + 从发送记录移除」。类型白名单避免误删升级、反馈等自动通知。
    const [result] = await pool.query(
      `DELETE FROM notification
       WHERE (batch_id = ? OR id = ?) AND type IN (${typePlaceholders})`,
      [batchId, batchId, ...ADMIN_TYPES],
    );
    res.send(resultData({ deleted: result.affectedRows || 0 }));
  } catch (e) {
    res.send(resultData(null, 500, '删除通知记录失败: ' + e.message));
  }
};
