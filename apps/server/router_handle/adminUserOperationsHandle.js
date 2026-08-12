import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { removeUserSessions } from '../util/sessionStore.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  AdminActionError,
  adminActionErrorResponse,
  beginAdminAction,
  finishAdminAction,
} from '../util/adminActionExecution.js';

const ADMIN_EDITABLE_ROLES = new Set(['user', 'visitor', 'test']);
const ADMIN_USER_CONFIRM_TEXTS = Object.freeze({
  update: Object.freeze(['确认修改用户', 'CONFIRM USER UPDATE']),
  disable: Object.freeze(['确认停用用户', 'CONFIRM USER DISABLE']),
  restore: Object.freeze(['确认恢复用户', 'CONFIRM USER RESTORE']),
});

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().slice(0, 255) : '';
}

function normalizeAlias(value) {
  return typeof value === 'string' ? value.trim().slice(0, 255) : '';
}

function resolveExpectedConfirmText(action, submittedValue) {
  const allowed = ADMIN_USER_CONFIRM_TEXTS[action] || [];
  const submitted = String(submittedValue || '').trim();
  return allowed.includes(submitted) ? submitted : allowed[0] || '';
}

async function appendFailureAudit(context, error) {
  if (!context) return;
  try {
    await finishAdminAction(context, {
      outcome: 'failed',
      metadata: { errorCode: stableAgentErrorCode(error) },
    });
  } catch {
    // 审计工具已记录安全错误码。
  }
}

function sendAdminActionError(res, error, fallbackMessage) {
  const response = adminActionErrorResponse(error, fallbackMessage);
  return res.send(resultData({ code: response.code }, response.status, response.message));
}

// POST /user/admin/update —— 仅后台用户管理调用；普通用户资料更新仍走 saveUserInfo。
export async function updateAdminUser(req, res) {
  const targetUserId = String(req.body?.userId || '').trim();
  if (!targetUserId) return res.send(resultData(null, 400, '缺少目标用户'));
  let actionContext = null;
  let connection = null;
  try {
    actionContext = await beginAdminAction(req, {
      action: 'user.update',
      targetId: targetUserId,
      expectedConfirmText: resolveExpectedConfirmText('update', req.body?.confirmText),
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id, alias, email, role, del_flag FROM user WHERE id = ? FOR UPDATE', [
      targetUserId,
    ]);
    const before = rows[0];
    if (!before) throw new AdminActionError('ADMIN_USER_NOT_FOUND', '目标用户不存在', 404);

    const nextRole = String(req.body?.role || before.role).trim();
    if (before.role === 'root' && nextRole !== 'root') {
      throw new AdminActionError('ADMIN_ROOT_ROLE_PROTECTED', 'Root 身份不能在用户管理中降级', 409);
    }
    if (nextRole === 'root' && before.role !== 'root') {
      throw new AdminActionError('ADMIN_ROOT_GRANT_FORBIDDEN', '不能通过用户管理提升为 Root', 409);
    }
    if (nextRole !== 'root' && !ADMIN_EDITABLE_ROLES.has(nextRole)) {
      throw new AdminActionError('ADMIN_USER_ROLE_INVALID', '目标角色不合法');
    }
    if (targetUserId === req.user.id && nextRole !== before.role) {
      throw new AdminActionError('ADMIN_SELF_ROLE_CHANGE_FORBIDDEN', '不能修改自己的角色', 409);
    }

    const alias = normalizeAlias(req.body?.alias);
    const email = normalizeEmail(req.body?.email);
    if (!alias) throw new AdminActionError('ADMIN_USER_ALIAS_REQUIRED', '昵称不能为空');
    if (!email) throw new AdminActionError('ADMIN_USER_EMAIL_REQUIRED', '邮箱不能为空');
    const changedFields = [];
    if (alias !== String(before.alias || '')) changedFields.push('alias');
    if (email !== String(before.email || '')) changedFields.push('email');
    if (nextRole !== String(before.role || '')) changedFields.push('role');
    if (!changedFields.length) {
      throw new AdminActionError('ADMIN_USER_NO_CHANGES', '用户资料没有变化', 409);
    }

    const [result] = await connection.query('UPDATE user SET alias = ?, email = ?, role = ? WHERE id = ?', [
      alias,
      email,
      nextRole,
      targetUserId,
    ]);
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: {
        changedFields,
        previousRole: before.role,
        resultingRole: nextRole,
        affectedRows: Number(result.affectedRows || 0),
      },
      db: connection,
    });
    await connection.commit();
    return res.send(resultData({ affectedRows: Number(result.affectedRows || 0), ...receipt }));
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }
    await appendFailureAudit(actionContext, error);
    return sendAdminActionError(res, error, '修改用户失败');
  } finally {
    connection?.release();
  }
}

