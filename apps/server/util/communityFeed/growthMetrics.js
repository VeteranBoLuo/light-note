import pool from '../../db/index.js';
import { feature } from './core.js';

// published_at is assigned once (COALESCE) on first approval, never on edits.
export async function communityGrowthMetrics(userId, { db = pool, env = process.env } = {}) {
  if (!userId || userId === 'visitor' || !feature(env).enabled)
    return { communityPostCount: 0, communityAnswerCount: 0 };
  const [[row]] = await db.query(
    `SELECT
    (SELECT COUNT(*) FROM community_posts WHERE author_id=? AND published_at IS NOT NULL) AS communityPostCount,
    (SELECT COUNT(*) FROM community_accepted_answers WHERE user_id=?) AS communityAnswerCount`,
    [userId, userId],
  );
  return {
    communityPostCount: Number(row.communityPostCount || 0),
    communityAnswerCount: Number(row.communityAnswerCount || 0),
  };
}
export async function communityWeekPosts(userId, { db = pool, calendar, weekKey, env = process.env } = {}) {
  if (!feature(env).enabled) return 0;
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count FROM community_posts
    WHERE author_id=? AND published_at IS NOT NULL
      AND YEARWEEK(DATE_ADD(published_at, INTERVAL ? MINUTE),1)=?`,
    [userId, Number(calendar.shiftMinutes || 0), weekKey],
  );
  return Number(row.count || 0);
}
