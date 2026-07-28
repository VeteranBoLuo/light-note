import pool from '../db/index.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_CLEANUP_DELAY_MS = 120_000;
const DEFAULT_RETENTION_DAYS = 180;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_MAX_BATCHES = 20;

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
  };
}

function isMissingTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146;
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

  return {
    retentionDays: safeRetentionDays,
    cutoff,
    tables,
    backlogPossible: Object.values(tables).some((result) => result.backlogPossible),
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
