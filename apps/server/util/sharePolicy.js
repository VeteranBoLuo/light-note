import crypto from 'node:crypto';

export const SHARE_DEFAULT_DAYS = 7;
export const SHARE_ALLOWED_DAYS = Object.freeze([1, 7, 30]);
export const SHARE_MAX_LIMIT = 10000;
export const SHARE_EVENT_RETENTION_DAYS = 90;

export function createShareToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashShareToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function hashShareAccessCode(code) {
  const normalized = String(code || '').trim();
  if (!normalized) return null;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(normalized, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyShareAccessCode(code, encodedHash) {
  if (!encodedHash) return true;
  const [algorithm, saltValue, hashValue] = String(encodedHash).split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = crypto.scryptSync(String(code || '').trim(), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function normalizeOptionalShareLimit(value, errorCode) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > SHARE_MAX_LIMIT) {
    const error = new Error(errorCode);
    error.code = errorCode;
    throw error;
  }
  return normalized;
}

export function normalizeBaseShareInput(input = {}) {
  const expiresInDays = Number(input.expiresInDays ?? SHARE_DEFAULT_DAYS);
  if (!SHARE_ALLOWED_DAYS.includes(expiresInDays)) {
    const error = new Error('SHARE_EXPIRY_INVALID');
    error.code = 'SHARE_EXPIRY_INVALID';
    throw error;
  }

  const description = String(input.description || '').trim();
  if (description.length > 200) {
    const error = new Error('SHARE_DESCRIPTION_TOO_LONG');
    error.code = 'SHARE_DESCRIPTION_TOO_LONG';
    throw error;
  }

  const accessCode = String(input.accessCode || '').trim();
  if (accessCode && !/^[A-Za-z0-9]{4,12}$/.test(accessCode)) {
    const error = new Error('SHARE_ACCESS_CODE_INVALID');
    error.code = 'SHARE_ACCESS_CODE_INVALID';
    throw error;
  }

  return { description, accessCode, expiresInDays };
}

export function hashShareVisitorIp(ip, shareId) {
  return crypto
    .createHash('sha256')
    .update(`${String(shareId || '')}:${String(ip || '')}`, 'utf8')
    .digest('hex');
}
