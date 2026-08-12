import crypto from 'crypto';
import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { createNotification } from '../util/notification.js';
import { EMAIL_EFFECTIVE_STATUS_SQL, maskEmail } from '../util/emailDelivery.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  AdminActionError,
  adminActionErrorResponse,
  beginAdminAction,
  finishAdminAction,
} from '../util/adminActionExecution.js';

// 后台「通知中心」聚合口径:只统计 root 主动下发的通知(system/other),
// 排除升级 / 反馈回复等系统自动通知。单条 legacy(无 batch_id)按自身 id 独立成组。
const ADMIN_TYPES = ['system', 'other'];
const GROUP_KEY = 'COALESCE(batch_id, id)';
const EMAIL_TYPES = ['verification', 'todo_reminder', 'system'];
const EMAIL_STATUSES = ['sending', 'accepted', 'failed', 'unknown'];
// 聊天室普通消息只驱动入口角标；通用通知中心仅展示回复与显式 @ 两类定向消息。
// 这条过滤同时兜住升级前已生成的旧聊天室通知，避免历史普通消息继续形成通知噪音。
const COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL = `(
  (type <> 'community_chat' AND COALESCE(source_type, '') <> 'community_chat_message')
  OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.kind')), '') IN ('reply', 'mention')
)`;
const COMMUNITY_CHAT_EXCLUDED_SQL =
  "type <> 'community_chat' AND COALESCE(source_type, '') <> 'community_chat_message'";

function parseNotificationMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

async function attachTodoStates(items, userId) {
  const reminderItems = items
    .filter((item) => item.type === 'todo_reminder')
    .map((item) => ({ item, todoId: String(parseNotificationMeta(item.meta)?.todoId || '').trim() }));
  const todoIds = [...new Set(reminderItems.map(({ todoId }) => todoId).filter(Boolean))];
  if (!todoIds.length) {
    reminderItems.forEach(({ item }) => {
      item.todoState = 'unavailable';
    });
    return;
  }

  const placeholders = todoIds.map(() => '?').join(',');
  const [todos] = await pool.query(
    `SELECT id, status FROM todo_items
     WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
    [userId, ...todoIds],
  );
  const statusById = new Map(todos.map((todo) => [String(todo.id), todo.status]));
  reminderItems.forEach(({ item, todoId }) => {
    const status = statusById.get(todoId);
    item.todoState = status === 'pending' || status === 'completed' ? status : 'unavailable';
  });
}

async function ensureRootRole(req, res) {
  const userId = req.user?.id;
  if (!userId || req.user?.role !== 'root' || req.adminContext) {
    res.send(resultData(null, 403, '没有操作权限'));
    return null;
  }
  try {
    const [rows] = await pool.query('SELECT role, del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
    if (!rows[0] || rows[0].role !== 'root' || Number(rows[0].del_flag) !== 0) {
      res.send(resultData(null, 403, '没有操作权限'));
      return null;
    }
    return userId;
  } catch {
    res.send(resultData(null, 500, '校验管理权限失败'));
    return null;
  }
}

function normalizeDateFilter(value) {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : null;
}

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
    const excludeCommunityChat = req.body?.excludeCommunityChat === true;

    const where = ['user_id = ?', 'del_flag = 0', COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL];
    const params = [userId];
    if (excludeCommunityChat) where.push(COMMUNITY_CHAT_EXCLUDED_SQL);
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
    await attachTodoStates(items, userId);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notification WHERE ${whereSql}`, params);
    const [[{ unreadTotal }]] = await pool.query(
      `SELECT COUNT(*) AS unreadTotal
        FROM notification
        WHERE user_id = ? AND is_read = 0 AND del_flag = 0
          AND ${COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL}
          ${excludeCommunityChat ? `AND ${COMMUNITY_CHAT_EXCLUDED_SQL}` : ''}`,
      [userId],
    );
    res.send(resultData({ items, total, unreadTotal, currentPage, pageSize }));
  } catch (error) {
    console.error('[notification] 列表查询失败 code=%s', error?.code || 'UNKNOWN');
    res.send(resultData(null, 500, '获取通知列表失败'));
  }
};

