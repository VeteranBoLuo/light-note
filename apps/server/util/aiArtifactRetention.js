import pool from '../db/index.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

const MAX_RETENTION_DAYS = 3650;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 10 * 60 * 1000;
const MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const DOMAIN_CONFIG = Object.freeze({
  changeSet: Object.freeze({ env: 'AI_CHANGE_SET_RETENTION_DAYS' }),
});

let retentionTimer = null;
let cleanupRunning = false;

function retentionError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function parseRetentionDays(value) {
  if (value == null || String(value).trim() === '') return { days: null, state: 'disabled' };
  const normalized = String(value).trim();
  if (!/^[1-9]\d*$/.test(normalized)) return { days: null, state: 'invalid' };
  const days = Number(normalized);
  if (!Number.isSafeInteger(days) || days > MAX_RETENTION_DAYS) return { days: null, state: 'invalid' };
  return { days, state: 'enabled' };
}

function requireRetentionDays(value) {
  const parsed = parseRetentionDays(value);
  if (parsed.state !== 'enabled') {
    throw retentionError(
      'AI_ARTIFACT_RETENTION_DAYS_INVALID',
      `保留天数必须是 1 到 ${MAX_RETENTION_DAYS} 之间的正整数`,
    );
  }
  return parsed.days;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function isMissingSchema(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

async function withTransaction(database, callback) {
  if (typeof database?.getConnection !== 'function') return callback(database);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function placeholders(ids) {
  return ids.map(() => '?').join(',');
}

async function cleanupChangeSetBatch(database, retentionDays, batchSize) {
  return withTransaction(database, async (connection) => {
    let rows;
    try {
      [rows] = await connection.query(
        `SELECT s.id
           FROM ai_change_sets s
          WHERE s.status IN ('applied', 'undone', 'expired')
            AND s.update_time < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
            AND NOT EXISTS (
              SELECT 1 FROM ai_conversations c
               WHERE c.id = s.conversation_id AND c.retention_mode = 'indefinite'
            )
          ORDER BY s.update_time ASC, s.id ASC
          LIMIT ? FOR UPDATE`,
        [retentionDays, batchSize],
      );
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return { deleted: 0, selected: 0, exhausted: true, skipped: true };
    }
    const ids = rows.map((row) => String(row.id));
    if (!ids.length) return { deleted: 0, selected: 0, exhausted: true, skipped: false };
    const [result] = await connection.query(
      `DELETE s FROM ai_change_sets s
        WHERE s.id IN (${placeholders(ids)})
          AND s.status IN ('applied', 'undone', 'expired')
          AND s.update_time < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
          AND NOT EXISTS (
            SELECT 1 FROM ai_conversations c
             WHERE c.id = s.conversation_id AND c.retention_mode = 'indefinite'
          )`,
      [...ids, retentionDays],
    );
    return {
      deleted: Number(result?.affectedRows || 0),
      selected: ids.length,
      exhausted: ids.length < batchSize,
      skipped: false,
    };
  });
}

async function runBoundedCleanup(cleanupBatch, database, retentionDays, options = {}) {
  const days = requireRetentionDays(retentionDays);
  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 500);
  const maxBatches = boundedInteger(options.maxBatches, DEFAULT_MAX_BATCHES, 1, 100);
  let deleted = 0;
  let actionsDeleted = 0;
  let batches = 0;
  let lastResult = { selected: 0, exhausted: true, skipped: false };
  for (; batches < maxBatches; batches += 1) {
    lastResult = await cleanupBatch(database, days, batchSize);
    deleted += Number(lastResult.deleted || 0);
    actionsDeleted += Number(lastResult.actionsDeleted || 0);
    if (lastResult.skipped || lastResult.exhausted || Number(lastResult.deleted || 0) === 0) {
      batches += 1;
      break;
    }
  }
  return {
    deleted,
    actionsDeleted,
    retentionDays: days,
    batches,
    skipped: Boolean(lastResult.skipped),
    backlogRemaining:
      !lastResult.skipped &&
      batches >= maxBatches &&
      Number(lastResult.selected || 0) === batchSize &&
      Number(lastResult.deleted || 0) > 0,
  };
}

export function getAiArtifactRetentionConfig(environment = process.env) {
  const domains = {};
  const invalidDomains = [];
  for (const [domain, definition] of Object.entries(DOMAIN_CONFIG)) {
    const parsed = parseRetentionDays(environment?.[definition.env]);
    domains[domain] = { ...parsed, env: definition.env, enabled: parsed.state === 'enabled' };
    if (parsed.state === 'invalid') invalidDomains.push(domain);
  }
  return {
    domains,
    enabledDomains: Object.entries(domains)
      .filter(([, value]) => value.enabled)
      .map(([domain]) => domain),
    invalidDomains,
  };
}

export function isAiArtifactRetentionEnabled(environment = process.env) {
  return getAiArtifactRetentionConfig(environment).enabledDomains.length > 0;
}

export function cleanupExpiredAiChangeSets(database = pool, retentionDays, options = {}) {
  return runBoundedCleanup(cleanupChangeSetBatch, database, retentionDays, options);
}

export async function runAiArtifactRetentionCleanup(database = pool, options = {}) {
  const config = options.config || getAiArtifactRetentionConfig();
  const cleanupOptions = { batchSize: options.batchSize, maxBatches: options.maxBatches };
  const result = {
    enabledDomains: [...config.enabledDomains],
    invalidDomains: [...config.invalidDomains],
    changeSet: null,
  };
  if (config.domains.changeSet.enabled) {
    result.changeSet = await cleanupExpiredAiChangeSets(database, config.domains.changeSet.days, cleanupOptions);
  }
  return result;
}

function logCleanupResult(result) {
  const changeSets = Number(result.changeSet?.deleted || 0);
  const backlog = [result.changeSet].some((item) => item?.backlogRemaining);
  const skipped = [result.changeSet].filter((item) => item?.skipped).length;
  const code = backlog ? 'AI_ARTIFACT_RETENTION_BACKLOG' : 'AI_ARTIFACT_RETENTION_CLEANUP_OK';
  console.info(
    '[ai-artifact-retention] code=%s change_sets=%d skipped=%d',
    code,
    changeSets,
    skipped,
  );
}

function retentionIntervalMs(value) {
  return boundedInteger(
    value ?? process.env.AI_ARTIFACT_RETENTION_CLEANUP_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
  );
}

export async function startAiArtifactRetentionScheduler({ database = pool, intervalMs } = {}) {
  const config = getAiArtifactRetentionConfig();
  if (!config.enabledDomains.length) {
    return { started: false, reason: 'disabled', enabledDomains: [], invalidDomains: config.invalidDomains };
  }
  if (retentionTimer) {
    return { started: false, reason: 'already_started', enabledDomains: config.enabledDomains };
  }
  if (config.invalidDomains.length) {
    console.warn(
      '[ai-artifact-retention] code=AI_ARTIFACT_RETENTION_CONFIG_INVALID domains=%s',
      config.invalidDomains.join(','),
    );
  }
  const runCleanup = async () => {
    if (cleanupRunning) return null;
    cleanupRunning = true;
    try {
      const result = await runAiArtifactRetentionCleanup(database, { config });
      logCleanupResult(result);
      return result;
    } catch (error) {
      console.error(
        '[ai-artifact-retention] code=AI_ARTIFACT_RETENTION_CLEANUP_FAILED error_code=%s',
        stableAgentErrorCode(error),
      );
      return null;
    } finally {
      cleanupRunning = false;
    }
  };
  await runCleanup();
  const safeIntervalMs = retentionIntervalMs(intervalMs);
  retentionTimer = setInterval(() => void runCleanup(), safeIntervalMs);
  retentionTimer.unref?.();
  return { started: true, intervalMs: safeIntervalMs, enabledDomains: config.enabledDomains };
}

export function stopAiArtifactRetentionScheduler() {
  if (!retentionTimer) return false;
  clearInterval(retentionTimer);
  retentionTimer = null;
  return true;
}

export const aiArtifactRetentionInternals = Object.freeze({
  MAX_RETENTION_DAYS,
  cleanupChangeSetBatch,
  parseRetentionDays,
  retentionIntervalMs,
});
