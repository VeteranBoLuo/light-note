import { createHash } from 'node:crypto';
import { POINTS_ECONOMY_VERSION } from '../pointsEconomyCatalog.js';
import { toolboxInputDigest } from './catalog.js';
import { toolboxError } from './errors.js';

const BILLING_TERMINAL_STATUSES = new Set(['settled', 'partially_settled', 'released', 'refunded']);

function operationRequestId(clientRequestId) {
  const digest = createHash('sha256')
    .update(String(clientRequestId || ''))
    .digest('hex')
    .slice(0, 48);
  return `tbx:${digest}`;
}

export async function reserveToolboxPoints(connection, { userId, clientRequestId, quote, jobId, toolId, inputDigest }) {
  const reservedPoints = Math.max(0, Math.floor(Number(quote.quoted_points) || 0));
  if (!reservedPoints) throw toolboxError('TOOLBOX_QUOTE_INVALID', '报价金额无效，请重新报价', 409);

  const [growthRows] = await connection.query('SELECT points FROM user_growth WHERE user_id = ? LIMIT 1 FOR UPDATE', [
    userId,
  ]);
  const growth = growthRows[0];
  if (!growth) throw toolboxError('TOOLBOX_POINTS_ACCOUNT_MISSING', '积分账户暂不可用，请稍后重试', 503);
  const balance = Math.max(0, Number(growth.points || 0));
  if (balance < reservedPoints) {
    throw toolboxError('TOOLBOX_POINTS_INSUFFICIENT', '积分不足，暂时无法开始该任务', 409, {
      requiredPoints: reservedPoints,
      balance,
    });
  }

  const requestId = operationRequestId(clientRequestId);
  const operationHash = toolboxInputDigest({
    operationType: 'toolbox_job',
    quoteId: quote.id,
    toolId,
    inputDigest,
    reservedPoints,
  });
  const [existingRows] = await connection.query(
    `SELECT id, operation_hash, status, result_json
       FROM points_economy_operations
      WHERE user_id = ? AND request_id = ?
      LIMIT 1 FOR UPDATE`,
    [userId, requestId],
  );
  if (existingRows.length) {
    const existing = existingRows[0];
    if (existing.operation_hash !== operationHash) {
      throw toolboxError('TOOLBOX_IDEMPOTENCY_KEY_REUSED', '该请求标识已用于其他任务，请刷新后重试', 409);
    }
    let result = existing.result_json;
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result);
      } catch {
        result = null;
      }
    }
    if (String(result?.jobId || '') !== String(jobId)) {
      throw toolboxError('TOOLBOX_IDEMPOTENCY_RESULT_PENDING', '原任务仍在处理中，请稍后刷新', 409);
    }
    return { operationId: existing.id, reservedPoints, replay: true };
  }

  const [operation] = await connection.query(
    `INSERT INTO points_economy_operations
      (user_id, request_id, operation_type, economy_version, operation_hash, status,
       result_json, item_id, cost_points)
     VALUES (?, ?, 'toolbox_job', ?, ?, 'reserved', ?, ?, ?)`,
    [
      userId,
      requestId,
      POINTS_ECONOMY_VERSION,
      operationHash,
      JSON.stringify({ jobId, quoteId: quote.id, reservedPoints, billingStatus: 'reserved' }),
      toolId,
      reservedPoints,
    ],
  );
  const [deducted] = await connection.query(
    'UPDATE user_growth SET points = points - ? WHERE user_id = ? AND points >= ?',
    [reservedPoints, userId, reservedPoints],
  );
  if (!deducted.affectedRows) {
    throw toolboxError('TOOLBOX_POINTS_INSUFFICIENT', '积分余额已变化，请重新确认报价', 409, {
      requiredPoints: reservedPoints,
    });
  }
  await connection.query(
    `INSERT INTO points_log (user_id, delta, reason, ref, meta)
     VALUES (?, ?, 'toolbox_reserve', ?, ?)`,
    [userId, -reservedPoints, jobId, JSON.stringify({ toolId, quoteId: quote.id, billingStatus: 'reserved' })],
  );
  return { operationId: operation.insertId, reservedPoints, replay: false };
}

export function resolveToolboxActualPoints({ quotedPoints, outcome, requestedActualPoints } = {}) {
  const quoted = Math.max(0, Math.floor(Number(quotedPoints) || 0));
  if (outcome === 'succeeded') return quoted;
  if (outcome === 'partial_succeeded') {
    const suggested = Math.ceil(quoted * 0.75);
    const requested = Number(requestedActualPoints);
    return Math.min(quoted, Math.max(1, Number.isSafeInteger(requested) ? requested : suggested));
  }
  return 0;
}

