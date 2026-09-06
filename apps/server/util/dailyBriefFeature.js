const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);

function parsePreferences(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isDailyBriefFeatureEnabled(env = process.env) {
  const raw = env.AI_DAILY_BRIEF_ENABLED;
  if (raw == null || String(raw).trim() === '') return true;
  return !DISABLED_VALUES.has(String(raw).trim().toLowerCase());
}

/**
 * 简报总开关和自动更新开关只由专用偏好接口原子写入。旧页面仍会保存整个 preferences JSON，
 * 因此普通资料保存必须保留数据库中已有值，避免用户关闭后被旧页面重置为默认开启。
 */
export function preserveDailyBriefPreference(incomingPreferences, persistedPreferences) {
  const next = parsePreferences(incomingPreferences);
  const persisted = parsePreferences(persistedPreferences);
  for (const key of ['dailyBrief', 'dailyBriefAutoUpdate']) {
    if (typeof persisted[key] === 'boolean') next[key] = persisted[key];
    else delete next[key];
  }
  delete next.daily_brief;
  delete next.daily_brief_auto_update;
  return JSON.stringify(next);
}
