import pool from '../../db/index.js';
import { POINTS_ACCOUNT_ELIGIBLE, POINTS_ACCOUNT_NOT_BANNED } from '../pointsAudienceEligibility.js';
import {
  compareLeaderboardScores,
  LEADERBOARD_ACTIVITY_REASONS,
  LEADERBOARD_LIMIT,
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_SCORE,
  LEADERBOARD_PRIZES,
  leaderboardAwards,
  leaderboardQualified,
  leaderboardRange,
  leaderboardServerShift,
  leaderboardSqlDate,
  leaderboardWeekMode,
  orderLeaderboard,
} from '../leaderboardPolicy.js';

const DAILY_SOURCES = `(${LEADERBOARD_ACTIVITY_REASONS.map((reason) => `'${reason}'`).join(', ')})`;
const MANOR_ACTION = "JSON_UNQUOTE(JSON_EXTRACT(l.meta, '$.manorAction'))";
const AQUARIUM_SALE = `${MANOR_ACTION} IN ('sell', 'sellAllWaitingFish')`;
const AQUARIUM_BATCH_SALE = `${MANOR_ACTION} = 'sellAllWaitingFish'`;
const AQUARIUM_FIRST_SALE_POINTS = "JSON_EXTRACT(l.meta, '$.manorFreeCastFirstSalePoints')";
const AQUARIUM_BATCH_SCORE = `CAST(JSON_UNQUOTE(${AQUARIUM_FIRST_SALE_POINTS}) AS SIGNED)`;
const CACHE_MS = 5 * 60_000;
const liveCache = new Map();

function scoringCondition(board) {
  const oneTime = board === 'total' ? " OR l.reason IN ('achievement', 'streak_milestone')" : '';
  return `l.delta > 0 AND (
    l.reason IN ${DAILY_SOURCES}
    OR (l.reason = 'manor_sale' AND (
      ${MANOR_ACTION} IN ('sellCrop', 'sellAllCrops')
      OR (${MANOR_ACTION} = 'sell' AND JSON_EXTRACT(l.meta, '$.manorFreeCastFirstSale') = CAST('true' AS JSON))
      OR (${AQUARIUM_BATCH_SALE} AND JSON_TYPE(${AQUARIUM_FIRST_SALE_POINTS}) = 'INTEGER'
        AND ${AQUARIUM_BATCH_SCORE} BETWEEN 1 AND l.delta)
    ))
    ${oneTime}
  )`;
}

function bounds(column, times) {
  return times.length ? `AND ${column} >= ? AND ${column} < ?` : '';
}

async function timeBounds(db, range) {
  const [[offset]] = await db.query('SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS serverOffset');
  const shift = leaderboardServerShift(Number(offset.serverOffset));
  const times = range ? [leaderboardSqlDate(range.start, shift), leaderboardSqlDate(range.end, shift)] : [];
  return { shift, times };
}

async function readActiveDays(db, { shift, times }, userId = null) {
  const owner = userId ? 'user_id = ? AND ' : '';
  const params = [shift, ...(userId ? [userId] : []), ...times];
  // Read each table's days separately so different historical collations cannot break the union.
  const [taskDays] = await db.query(
    `SELECT DISTINCT user_id AS userId, DATE_FORMAT(DATE_ADD(create_time, INTERVAL ? MINUTE), '%Y-%m-%d') AS activeDay
       FROM points_log WHERE ${owner}delta > 0 AND reason IN ${DAILY_SOURCES} ${bounds('create_time', times)}`,
    params,
  );
  const [harvestDays] = await db.query(
    `SELECT DISTINCT user_id AS userId, DATE_FORMAT(DATE_ADD(created_at, INTERVAL ? MINUTE), '%Y-%m-%d') AS activeDay
       FROM knowledge_manor_operations WHERE ${owner}action = 'harvest' AND effectful = 1 ${bounds('created_at', times)}`,
    params,
  );

  const days = new Map();
  for (const { userId, activeDay } of [...taskDays, ...harvestDays]) {
    if (!days.has(userId)) days.set(userId, new Set());
    days.get(userId).add(activeDay);
  }
  return days;
}

