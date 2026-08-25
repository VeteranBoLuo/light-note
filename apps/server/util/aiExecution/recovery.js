import pool from '../../db/index.js';
import * as aiQuota from '../aiQuota.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { AI_EXECUTION_BILLING_RULE_VERSION } from './policy.js';

const RECOVERY_BATCH_SIZE = 100;
const RECOVERY_INTERVAL_MS = 10 * 60 * 1000;
const MIN_RECOVERY_INTERVAL_MS = 60 * 1000;
const LEASE_EXPIRED_ERROR = 'AI_EXECUTION_LEASE_EXPIRED';
let recoveryTimer = null;
let recoveryInFlight = null;

function safeBatchSize(value) {
  return Math.max(1, Math.min(500, Math.floor(Number(value) || RECOVERY_BATCH_SIZE)));
}

async function claimExpiredExecution(database, id) {
  const [result] = await database.query(
    `UPDATE ai_executions execution_row
       LEFT JOIN (
         SELECT execution_id,
                COUNT(*) AS provider_call_count,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(total_tokens), 0) AS provider_tokens,
                COALESCE(SUM(CASE WHEN billing_scope = 'user' THEN total_tokens ELSE 0 END), 0)
                  AS billable_tokens,
                COALESCE(SUM(
                  CASE
                    WHEN billing_scope = 'user'
                     AND usage_status <> 'reported'
                     AND NOT (
                       status IN ('failed', 'aborted')
                       AND (stage = 'image_recognition' OR LEFT(stage, 18) = 'image_recognition_')
                     )
                    THEN estimated_tokens
                    ELSE 0
                  END
                ), 0) AS missing_billable_tokens,
                COALESCE(SUM(
                  CASE
                    WHEN billing_scope = 'user'
                     AND usage_status <> 'reported'
                     AND NOT (
                       status IN ('failed', 'aborted')
                       AND (stage = 'image_recognition' OR LEFT(stage, 18) = 'image_recognition_')
                     )
                    THEN 1
                    ELSE 0
                  END
                ), 0) AS missing_billable_spans
           FROM ai_provider_spans
          WHERE execution_id = ?
          GROUP BY execution_id
       ) spans ON spans.execution_id = execution_row.id
       LEFT JOIN ai_token_reservations reservation
         ON reservation.reservation_key = execution_row.quota_reservation_key
        SET execution_row.status = 'failed',
            execution_row.model_called = IF(COALESCE(spans.provider_call_count, 0) > 0, 1, 0),
            execution_row.provider_call_count = COALESCE(spans.provider_call_count, 0),
            execution_row.prompt_tokens = COALESCE(spans.prompt_tokens, 0),
            execution_row.completion_tokens = COALESCE(spans.completion_tokens, 0),
            execution_row.provider_tokens = COALESCE(spans.provider_tokens, 0),
            execution_row.charged_tokens = CASE
              WHEN execution_row.billing_policy IN ('user', 'none') THEN 0
              WHEN reservation.reserved_tokens IS NULL
                THEN COALESCE(spans.billable_tokens, 0) + COALESCE(spans.missing_billable_tokens, 0)
              ELSE LEAST(
                reservation.reserved_tokens,
                COALESCE(spans.billable_tokens, 0) + COALESCE(spans.missing_billable_tokens, 0)
              )
            END,
            execution_row.usage_complete = IF(COALESCE(spans.missing_billable_spans, 0) = 0, 1, 0),
            execution_row.quota_settlement_status = IF(
              execution_row.quota_reservation_key IS NULL,
              'not_used',
              'deferred'
            ),
            execution_row.error_code = ?,
            execution_row.duration_ms = LEAST(
              2147483647,
              GREATEST(
                execution_row.duration_ms,
                TIMESTAMPDIFF(SECOND, execution_row.created_at, CURRENT_TIMESTAMP) * 1000
              )
            ),
            execution_row.lease_expires_at = NULL,
            execution_row.updated_at = CURRENT_TIMESTAMP
      WHERE execution_row.id = ?
        AND execution_row.status = 'running'
        AND execution_row.lease_expires_at <= CURRENT_TIMESTAMP`,
    [id, LEASE_EXPIRED_ERROR, id],
  );
  if (Number(result?.affectedRows || 0) !== 1) return null;
  const [rows] = await database.query(`SELECT charged_tokens FROM ai_executions WHERE id = ? LIMIT 1`, [id]);
  return { chargedTokens: Math.max(0, Number(rows[0]?.charged_tokens || 0)) };
}

