import pool from '../db/index.js';
import {
  checkFaviconApiHealth,
  fetchFaviconFromApi,
} from './bookmarkIconClient.js';
import { checkBookmarkIconStorageWritable } from './bookmarkIconService.js';

export async function checkBookmarkIconSchema(
  query = pool.query.bind(pool),
) {
  const [rows] = await query(
    `SELECT
       EXISTS(
         SELECT 1
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bookmark_icon_jobs'
       ) AS tableExists,
       EXISTS(
         SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bookmark_icon_jobs'
           AND COLUMN_NAME = 'finished_at'
       ) AS finishedAtExists,
       EXISTS(
         SELECT 1
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bookmark_icon_jobs'
           AND INDEX_NAME = 'idx_icon_job_updates'
       ) AS updateIndexExists`,
  );
  const state = rows?.[0] || {};
  const missing = [];
  if (!Number(state.tableExists)) missing.push('bookmark_icon_jobs');
  if (!Number(state.finishedAtExists)) missing.push('finished_at');
  if (!Number(state.updateIndexExists)) missing.push('idx_icon_job_updates');
  return { ok: missing.length === 0, missing };
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

export async function assertBookmarkIconWorkerRuntime({
  schemaCheck = checkBookmarkIconSchema,
  healthCheck = checkFaviconApiHealth,
} = {}) {
  const schema = await schemaCheck();
  if (!schema.ok) {
    throw runtimeError('BOOKMARK_ICON_SCHEMA_UNAVAILABLE', {
      missing: schema.missing,
    });
  }

  const health = await healthCheck();
  if (!health.ok) {
    throw runtimeError('BOOKMARK_ICON_API_UNAVAILABLE');
  }
  return { ok: true };
}

export async function checkBookmarkIconRuntime({
  probeUrl = process.env.BOOKMARK_ICON_RUNTIME_PROBE_URL || 'https://github.com',
} = {}) {
  const schema = await checkBookmarkIconSchema();
  const health = await checkFaviconApiHealth();
  const storage = await checkBookmarkIconStorageWritable();
  const probe = health.ok
    ? await fetchFaviconFromApi(probeUrl)
    : { ok: false, errorCode: 'BOOKMARK_ICON_API_UNAVAILABLE' };

  return {
    ok: schema.ok && health.ok && storage.ok && probe.ok,
    schema,
    health,
    storage,
    probe: probe.ok
      ? {
          ok: true,
          contentType: probe.contentType,
          sourceType: probe.sourceType,
        }
      : {
          ok: false,
          errorCode: probe.errorCode || 'UPSTREAM_ERROR',
        },
  };
}
