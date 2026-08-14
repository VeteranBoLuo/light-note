import pool from '../db/index.js';

export const DEFAULT_GROWTH_PREFERENCES = Object.freeze({
  weeklyActiveTarget: 5,
  streakReminderEnabled: true,
  celebrationEnabled: true,
  lowPressureMode: false,
  timezone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  pointsGoalItemId: null,
  pointsGoalEnabled: false,
});

const WEEKLY_TARGETS = new Set([0, 3, 5, 7]);

function normalizeTimezone(value) {
  const timezone = String(value || '').trim();
  return isValidTimezone(timezone) ? timezone : DEFAULT_GROWTH_PREFERENCES.timezone;
}

function normalizeOffset(value) {
  const offset = Math.trunc(Number(value));
  return Number.isFinite(offset) && offset >= -720 && offset <= 840
    ? offset
    : DEFAULT_GROWTH_PREFERENCES.utcOffsetMinutes;
}

function offsetForTimezone(timezone, value = new Date()) {
  try {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((representedUtc - date.getTime()) / 60_000);
  } catch {
    return null;
  }
}

function isValidTimezone(value) {
  const timezone = String(value || '').trim();
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function invalidPatchReason(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'invalid_preferences';
  for (const key of ['streakReminderEnabled', 'celebrationEnabled', 'lowPressureMode']) {
    if (patch[key] != null && typeof patch[key] !== 'boolean') return `invalid_${key}`;
  }
  if (patch.timezone != null && !isValidTimezone(patch.timezone)) return 'invalid_timezone';
  if (patch.utcOffsetMinutes != null) {
    const offset = Number(patch.utcOffsetMinutes);
    if (!Number.isInteger(offset) || offset < -720 || offset > 840) return 'invalid_utc_offset';
  }
  return null;
}

function fromRow(row) {
  if (!row) return { ...DEFAULT_GROWTH_PREFERENCES };
  return {
    weeklyActiveTarget: WEEKLY_TARGETS.has(Number(row.weeklyActiveTarget))
      ? Number(row.weeklyActiveTarget)
      : DEFAULT_GROWTH_PREFERENCES.weeklyActiveTarget,
    streakReminderEnabled: Boolean(Number(row.streakReminderEnabled)),
    celebrationEnabled: Boolean(Number(row.celebrationEnabled)),
    lowPressureMode: Boolean(Number(row.lowPressureMode)),
    timezone: normalizeTimezone(row.timezone),
    utcOffsetMinutes: normalizeOffset(row.utcOffsetMinutes),
    pointsGoalItemId: String(row.pointsGoalItemId || '').trim() || null,
    pointsGoalEnabled: Boolean(Number(row.pointsGoalEnabled)),
  };
}

export function dayKeyAtOffset(
  value = new Date(),
  utcOffsetMinutes = DEFAULT_GROWTH_PREFERENCES.utcOffsetMinutes,
  deltaDays = 0,
) {
  const shifted = new Date(
    new Date(value).getTime() + normalizeOffset(utcOffsetMinutes) * 60_000 + Number(deltaDays || 0) * 86_400_000,
  );
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// 与 MySQL YEARWEEK(date, 1) 保持同一周一重置口径，返回可直接用于积分幂等 ref 的 YYYYWW。
export function weekKeyAtOffset(value = new Date(), utcOffsetMinutes = DEFAULT_GROWTH_PREFERENCES.utcOffsetMinutes) {
  const shifted = new Date(new Date(value).getTime() + normalizeOffset(utcOffsetMinutes) * 60_000);
  const weekDate = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const weekday = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - weekday);
  const weekYear = weekDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((weekDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${weekYear}${String(week).padStart(2, '0')}`;
}

export async function getGrowthCalendarContext(userId, { db = pool, now = new Date() } = {}) {
  const preferences = await getGrowthPreferences(userId, { db });
  const [[offsetRow]] = await db.query('SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS serverOffset');
  // IANA 时区在夏令时切换时动态计算偏移；持久化 offset 只作为旧运行时的兼容兜底。
  const utcOffsetMinutes = normalizeOffset(
    offsetForTimezone(preferences.timezone, now) ?? preferences.utcOffsetMinutes,
  );
  return {
    weeklyActiveTarget: preferences.weeklyActiveTarget,
    timezone: preferences.timezone,
    utcOffsetMinutes,
    serverOffsetMinutes: Number(offsetRow?.serverOffset || 0),
    shiftMinutes: utcOffsetMinutes - Number(offsetRow?.serverOffset || 0),
    dayKey: dayKeyAtOffset(now, utcOffsetMinutes),
    weekKey: weekKeyAtOffset(now, utcOffsetMinutes),
    previousDayKey: dayKeyAtOffset(now, utcOffsetMinutes, -1),
    makeupDays: Array.from({ length: 3 }, (_, index) => dayKeyAtOffset(now, utcOffsetMinutes, -(index + 1))),
  };
}

export async function getGrowthPreferences(userId, { db = pool } = {}) {
  if (!userId || userId === 'visitor') return { ...DEFAULT_GROWTH_PREFERENCES };
  const [[row]] = await db.query(
    `SELECT weekly_active_target AS weeklyActiveTarget,
            streak_reminder_enabled AS streakReminderEnabled,
            celebration_enabled AS celebrationEnabled,
            low_pressure_mode AS lowPressureMode,
            timezone,
            utc_offset_minutes AS utcOffsetMinutes,
            points_goal_item_id AS pointsGoalItemId,
            points_goal_enabled AS pointsGoalEnabled
       FROM user_growth_preferences
      WHERE user_id = ? LIMIT 1`,
    [String(userId)],
  );
  return fromRow(row);
}

export async function updatePointsGoalPreference(userId, { itemId = null, enabled = false } = {}, { db = pool } = {}) {
  if (!userId || userId === 'visitor') return { ok: false, reason: 'visitor' };
  if (typeof enabled !== 'boolean') return { ok: false, reason: 'invalid_points_goal_enabled' };
  const normalizedItemId = String(itemId || '').trim();
  if (enabled && !normalizedItemId) return { ok: false, reason: 'points_goal_item_required' };
  if (normalizedItemId.length > 64) return { ok: false, reason: 'invalid_points_goal_item' };
  await db.query(
    `INSERT INTO user_growth_preferences (user_id, points_goal_item_id, points_goal_enabled)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       points_goal_item_id = VALUES(points_goal_item_id),
       points_goal_enabled = VALUES(points_goal_enabled)`,
    [String(userId), normalizedItemId || null, enabled ? 1 : 0],
  );
  return { ok: true, pointsGoalItemId: normalizedItemId || null, pointsGoalEnabled: enabled };
}

export async function updateGrowthPreferences(userId, patch = {}, { db = pool } = {}) {
  if (!userId || userId === 'visitor') return { ok: false, reason: 'visitor' };
  const invalidReason = invalidPatchReason(patch);
  if (invalidReason) return { ok: false, reason: invalidReason };
  const current = await getGrowthPreferences(userId, { db });
  const requestedTarget =
    patch.weeklyActiveTarget == null ? current.weeklyActiveTarget : Number(patch.weeklyActiveTarget);
  if (!WEEKLY_TARGETS.has(requestedTarget)) return { ok: false, reason: 'invalid_weekly_target' };
  const next = {
    weeklyActiveTarget: requestedTarget,
    streakReminderEnabled:
      patch.streakReminderEnabled == null ? current.streakReminderEnabled : Boolean(patch.streakReminderEnabled),
    celebrationEnabled:
      patch.celebrationEnabled == null ? current.celebrationEnabled : Boolean(patch.celebrationEnabled),
    lowPressureMode: patch.lowPressureMode == null ? current.lowPressureMode : Boolean(patch.lowPressureMode),
    timezone: patch.timezone == null ? current.timezone : String(patch.timezone).trim(),
    utcOffsetMinutes: patch.utcOffsetMinutes == null ? current.utcOffsetMinutes : Number(patch.utcOffsetMinutes),
  };
  await db.query(
    `INSERT INTO user_growth_preferences
       (user_id, weekly_active_target, streak_reminder_enabled, celebration_enabled,
        low_pressure_mode, timezone, utc_offset_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       weekly_active_target = VALUES(weekly_active_target),
       streak_reminder_enabled = VALUES(streak_reminder_enabled),
       celebration_enabled = VALUES(celebration_enabled),
       low_pressure_mode = VALUES(low_pressure_mode),
       timezone = VALUES(timezone),
       utc_offset_minutes = VALUES(utc_offset_minutes)`,
    [
      String(userId),
      next.weeklyActiveTarget,
      next.streakReminderEnabled ? 1 : 0,
      next.celebrationEnabled ? 1 : 0,
      next.lowPressureMode ? 1 : 0,
      next.timezone,
      next.utcOffsetMinutes,
    ],
  );
  return { ok: true, ...next };
}
