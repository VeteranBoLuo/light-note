import crypto from 'node:crypto';
import pool from '../db/index.js';
import { resultData, insertData, INTERNAL_ROLES, L } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { createNotification } from '../util/notification.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { recordAdminOperationAudit } from '../util/adminOperationAudit.js';

const OPINION_STATUS = {
  PENDING: 'pending',
  REPLIED: 'replied',
  VIEWED: 'viewed',
};
const OPINION_STATUS_VALUES = new Set(Object.values(OPINION_STATUS));
const MAX_PAGE_SIZE = 100;
const MAX_FILTER_KEY_LENGTH = 200;

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requestId(req) {
  const current = String(req?.requestId || '').trim();
  return current ? current.slice(0, 64) : crypto.randomUUID();
}

function normalizeOpinionFilters(value) {
  const filters = value && typeof value === 'object' ? value : {};
  const status = String(filters.status || '').trim();
  const opinionId = String(filters.opinionId || '').trim();
  const key = String(filters.key || '').trim();
  if (status && !OPINION_STATUS_VALUES.has(status)) return null;
  if (opinionId.length > 255 || key.length > MAX_FILTER_KEY_LENGTH) return null;
  return {
    status,
    opinionId,
    key,
    hideInternal: filters.hideInternal !== false,
  };
}

function auditReason(value, fallback) {
  return (
    String(value || fallback || '')
      .trim()
      .slice(0, 500) || fallback
  );
}

export const recordOpinion = async (req, res) => {
  const userId = req.user?.id;
  const insertSql = 'INSERT INTO opinion SET ?';
  const type = String(req.body?.type || '').trim();
  const content = String(req.body?.content || '').trim();
  if (!type) {
    return res.send(resultData(null, 400, '请选择反馈类型'));
  }
  if (content.length < 6 || content.length > 500) {
    return res.send(resultData(null, 400, '反馈内容需为 6 至 500 个字符'));
  }
  // 字段白名单:此前 params = req.body 整体入库(mass-assignment),请求体可直写任意列(如 reply_content/status)
  const params = {
    type,
    content,
    imgArray: req.body?.imgArray,
    phone: req.body?.phone,
    userId,
    status: OPINION_STATUS.PENDING,
    replyViewed: 0,
  };
  try {
    await pool.query(insertSql, [insertData(params)]);
    res.send(resultData('反馈成功'));
  } catch (err) {
    console.error('[opinion] 记录反馈失败 code=%s', stableAgentErrorCode(err));
    res.send(resultData(null, 500, '提交失败，请稍后重试'));
  }
};