// POST /notification/unreadCount —— 未读总数 + 分类型未读数(铃铛角标 + 各 tab 角标)
export const unreadCount = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData({ unreadTotal: 0, byType: {} }));
  }
  try {
    const excludeCommunityChat = req.body?.excludeCommunityChat === true;
    const [rows] = await pool.query(
      `SELECT type, COUNT(*) AS c FROM notification
       WHERE user_id = ? AND is_read = 0 AND del_flag = 0
         AND ${COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL}
         ${excludeCommunityChat ? `AND ${COMMUNITY_CHAT_EXCLUDED_SQL}` : ''}
       GROUP BY type`,
      [userId],
    );
    const byType = {};
    let unreadTotal = 0;
    for (const r of rows) {
      byType[r.type] = Number(r.c || 0);
      unreadTotal += Number(r.c || 0);
    }
    res.send(resultData({ unreadTotal, byType }));
  } catch {
    res.send(resultData(null, 500, '获取未读数失败'));
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
    const excludeCommunityChat = req.body?.excludeCommunityChat === true;
    const [result] = await pool.query(
      `UPDATE notification SET is_read = 1, read_time = NOW()
       WHERE user_id = ? AND is_read = 0 AND del_flag = 0
         AND ${COMMUNITY_CHAT_TARGETED_NOTIFICATION_SQL}
         ${excludeCommunityChat ? `AND ${COMMUNITY_CHAT_EXCLUDED_SQL}` : ''}`,
      [req.user.id],
    );
    res.send(resultData({ updated: result.affectedRows || 0 }));
  } catch {
    res.send(resultData(null, 500, '标记全部已读失败'));
  }
};

// POST /notification/send —— 管理员发通知(仅 root)
// 接收人四选一:toAll(全体非游客) / role(按角色) / userIds(多选) / userId(单发)。
// 同一次发送共享 batch_id,便于后台按批查看已读率与撤回。
export const send = async (req, res) => {
  const {
    userId,
    userIds,
    toAll = false,
    role = null,
    type = 'system',
    title,
    content = null,
    link = null,
  } = req.body || {};
  if (!title || !title.trim()) {
    return res.send(resultData(null, 400, '通知标题不能为空'));
  }
  if (!ADMIN_TYPES.includes(type)) {
    return res.send(resultData(null, 400, '通知类型不合法'));
  }
  let actionContext = null;
  let connection = null;
  try {
    const batchId = crypto.randomUUID();
    const recipientScope = toAll ? 'all' : role ? 'role' : Array.isArray(userIds) && userIds.length ? 'users' : 'user';
    actionContext = await beginAdminAction(req, {
      action: 'notification.send',
      targetId: batchId,
      expectedConfirmText: '确认发送通知',
      metadata: { recipientScope, type, titleLength: title.trim().length },
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    let recipients = [];
    if (toAll) {
      const [users] = await connection.query("SELECT id FROM user WHERE del_flag = 0 AND role != 'visitor'");
      recipients = users.map((u) => u.id);
    } else if (role) {
      const [users] = await connection.query('SELECT id FROM user WHERE del_flag = 0 AND role = ?', [role]);
      recipients = users.map((u) => u.id);
    } else if (Array.isArray(userIds) && userIds.length) {
      recipients = [...new Set(userIds.filter(Boolean))];
    } else if (userId) {
      recipients = [userId];
    } else {
      throw new AdminActionError('NOTIFICATION_RECIPIENT_REQUIRED', '缺少接收用户');
    }
    if (!recipients.length) {
      throw new AdminActionError('NOTIFICATION_RECIPIENT_EMPTY', '没有匹配的接收用户');
    }
    const payload = { type, title: title.trim(), content, link, batchId };
    // 用户量小,循环写入即可(与原实现一致)
    for (const uid of recipients) {
      await createNotification(uid, payload, connection);
    }
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: { recipientCount: recipients.length },
      db: connection,
    });
    await connection.commit();
    return res.send(resultData({ sent: recipients.length, batchId, ...receipt }));
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始业务错误。
      }
    }
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {
        // 审计工具已记录安全错误码。
      }
    }
    const response = adminActionErrorResponse(error, '发送通知失败');
    return res.send(resultData({ code: response.code }, response.status, response.message));
  } finally {
    connection?.release();
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
       FROM notification WHERE ${typeIn} AND COALESCE(admin_archived, 0) = 0
       GROUP BY ${GROUP_KEY}
       ORDER BY createTime DESC
       LIMIT ? OFFSET ?`,
      [...ADMIN_TYPES, pageSize, offset],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT ${GROUP_KEY} FROM notification
         WHERE ${typeIn} AND COALESCE(admin_archived, 0) = 0
         GROUP BY ${GROUP_KEY}
       ) t`,
      ADMIN_TYPES,
    );
    res.send(resultData({ items, total, currentPage, pageSize }));
  } catch (e) {
    res.send(resultData(null, 500, '获取发送记录失败: ' + e.message));
  }
};

