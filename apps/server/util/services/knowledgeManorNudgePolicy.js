import { Temporal } from '@js-temporal/polyfill';
import { growthCalendarAt } from '../growthPreferences.js';
import { canEnterManor, knowledgeManorEnabled } from './knowledgeManorAccess.js';

export const MANOR_NUDGE_SOURCE = 'manor_daily';
export const MANOR_RECENT_MS = 14 * 24 * 60 * 60 * 1000;
export const isManorNudge = (item) => ['manor_digest', 'manor_water_expiring'].includes(item?.type);
export const manorNudgeSourceId = (userId, dayKey) => `${userId}:${dayKey}`;

export function manorPreferences(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function manorNudgeCalendar(now, preferences = {}) {
  const calendar = growthCalendarAt(preferences, now);
  const local = Temporal.Instant.fromEpochMilliseconds(new Date(now).getTime()).toZonedDateTimeISO(calendar.timezone);
  const midnight = local.toPlainDate().add({ days: 1 }).toZonedDateTime(calendar.timezone);
  return { ...calendar, inWindow: local.hour === 21, expiresAt: new Date(midnight.epochMilliseconds).toISOString() };
}

export function manorAccountEligible(account, env = process.env) {
  return Boolean(
    account && Number(account.del_flag) === 0 && knowledgeManorEnabled(env) && canEnterManor(account.role, env),
  );
}

export function manorNotificationsEnabled(preferences) {
  return preferences.notificationsInApp !== false && preferences.notifyManor === true;
}

export function recentManorOperation(updatedAtMs, now) {
  const time = Number(updatedAtMs),
    current = new Date(now).getTime();
  return Number.isFinite(time) && time <= current && time >= current - MANOR_RECENT_MS;
}

export function operatedManorToday(updatedAtMs, calendar) {
  return growthCalendarAt({ timezone: calendar.timezone }, new Date(Number(updatedAtMs))).dayKey === calendar.dayKey;
}

const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);
export function manorNudgeReasons(attention, preferences, operatedToday) {
  const digest = attention && !attention.fresh && preferences.notifyManorDigest !== false && !operatedToday;
  return {
    water: attention && !attention.fresh && preferences.notifyManorWater !== false ? count(attention.water) : 0,
    ripe: digest ? count(attention.ripe) : 0,
    tankFull: digest ? count(attention.tankFull) : 0,
    compostFull: Boolean(digest && attention.compostFull),
    crafted: Boolean(digest && attention.crafted),
    rewards: digest ? count(attention.rewards) : 0,
  };
}

export const hasManorDigest = (reasons) =>
  Boolean(reasons.ripe || reasons.tankFull || reasons.compostFull || reasons.crafted || reasons.rewards);
export const manorNudgeType = (reasons) =>
  reasons.water ? 'manor_water_expiring' : hasManorDigest(reasons) ? 'manor_digest' : null;

/** Only the server-owned manor source may shorten an existing outbox job. */
export function manorNudgeMeta(notification) {
  try {
    if (!isManorNudge(notification) || notification.source_type !== MANOR_NUDGE_SOURCE) return null;
    const meta = manorPreferences(notification.meta).manor;
    if (!meta || !/^\d{8}$/.test(meta.dayKey || '') || typeof meta.timezone !== 'string') return null;
    if (notification.source_id !== manorNudgeSourceId(notification.user_id, meta.dayKey)) return null;
    for (const key of ['water', 'ripe', 'tankFull', 'rewards'])
      if (!Number.isSafeInteger(meta[key]) || meta[key] < 0) return null;
    for (const key of ['compostFull', 'crafted']) if (typeof meta[key] !== 'boolean') return null;
    if (notification.type === 'manor_water_expiring' ? !meta.water : meta.water !== 0 || !hasManorDigest(meta))
      return null;
    const date = Temporal.PlainDate.from(
      `${meta.dayKey.slice(0, 4)}-${meta.dayKey.slice(4, 6)}-${meta.dayKey.slice(6)}`,
    );
    const midnight = date.add({ days: 1 }).toZonedDateTime(meta.timezone).epochMilliseconds;
    if (typeof meta.expiresAt !== 'string' || new Date(meta.expiresAt).getTime() !== midnight) return null;
    return meta;
  } catch {
    return null;
  }
}