export const getOpinionList = async (req, res) => {
  const pageSize = Math.min(positiveInteger(req.body?.pageSize), MAX_PAGE_SIZE);
  const currentPage = positiveInteger(req.body?.currentPage);
  const filters = normalizeOpinionFilters(req.body?.filters);
  const currentUserId = req.user?.id;
  const role = req.user?.role;
  const requestedUserId = String(req.body?.userId || '').trim();
  const targetUserId = role === 'root' ? requestedUserId || undefined : currentUserId;
  const skip = pageSize * (currentPage - 1);

  if (!pageSize || !currentPage || !filters || requestedUserId.length > 255 || !Number.isSafeInteger(skip)) {
    return res.send(resultData(null, 400, L(req, '分页或筛选参数不合法', 'Invalid pagination or filters')));
  }

  if (role !== 'root' && !currentUserId) {
    return res.send(resultData(null, 400, L(req, '缺少用户信息', 'Missing user information')));
  }

  try {
    // 隐藏内部账号(root/test):仅 root 查看全部反馈(未指定某用户)时生效;查指定用户或普通用户看自己时不过滤
    const applyRoleFilter = role === 'root' && targetUserId === undefined && filters.hideInternal;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const internalRoleClause = `(u.role IS NULL OR u.role NOT IN (${rolePh}))`;
    const whereClauses = [];
    const whereParams = [];

    if (targetUserId !== undefined) {
      whereClauses.push('o.user_id = ?');
      whereParams.push(targetUserId);
    }

    if (filters.key) {
      whereClauses.push(
        "(u.alias LIKE ? OR o.phone LIKE ? OR o.content LIKE ? OR o.type LIKE ? OR COALESCE(o.reply_content, '') LIKE ?)",
      );
      const keyValue = `%${filters.key}%`;
      whereParams.push(keyValue, keyValue, keyValue, keyValue, keyValue);
    }

    if (filters.status) {
      whereClauses.push('o.status = ?');
      whereParams.push(filters.status);
    }

    if (filters.opinionId) {
      whereClauses.push('o.id = ?');
      whereParams.push(filters.opinionId);
    }

    if (applyRoleFilter) {
      whereClauses.push(internalRoleClause);
      whereParams.push(...INTERNAL_ROLES);
    }

    const filteredWhere = whereClauses.length ? ` AND ${whereClauses.join(' AND ')}` : '';
    const summaryClauses = [];
    const summaryParams = [];
    if (targetUserId !== undefined) {
      summaryClauses.push('o.user_id = ?');
      summaryParams.push(targetUserId);
    }
    if (applyRoleFilter) {
      summaryClauses.push(internalRoleClause);
      summaryParams.push(...INTERNAL_ROLES);
    }
    const summaryWhere = summaryClauses.length ? ` AND ${summaryClauses.join(' AND ')}` : '';

    const [itemsResult, totalResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT o.*, u.alias
           FROM opinion o
           LEFT JOIN user u ON o.user_id = u.id
          WHERE o.del_flag = 0${filteredWhere}
          ORDER BY o.create_time DESC, o.id DESC
          LIMIT ? OFFSET ?`,
        [...whereParams, pageSize, skip],
      ),
      pool.query(
        `SELECT COUNT(*) AS total
           FROM opinion o
           LEFT JOIN user u ON o.user_id = u.id
          WHERE o.del_flag = 0${filteredWhere}`,
        whereParams,
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(o.status = ?), 0) AS pending_total,
           COALESCE(SUM(o.status = ?), 0) AS replied_total,
           COALESCE(SUM(o.status = ?), 0) AS viewed_total
           FROM opinion o
           LEFT JOIN user u ON o.user_id = u.id
          WHERE o.del_flag = 0${summaryWhere}`,
        [OPINION_STATUS.PENDING, OPINION_STATUS.REPLIED, OPINION_STATUS.VIEWED, ...summaryParams],
      ),
    ]);
    return res.send(
      resultData({
        items: itemsResult[0],
        total: Number(totalResult[0][0]?.total || 0),
        summary: summaryResult[0][0] || { pending_total: 0, replied_total: 0, viewed_total: 0 },
      }),
    );
  } catch (error) {
    console.error('[opinion] list failed code=%s', stableAgentErrorCode(error));
    return res.send(
      resultData(null, 500, L(req, '反馈列表加载失败，请稍后重试', 'Could not load feedback. Please try again.')),
    );
  }
};

