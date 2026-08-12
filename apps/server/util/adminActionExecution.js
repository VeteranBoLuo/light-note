import crypto from 'node:crypto';
import pool from '../db/index.js';
import { assertRegisteredAdminAction } from './adminActionRegistry.js';
import { recordAdminOperationAudit } from './adminOperationAudit.js';

const MIN_REASON_LENGTH = 6;

export class AdminActionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AdminActionError';
    this.code = code;
    this.status = status;
  }
}

function normalizeReason(value) {
  return String(value || '')
    .trim()
    .slice(0, 500);
}

function normalizeRequestId(req) {
  const requestId = String(req?.requestId || '').trim();
  return requestId ? requestId.slice(0, 64) : crypto.randomUUID();
}

function assertRootAdminRequest(req) {
  if (!req?.user?.id || req.user.role !== 'root' || req.adminContext) {
    throw new AdminActionError('ADMIN_ACTION_FORBIDDEN', '没有操作权限', 403);
  }
}

function validateAdminActionInput(definition, payload = {}, expectedConfirmText = null) {
  const reason = normalizeReason(payload.reason);
  if (definition.reasonRequired && reason.length < MIN_REASON_LENGTH) {
    throw new AdminActionError('ADMIN_ACTION_REASON_REQUIRED', `请填写至少 ${MIN_REASON_LENGTH} 个字的操作原因`);
  }
  if (['high', 'critical'].includes(definition.riskLevel) && payload.confirmed !== true) {
    throw new AdminActionError('ADMIN_ACTION_CONFIRMATION_REQUIRED', '请确认已核对影响范围');
  }
  if (expectedConfirmText != null && String(payload.confirmText || '').trim() !== String(expectedConfirmText)) {
    throw new AdminActionError('ADMIN_ACTION_CONFIRM_TEXT_MISMATCH', `请输入确认短语：${expectedConfirmText}`);
  }
  return reason;
}

/**
 * 高风险后台动作的统一入口：封闭注册、Root 普通上下文、原因、显式确认和 intent 审计。
 * intent 使用独立连接先落库，确保后续业务事务失败时仍能追溯尝试记录。
 */
export async function beginAdminAction(
  req,
  { action, targetId = null, metadata = {}, expectedConfirmText = null } = {},
) {
  assertRootAdminRequest(req);
  let definition;
  try {
    definition = assertRegisteredAdminAction(action);
  } catch (error) {
    throw new AdminActionError(error?.code || 'ADMIN_ACTION_UNREGISTERED', '后台动作未登记', 500);
  }
  const reason = validateAdminActionInput(definition, req.body || {}, expectedConfirmText);
  const requestId = normalizeRequestId(req);
  const baseEntry = {
    actorUserId: req.user.id,
    action: definition.action,
    targetType: definition.targetType,
    targetId: targetId == null ? null : String(targetId),
    reason,
    requestId,
    ip: req.ip,
  };
  const intentAuditId = await recordAdminOperationAudit(
    { ...baseEntry, outcome: 'intent', metadata: { ...metadata, riskLevel: definition.riskLevel } },
    { db: pool, required: definition.auditRequired },
  );
  return {
    definition,
    reason,
    requestId,
    intentAuditId,
    baseEntry,
    metadata,
  };
}

/**
 * 成功结果应传入业务事务连接，让业务写入与 terminal 审计同成败。
 * 失败结果在业务回滚后用默认连接追加，保留失败尝试。
 */
export async function finishAdminAction(context, { outcome, metadata = {}, db = pool } = {}) {
  if (!context?.definition || !['succeeded', 'failed', 'denied'].includes(outcome)) {
    throw new AdminActionError('ADMIN_ACTION_RESULT_INVALID', '后台动作结果无效', 500);
  }
  const auditId = await recordAdminOperationAudit(
    {
      ...context.baseEntry,
      outcome,
      metadata: {
        ...context.metadata,
        ...metadata,
        riskLevel: context.definition.riskLevel,
        intentAuditId: context.intentAuditId || null,
      },
    },
    { db, required: context.definition.auditRequired },
  );
  return { auditId, requestId: context.requestId };
}

export function adminActionErrorResponse(error, fallbackMessage = '操作失败') {
  if (error instanceof AdminActionError) {
    return { status: error.status, message: error.message, code: error.code };
  }
  if (error?.code === 'ADMIN_AUDIT_UNAVAILABLE') {
    return { status: 503, message: '管理员审计暂不可用，操作已阻断', code: error.code };
  }
  return { status: 500, message: fallbackMessage, code: 'ADMIN_ACTION_FAILED' };
}

export const adminActionExecutionInternals = {
  MIN_REASON_LENGTH,
  normalizeReason,
  normalizeRequestId,
  validateAdminActionInput,
};
