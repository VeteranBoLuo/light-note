import crypto from 'node:crypto';

function asBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function rolloutBucket(userId) {
  const digest = crypto.createHash('sha256').update(`growth-center-v2\0${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function isGrowthCenterV2Enabled({ userId, userRole, env = process.env } = {}) {
  const explicit = asBoolean(env.GROWTH_CENTER_V2_ENABLED);
  if (explicit === false) return false;
  if (explicit === true) return true;
  if (env.NODE_ENV !== 'production') return true;
  if (userRole === 'root') return true;
  const testUsers = new Set(
    String(env.GROWTH_CENTER_V2_TEST_USER_IDS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (userId && testUsers.has(String(userId))) return true;
  const percent = Math.max(0, Math.min(100, Math.trunc(Number(env.GROWTH_CENTER_V2_ROLLOUT_PERCENT) || 0)));
  return Boolean(userId) && rolloutBucket(String(userId)) < percent;
}
