import pool from '../../db/index.js';
import { notificationPresentation } from '@lightnote/shared/notification-presentation';
import { createNotification } from '../notification.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createKnowledgeManorService } from './knowledgeManorService.js';
import { readManorRuntime } from './knowledgeManorRuntime.js';
import { knowledgeManorEnabled } from './knowledgeManorAccess.js';
import {
  MANOR_NUDGE_SOURCE,
  MANOR_RECENT_MS,
  manorNudgeSourceId,
  manorPreferences,
  manorNudgeCalendar,
  manorAccountEligible,
  manorNotificationsEnabled,
  recentManorOperation,
  operatedManorToday,
  manorNudgeReasons,
  hasManorDigest,
  manorNudgeType,
  manorNudgeMeta,
} from './knowledgeManorNudgePolicy.js';

const POLL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 50;
const MAX_BATCHES = 20;
const emptyCounts = () => ({ scanned: 0, candidates: 0, sent: 0, duplicates: 0, skipped: 0, failed: 0 });

/** No scheduler guard in this explicitly injectable core: fixtures never need a production runtime. */
export function createManorNudgeService({
  db,
  now = () => new Date(),
  env = process.env,
  logger = console,
  attention = createKnowledgeManorService({ db, now }).attention,
  notify = (userId, payload) => createNotification(userId, payload, db),
  runtimeReader = readManorRuntime,
} = {}) {
  if (!db || typeof db.query !== 'function') throw new Error('MANOR_NUDGE_DATABASE_REQUIRED');
  async function readContext(userId) {
    const [[account]] = await db.query('SELECT id,role,del_flag,preferences FROM user WHERE id=? LIMIT 1', [userId]);
    if (!manorAccountEligible(account, env)) return null;
    const [[saved]] = await db.query(
      'SELECT revision,UNIX_TIMESTAMP(updated_at)*1000 AS updatedAtMs FROM knowledge_manors WHERE user_id=?',
      [userId],
    );
    if (!saved) return null;
    const [[calendarPreferences]] = await db.query(
      'SELECT timezone,utc_offset_minutes AS utcOffsetMinutes FROM user_growth_preferences WHERE user_id=?',
      [userId],
    );
    return {
      account,
      updatedAtMs: Number(saved.updatedAtMs),
      revision: Number(saved.revision),
      calendarPreferences: calendarPreferences || {},
      preferences: manorPreferences(account.preferences),
    };
  }

  function eligibleContext(context, clock) {
    return (
      context && manorNotificationsEnabled(context.preferences) && recentManorOperation(context.updatedAtMs, clock)
    );
  }

  async function runBatch({ after = null, limit = BATCH_SIZE } = {}) {
    const counts = emptyCounts(),
      clock = now();
    if (!knowledgeManorEnabled(env) || (await runtimeReader(db)).mode !== 'open')
      return { ...counts, nextCursor: null };
    limit = Math.max(1, Math.min(100, Math.trunc(Number(limit)) || BATCH_SIZE));
    const params = [(clock.getTime() - MANOR_RECENT_MS) / 1000, clock.getTime() / 1000];
    const seek = after ? ' AND (updated_at>FROM_UNIXTIME(?) OR (updated_at=FROM_UNIXTIME(?) AND user_id>?))' : '';
    if (after) params.push(after.updatedAtMs / 1000, after.updatedAtMs / 1000, after.userId);
    const [rows] = await db.query(
      `SELECT user_id AS userId,UNIX_TIMESTAMP(updated_at)*1000 AS updatedAtMs
      FROM knowledge_manors WHERE updated_at BETWEEN FROM_UNIXTIME(?) AND FROM_UNIXTIME(?)
      AND JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.adopted'))='true'${seek} ORDER BY updated_at,user_id LIMIT ?`,
      [...params, limit],
    );
    counts.scanned = rows.length;
    if (!rows.length) return { ...counts, nextCursor: null };
    const ids = rows.map((row) => row.userId),
      slots = ids.map(() => '?').join(',');
    // Separate point/range reads avoid converting indexed legacy user IDs in cross-charset joins.
    const [users] = await db.query(`SELECT id,role,del_flag,preferences FROM user WHERE id IN (${slots})`, ids);
    const [calendars] = await db.query(
      `SELECT user_id AS userId,timezone,utc_offset_minutes AS utcOffsetMinutes
      FROM user_growth_preferences WHERE user_id IN (${slots})`,
      ids,
    );
    const accounts = new Map(users.map((user) => [user.id, user]));
    const calendarByUser = new Map(calendars.map((row) => [row.userId, row]));
    for (const candidate of rows) {
      try {
        const account = accounts.get(candidate.userId);
        if (!manorAccountEligible(account, env)) continue;
        const calendar = manorNudgeCalendar(clock, calendarByUser.get(candidate.userId));
        if (!calendar.inWindow) continue;
        counts.candidates++;
        const preferences = manorPreferences(account.preferences);
        if (
          !manorNotificationsEnabled(preferences) ||
          (preferences.notifyManorWater === false && preferences.notifyManorDigest === false)
        ) {
          counts.skipped++;
          continue;
        }
        const [[existing]] = await db.query(
          'SELECT id FROM notification WHERE user_id=? AND source_type=? AND source_id=? LIMIT 1',
          [candidate.userId, MANOR_NUDGE_SOURCE, manorNudgeSourceId(candidate.userId, calendar.dayKey)],
        );
        if (existing) {
          counts.duplicates++;
          continue;
        }
        const before = await readContext(candidate.userId);
        if (!eligibleContext(before, now())) {
          counts.skipped++;
          continue;
        }
        const summary = await attention(candidate.userId);
        const current = await readContext(candidate.userId),
          currentTime = now();
        if (
          !eligibleContext(current, currentTime) ||
          current.revision !== before.revision ||
          current.updatedAtMs !== before.updatedAtMs
        ) {
          counts.skipped++;
          continue;
        }
        const currentCalendar = manorNudgeCalendar(currentTime, current.calendarPreferences);
        const beforeCalendar = manorNudgeCalendar(clock, before.calendarPreferences);
        if (
          !currentCalendar.inWindow ||
          currentCalendar.dayKey !== beforeCalendar.dayKey ||
          currentCalendar.timezone !== beforeCalendar.timezone ||
          (await runtimeReader(db)).mode !== 'open'
        ) {
          counts.skipped++;
          continue;
        }
        const reasons = manorNudgeReasons(
          summary,
          current.preferences,
          operatedManorToday(current.updatedAtMs, currentCalendar),
        );
        const type = manorNudgeType(reasons);
        if (!type) {
          counts.skipped++;
          continue;
        }
        const payload = {
          type,
          link: '/knowledge-manor',
          sourceType: MANOR_NUDGE_SOURCE,
          sourceId: manorNudgeSourceId(candidate.userId, currentCalendar.dayKey),
          meta: {
            manor: {
              dayKey: currentCalendar.dayKey,
              timezone: currentCalendar.timezone,
              expiresAt: currentCalendar.expiresAt,
              ...reasons,
            },
          },
        };
        Object.assign(payload, notificationPresentation(payload, current.preferences.lang || 'zh-CN'));
        if (await notify(candidate.userId, payload)) counts.sent++;
        else counts.duplicates++;
      } catch (error) {
        counts.failed++;
        logger.warn('[庄园提醒] 单账号失败 code=%s', stableAgentErrorCode(error));
      }
    }
    const last = rows.at(-1);
    return {
      ...counts,
      nextCursor: rows.length === limit ? { userId: last.userId, updatedAtMs: Number(last.updatedAtMs) } : null,
    };
  }

  async function preparePush(notification, { full = false } = {}) {
    const meta = manorNudgeMeta(notification);
    if (!meta) return { status: 'cancelled', code: 'MANOR_NUDGE_INVALID' };
    let clock = now();
    if (new Date(meta.expiresAt).getTime() <= clock.getTime())
      return { status: 'expired', code: 'MANOR_NUDGE_EXPIRED' };
    let current = await readContext(notification.user_id);
    clock = now();
    if (!eligibleContext(current, clock) || (await runtimeReader(db)).mode !== 'open')
      return { status: 'cancelled', code: 'MANOR_NUDGE_UNAVAILABLE' };
    const water = notification.type === 'manor_water_expiring';
    const enabled = (preferences) =>
      water ? preferences.notifyManorWater !== false : preferences.notifyManorDigest !== false;
    if (!enabled(current.preferences)) return { status: 'cancelled', code: 'MANOR_NUDGE_DISABLED' };
    let calendar = manorNudgeCalendar(clock, current.calendarPreferences);
    if (calendar.dayKey !== meta.dayKey) return { status: 'expired', code: 'MANOR_NUDGE_EXPIRED' };
    let updated = notification;
    if (full) {
      let summary;
      try {
        summary = await attention(notification.user_id);
      } catch (error) {
        if (error?.code === 'MANOR_ACCOUNT_UNAVAILABLE')
          return { status: 'cancelled', code: 'MANOR_NUDGE_UNAVAILABLE' };
        throw error;
      }
      const before = current;
      current = await readContext(notification.user_id);
      clock = now();
      if (
        !eligibleContext(current, clock) ||
        !enabled(current.preferences) ||
        (await runtimeReader(db)).mode !== 'open'
      )
        return { status: 'cancelled', code: 'MANOR_NUDGE_UNAVAILABLE' };
      calendar = manorNudgeCalendar(clock, current.calendarPreferences);
      if (calendar.dayKey !== meta.dayKey) return { status: 'expired', code: 'MANOR_NUDGE_EXPIRED' };
      if (
        before.revision !== current.revision ||
        before.updatedAtMs !== current.updatedAtMs ||
        before.calendarPreferences.timezone !== current.calendarPreferences.timezone
      )
        throw Object.assign(new Error('MANOR_NUDGE_CHANGED'), { code: 'MANOR_NUDGE_CHANGED' });
      const reasons = manorNudgeReasons(
        summary,
        current.preferences,
        operatedManorToday(current.updatedAtMs, calendar),
      );
      if (water ? !reasons.water : !hasManorDigest(reasons))
        return { status: 'cancelled', code: 'MANOR_NUDGE_COLLECTED' };
      if (!water) reasons.water = 0; // A digest never changes into another notification type.
      updated = { ...notification, meta: { manor: { ...meta, ...reasons } } };
    }
    const expiresAtMs = Math.min(new Date(meta.expiresAt).getTime(), new Date(calendar.expiresAt).getTime());
    if (expiresAtMs <= clock.getTime()) return { status: 'expired', code: 'MANOR_NUDGE_EXPIRED' };
    return { status: 'ready', notification: updated, expiresAtMs };
  }

  return { runBatch, preparePush };
}

let running = false,
  cursor = null;
export async function generateManorNudges({ service, env = process.env, logger = console } = {}) {
  if (!notificationSchedulerEnabled(env) || running) return;
  running = true;
  const totals = emptyCounts();
  try {
    service ||= createManorNudgeService({ db: pool, env, logger });
    for (let i = 0; i < MAX_BATCHES; i++) {
      const result = await service.runBatch({ after: cursor });
      for (const key of Object.keys(totals)) totals[key] += result[key];
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    if (totals.candidates || totals.failed) logger.log('[庄园提醒] 本轮统计 %j', totals);
    return totals;
  } catch (error) {
    logger.warn('[庄园提醒] 生成失败 code=%s', stableAgentErrorCode(error));
  } finally {
    running = false;
  }
}

export function startManorNudgeScheduler({ env = process.env, run = () => generateManorNudges({ env }) } = {}) {
  if (!notificationSchedulerEnabled(env)) return () => {};
  void run();
  const timer = setInterval(() => {
    void run();
  }, POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