async function setAdminUserDisabled(req, res, disabled) {
  const targetUserId = String(req.body?.userId || '').trim();
  if (!targetUserId) return res.send(resultData(null, 400, '缺少目标用户'));
  const action = disabled ? 'user.delete' : 'user.restore';
  const expectedConfirmText = resolveExpectedConfirmText(
    disabled ? 'disable' : 'restore',
    req.body?.confirmText,
  );
  let actionContext = null;
  let connection = null;
  try {
    actionContext = await beginAdminAction(req, { action, targetId: targetUserId, expectedConfirmText });
    if (targetUserId === req.user.id) {
      throw new AdminActionError('ADMIN_SELF_DISABLE_FORBIDDEN', '不能停用或恢复自己的账号', 409);
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id, role, del_flag FROM user WHERE id = ? FOR UPDATE', [
      targetUserId,
    ]);
    const target = rows[0];
    if (!target) throw new AdminActionError('ADMIN_USER_NOT_FOUND', '目标用户不存在', 404);
    if (target.role === 'root') {
      throw new AdminActionError('ADMIN_ROOT_ACCOUNT_PROTECTED', 'Root 账号不能在用户管理中停用或恢复', 409);
    }
    const expectedFlag = disabled ? 0 : 1;
    if (Number(target.del_flag) !== expectedFlag) {
      throw new AdminActionError(
        disabled ? 'ADMIN_USER_ALREADY_DISABLED' : 'ADMIN_USER_ALREADY_ACTIVE',
        disabled ? '用户已经处于停用状态' : '用户已经处于正常状态',
        409,
      );
    }
    const nextFlag = disabled ? 1 : 0;
    const [result] = await connection.query('UPDATE user SET del_flag = ? WHERE id = ?', [nextFlag, targetUserId]);
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: { affectedRows: Number(result.affectedRows || 0), resultingStatus: disabled ? 'disabled' : 'active' },
      db: connection,
    });
    await connection.commit();

    let sessionsRevoked = null;
    if (disabled) {
      try {
        await removeUserSessions(targetUserId);
        sessionsRevoked = true;
      } catch (error) {
        sessionsRevoked = false;
        console.warn('[admin-user-disable] session cleanup failed code=%s', stableAgentErrorCode(error));
      }
    }
    return res.send(
      resultData({
        affectedRows: Number(result.affectedRows || 0),
        status: disabled ? 'disabled' : 'active',
        sessionsRevoked,
        ...receipt,
      }),
    );
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }
    await appendFailureAudit(actionContext, error);
    return sendAdminActionError(res, error, disabled ? '停用用户失败' : '恢复用户失败');
  } finally {
    connection?.release();
  }
}

export const disableAdminUser = (req, res) => setAdminUserDisabled(req, res, true);
export const restoreAdminUser = (req, res) => setAdminUserDisabled(req, res, false);

export const adminUserOperationsInternals = {
  ADMIN_EDITABLE_ROLES,
  ADMIN_USER_CONFIRM_TEXTS,
  normalizeAlias,
  normalizeEmail,
  resolveExpectedConfirmText,
};
