import crypto from 'crypto';

export const FILE_SHARE_DEFAULT_DAYS = 7;
export const FILE_SHARE_ALLOWED_DAYS = Object.freeze([1, 7, 30]);
export const FILE_SHARE_MAX_LIMIT = 10000;
export const FILE_SHARE_EVENT_RETENTION_DAYS = 90;

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

function normalizeOptionalLimit(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > FILE_SHARE_MAX_LIMIT) {
    const error = new Error(`${fieldName.toUpperCase()}_INVALID`);
    error.code = `${fieldName.toUpperCase()}_INVALID`;
    throw error;
  }
  return normalized;
}

export function normalizeFileShareInput(input = {}) {
  const expiresInDays = Number(input.expiresInDays ?? FILE_SHARE_DEFAULT_DAYS);
  if (!FILE_SHARE_ALLOWED_DAYS.includes(expiresInDays)) {
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

  return {
    description,
    accessCode,
    expiresInDays,
    maxAccessCount: normalizeOptionalLimit(input.maxAccessCount, 'share_access_limit'),
    maxDownloadCount: normalizeOptionalLimit(input.maxDownloadCount, 'share_download_limit'),
  };
}

export function getFileShareState(row, now = Date.now(), operation = 'any') {
  if (!row) return 'missing';
  if (row.status !== 'active' || row.revoked_at) return 'revoked';
  if (row.file_del_flag !== undefined && Number(row.file_del_flag) !== 0) return 'file_unavailable';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  if (
    operation !== 'download' &&
    row.max_access_count !== null &&
    Number(row.access_count) >= Number(row.max_access_count)
  ) {
    return 'access_limit_reached';
  }
  if (
    operation !== 'access' &&
    row.max_download_count !== null &&
    Number(row.download_count) >= Number(row.max_download_count)
  ) {
    return 'download_limit_reached';
  }
  return 'active';
}

export function hashShareVisitorIp(ip, shareId) {
  return crypto
    .createHash('sha256')
    .update(`${String(shareId || '')}:${String(ip || '')}`, 'utf8')
    .digest('hex');
}
