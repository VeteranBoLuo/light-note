import pool from '../../db/index.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createNotification } from '../notification.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { POINTS_ACCOUNT_ELIGIBLE } from '../pointsAudienceEligibility.js';
import { grantPointsIdempotently } from '../pointsGrantOperations.js';
import { lockLeaderboardFacts } from '../leaderboardSettlementLock.js';
import {
  addLeaderboardDays,
  getLeaderboardConfig,
  LEADERBOARD_REWARD_REASON,
  leaderboardOpen,
  leaderboardRange,
  leaderboardAwards,
  leaderboardWeekMode,
  orderLeaderboard,
} from '../leaderboardPolicy.js';
import { readLeaderboardAccounts, readLeaderboardScores } from './leaderboardRead.js';

const TICK_MS = 10 * 60_000;
const BATCH_SIZE = 100;
const WEEKS_PER_TICK = 4;
const IN_APP = "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.notificationsInApp')), 'true')";

export async function assertLeaderboardReady(db, config = getLeaderboardConfig()) {
  if (!config.openWeek) return;
  const [[anchor]] = await db.query(
    "SELECT DATE_FORMAT(MIN(period_key), '%Y-%m-%d') AS week FROM leaderboard_periods WHERE board = 'week'",
  );
  if (anchor.week && anchor.week !== config.openWeek) {
    throw Object.assign(new Error('The first leaderboard week is already recorded'), { code: 'LEADERBOARD_OPEN_WEEK_CHANGED' });
  }
  await db.query('SELECT position, score, active_days, reward_state, notified_at FROM leaderboard_results LIMIT 0');
  const [[lock]] = await db.query(
    `SELECT ENGINE AS engine FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leaderboard_settlement_lock'
         AND EXISTS (SELECT 1 FROM leaderboard_settlement_lock WHERE id = 1)`,
  );
  if (lock?.engine?.toLowerCase() !== 'innodb') {
    throw Object.assign(new Error('Leaderboard settlement requires an InnoDB lock row'), { code: 'LEADERBOARD_LOCK_MISSING' });
  }
}

async function transaction(db, work) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

async function recordWeek(db, week, config) {
  await db.query(
    `INSERT INTO leaderboard_periods (board, period_key, period_end, mode)
       VALUES ('week', ?, ?, ?)
       ON DUPLICATE KEY UPDATE period_key = VALUES(period_key)`,
    [week, addLeaderboardDays(week, 7), leaderboardWeekMode(week, config)],
  );
}

async function freezeWeek(db, week, config) {
  return transaction(db, async (conn) => {
    await recordWeek(conn, week, config);
    const [[period]] = await conn.query(
      "SELECT state FROM leaderboard_periods WHERE board = 'week' AND period_key = ? FOR UPDATE",
      [week],
    );
    if (period.state !== 'open') return false;

    // Lock before the first snapshot read so all previously written facts are visible.
    await lockLeaderboardFacts(conn, { forSettlement: true });
    const mode = leaderboardWeekMode(week, config);
    const range = { start: week, end: addLeaderboardDays(week, 7) };
    const { scores } = await readLeaderboardScores('week', range, conn);
    const accounts = await readLeaderboardAccounts(conn, scores.map((row) => row.userId));
    const ranked = orderLeaderboard(scores, accounts);
    const { qualifiedCount, awards } = leaderboardAwards(ranked, mode);
    // Freeze every place so players can also see their own rank below the public cutoff.
    for (let offset = 0; offset < ranked.length; offset += BATCH_SIZE) {
      const records = ranked.slice(offset, offset + BATCH_SIZE).map((row) => {
        const points = awards.get(row.rank) ?? 0;
        return ['week', week, row.userId, row.rank, row.score, row.activeDays,
          points ? row.rank : null, points, points ? 'pending' : 'none'];
      });
      await conn.query(
        `INSERT INTO leaderboard_results
           (board, period_key, user_id, position, score, active_days, reward_slot, reward_points, reward_state)
         VALUES ?`,
        [records],
      );
    }
    await conn.query(
      `UPDATE leaderboard_periods SET mode = ?, state = ?, frozen_at = NOW(), qualified_count = ?, slots = ?
        WHERE board = 'week' AND period_key = ?`,
      [mode, awards.size ? 'frozen' : 'complete', qualifiedCount, awards.size, week],
    );
    return true;
  });
}

async function activeAccountForUpdate(conn, userId) {
  const [[account]] = await conn.query(
    `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.lang')), 'zh-CN') AS lang,
            ${IN_APP} AS inApp
       FROM user u WHERE u.id = ? AND ${POINTS_ACCOUNT_ELIGIBLE} FOR UPDATE`,
    [userId],
  );
  if (!account) return null;
  const [[ban]] = await conn.query(
    'SELECT is_active AS active FROM security_account_bans WHERE user_id = ? FOR UPDATE',
    [userId],
  );
  return Number(ban?.active) === 1 ? null : account;
}