// POST /notification/admin/recall —— 撤回一个批次(软删该批全部;仅 root)
export const adminRecall = async (req, res) => {
  const { batchId } = req.body || {};
  if (!batchId) return res.send(resultData(null, 400, '缺少批次标识'));
  let actionContext = null;
  let connection = null;
  try {
    actionContext = await beginAdminAction(req, {
      action: 'notification.recall',
      targetId: batchId,
      expectedConfirmText: '确认撤回通知',
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // 撤回 = 置 recalled=1 + 软删。兼容 legacy 单条(无 batch_id,批次键即自身 id):batch_id 命中 或 id 命中。
    const [r] = await connection.query(
      'UPDATE notification SET recalled = 1, del_flag = 1 WHERE (batch_id = ? OR id = ?) AND recalled = 0',
      [batchId, batchId],
    );
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: { affectedRows: Number(r.affectedRows || 0) },
      db: connection,
    });
    await connection.commit();
    return res.send(resultData({ recalled: r.affectedRows || 0, ...receipt }));
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {}
    }
    const response = adminActionErrorResponse(error, '撤回通知失败');
    return res.send(resultData({ code: response.code }, response.status, response.message));
  } finally {
    connection?.release();
  }
};

// POST /notification/admin/delete —— 兼容旧路径：归档批次并保留发送、阅读与审计依据。
export const adminDelete = async (req, res) => {
  const { batchId } = req.body || {};
  if (!batchId) return res.send(resultData(null, 400, '缺少批次标识'));
  let actionContext = null;
  let connection = null;
  try {
    actionContext = await beginAdminAction(req, {
      action: 'notification.archive',
      targetId: batchId,
      expectedConfirmText: '确认归档通知',
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const typePlaceholders = ADMIN_TYPES.map(() => '?').join(',');
    const [result] = await connection.query(
      `UPDATE notification
       SET recalled = 1, del_flag = 1, admin_archived = 1
       WHERE (batch_id = ? OR id = ?) AND type IN (${typePlaceholders})`,
      [batchId, batchId, ...ADMIN_TYPES],
    );
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: { affectedRows: Number(result.affectedRows || 0), archived: true },
      db: connection,
    });
    await connection.commit();
    return res.send(resultData({ archived: result.affectedRows || 0, deleted: result.affectedRows || 0, ...receipt }));
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {}
    }
    const response = adminActionErrorResponse(error, '归档通知记录失败');
    return res.send(resultData({ code: response.code }, response.status, response.message));
  } finally {
    connection?.release();
  }
};

// POST /notification/admin/recipients —— 某批次的接收者与已读明细(仅 root)
// 用于发送记录里「点击查看发给谁、谁已读谁未读」。含 recalled(软删)行,便于撤回后回看当时的接收者。
export const adminBatchRecipients = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  const { batchId } = req.body || {};
  if (!batchId) return res.send(resultData(null, 400, '缺少批次标识'));
  try {
    const typePlaceholders = ADMIN_TYPES.map(() => '?').join(',');
    // 兼容 legacy 单条(无 batch_id,批次键即自身 id):batch_id 命中 或 id 命中。未读在前,方便催阅。
    const [items] = await pool.query(
      `SELECT n.user_id AS userId, n.is_read AS isRead, n.read_time AS readTime, u.alias, u.email, u.role
       FROM notification n
       LEFT JOIN user u ON u.id = n.user_id
       WHERE (n.batch_id = ? OR n.id = ?) AND n.type IN (${typePlaceholders})
       ORDER BY n.is_read ASC, n.read_time DESC, u.alias ASC`,
      [batchId, batchId, ...ADMIN_TYPES],
    );
    const readCount = items.reduce((acc, r) => acc + (Number(r.isRead) === 1 ? 1 : 0), 0);
    res.send(resultData({ items, total: items.length, readCount }));
  } catch (e) {
    res.send(resultData(null, 500, '获取接收明细失败: ' + e.message));
  }
};

