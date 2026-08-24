import pool from '../../db/index.js';

function affectedExactlyOne(result) {
  return Number(result?.affectedRows || 0) === 1;
}

function persistenceError(code) {
  const error = new Error(code);
  error.code = code;
  error.status = 503;
  return error;
}

export async function insertAiExecution(execution, database = pool) {
  try {
    const [result] = await database.query(
      `INSERT INTO ai_executions
        (id, request_id, actor_user_id, subject_user_id, billing_policy, surface, task_type,
         skill_id, skill_version, status, quota_reservation_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
      [
        execution.id,
        execution.requestId,
        execution.actorUserId,
        execution.subjectUserId,
        execution.billingPolicy,
        execution.surface,
        execution.taskType,
        execution.skillId,
        execution.skillVersion,
        execution.quotaHandle?.reservationKey || null,
      ],
    );
    if (!affectedExactlyOne(result)) throw persistenceError('AI_EXECUTION_START_NOT_PERSISTED');
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') throw persistenceError('AI_EXECUTION_REQUEST_DUPLICATED');
    if (error?.code?.startsWith?.('AI_EXECUTION_')) throw error;
    throw persistenceError('AI_EXECUTION_STORE_UNAVAILABLE');
  }
}

export async function updateAiExecutionReservation(execution, database = pool) {
  const [result] = await database.query('UPDATE ai_executions SET quota_reservation_key = ? WHERE id = ?', [
    execution.quotaHandle?.reservationKey || null,
    execution.id,
  ]);
  if (!affectedExactlyOne(result)) throw persistenceError('AI_EXECUTION_RESERVATION_NOT_PERSISTED');
}

export async function insertAiProviderSpan(span, database = pool) {
  const [result] = await database.query(
    `INSERT INTO ai_provider_spans
      (id, execution_id, trace_id, stage, task_type, kind, provider, model, status, usage_status,
       prompt_tokens, completion_tokens, total_tokens, estimated_cost, duration_ms, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      span.id,
      span.executionId,
      span.traceId,
      span.stage,
      span.taskType,
      span.kind,
      span.provider,
      span.model,
      span.status,
      span.usageStatus,
      span.usage.promptTokens,
      span.usage.completionTokens,
      span.usage.totalTokens,
      span.estimatedCost,
      span.durationMs,
      span.errorCode,
    ],
  );
  if (!affectedExactlyOne(result)) throw persistenceError('AI_PROVIDER_SPAN_NOT_PERSISTED');
}

export async function settleAiExecution(execution, database = pool) {
  const [result] = await database.query(
    `UPDATE ai_executions
        SET status = ?, model_called = ?, provider_call_count = ?, prompt_tokens = ?, completion_tokens = ?,
            provider_tokens = ?, charged_tokens = ?, usage_complete = ?, quota_settlement_status = ?,
            error_code = ?, duration_ms = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'running'`,
    [
      execution.status,
      execution.providerCallCount > 0 ? 1 : 0,
      execution.providerCallCount,
      execution.usage.promptTokens,
      execution.usage.completionTokens,
      execution.usage.totalTokens,
      execution.chargedTokens,
      execution.missingUsageSpans === 0 ? 1 : 0,
      execution.quotaSettlementStatus,
      execution.errorCode,
      execution.durationMs,
      execution.id,
    ],
  );
  if (!affectedExactlyOne(result)) throw persistenceError('AI_EXECUTION_TERMINAL_NOT_PERSISTED');
}

export const defaultAiExecutionPersistence = Object.freeze({
  insertAiExecution,
  updateAiExecutionReservation,
  insertAiProviderSpan,
  settleAiExecution,
});
