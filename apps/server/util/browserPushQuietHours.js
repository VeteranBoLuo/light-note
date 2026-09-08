function minuteOfDay(value, fallback) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

export function browserPushQuietUntil(preferences, now = new Date()) {
  if (preferences?.notificationsDnd !== true) return null;
  const start = minuteOfDay(preferences.notificationsDndStart, 22 * 60);
  const end = minuteOfDay(preferences.notificationsDndEnd, 8 * 60);
  if (start === end) return null;
  const offset = Math.max(-840, Math.min(840, Number(preferences.notificationsTimezoneOffset) || 0));
  const local = new Date(now.getTime() - offset * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const inQuiet = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!inQuiet) return null;
  const minutesUntilEnd = start < end || minute < end ? end - minute : 24 * 60 - minute + end;
  return new Date(
    local.getTime() -
      local.getUTCSeconds() * 1000 -
      local.getUTCMilliseconds() +
      minutesUntilEnd * 60_000 +
      offset * 60_000,
  );
}