export async function readLeaderboardScores(board, range, db) {
  const dates = await timeBounds(db, range);
  const [points] = await db.query(
    `SELECT l.user_id AS userId,
            CASE WHEN l.reason = 'manor_sale' AND ${AQUARIUM_SALE}
              THEN 'manor_aquarium_sale' ELSE l.reason END AS scoreSource,
            SUM(CASE WHEN l.reason = 'manor_sale' AND ${AQUARIUM_BATCH_SALE}
              THEN ${AQUARIUM_BATCH_SCORE} ELSE l.delta END) AS points,
            DATE_FORMAT(MAX(l.create_time), '%Y-%m-%d %H:%i:%s') AS reachedAt
       FROM points_log l WHERE ${scoringCondition(board)} ${bounds('l.create_time', dates.times)}
      GROUP BY l.user_id, scoreSource`,
    dates.times,
  );
  const days = await readActiveDays(db, dates);

  const scores = new Map();
  for (const { userId, scoreSource, points: amount, reachedAt } of points) {
    if (!scores.has(userId)) {
      scores.set(userId, { userId, score: 0, reachedAt, activeDays: days.get(userId)?.size ?? 0, sources: {} });
    }
    const row = scores.get(userId);
    row.score += Number(amount);
    row.sources[scoreSource] = Number(amount);
    if (reachedAt > row.reachedAt) row.reachedAt = reachedAt;
  }
  return { scores: [...scores.values()], days };
}

function liveScores(board, range, db) {
  if (db !== pool) return readLeaderboardScores(board, range, db);
  const key = range?.start || 'total';
  const cached = liveCache.get(board);
  if (cached?.key === key && cached.expires > Date.now()) return cached.loading;
  const entry = { key, expires: Date.now() + CACHE_MS };
  entry.loading = readLeaderboardScores(board, range, db).catch((error) => {
    if (liveCache.get(board) === entry) liveCache.delete(board);
    throw error;
  });
  liveCache.set(board, entry);
  return entry.loading;
}

export async function readLeaderboardAccounts(db, userIds, includeProfile = false) {
  if (!userIds.length) return new Map();
  const fields = includeProfile ? `,
        u.alias AS nickname, i.community_id AS communityId,
        LEFT(SHA2(NULLIF(u.head_picture, ''), 256), 16) AS avatarVersion` : '';
  const community = includeProfile ? 'LEFT JOIN community_chat_user_identities i ON i.user_id = u.id' : '';
  const accounts = new Map();
  for (let index = 0; index < userIds.length; index += 250) {
    const [rows] = await db.query(
      `SELECT u.id AS userId${fields} FROM user u ${community}
        WHERE u.id IN (?) AND ${POINTS_ACCOUNT_ELIGIBLE} AND ${POINTS_ACCOUNT_NOT_BANNED}`,
      [userIds.slice(index, index + 250)],
    );
    for (const row of rows) accounts.set(row.userId, row);
  }
  return accounts;
}

export async function readWeeklyLeaderboardRank(participantId, { db = pool, now = new Date() } = {}) {
  const { scores } = await liveScores('week', leaderboardRange('week', now), db);
  const own = scores.find(({ userId }) => userId === participantId);
  if (!own) return null;

  const ahead = scores.filter((row) => compareLeaderboardScores(row, own) < 0).map(({ userId }) => userId);
  const accounts = await readLeaderboardAccounts(db, [participantId, ...ahead]);
  return accounts.has(participantId) ? ahead.filter((id) => accounts.has(id)).length + 1 : null;
}

export function leaderboardNickname(value) {
  const name = String(value ?? '').trim();
  const normalized = name.normalize('NFKC');
  const phone = /^(?:(?:\+?86)[\s-]?)?(1[3-9]\d{9})$/.exec(normalized.replace(/[\s()-]/g, ''));
  if (phone) return `${phone[1].slice(0, 3)}****${phone[1].slice(-4)}`;
  if (/^\S+@\S+\.\S+$/.test(normalized)) return '';
  return name;
}

function publicRow(row, profile, participantId, championId = null) {
  if (!profile) return { rank: Number(row.rank), unavailable: true };
  const communityId = profile.communityId || null;
  const avatar = communityId && profile.avatarVersion
    ? `/api/growth/leaderboard/avatar/${encodeURIComponent(communityId)}?v=${profile.avatarVersion}`
    : null;
  return {
    rank: Number(row.rank),
    nickname: leaderboardNickname(profile.nickname),
    communityId,
    avatar,
    score: Number(row.score),
    activeDays: Number(row.activeDays),
    qualified: leaderboardQualified(row),
    isMe: row.userId === participantId,
    champion: row.userId === championId,
    rewardSlot: Number(row.rewardSlot) || null,
    rewardPoints: Number(row.rewardPoints) || 0,
    rewardState: row.rewardState || 'none',
  };
}