export async function settleToolboxBilling(
  connection,
  job,
  { outcome, requestedActualPoints = null, reasonCode = '' } = {},
) {
  const currentStatus = String(job.billing_status || '');
  const billingMedium = String(job.billing_medium || 'points');
  if (BILLING_TERMINAL_STATUSES.has(currentStatus)) {
    return {
      billingStatus: currentStatus,
      actualPoints: Math.max(0, Number(job.actual_points || 0)),
      refundedPoints:
        billingMedium === 'points'
          ? Math.max(0, Number(job.quoted_points || 0) - Number(job.actual_points || 0))
          : 0,
      replay: true,
    };
  }
  if (billingMedium === 'ai_quota') {
    if (currentStatus !== 'quoted') {
      throw toolboxError('TOOLBOX_BILLING_STATE_INVALID', '任务计费状态异常，已停止自动结算', 500);
    }
    const billingStatus = ['succeeded', 'partial_succeeded'].includes(String(outcome)) ? 'settled' : 'released';
    await connection.query(
      `UPDATE toolbox_jobs
          SET billing_status = ?, actual_points = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [billingStatus, job.id],
    );
    return { billingStatus, actualPoints: 0, refundedPoints: 0, replay: false };
  }
  if (billingMedium !== 'points') {
    throw toolboxError('TOOLBOX_BILLING_MEDIUM_INVALID', '任务计费方式无效，已停止自动结算', 500);
  }
  if (currentStatus !== 'reserved') {
    throw toolboxError('TOOLBOX_BILLING_STATE_INVALID', '任务计费状态异常，已停止自动结算', 500);
  }
  const quotedPoints = Math.max(0, Number(job.quoted_points || 0));
  const actualPoints = resolveToolboxActualPoints({ quotedPoints, outcome, requestedActualPoints });
  const refundedPoints = quotedPoints - actualPoints;
  const billingStatus = actualPoints === quotedPoints ? 'settled' : actualPoints > 0 ? 'partially_settled' : 'released';

  if (refundedPoints > 0) {
    const [credited] = await connection.query('UPDATE user_growth SET points = points + ? WHERE user_id = ?', [
      refundedPoints,
      job.user_id,
    ]);
    if (!credited.affectedRows) {
      throw toolboxError('TOOLBOX_POINTS_REFUND_FAILED', '积分释放暂时失败，任务将在稍后重试结算', 503);
    }
    await connection.query(
      `INSERT INTO points_log (user_id, delta, reason, ref, meta)
       VALUES (?, ?, ?, ?, ?)`,
      [
        job.user_id,
        refundedPoints,
        actualPoints > 0 ? 'toolbox_adjustment' : 'toolbox_release',
        job.id,
        JSON.stringify({
          toolId: job.tool_id,
          billingStatus,
          quotedPoints,
          actualPoints,
          reasonCode: String(reasonCode || '').slice(0, 64) || null,
        }),
      ],
    );
  }

  const [updatedOperation] = await connection.query(
    `UPDATE points_economy_operations
        SET status = ?, cost_points = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'reserved'`,
    [
      billingStatus,
      actualPoints,
      JSON.stringify({
        jobId: job.id,
        quoteId: job.quote_id,
        billingStatus,
        quotedPoints,
        actualPoints,
        refundedPoints,
        outcome,
        reasonCode: String(reasonCode || '').slice(0, 64) || null,
      }),
      job.points_operation_id,
      job.user_id,
    ],
  );
  if (!updatedOperation.affectedRows) {
    throw toolboxError('TOOLBOX_BILLING_RECEIPT_CONFLICT', '积分收据状态异常，已停止重复结算', 500);
  }
  await connection.query(
    `UPDATE toolbox_jobs
        SET billing_status = ?, actual_points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [billingStatus, actualPoints, job.id],
  );
  return { billingStatus, actualPoints, refundedPoints, replay: false };
}

// 保留旧导出名，避免尚未完成热更新的 Worker 在滚动重启期间丢失结算入口。
export const settleReservedToolboxBilling = settleToolboxBilling;

export const toolboxBillingInternals = Object.freeze({ BILLING_TERMINAL_STATUSES, operationRequestId });