async function settleRecoveredQuota(database, quota, row) {
  if (!row.quota_reservation_key) return 'not_used';
  let reconciled = false;
  try {
    const handle = { reservationKey: String(row.quota_reservation_key) };
    if (row.billing_policy === 'system' || (row.billing_policy === 'user' && row.status !== 'failed')) {
      reconciled = await quota.reconcile(handle, Math.max(0, Number(row.charged_tokens || 0)), { database });
    } else {
      reconciled = quota.releaseReservation
        ? await quota.releaseReservation(handle, { database })
        : await quota.reconcile(handle, 0, { database });
    }
  } catch {
    reconciled = false;
  }
  if (!reconciled) return 'deferred';
  const [result] = await database.query(
    `UPDATE ai_executions
        SET quota_settlement_status = 'reconciled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status <> 'running' AND quota_settlement_status = 'deferred'`,
    [row.id],
  );
  if (Number(result?.affectedRows || 0) === 1) return 'reconciled';
  const [rows] = await database.query(`SELECT quota_settlement_status FROM ai_executions WHERE id = ? LIMIT 1`, [
    row.id,
  ]);
  return rows[0]?.quota_settlement_status === 'reconciled' ? 'reconciled' : 'deferred';
}

/**
 * 先用带租约条件的单条 UPDATE 原子认领，再幂等退回额度。即便进程在两步之间再次退出，
 * deferred 行也会被下一轮继续结算，不会把旧请求永远留在 running 或 reserved。
 */
export async function recoverExpiredAiExecutions({
  database = pool,
  quota = aiQuota,
  batchSize = RECOVERY_BATCH_SIZE,
} = {}) {
  const limit = safeBatchSize(batchSize);
  const [rows] = await database.query(
    `SELECT id, status, billing_policy, charged_tokens, quota_reservation_key
       FROM ai_executions
      WHERE (status = 'running' AND lease_expires_at <= CURRENT_TIMESTAMP)
         OR (
           status <> 'running'
           AND quota_settlement_status = 'deferred'
           AND quota_reservation_key IS NOT NULL
           AND (error_code = ? OR billing_rule_version = ?)
         )
      ORDER BY updated_at ASC, id ASC
      LIMIT ${limit}`,
    [LEASE_EXPIRED_ERROR, AI_EXECUTION_BILLING_RULE_VERSION],
  );
  const summary = { scanned: rows.length, recovered: 0, reconciled: 0, deferred: 0 };
  for (const row of rows) {
    if (row.status === 'running') {
      const claimed = await claimExpiredExecution(database, row.id);
      if (!claimed) continue;
      row.charged_tokens = claimed.chargedTokens;
      row.status = 'failed';
      summary.recovered += 1;
    }
    const settlement = await settleRecoveredQuota(database, quota, row);
    if (settlement === 'reconciled') summary.reconciled += 1;
    if (settlement === 'deferred') summary.deferred += 1;
  }
  return summary;
}

export async function startAiExecutionRecoveryScheduler({
  database = pool,
  quota = aiQuota,
  intervalMs = RECOVERY_INTERVAL_MS,
} = {}) {
  if (recoveryTimer) return { started: false, intervalMs: null };
  const safeInterval = Math.max(MIN_RECOVERY_INTERVAL_MS, Number(intervalMs) || RECOVERY_INTERVAL_MS);
  const runRecovery = () => {
    if (recoveryInFlight) return recoveryInFlight;
    recoveryInFlight = recoverExpiredAiExecutions({ database, quota })
      .catch((error) => {
        console.error('[ai-execution-recovery] failed code=%s', stableAgentErrorCode(error));
        return null;
      })
      .finally(() => {
        recoveryInFlight = null;
      });
    return recoveryInFlight;
  };
  // 先注册周期再做首次扫描：启动瞬间的数据库抖动或迁移短暂未就绪不能永久关闭回收能力。
  recoveryTimer = setInterval(runRecovery, safeInterval);
  recoveryTimer.unref?.();
  await runRecovery();
  return { started: true, intervalMs: safeInterval };
}

export function stopAiExecutionRecoveryScheduler() {
  if (!recoveryTimer) return false;
  clearInterval(recoveryTimer);
  recoveryTimer = null;
  return true;
}

export const aiExecutionRecoveryInternals = Object.freeze({
  LEASE_EXPIRED_ERROR,
  MIN_RECOVERY_INTERVAL_MS,
  RECOVERY_BATCH_SIZE,
  claimExpiredExecution,
  settleRecoveredQuota,
});
