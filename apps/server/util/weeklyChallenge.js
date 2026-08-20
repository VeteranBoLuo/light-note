import pool from '../db/index.js';
import { earnPoints } from './points.js';
import { getMeaningfulActivityFacts } from './meaningfulActivity.js';
import {
  POINTS_EARNING_POLICY_VERSION,
  earningWritesEnabled,
  resolveWeeklyChallenges,
  usesC5EarningRules,
  weeklyClaimRef,
  weeklyClaimRefCandidates,
} from './pointsEarningPolicy.js';
import { resolveWeeklyEarningPolicyVersion } from './pointsEarningPolicyState.js';
import { dayKeyAtOffset, getGrowthCalendarContext, weekKeyAtOffset } from './growthPreferences.js';

export const WEEKLY_CHALLENGES = resolveWeeklyChallenges();

export async function currentWeekKey(db = pool, calendar = null) {
  if (calendar?.weekKey) return String(calendar.weekKey);
  if (calendar?.utcOffsetMinutes != null) return weekKeyAtOffset(new Date(), calendar.utcOffsetMinutes);
  const [[row]] = await db.query('SELECT YEARWEEK(CURDATE(), 1) AS wk');
  return String(row.wk);
}

async function legacyWeekProgress(userId, db, calendar, weekKey) {
  const shift = Number(calendar.shiftMinutes || 0);
  const [[row]] = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND YEARWEEK(DATE_ADD(b.create_time, INTERVAL ? MINUTE), 1) = ?
          AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id)) AS bookmark,
      (SELECT COUNT(*) FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND YEARWEEK(DATE_ADD(n.create_time, INTERVAL ? MINUTE), 1) = ?
          AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id)) AS note,
      (SELECT COUNT(DISTINCT day) FROM growth_events
        WHERE user_id = ? AND source = 'checkin' AND status = 'granted'
          AND YEARWEEK(STR_TO_DATE(day, '%Y%m%d'), 1) = ?) AS checkin,
      (SELECT COUNT(*) FROM todo_items td
        WHERE td.user_id = ? AND td.del_flag = 0 AND td.status = 'completed'
          AND td.completed_at IS NOT NULL
          AND YEARWEEK(DATE_ADD(td.completed_at, INTERVAL ? MINUTE), 1) = ?) AS todo,
      (SELECT COUNT(*) FROM resource_inbox ri
        WHERE ri.user_id = ? AND ri.status = 'completed'
          AND YEARWEEK(DATE_ADD(ri.complete_time, INTERVAL ? MINUTE), 1) = ?
          AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr
            WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
              AND osr.resource_id = ri.resource_id)) AS organize`,
    [userId, shift, weekKey, userId, shift, weekKey, userId, weekKey, userId, shift, weekKey, userId, shift, weekKey],
  );
  return row;
}

export async function weekProgress(userId, db = pool, { calendar = null, weekKey = null, policyVersion = null } = {}) {
  const effectiveCalendar = calendar || (await getGrowthCalendarContext(userId, { db }));
  const week = String(
    weekKey || effectiveCalendar.weekKey || weekKeyAtOffset(new Date(), effectiveCalendar.utcOffsetMinutes),
  );
  const version = policyVersion || (await resolveWeeklyEarningPolicyVersion(week, { db }));
  if (!usesC5EarningRules(version)) {
    return legacyWeekProgress(userId, db, effectiveCalendar, week);
  }
  const facts = await getMeaningfulActivityFacts(userId, { db, calendar: effectiveCalendar, weekKey: week });
  return {
    collect: Number(facts.byType.bookmark || 0) + Number(facts.byType.file || 0),
    note: Number(facts.byType.note || 0),
    progress: Number(facts.byType.todo || 0) + Number(facts.byType.organize || 0),
    activeDays: facts.activeDays,
    variety: facts.variety,
  };
}

export async function getWeeklyChallenges(userId, { db = pool, calendar = null } = {}) {
  const guestVersion = POINTS_EARNING_POLICY_VERSION;
  if (!userId || userId === 'visitor') {
    return {
      weekKey: null,
      timezone: null,
      policyVersion: guestVersion,
      todayActive: false,
      earnedPoints: 0,
      totalPoints: resolveWeeklyChallenges(guestVersion).reduce((sum, challenge) => sum + challenge.reward, 0),
      challenges: resolveWeeklyChallenges(guestVersion).map((challenge) => ({
        ...challenge,
        cur: 0,
        done: false,
        claimed: false,
        claimable: false,
      })),
    };
  }
  const effectiveCalendar = calendar || (await getGrowthCalendarContext(userId, { db }));
  const weekKey = await currentWeekKey(db, effectiveCalendar);
  const policyVersion = await resolveWeeklyEarningPolicyVersion(weekKey, { db });
  const catalog = resolveWeeklyChallenges(policyVersion);
  const progress = await weekProgress(userId, db, {
    calendar: effectiveCalendar,
    weekKey,
    policyVersion,
  });
  const todayFacts = usesC5EarningRules(policyVersion)
    ? await getMeaningfulActivityFacts(userId, {
        db,
        calendar: effectiveCalendar,
        dayKey: effectiveCalendar.dayKey || dayKeyAtOffset(new Date(), effectiveCalendar.utcOffsetMinutes),
      })
    : null;
  const refCandidates = [
    ...new Set(catalog.flatMap((challenge) => weeklyClaimRefCandidates(weekKey, challenge.key, policyVersion))),
  ];
  const [claimRows] = await db.query(
    `SELECT ref FROM points_log
      WHERE user_id = ? AND reason = 'weekly' AND ref IN (${refCandidates.map(() => '?').join(',')})`,
    [userId, ...refCandidates],
  );
  const claimedRefs = new Set(claimRows.map((row) => String(row.ref)));
  const challenges = catalog.map((challenge) => {
    const cur = Number(progress[challenge.metric] || 0);
    const done = cur >= challenge.target;
    const claimed = weeklyClaimRefCandidates(weekKey, challenge.key, policyVersion).some((ref) => claimedRefs.has(ref));
    return { ...challenge, cur: Math.min(cur, challenge.target), done, claimed, claimable: done && !claimed };
  });
  return {
    weekKey,
    timezone: effectiveCalendar.timezone,
    policyVersion,
    todayActive: Boolean(todayFacts?.total),
    challenges,
    claimableCount: challenges.filter((challenge) => challenge.claimable).length,
    earnedPoints: challenges
      .filter((challenge) => challenge.claimed)
      .reduce((sum, challenge) => sum + challenge.reward, 0),
    totalPoints: catalog.reduce((sum, challenge) => sum + challenge.reward, 0),
  };
}

export async function claimWeeklyChallenge(userId, key) {
  if (!userId || userId === 'visitor') return { ok: false, reason: 'visitor' };
  const weekly = await getWeeklyChallenges(userId);
  if (!earningWritesEnabled(weekly.policyVersion)) return { ok: false, reason: 'earning_paused' };
  const challenge = weekly.challenges.find((item) => item.key === key);
  if (!challenge) return { ok: false, reason: 'not_found', msg: '挑战不存在' };
  if (!challenge.done) return { ok: false, reason: 'incomplete', msg: '挑战尚未完成' };
  await pool.query('INSERT IGNORE INTO user_growth (user_id) VALUES (?)', [userId]);
  const ref = weeklyClaimRef(weekly.weekKey, key, weekly.policyVersion);
  const got = await earnPoints(userId, challenge.reward, 'weekly', ref, pool, {
    policyVersion: weekly.policyVersion,
    meta: { challengeKey: key },
  });
  if (!got) return { ok: false, reason: 'claimed', msg: '本周该挑战已领取' };
  return { ok: true, key, reward: challenge.reward };
}
