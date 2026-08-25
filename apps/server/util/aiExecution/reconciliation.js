import pool from '../../db/index.js';
import * as aiQuota from '../aiQuota.js';
import { AI_EXECUTION_BILLING_RULE_VERSION } from './policy.js';

function safeLimit(value) {
  return Math.max(1, Math.min(20_000, Math.floor(Number(value) || 5_000)));
}

async function loadHistoricalCandidates(database, { userId = '', limit = 5_000, currentRuleVersion }) {
  const actorClause = userId ? 'AND execution_row.actor_user_id = ?' : '';
  const params = [currentRuleVersion];
  if (userId) params.push(String(userId).slice(0, 128));
  const [rows] = await database.query(
    `SELECT execution_row.id,
            execution_row.status,
            execution_row.provider_call_count AS providerCallCount,
            execution_row.charged_tokens AS chargedTokens,
            execution_row.billing_rule_version AS billingRuleVersion,
            execution_row.quota_reservation_key AS reservationKey,
            reservation.status AS reservationStatus,
            reservation.actual_tokens AS reservationActualTokens,
            COALESCE(SUM(CASE WHEN span.billing_scope = 'user' THEN 1 ELSE 0 END), 0) AS userSpanCount,
            COALESCE(SUM(CASE WHEN span.billing_scope = 'user' THEN span.total_tokens ELSE 0 END), 0) AS userTokens,
            COALESCE(SUM(
              CASE
                WHEN span.billing_scope = 'user'
                 AND span.usage_status <> 'reported'
                 AND NOT (
                   span.status IN ('failed', 'aborted')
                   AND (
                     span.stage = 'image_recognition'
                     OR LEFT(span.stage, 18) = 'image_recognition_'
                   )
                 )
                THEN 1
                ELSE 0
              END
            ), 0) AS missingUserUsageSpans
       FROM ai_executions execution_row
       LEFT JOIN ai_provider_spans span ON span.execution_id = execution_row.id
       LEFT JOIN ai_token_reservations reservation
         ON reservation.reservation_key = execution_row.quota_reservation_key
      WHERE execution_row.billing_policy = 'user'
        AND execution_row.status <> 'running'
        AND execution_row.billing_rule_version < ?
        ${actorClause}
      GROUP BY execution_row.id, execution_row.status, execution_row.provider_call_count,
               execution_row.charged_tokens, execution_row.billing_rule_version,
               execution_row.quota_reservation_key, execution_row.created_at,
               reservation.status, reservation.actual_tokens
      ORDER BY execution_row.created_at ASC, execution_row.id ASC
      LIMIT ${safeLimit(limit)}`,
    params,
  );
  return rows;
}

function replayHistoricalCharge(row) {
  const normalizedTokens = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
  };
  const chargedTokens = normalizedTokens(row.chargedTokens);
  const userTokens = normalizedTokens(row.userTokens);
  if (chargedTokens == null || userTokens == null) return { eligible: false, reason: 'ledger_inconsistent' };
  const failed = row.status === 'failed';
  if (!failed && Number(row.missingUserUsageSpans || 0) > 0) {
    return { eligible: false, reason: 'missing_usage' };
  }
  if (!failed && Number(row.providerCallCount || 0) > 0 && Number(row.userSpanCount || 0) < 1) {
    return { eligible: false, reason: 'missing_user_span' };
  }
  const expectedTokens = failed ? 0 : userTokens;
  if (expectedTokens > chargedTokens) return { eligible: false, reason: 'would_increase_charge' };

  if (!row.reservationKey) {
    if (chargedTokens > 0 || expectedTokens > 0) {
      return { eligible: false, reason: 'reservation_unavailable' };
    }
    return {
      eligible: true,
      chargedTokens,
      expectedTokens,
      refundTokens: 0,
      reservationAlreadyCorrected: true,
      ledgerNeedsCorrection: false,
    };
  }
  if (row.reservationStatus === 'blocked') {
    if (chargedTokens > 0 || expectedTokens > 0) {
      return { eligible: false, reason: 'ledger_inconsistent' };
    }
    return {
      eligible: true,
      chargedTokens,
      expectedTokens,
      refundTokens: 0,
      reservationAlreadyCorrected: true,
      ledgerNeedsCorrection: false,
    };
  }
  if (row.reservationStatus !== 'reconciled') return { eligible: false, reason: 'reservation_unavailable' };
  if (row.reservationActualTokens == null) return { eligible: false, reason: 'ledger_inconsistent' };
  const reservationActual = normalizedTokens(row.reservationActualTokens);
  if (reservationActual == null) return { eligible: false, reason: 'ledger_inconsistent' };
  if (expectedTokens > reservationActual) return { eligible: false, reason: 'would_increase_charge' };
  const ledgerNeedsCorrection = reservationActual !== expectedTokens;
  return {
    eligible: true,
    chargedTokens,
    expectedTokens,
    refundTokens: reservationActual - expectedTokens,
    reservationAlreadyCorrected: !ledgerNeedsCorrection,
    ledgerNeedsCorrection,
  };
}

async function markExecutionReconciled(database, row, expectedTokens, currentRuleVersion) {
  const [result] = await database.query(
    `UPDATE ai_executions
        SET charged_tokens = ?, billing_rule_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND billing_rule_version = ? AND status <> 'running'`,
    [expectedTokens, currentRuleVersion, row.id, row.billingRuleVersion],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    const error = new Error('历史 AI 账单版本更新失败');
    error.code = 'AI_EXECUTION_RECONCILIATION_CONFLICT';
    throw error;
  }
}

/**
 * 按 Span 的计费归属重放旧账单。默认 dry-run；只自动退款，绝不在规则升级时追扣用户。
 */
export async function reconcileHistoricalAiExecutionBilling({
  database = pool,
  quota = aiQuota,
  apply = false,
  userId = '',
  limit = 5_000,
  currentRuleVersion = AI_EXECUTION_BILLING_RULE_VERSION,
} = {}) {
  const rows = await loadHistoricalCandidates(database, { userId, limit, currentRuleVersion });
  const summary = {
    dryRun: !apply,
    ruleVersion: currentRuleVersion,
    scanned: rows.length,
    eligible: 0,
    wouldCorrect: 0,
    corrected: 0,
    markedCurrent: 0,
    refundTokens: 0,
    skipped: {},
  };
  for (const row of rows) {
    const replay = replayHistoricalCharge(row);
    if (!replay.eligible) {
      summary.skipped[replay.reason] = Number(summary.skipped[replay.reason] || 0) + 1;
      continue;
    }
    summary.eligible += 1;
    summary.refundTokens += replay.refundTokens;
    if (replay.refundTokens > 0) summary.wouldCorrect += 1;
    if (!apply) continue;
    if (replay.ledgerNeedsCorrection) {
      const correction = await quota.correctReconciledReservation(
        { reservationKey: String(row.reservationKey) },
        replay.expectedTokens,
        { database },
      );
      if (correction?.corrected !== false) summary.corrected += 1;
    }
    await markExecutionReconciled(database, row, replay.expectedTokens, currentRuleVersion);
    summary.markedCurrent += 1;
  }
  return summary;
}

export const aiExecutionReconciliationInternals = Object.freeze({
  loadHistoricalCandidates,
  markExecutionReconciled,
  replayHistoricalCharge,
  safeLimit,
});