// POST /notification/admin/email/stats —— 今日邮件 SMTP 投递概览（仅 root 普通上下文）
export const adminEmailStats = async (req, res) => {
  if (!(await ensureRootRole(req, res))) return;
  try {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM((${EMAIL_EFFECTIVE_STATUS_SQL}) = 'accepted'), 0) AS accepted,
              COALESCE(SUM((${EMAIL_EFFECTIVE_STATUS_SQL}) = 'failed'), 0) AS failed,
              COALESCE(SUM((${EMAIL_EFFECTIVE_STATUS_SQL}) = 'unknown'), 0) AS unknownCount
       FROM email_delivery_logs e
       WHERE e.create_time >= CURDATE()`,
    );
    return res.send(
      resultData({
        total: Number(row?.total || 0),
        accepted: Number(row?.accepted || 0),
        failed: Number(row?.failed || 0),
        unknown: Number(row?.unknownCount || 0),
      }),
    );
  } catch {
    return res.send(resultData(null, 500, '获取邮件发送概览失败'));
  }
};

// POST /notification/admin/email/list —— 邮件投递记录分页与筛选（仅 root 普通上下文）
export const adminEmailList = async (req, res) => {
  if (!(await ensureRootRole(req, res))) return;
  try {
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 20, 1), 50);
    const currentPage = Math.max(Number(req.body?.currentPage) || 1, 1);
    const offset = (currentPage - 1) * pageSize;
    const emailType = String(req.body?.emailType || '').trim();
    const status = String(req.body?.status || '').trim();
    const keyword = String(req.body?.keyword || '')
      .trim()
      .slice(0, 100);
    const startDate = normalizeDateFilter(req.body?.startDate);
    const endDate = normalizeDateFilter(req.body?.endDate);
    const where = ['1 = 1'];
    const params = [];

    if (emailType && emailType !== 'all') {
      if (!EMAIL_TYPES.includes(emailType)) return res.send(resultData(null, 400, '邮件类型不合法'));
      where.push('e.email_type = ?');
      params.push(emailType);
    }
    if (status && status !== 'all') {
      if (!EMAIL_STATUSES.includes(status)) return res.send(resultData(null, 400, '邮件状态不合法'));
      where.push(`(${EMAIL_EFFECTIVE_STATUS_SQL}) = ?`);
      params.push(status);
    }
    if (keyword) {
      where.push('(e.recipient_email LIKE ? OR e.subject LIKE ? OR u.alias LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
    if (startDate) {
      where.push('e.create_time >= ?');
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      where.push('e.create_time < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(`${endDate} 00:00:00`);
    }
    const whereSql = where.join(' AND ');
    const [items] = await pool.query(
      `SELECT e.id, e.email_type AS emailType, e.user_id AS userId,
              e.recipient_email AS recipientEmail, e.subject,
              e.business_type AS businessType, e.business_id AS businessId,
              (${EMAIL_EFFECTIVE_STATUS_SQL}) AS status, e.attempt_no AS attemptNo,
              e.accepted_at AS acceptedAt, e.create_time AS createTime, e.update_time AS updateTime,
              u.alias
       FROM email_delivery_logs e
       LEFT JOIN user u ON u.id = e.user_id
       WHERE ${whereSql}
       ORDER BY e.create_time DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM email_delivery_logs e
       LEFT JOIN user u ON u.id = e.user_id
       WHERE ${whereSql}`,
      params,
    );
    const safeItems = items.map((item) => ({
      ...item,
      recipientEmail: maskEmail(item.recipientEmail),
    }));
    return res.send(resultData({ items: safeItems, total: Number(total || 0), currentPage, pageSize }));
  } catch {
    return res.send(resultData(null, 500, '获取邮件发送记录失败'));
  }
};

// POST /notification/admin/email/detail —— 单封邮件投递详情（仅 root 普通上下文）
export const adminEmailDetail = async (req, res) => {
  if (!(await ensureRootRole(req, res))) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, '缺少邮件记录标识'));
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.email_type AS emailType, e.user_id AS userId,
              e.recipient_email AS recipientEmail, e.subject,
              e.business_type AS businessType, e.business_id AS businessId,
              e.provider, (${EMAIL_EFFECTIVE_STATUS_SQL}) AS status,
              e.attempt_no AS attemptNo, e.provider_message_id AS providerMessageId,
              e.provider_response AS providerResponse, e.error_code AS errorCode,
              e.error_message AS errorMessage, e.accepted_at AS acceptedAt,
              e.create_time AS createTime, e.update_time AS updateTime,
              u.alias, t.title AS todoTitle
       FROM email_delivery_logs e
       LEFT JOIN user u ON u.id = e.user_id
       LEFT JOIN todo_items t ON e.business_type = 'todo' AND t.id = e.business_id
       WHERE e.id = ?
       LIMIT 1`,
      [id],
    );
    if (!rows[0]) return res.send(resultData(null, 404, '邮件记录不存在'));
    return res.send(resultData(rows[0]));
  } catch {
    return res.send(resultData(null, 500, '获取邮件详情失败'));
  }
};