async function sendAward(db, { week, userId }) {
  return transaction(db, async (conn) => {
    const [[row]] = await conn.query(
      `SELECT position AS \`rank\`, reward_points AS points, reward_slot AS slot, reward_state AS state
         FROM leaderboard_results WHERE board = 'week' AND period_key = ? AND user_id = ? FOR UPDATE`,
      [week, userId],
    );
    if (row?.state !== 'pending') return;
    if (!(await activeAccountForUpdate(conn, userId))) {
      await conn.query(
        `UPDATE leaderboard_results SET reward_state = 'skipped', reward_error = 'account_ineligible'
          WHERE board = 'week' AND period_key = ? AND user_id = ?`,
        [week, userId],
      );
      return;
    }
    const points = Number(row.points);
    const receipt = await grantPointsIdempotently(
      {
        userId,
        requestId: `leaderboard:week:${week}`,
        operationType: LEADERBOARD_REWARD_REASON,
        reason: LEADERBOARD_REWARD_REASON,
        ref: week,
        policyVersion: 'leaderboard-v1',
        points,
        meta: { week, rank: Number(row.rank), rewardSlot: Number(row.slot) },
      },
      { db: conn },
    );
    if (receipt.granted !== points) {
      throw Object.assign(new Error('Leaderboard receipt differs from frozen award'), { code: 'LEADERBOARD_REWARD_MISMATCH' });
    }
    await conn.query(
      "UPDATE leaderboard_results SET reward_state = 'paid' WHERE board = 'week' AND period_key = ? AND user_id = ?",
      [week, userId],
    );
  });
}

async function notifyAward(db, { week, userId }) {
  return transaction(db, async (conn) => {
    const [[row]] = await conn.query(
      `SELECT position AS \`rank\`, reward_slot AS slot, reward_points AS points, reward_state AS state, notified_at AS notifiedAt
         FROM leaderboard_results WHERE board = 'week' AND period_key = ? AND user_id = ? FOR UPDATE`,
      [week, userId],
    );
    if (row?.state !== 'paid' || row.notifiedAt) return;
    const account = await activeAccountForUpdate(conn, userId);
    if (account && account.inApp !== 'false') {
      const end = addLeaderboardDays(week, 6);
      const en = account.lang === 'en-US';
      await createNotification(userId, {
        type: 'system',
        title: en ? 'Weekly leaderboard reward' : '积分周榜奖励已到账',
        content: en
          ? `${week} – ${end}: your rank was #${row.rank} and you earned ${row.points} points.`
          : `${week} 至 ${end}，你在周榜排名第 ${row.rank}，获得 ${row.points} 积分奖励。`,
        link: '/growth?section=leaderboard',
        sourceType: LEADERBOARD_REWARD_REASON,
        sourceId: `week:${week}`,
        meta: { week, rank: Number(row.rank), rewardSlot: Number(row.slot), points: Number(row.points) },
        inAppOnly: true,
      }, conn);
    }
    await conn.query(
      'UPDATE leaderboard_results SET notified_at = NOW() WHERE board = ? AND period_key = ? AND user_id = ?',
      ['week', week, userId],
    );
  });
}

async function processOutbox(db, state, handler) {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(period_key, '%Y-%m-%d') AS week, user_id AS userId
       FROM leaderboard_results WHERE board = 'week' AND reward_state = ? AND notified_at IS NULL
      ORDER BY period_key, position LIMIT ?`,
    [state, BATCH_SIZE],
  );
  for (const row of rows) {
    try {
      await handler(db, row);
    } catch (error) {
      console.error('[leaderboard] %s processing failed code=%s', state, stableAgentErrorCode(error));
    }
  }
}

async function finishWeeks(db) {
  // Frozen result rows only move toward completion. Read the candidates without
  // locking the outbox, then update one primary-key row at a time.
  const [completed] = await db.query(
    `SELECT DATE_FORMAT(p.period_key, '%Y-%m-%d') AS week
       FROM leaderboard_periods p WHERE p.board = 'week' AND p.state = 'frozen'
        AND NOT EXISTS (
          SELECT 1 FROM leaderboard_results r WHERE r.board = p.board AND r.period_key = p.period_key
            AND (r.reward_state = 'pending' OR (r.reward_state = 'paid' AND r.notified_at IS NULL))
        )`,
  );
  for (const { week } of completed) {
    await db.query(
      "UPDATE leaderboard_periods SET state = 'complete' WHERE board = 'week' AND period_key = ? AND state = 'frozen'",
      [week],
    );
  }
}

export async function runLeaderboardSettlement({ db = pool, config = getLeaderboardConfig(), now } = {}) {
  if (!config.openWeek) return;
  if (!now) {
    // Use the same clock that timestamps the point and harvest records.
    const [[clock]] = await db.query('SELECT UNIX_TIMESTAMP() AS seconds');
    now = new Date(Number(clock.seconds) * 1000);
  }
  if (!leaderboardOpen(config, now)) return;
  const { start: thisWeek } = leaderboardRange('week', now);
  await recordWeek(db, config.openWeek, config);
  if (thisWeek !== config.openWeek) await recordWeek(db, thisWeek, config);

  const [finished] = await db.query(
    `SELECT DATE_FORMAT(period_key, '%Y-%m-%d') AS week FROM leaderboard_periods
      WHERE board = 'week' AND period_key < ? AND state <> 'open'`,
    [thisWeek],
  );
  const closed = new Set(finished.map((row) => row.week));
  let remaining = WEEKS_PER_TICK;
  for (let week = config.openWeek; week < thisWeek && remaining; week = addLeaderboardDays(week, 7)) {
    if (closed.has(week)) continue;
    try {
      await freezeWeek(db, week, config);
    } catch (error) {
      console.error('[leaderboard] freeze failed code=%s', stableAgentErrorCode(error));
    }
    remaining--;
  }
  if (config.rewardsEnabled) await processOutbox(db, 'pending', sendAward);
  await processOutbox(db, 'paid', notifyAward);
  await finishWeeks(db);
}

export function startLeaderboardScheduler() {
  const config = getLeaderboardConfig();
  if (!config.openWeek || !notificationSchedulerEnabled()) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runLeaderboardSettlement({ config });
    } catch (error) {
      console.error('[leaderboard] scheduler failed code=%s', stableAgentErrorCode(error));
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(tick, TICK_MS).unref();
}
