import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import redisClient from '../redisClient.js';
import { INTERNAL_ROLES } from '../internalRoles.js';
import { decodeAdminListCursor, encodeAdminListCursor } from '../adminListCursor.js';

const DAY_MS = 86_400_000;
export const activityTime = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 23).replace('T', ' ');
const eligibleSql = `u.del_flag = 0 AND u.role NOT IN ('visitor', 'deleted')`;
const scopeSql = (hideInternal) =>
  eligibleSql + (hideInternal ? ` AND u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(',')})` : '');
const scopeParams = (hideInternal) => (hideInternal ? [...INTERNAL_ROLES] : []);
const telemetry = { accepted: 0, coalesced: 0, failed: 0 };
let lastFailureLog = 0;
export function activityFailure(error) {
  telemetry.failed++;
  if (Date.now() - lastFailureLog > 60_000) {
    lastFailureLog = Date.now();
    console.error(
      '[user-activity] failed code=%s counters=%j',
      /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'ACTIVITY_UNAVAILABLE',
      telemetry,
    );
  }
}
export const getActivityCounters = () => ({ ...telemetry });

export async function recordActivity(userId, { now = new Date(), db = pool, redis = redisClient } = {}) {
  if (!redis.isReady) throw Object.assign(new Error('Activity unavailable'), { code: 'ACTIVITY_REDIS_UNAVAILABLE' });
  const time = activityTime(now);
  const key = `user-activity:v1:${time.slice(0, 10)}:${userId}`;
  const token = randomUUID();
  // AbortSignal cancels queued commands too; never enqueue telemetry indefinitely during reconnect.
  const command = () => redis.withAbortSignal(AbortSignal.timeout(1000));
  const acquired = await command().set(key, token, { NX: true, EX: 60 });
  if (!acquired) {
    telemetry.coalesced++;
    return { accepted: true, recorded: false };
  }
  try {
    // Recheck the authoritative account, including disabled root accounts. No raw event history is stored.
    const [result] = await db.query(
      {
        sql: `INSERT INTO user_activity_daily (activity_date, user_id, first_active_at, last_active_at)
      SELECT ?, id, ?, ? FROM user WHERE id = ? AND del_flag = 0 AND role NOT IN ('visitor', 'deleted')
      ON DUPLICATE KEY UPDATE last_active_at = GREATEST(last_active_at, VALUES(last_active_at))`,
        timeout: 5000,
      },
      [time.slice(0, 10), time, time, userId],
    );
    telemetry.accepted++;
    return { accepted: result.affectedRows > 0, recorded: result.affectedRows > 0 };
  } catch (error) {
    try {
      await command().eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
        { keys: [key], arguments: [token] },
      );
    } catch {
      /* TTL bounds the reservation even if Redis disconnects. */
    }
    throw error;
  }
}

export async function activityCoverage({ db = pool, now = new Date() } = {}) {
  const [rows] = await db.query(
    "SELECT DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s.%f') AS startedAt FROM user_activity_metadata WHERE id = 1",
  );
  if (!rows[0]?.startedAt)
    throw Object.assign(new Error('Activity schema not ready'), { code: 'ACTIVITY_SCHEMA_NOT_READY' });
  const startedAt = rows[0].startedAt.slice(0, 23);
  const fullDaysFrom = activityTime(new Date(Date.parse(startedAt.replace(' ', 'T') + '+08:00') + DAY_MS)).slice(0, 10);
  return { available: true, startedAt, fullDaysFrom, partialToday: activityTime(now).slice(0, 10) < fullDaysFrom };
}