async function readPrevious(range, common, participantId, db) {
  const [[period]] = await db.query(
    `SELECT mode, state, qualified_count AS qualifiedCount, slots
       FROM leaderboard_periods WHERE board = 'week' AND period_key = ?`,
    [range.start],
  );
  if (!period || period.state === 'open') {
    return { ...common, range, phase: 'closing', rows: [], mine: null, ownDays: 0, total: 0, weekly: null };
  }
  const [rows] = await db.query(
    `SELECT user_id AS userId, position AS \`rank\`, score, active_days AS activeDays,
            reward_slot AS rewardSlot, reward_points AS rewardPoints, reward_state AS rewardState
       FROM leaderboard_results WHERE board = 'week' AND period_key = ? AND (position <= ? OR user_id = ?)
      ORDER BY position`,
    [range.start, LEADERBOARD_LIMIT, participantId],
  );
  const [[counts]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(reward_state = 'paid') AS paidSlots
       FROM leaderboard_results WHERE board = 'week' AND period_key = ?`,
    [range.start],
  );
  const userIds = rows.map((row) => row.userId);
  if (participantId && !userIds.includes(participantId)) userIds.push(participantId);
  const profiles = await readLeaderboardAccounts(db, userIds, true);
  const visible = rows.map((row) => publicRow(row, profiles.get(row.userId), participantId));
  const mine = visible.find((row) => row.isMe) || null;
  let ownDays = mine?.activeDays ?? 0;
  if (!mine && profiles.has(participantId)) {
    // Unranked accounts can still have valid harvest days. Their activity is
    // available in the original receipts for both new and existing snapshots.
    const days = await readActiveDays(db, await timeBounds(db, range), participantId);
    ownDays = days.get(participantId)?.size ?? 0;
  }
  return {
    ...common,
    range,
    phase: 'settled',
    rows: visible.filter((row) => row.rank <= LEADERBOARD_LIMIT),
    mine,
    ownDays,
    total: Number(counts.total),
    weekly: { mode: period.mode, qualifiedCount: Number(period.qualifiedCount), slots: Number(period.slots), paidSlots: Number(counts.paidSlots) },
  };
}

export async function readLeaderboard(participantId, board, previous, { db = pool, config, now = new Date() }) {
  const last = leaderboardRange('week', now, true);
  const previousAvailable = last.start >= config.openWeek;
  const common = {
    board, previousAvailable, canParticipate: Boolean(participantId),
    rules: { limit: LEADERBOARD_LIMIT, minimumScore: LEADERBOARD_MIN_SCORE, minimumDays: LEADERBOARD_MIN_DAYS, prizes: LEADERBOARD_PRIZES },
  };
  const range = leaderboardRange(board, now, previous);
  if (previous && board === 'week') return readPrevious(range, common, participantId, db);

  const { scores, days } = await liveScores(board, range, db);
  const profiles = await readLeaderboardAccounts(db, scores.map((row) => row.userId), true);
  const ranked = orderLeaderboard(scores, profiles);
  let weekly = null;
  let championId = null;
  let scoreAtLastSeat = null;
  if (board === 'week') {
    const [[period]] = await db.query(
      "SELECT mode, state FROM leaderboard_periods WHERE board = 'week' AND period_key = ?",
      [range.start],
    );
    const mode = period && period.state !== 'open' ? period.mode : leaderboardWeekMode(range.start, config);
    const { qualifiedCount, awards } = leaderboardAwards(ranked, mode);
    weekly = { mode, qualifiedCount, slots: awards.size, paidSlots: 0 };
    for (const [rank, points] of awards) {
      const row = ranked[rank - 1];
      row.rewardSlot = rank;
      row.rewardPoints = points;
      scoreAtLastSeat = row.score;
    }
    if (previousAvailable) {
      const [[champion]] = await db.query(
        `SELECT user_id AS userId FROM leaderboard_results
          WHERE board = 'week' AND period_key = ? AND position = 1 LIMIT 1`,
        [last.start],
      );
      championId = champion?.userId || null;
    }
  }
  const own = ranked.find((row) => row.userId === participantId);
  const mine = own ? { ...publicRow(own, profiles.get(participantId), participantId, championId), sources: own.sources } : null;
  const rows = ranked.slice(0, LEADERBOARD_LIMIT).map((row) => publicRow(row, profiles.get(row.userId), participantId, championId));
  return {
    ...common, range, phase: 'live', rows, mine, ownDays: days.get(participantId)?.size ?? 0,
    total: ranked.length, weekly, scoreAtLastSeat,
  };
}

export async function readLeaderboardAvatar(communityId, db = pool) {
  if (!/^ln_[2-9A-HJ-NP-Z]{6,8}$/.test(communityId)) return '';
  const [[row]] = await db.query(
    `SELECT u.head_picture AS source FROM user u
       JOIN community_chat_user_identities i ON i.user_id = u.id
      WHERE i.community_id = ? AND ${POINTS_ACCOUNT_ELIGIBLE} AND ${POINTS_ACCOUNT_NOT_BANNED}
        AND EXISTS (SELECT 1 FROM points_log l WHERE l.user_id = u.id AND ${scoringCondition('total')})
      LIMIT 1`,
    [communityId],
  );
  return String(row?.source || '');
}
