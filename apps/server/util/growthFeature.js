function asBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

// 成长中心 V2 已全量开放；GROWTH_CENTER_V2_ENABLED=false 只作为应急回退旧版的开关。
export function isGrowthCenterV2Enabled({ env = process.env } = {}) {
  return asBoolean(env.GROWTH_CENTER_V2_ENABLED) !== false;
}