export async function queryActivitySummary({ hideInternal = true, now = new Date(), days = 7, db = pool } = {}) {
  const coverage = await activityCoverage({ db, now });
  const today = activityTime(now).slice(0, 10);
  const startDate = activityTime(new Date(now.getTime() - (days - 1) * DAY_MS)).slice(0, 10);
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT a.user_id) AS period,
    COUNT(DISTINCT CASE WHEN a.activity_date = ? THEN a.user_id END) AS today
    FROM user_activity_daily a STRAIGHT_JOIN user u ON u.id = a.user_id
    WHERE a.activity_date >= ? AND a.activity_date <= ? AND a.first_active_at <= ? AND ${scopeSql(hideInternal)}`,
    [today, startDate, today, activityTime(now), ...scopeParams(hideInternal)],
  );
  return {
    ...coverage,
    snapshotAt: activityTime(now),
    today: Number(rows[0]?.today || 0),
    period: Number(rows[0]?.period || 0),
    partialPeriod: startDate < coverage.fullDaysFrom,
  };
}

export async function queryActivityBaseline({ hideInternal, dates, cutoffTime, now = new Date(), db = pool }) {
  const coverage = await activityCoverage({ db, now });
  // All seven full comparable days must exist; an absent day after rollout is a real zero.
  if (!dates.length || dates[0] < coverage.fullDaysFrom) return null;
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(a.activity_date, '%Y-%m-%d') AS d, COUNT(*) AS c
    FROM user_activity_daily a STRAIGHT_JOIN user u ON u.id = a.user_id
    WHERE a.activity_date >= ? AND a.activity_date <= ? AND TIME(a.first_active_at) <= ? AND ${scopeSql(hideInternal)}
    GROUP BY a.activity_date`,
    [dates[0], dates.at(-1), cutoffTime, ...scopeParams(hideInternal)],
  );
  const counts = new Map(rows.map((row) => [row.d, Number(row.c)]));
  const values = dates.map((date) => counts.get(date) || 0);
  return { yesterday: values.at(-1), average7d: Number((values.reduce((a, b) => a + b, 0) / dates.length).toFixed(1)) };
}

function validActivityTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(value)) return false;
  const timestamp = Date.parse(value.replace(' ', 'T') + '+08:00');
  return Number.isFinite(timestamp) && activityTime(new Date(timestamp)) === value;
}
function invalidCursor() {
  return Object.assign(new Error('Invalid activity cursor'), { code: 'ADMIN_LIST_CURSOR_INVALID' });
}
export async function queryActiveUsers({
  actorId,
  hideInternal = true,
  cursor = null,
  snapshotAt = null,
  now = new Date(),
  db = pool,
}) {
  const coverage = await activityCoverage({ db, now });
  const current = activityTime(now);
  const date = current.slice(0, 10);
  const asOf = snapshotAt || current;
  if (!validActivityTime(asOf) || asOf.slice(0, 10) !== date || asOf > current) throw invalidCursor();
  const scope = `active-users:${actorId}:${hideInternal}:${asOf}`;
  const after = decodeAdminListCursor(cursor, scope);
  if (
    after &&
    (!validActivityTime(after.value) ||
      after.value > asOf ||
      after.value.slice(0, 10) !== date ||
      after.id.length > 255)
  )
    throw invalidCursor();
  const where = `a.activity_date = ? AND a.first_active_at <= ? AND ${scopeSql(hideInternal)}`;
  const params = [date, asOf, ...scopeParams(hideInternal)];
  const [[totals], [rows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM user_activity_daily a STRAIGHT_JOIN user u ON u.id = a.user_id WHERE ${where}`,
      params,
    ),
    db.query(
      `SELECT u.id, u.alias AS name, COALESCE(r.remark_name, '') AS userRemark,
      DATE_FORMAT(a.first_active_at, '%Y-%m-%d %H:%i:%s.%f') AS firstActiveAt,
      DATE_FORMAT(a.last_active_at, '%Y-%m-%d %H:%i:%s.%f') AS lastActiveAt
      FROM user_activity_daily a STRAIGHT_JOIN user u ON u.id = a.user_id
      LEFT JOIN admin_user_remarks r ON r.admin_user_id = ? AND r.target_user_id = u.id
      WHERE ${where}${after ? ' AND (a.first_active_at < ? OR (a.first_active_at = ? AND a.user_id < ?))' : ''}
      ORDER BY a.first_active_at DESC, a.user_id DESC LIMIT 21`,
      [actorId, ...params, ...(after ? [after.value, after.value, after.id] : [])],
    ),
  ]);
  const items = rows.slice(0, 20).map((row) => ({
    ...row,
    firstActiveAt: row.firstActiveAt.slice(0, 23),
    lastActiveAt: row.lastActiveAt.slice(0, 23),
  }));
  const last = items.at(-1);
  return {
    ...coverage,
    date,
    snapshotAt: asOf,
    hideInternal,
    total: Number(totals[0]?.total || 0),
    items,
    hasMore: rows.length > 20,
    nextCursor: rows.length > 20 ? encodeAdminListCursor(scope, { value: last.firstActiveAt, id: last.id }) : null,
  };
}
