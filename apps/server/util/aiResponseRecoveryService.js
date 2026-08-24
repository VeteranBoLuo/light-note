import pool from '../db/index.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

// 新模块化 Skill 不再写入旧 Agent SSE 恢复快照。
// 这里仅保留有界清理器，确保发布前遗留的短期记录自然清空后不再增长。
const RESPONSE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MIN_RESPONSE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const RESPONSE_CLEANUP_BATCH_SIZE = 500;
let responseCleanupTimer = null;

export async function cleanupExpiredResponseEvents(database = pool, { maxBatches = 20 } = {}) {
  let deleted = 0;
  try {
    const batches = Math.max(1, Math.min(100, Math.trunc(Number(maxBatches) || 20)));
    for (let index = 0; index < batches; index += 1) {
      const [result] = await database.query(
        `DELETE FROM ai_response_events
          WHERE expires_at <= CURRENT_TIMESTAMP
          LIMIT ${RESPONSE_CLEANUP_BATCH_SIZE}`,
      );
      const affected = Number(result?.affectedRows || 0);
      deleted += affected;
      if (affected < RESPONSE_CLEANUP_BATCH_SIZE) break;
    }
  } catch (error) {
    // 旧表不存在代表迁移前没有历史快照；机会式清理不应阻止服务启动。
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) throw error;
  }
  return { deleted };
}

export async function startAiResponseRecoveryCleanupScheduler({
  intervalMs = RESPONSE_CLEANUP_INTERVAL_MS,
  database = pool,
} = {}) {
  if (responseCleanupTimer) return { started: false, intervalMs: null };
  await cleanupExpiredResponseEvents(database);
  const safeInterval = Math.max(
    MIN_RESPONSE_CLEANUP_INTERVAL_MS,
    Number(intervalMs) || RESPONSE_CLEANUP_INTERVAL_MS,
  );
  responseCleanupTimer = setInterval(() => {
    cleanupExpiredResponseEvents(database).catch((error) =>
      console.error('[ai-response-recovery] legacy cleanup failed code=%s', stableAgentErrorCode(error)),
    );
  }, safeInterval);
  responseCleanupTimer.unref?.();
  return { started: true, intervalMs: safeInterval };
}

export function stopAiResponseRecoveryCleanupScheduler() {
  if (!responseCleanupTimer) return false;
  clearInterval(responseCleanupTimer);
  responseCleanupTimer = null;
  return true;
}

export const aiResponseRecoveryInternals = Object.freeze({
  MIN_RESPONSE_CLEANUP_INTERVAL_MS,
  RESPONSE_CLEANUP_BATCH_SIZE,
});
