import pool from '../db/index.js';
import { earnPoints } from './points.js';

// 每周挑战:固定一组任务,按 ISO 周(周一起)重置。完成给积分,按 (reason='weekly', ref='<yearweek>:<key>') 幂等。
// 进度全部从真实资源/签到事件派生,不新增表;周界用 MySQL YEARWEEK(...,1)(mode1=周一起,与 ISO 一致)。
export const WEEKLY_CHALLENGES = [
  { key: 'wk_bookmark', metric: 'bookmark', target: 5, reward: 40 },
  { key: 'wk_note', metric: 'note', target: 3, reward: 50 },
  { key: 'wk_checkin', metric: 'checkin', target: 5, reward: 60 },
];

async function currentWeekKey() {
  const [[r]] = await pool.query('SELECT YEARWEEK(CURDATE(), 1) AS wk');
  return String(r.wk);
}

// 本周进度:书签/笔记(本周创建数)、签到(本周去重签到天数)
async function weekProgress(userId) {
  const [[r]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND YEARWEEK(b.create_time, 1) = YEARWEEK(CURDATE(), 1)
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
          )) AS bookmark,
      (SELECT COUNT(*) FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND YEARWEEK(n.create_time, 1) = YEARWEEK(CURDATE(), 1)
          AND NOT EXISTS (
            SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
          )) AS note,
      (SELECT COUNT(DISTINCT day) FROM growth_events WHERE user_id = ? AND source = 'checkin' AND status = 'granted' AND YEARWEEK(create_time, 1) = YEARWEEK(CURDATE(), 1)) AS checkin`,
    [userId, userId, userId],
  );
  return r;
}

export async function getWeeklyChallenges(userId) {
  if (!userId || userId === 'visitor') {
    return {
      weekKey: null,
      challenges: WEEKLY_CHALLENGES.map((c) => ({ ...c, cur: 0, done: false, claimed: false, claimable: false })),
    };
  }
  const wk = await currentWeekKey();
  const prog = await weekProgress(userId);
  const [claimRows] = await pool.query(
    "SELECT ref FROM points_log WHERE user_id = ? AND reason = 'weekly' AND ref LIKE ?",
    [userId, wk + ':%'],
  );
  const claimed = new Set(claimRows.map((r) => r.ref));
  const challenges = WEEKLY_CHALLENGES.map((c) => {
    const cur = Number(prog[c.metric] || 0);
    const done = cur >= c.target;
    const isClaimed = claimed.has(wk + ':' + c.key);
    return {
      key: c.key,
      metric: c.metric,
      target: c.target,
      reward: c.reward,
      cur: Math.min(cur, c.target),
      done,
      claimed: isClaimed,
      claimable: done && !isClaimed,
    };
  });
  const claimableCount = challenges.filter((c) => c.claimable).length;
  return { weekKey: wk, challenges, claimableCount };
}

export async function claimWeeklyChallenge(userId, key) {
  if (!userId || userId === 'visitor') return { ok: false, reason: 'visitor' };
  const c = WEEKLY_CHALLENGES.find((x) => x.key === key);
  if (!c) return { ok: false, reason: 'not_found', msg: '挑战不存在' };
  const { weekKey, challenges } = await getWeeklyChallenges(userId);
  const ch = challenges.find((x) => x.key === key);
  if (!ch || !ch.done) return { ok: false, reason: 'incomplete', msg: '挑战尚未完成' };
  await pool.query('INSERT IGNORE INTO user_growth (user_id) VALUES (?)', [userId]); // 保证行存在(纯创建类用户可能还没成长行)
  const got = await earnPoints(userId, c.reward, 'weekly', weekKey + ':' + key);
  if (!got) return { ok: false, reason: 'claimed', msg: '本周该挑战已领取' };
  return { ok: true, key, reward: c.reward };
}
