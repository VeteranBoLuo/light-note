import pool from '../db/index.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_CLEANUP_DELAY_MS = 120_000;
const DEFAULT_RETENTION_DAYS = 180;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_MAX_BATCHES = 20;
// AI 回复摘要比其它运维日志敏感得多：轮廓字段(结果类型、字符数)长期保留，
// 脱敏摘要只在排障窗口内保留，到期置空而不是删行。
const DEFAULT_DIGEST_RETENTION_DAYS = 7;

const LOG_TABLES = [
  { table: 'api_logs', timeColumn: 'request_time' },
  { table: 'operation_logs', timeColumn: 'create_time' },
  { table: 'conversion_events', timeColumn: 'create_time' },
];

let cleanupInterval = null;
let initialCleanupTimer = null;

function boundedInteger(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function getOperationalLogRetentionConfig(env = process.env) {
  return {
    retentionDays: boundedInteger(env.OPERATIONAL_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1, 3650),
    batchSize: boundedInteger(env.OPERATIONAL_LOG_RETENTION_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 5000),
    maxBatches: boundedInteger(env.OPERATIONAL_LOG_RETENTION_MAX_BATCHES, DEFAULT_MAX_BATCHES, 1, 100),
    digestRetentionDays: boundedInteger(
      env.AGENT_LOG_DIGEST_RETENTION_DAYS,
      DEFAULT_DIGEST_RETENTION_DAYS,
      1,
      DEFAULT_RETENTION_DAYS,
    ),
  };
}

function isMissingTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146;
}

// 摘要列可能还没迁移(老库)，此时静默跳过：清理是机会式维护，不该阻断其它日志保留。
function isMissingColumnError(error) {
  return error?.code === 'ER_BAD_FIELD_ERROR' || Number(error?.errno) === 1054;
}

/**
 * 把过期的 AI 回复摘要置空。只清 answer_digest，保留整行与结果轮廓字段，
 * 因此后台仍能看到「这轮产出了多少字、是不是只发了确认卡」，只是看不到内容片段。
 */
export async function purgeExpiredAgentLogDigests({
  db = pool,
  digestRetentionDays,
  batchSize,
  maxBatches,
  now = new Date(),
} = {}) {
  const defaults = getOperationalLogRetentionConfig();
  const safeRetentionDays = boundedInteger(
    digestRetentionDays,
    defaults.digestRetentionDays,
    1,
    DEFAULT_RETENTION_DAYS,
  );
  const safeBatchSize = boundedInteger(batchSize, defaults.batchSize, 1, 5000);
  const safeMaxBatches = boundedInteger(maxBatches, defaults.maxBatches, 1, 100);
  const cutoff = new Date(now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000);
  let purged = 0;
  let batches = 0;
  let lastAffectedRows = 0;

  do {
    let result;
    try {
      [result] = await db.query(
        `UPDATE \`agent_logs\`
            SET \`answer_digest\` = NULL
          WHERE \`answer_digest\` IS NOT NULL
            AND \`created_at\` < ?
          ORDER BY \`created_at\` ASC
          LIMIT ?`,
        [cutoff, safeBatchSize],
      );
    } catch (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return { purged: 0, batches: 0, backlogPossible: false, skipped: true, retentionDays: safeRetentionDays };
      }
      throw error;
    }

    lastAffectedRows = Number(result?.affectedRows || 0);
    purged += lastAffectedRows;
    batches += 1;
  } while (lastAffectedRows >= safeBatchSize && batches < safeMaxBatches);

  return {
    purged,
    batches,
    backlogPossible: lastAffectedRows >= safeBatchSize,
    skipped: false,
    retentionDays: safeRetentionDays,
    cutoff,
  };
}

async function cleanupLogTable(db, { table, timeColumn }, cutoff, batchSize, maxBatches) {
  let deleted = 0;
  let batches = 0;
  let lastAffectedRows = 0;

  do {
    let result;
    try {
      [result] = await db.query(
        `DELETE FROM \`${table}\`
         WHERE \`${timeColumn}\` < ?
         ORDER BY \`${timeColumn}\` ASC
         LIMIT ?`,
        [cutoff, batchSize],
      );
    } catch (error) {
      if (isMissingTableError(error)) {
        return { deleted: 0, batches: 0, backlogPossible: false, tableMissing: true };
      }
      throw error;
    }

    lastAffectedRows = Number(result?.affectedRows || 0);
    deleted += lastAffectedRows;
    batches += 1;
  } while (lastAffectedRows >= batchSize && batches < maxBatches);

  return {
    deleted,
    batches,
    backlogPossible: lastAffectedRows >= batchSize,
    tableMissing: false,
  };
}

export async function cleanupOperationalLogs({
  db = pool,
  retentionDays,
  batchSize,
  maxBatches,
  digestRetentionDays,
  now = new Date(),
} = {}) {
  const defaults = getOperationalLogRetentionConfig();
  const safeRetentionDays = boundedInteger(retentionDays, defaults.retentionDays, 1, 3650);
  const safeBatchSize = boundedInteger(batchSize, defaults.batchSize, 1, 5000);
  const safeMaxBatches = boundedInteger(maxBatches, defaults.maxBatches, 1, 100);
  const cutoff = new Date(now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000);
  const tables = {};

  for (const descriptor of LOG_TABLES) {
    tables[descriptor.table] = await cleanupLogTable(db, descriptor, cutoff, safeBatchSize, safeMaxBatches);
  }

  const agentLogDigests = await purgeExpiredAgentLogDigests({
    db,
    digestRetentionDays,
    batchSize: safeBatchSize,
    maxBatches: safeMaxBatches,
    now,
  });

  return {
    retentionDays: safeRetentionDays,
    cutoff,
    tables,
    agentLogDigests,
    backlogPossible:
      Object.values(tables).some((result) => result.backlogPossible) || agentLogDigests.backlogPossible,
  };
}

export function startOperationalLogRetentionScheduler() {
  if (cleanupInterval || initialCleanupTimer) return false;

  const run = () =>
    cleanupOperationalLogs()
      .then((result) => {
        if (result.backlogPossible) {
          console.warn('[operational-log-retention] cleanup backlog remains');
        }
      })
      .catch((error) => {
        console.error('[operational-log-retention] cleanup failed code=%s', stableAgentErrorCode(error));
      });

  initialCleanupTimer = setTimeout(() => {
    initialCleanupTimer = null;
    void run();
  }, INITIAL_CLEANUP_DELAY_MS);
  initialCleanupTimer.unref?.();

  cleanupInterval = setInterval(() => {
    void run();
  }, CLEANUP_INTERVAL_MS);
  cleanupInterval.unref?.();
  return true;
}

export function stopOperationalLogRetentionScheduler() {
  if (initialCleanupTimer) clearTimeout(initialCleanupTimer);
  if (cleanupInterval) clearInterval(cleanupInterval);
  initialCleanupTimer = null;
  cleanupInterval = null;
}
