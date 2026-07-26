#!/usr/bin/env node

import { createHash } from 'node:crypto';
import pool from '../db/index.js';
import { normalizeOrigin } from '../util/bookmarkIconClient.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

function readArgument(name) {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

function parseDateArgument(name, required = false) {
  const raw = readArgument(name);
  if (!raw) {
    if (required) {
      const error = new Error(`MISSING_${name.toUpperCase()}`);
      error.code = `MISSING_${name.toUpperCase()}`;
      throw error;
    }
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`INVALID_${name.toUpperCase()}`);
    error.code = `INVALID_${name.toUpperCase()}`;
    throw error;
  }
  return parsed;
}

const ERROR_CODES = [
  'INTERNAL_ERROR',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'ICON_NOT_FOUND',
];

async function loadCandidates(connection, since, until, { lock = false } = {}) {
  const errorPlaceholders = ERROR_CODES.map(() => '?').join(',');
  const untilClause = until ? 'AND j.create_time <= ?' : '';
  const params = [since];
  if (until) params.push(until);
  params.push(...ERROR_CODES);

  const [rows] = await connection.query(
    `SELECT j.id,
            j.status,
            j.error_code AS errorCode,
            j.batch_id AS batchId,
            j.user_id AS userId,
            j.bookmark_id AS bookmarkId,
            b.url AS currentUrl
     FROM bookmark_icon_jobs j
     INNER JOIN bookmark b
       ON b.id = j.bookmark_id
      AND b.user_id = j.user_id
      AND b.del_flag = 0
     WHERE j.create_time >= ?
       ${untilClause}
       AND j.status IN ('not_found', 'failed')
       AND j.error_code IN (${errorPlaceholders})
       AND (b.icon_url IS NULL OR b.icon_url = '')
     ORDER BY j.id ASC
     ${lock ? 'FOR UPDATE' : ''}`,
    params,
  );
  return rows || [];
}

function summarize(rows) {
  const counts = {};
  for (const row of rows) {
    const key = `${row.status}:${row.errorCode}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  const since = parseDateArgument('since', true);
  const until = parseDateArgument('until');

  if (!apply) {
    const rows = await loadCandidates(pool, since, until);
    console.log(
      '[bookmark-icon-requeue] dryRun=true candidates=%s breakdown=%s',
      rows.length,
      JSON.stringify(summarize(rows)),
    );
    return;
  }

  const connection = await pool.getConnection();
  let requeued = 0;
  let cancelled = 0;
  try {
    await connection.beginTransaction();
    const rows = await loadCandidates(connection, since, until, { lock: true });

    for (const row of rows) {
      const currentUrl = String(row.currentUrl || '').trim();
      const originKey = normalizeOrigin(currentUrl);
      if (!currentUrl || !originKey) {
        const [result] = await connection.query(
          `UPDATE bookmark_icon_jobs
           SET status = 'cancelled',
               error_code = 'BOOKMARK_URL_UNAVAILABLE',
               finished_at = NOW(3),
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND user_id = ?`,
          [row.id, row.userId],
        );
        cancelled += Number(result?.affectedRows || 0);
        continue;
      }

      const urlHash = createHash('sha256').update(currentUrl).digest('hex');
      try {
        const [result] = await connection.query(
          `UPDATE bookmark_icon_jobs
           SET url_snapshot = ?,
               origin_key = ?,
               url_hash = ?,
               status = 'queued',
               attempts = 0,
               available_at = NOW(),
               error_code = NULL,
               finished_at = NULL,
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND user_id = ?`,
          [currentUrl, originKey, urlHash, row.id, row.userId],
        );
        requeued += Number(result?.affectedRows || 0);
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        const [result] = await connection.query(
          `UPDATE bookmark_icon_jobs
           SET status = 'cancelled',
               error_code = 'DUPLICATE_CURRENT_URL_JOB',
               finished_at = NOW(3),
               locked_at = NULL,
               locked_by = NULL
           WHERE id = ? AND user_id = ?`,
          [row.id, row.userId],
        );
        cancelled += Number(result?.affectedRows || 0);
      }
    }

    await connection.commit();
    console.log(
      '[bookmark-icon-requeue] dryRun=false candidates=%s requeued=%s cancelled=%s',
      rows.length,
      requeued,
      cancelled,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    '[bookmark-icon-requeue] failed code=%s usage="--since=ISO [--until=ISO] [--apply]"',
    String(error?.code || error?.name || 'UNKNOWN'),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