export const replyOpinion = async (req, res) => {
  const role = req.user?.role;
  if (role !== 'root' || req.adminContext) {
    return res.send(resultData(null, 403, L(req, '没有操作权限', 'You do not have permission for this action')));
  }

  const id = String(req.body?.id || '').trim();
  const replyContent = String(req.body?.replyContent || '').trim();
  if (!id || id.length > 255 || !replyContent) {
    return res.send(resultData(null, 400, L(req, '回复内容不能为空', 'Reply content is required')));
  }
  if (replyContent.length > 2_000) {
    return res.send(
      resultData(null, 400, L(req, '回复内容不能超过 2000 个字符', 'Reply content cannot exceed 2,000 characters')),
    );
  }

  const operationRequestId = requestId(req);
  let connection;
  let notificationTarget = null;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT o.id, o.user_id, o.status,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.notifyOpinionReply')), 'true') AS notify_pref
         FROM opinion o
         LEFT JOIN user u ON u.id = o.user_id
        WHERE o.id = ? AND o.del_flag = 0
        FOR UPDATE`,
      [id],
    );
    const before = rows[0];
    if (!before) {
      await connection.rollback();
      return res.send(resultData(null, 404, L(req, '反馈不存在或已删除', 'Feedback does not exist or was deleted')));
    }

    const [result] = await connection.query(
      `UPDATE opinion
          SET reply_content = ?, reply_time = NOW(), reply_viewed = 0,
              viewed_time = NULL, status = ?
        WHERE id = ? AND del_flag = 0`,
      [replyContent, OPINION_STATUS.REPLIED, id],
    );
    const [updatedRows] = await connection.query(
      `SELECT id, status, reply_content, reply_time, reply_viewed, viewed_time
         FROM opinion
        WHERE id = ? AND del_flag = 0
        LIMIT 1`,
      [id],
    );
    const auditId = await recordAdminOperationAudit(
      {
        actorUserId: req.user.id,
        action: 'opinion.reply',
        targetType: 'opinion',
        targetId: id,
        outcome: 'succeeded',
        reason: auditReason(req.body?.reason, '管理员回复用户反馈'),
        requestId: operationRequestId,
        ip: req.ip,
        metadata: {
          previousStatus: before.status,
          resultingStatus: OPINION_STATUS.REPLIED,
          affectedRows: Number(result.affectedRows || 0),
          notificationPreferred: before.notify_pref !== 'false',
        },
      },
      { db: connection },
    );
    await connection.commit();
    notificationTarget =
      before.user_id && before.notify_pref !== 'false' ? { userId: before.user_id, opinionId: id } : null;

    let notificationCreated = null;
    if (notificationTarget) {
      notificationCreated = false;
      try {
        await createNotification(notificationTarget.userId, {
          type: 'opinion_reply',
          title: '你的反馈收到新回复',
          content: replyContent,
          link: '/opinions?tab=history&markViewed=1',
          meta: { opinionId: notificationTarget.opinionId },
        });
        notificationCreated = true;
      } catch (error) {
        console.warn('[opinion] reply notification failed code=%s', stableAgentErrorCode(error));
      }
    }

    return res.send(
      resultData({
        opinion: updatedRows[0] || {
          id,
          status: OPINION_STATUS.REPLIED,
          reply_content: replyContent,
          reply_viewed: 0,
          viewed_time: null,
        },
        affectedRows: Number(result.affectedRows || 0),
        requestId: operationRequestId,
        auditId: auditId || null,
        notificationCreated,
      }),
    );
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {}
    console.error('[opinion] reply failed code=%s', stableAgentErrorCode(error));
    await recordAdminOperationAudit({
      actorUserId: req.user?.id,
      action: 'opinion.reply',
      targetType: 'opinion',
      targetId: id,
      outcome: 'failed',
      reason: auditReason(req.body?.reason, '管理员回复用户反馈'),
      requestId: operationRequestId,
      ip: req.ip,
      metadata: { errorCode: stableAgentErrorCode(error) },
    });
    return res.send(
      resultData(null, 500, L(req, '回复保存失败，请稍后重试', 'Could not save the reply. Please try again.')),
    );
  } finally {
    connection?.release();
  }
};

export const markOpinionReplyViewed = async (req, res) => {
  const userId = req.user?.id;
  const inputIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = [...new Set(inputIds.map((id) => String(id || '').trim()).filter(Boolean))];

  if (!userId) {
    return res.send(resultData(null, 400, L(req, '缺少用户信息', 'Missing user information')));
  }
  if (ids.length > 100 || ids.some((id) => id.length > 255)) {
    return res.send(resultData(null, 400, L(req, '反馈标识不合法', 'Invalid feedback identifier')));
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
  } catch (error) {
    console.error('[opinion] mark viewed failed code=%s', stableAgentErrorCode(error));
    return res.send(
      resultData(
        null,
        500,
        L(req, '反馈状态更新失败，请稍后重试', 'Could not update feedback status. Please try again.'),
      ),
    );
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
  } catch (error) {
    console.error('[opinion] notice failed code=%s', stableAgentErrorCode(error));
    return res.send(
      resultData(null, 500, L(req, '反馈提醒加载失败，请稍后重试', 'Could not load feedback notifications.')),
    );
  }
};

export const delOpinion = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id || id.length > 255) {
    return res.send(resultData(null, 400, L(req, '反馈标识不合法', 'Invalid feedback identifier')));
  }

  const isAdmin = req.user?.role === 'root' && !req.adminContext;
  const operationRequestId = requestId(req);
  const reason = isAdmin ? auditReason(req.body?.reason, '') : '用户删除自己的反馈';
  if (req.user?.role === 'root' && !isAdmin) {
    return res.send(
      resultData(
        null,
        403,
        L(req, '管理员预览上下文不能删除反馈', 'Feedback cannot be deleted from administrator preview'),
      ),
    );
  }
  if (isAdmin && reason.length < 6) {
    return res.send(
      resultData(
        null,
        400,
        L(req, '请填写至少 6 个字符的删除原因', 'Enter a deletion reason of at least 6 characters'),
      ),
    );
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, user_id, status
         FROM opinion
        WHERE id = ? AND del_flag = 0${isAdmin ? '' : ' AND user_id = ?'}
        FOR UPDATE`,
      isAdmin ? [id] : [id, req.user.id],
    );
    const before = rows[0];
    if (!before) {
      await connection.rollback();
      return res.send(
        resultData(null, 404, L(req, '反馈不存在或无权限', 'Feedback does not exist or is not accessible')),
      );
    }
    const [result] = await connection.query('UPDATE opinion SET del_flag = 1 WHERE id = ? AND del_flag = 0', [id]);
    let auditId = null;
    if (isAdmin) {
      auditId = await recordAdminOperationAudit(
        {
          actorUserId: req.user.id,
          action: 'opinion.delete',
          targetType: 'opinion',
          targetId: id,
          outcome: 'succeeded',
          reason,
          requestId: operationRequestId,
          ip: req.ip,
          metadata: {
            previousStatus: before.status,
            affectedRows: Number(result.affectedRows || 0),
          },
        },
        { db: connection, required: true },
      );
    }
    await connection.commit();
    return res.send(
      resultData({
        affectedRows: Number(result.affectedRows || 0),
        deleted: true,
        requestId: isAdmin ? operationRequestId : null,
        auditId: auditId || null,
      }),
    );
  } catch (error) {
    try {
      await connection?.rollback();
    } catch {}
    console.error('[opinion] delete failed code=%s', stableAgentErrorCode(error));
    if (isAdmin) {
      await recordAdminOperationAudit({
        actorUserId: req.user?.id,
        action: 'opinion.delete',
        targetType: 'opinion',
        targetId: id,
        outcome: 'failed',
        reason,
        requestId: operationRequestId,
        ip: req.ip,
        metadata: { errorCode: stableAgentErrorCode(error) },
      });
    }
    const status = error?.code === 'ADMIN_AUDIT_UNAVAILABLE' ? 503 : 500;
    const msg =
      status === 503
        ? L(req, '管理员审计暂不可用，删除已阻断', 'Administrator audit is unavailable, so deletion was blocked')
        : L(req, '反馈删除失败，请稍后重试', 'Could not delete feedback. Please try again.');
    return res.send(resultData(null, status, msg));
  } finally {
    connection?.release();
  }
};

export const opinionHandleInternals = {
  MAX_PAGE_SIZE,
  normalizeOpinionFilters,
  positiveInteger,
};
