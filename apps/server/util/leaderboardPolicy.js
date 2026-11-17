import { isPointsAudienceAccount } from './pointsAudienceEligibility.js';

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MINUTES = 480;

export const LEADERBOARD_TYPES = Object.freeze(['week', 'month', 'total']);
export const LEADERBOARD_LIMIT = 20;
export const LEADERBOARD_PRIZES = Object.freeze([88, 77, 66]);
export const LEADERBOARD_MIN_SCORE = 100;
export const LEADERBOARD_MIN_DAYS = 3;
export const LEADERBOARD_REWARD_REASON = 'leaderboard_reward';
export const LEADERBOARD_ACTIVITY_REASONS = Object.freeze(['checkin', 'quest', 'weekly']);

export function canViewLeaderboard({ user, adminContext }) {
  return !adminContext && Boolean(
    isPointsAudienceAccount(user) || (user?.role === 'root' && user.id && user.id !== 'visitor'),
  );
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function addLeaderboardDays(day, days) {
  return isoDay(new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS));
}

export function leaderboardRange(board, now, previous = false) {
  if (board === 'total') return null;
  const day = new Date(now.getTime() + BEIJING_OFFSET_MINUTES * 60_000);
  if (board === 'month') {
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth();
    return { start: isoDay(new Date(Date.UTC(year, month, 1))), end: isoDay(new Date(Date.UTC(year, month + 1, 1))) };
  }
  const monday = addLeaderboardDays(isoDay(day), 1 - (day.getUTCDay() || 7) - (previous ? 7 : 0));
  return { start: monday, end: addLeaderboardDays(monday, 7) };
}

export function leaderboardServerShift(serverOffsetMinutes) {
  return BEIJING_OFFSET_MINUTES - serverOffsetMinutes;
}

export function leaderboardSqlDate(day, shiftMinutes) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - shiftMinutes * 60_000)
    .toISOString().slice(0, 19).replace('T', ' ');
}

function readMonday(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || isoDay(date) !== value || date.getUTCDay() !== 1) {
    throw Object.assign(new Error('Leaderboard schedule requires a Beijing Monday'), { code: 'LEADERBOARD_SCHEDULE_INVALID' });
  }
  return value;
}

export function getLeaderboardConfig(env = process.env) {
  const openWeek = env.POINTS_LEADERBOARD_OPEN_WEEK ? readMonday(env.POINTS_LEADERBOARD_OPEN_WEEK) : null;
  const firstRewardWeek = openWeek && env.POINTS_LEADERBOARD_FIRST_REWARD_WEEK
    ? readMonday(env.POINTS_LEADERBOARD_FIRST_REWARD_WEEK)
    : null;
  return { openWeek, firstRewardWeek, rewardsEnabled: env.POINTS_LEADERBOARD_REWARDS_ENABLED === 'true' };
}

export function leaderboardOpen(config, now = new Date()) {
  return Boolean(config.openWeek && leaderboardRange('week', now).start >= config.openWeek);
}

export function leaderboardWeekMode(week, config) {
  return week > config.openWeek && config.firstRewardWeek && week >= config.firstRewardWeek ? 'reward' : 'observation';
}

export function leaderboardQualified({ score, activeDays }) {
  return score >= LEADERBOARD_MIN_SCORE && activeDays >= LEADERBOARD_MIN_DAYS;
}

export function orderLeaderboard(scores, eligibleIds) {
  return scores.filter((score) => eligibleIds.has(score.userId)).sort((a, b) =>
    b.score - a.score || b.activeDays - a.activeDays || a.reachedAt.localeCompare(b.reachedAt) || a.userId.localeCompare(b.userId),
  ).map((score, index) => ({ ...score, rank: index + 1 }));
}

export function leaderboardSeats(rows, mode) {
  const qualified = rows.filter(leaderboardQualified);
  const slots = mode === 'reward' ? Math.min(LEADERBOARD_PRIZES.length, Math.floor(qualified.length / 2)) : 0;
  return { qualifiedCount: qualified.length, slots, winners: qualified.slice(0, slots) };
}
