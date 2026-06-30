import pool from '../../../db/index.js';

const VALID_TARGET_TYPES = new Set(['ip', 'user']);

export const normalizeWhitelistType = (type = '') => {
  const value = String(type || '').toLowerCase();
  return VALID_TARGET_TYPES.has(value) ? value : '';
};

export const isSecurityWhitelisted = async (targetType, targetValue, executor = pool) => {
  const type = normalizeWhitelistType(targetType);
  const value = String(targetValue || '').trim();
  if (!type || !value) return false;
  const [rows] = await executor.query(
    `SELECT id
     FROM security_whitelist
     WHERE target_type = ? AND target_value = ? AND enabled = 1
     LIMIT 1`,
    [type, value],
  );
  return Boolean(rows[0]);
};

export const disableSecurityWhitelist = async (targetType, targetValue, executor = pool) => {
  const type = normalizeWhitelistType(targetType);
  const value = String(targetValue || '').trim();
  if (!type || !value) return false;
  await executor.query(
    `UPDATE security_whitelist
     SET enabled = 0, updated_at = NOW()
     WHERE target_type = ? AND target_value = ? AND enabled = 1`,
    [type, value],
  );
  return true;
};
