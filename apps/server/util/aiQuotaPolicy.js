export function aiQuotaMode(env = process.env) {
  return String(env.AI_DAILY_QUOTA_MODE || '')
    .trim()
    .toLowerCase() === 'off'
    ? 'permanent_only'
    : 'daily_and_permanent';
}

export function levelGiftsEnabled(env = process.env) {
  return (
    String(env.AI_LEVEL_GIFT_MODE || '')
      .trim()
      .toLowerCase() === 'on'
  );
}

export function dailyBriefQuota(env = process.env) {
  const value = Number(env.AI_DAILY_BRIEF_DAILY_QUOTA ?? 66_000);
  return Number.isSafeInteger(value) && value >= 0 ? value : 66_000;
}

export function platformDailyBriefEnabled(env = process.env) {
  return aiQuotaMode(env) === 'permanent_only' || env.AI_DAILY_BRIEF_PLATFORM_BILLING === 'on';
}
