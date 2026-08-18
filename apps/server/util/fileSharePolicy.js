import {
  SHARE_ALLOWED_DAYS,
  SHARE_DEFAULT_DAYS,
  SHARE_EVENT_RETENTION_DAYS,
  SHARE_MAX_LIMIT,
  createShareToken,
  hashShareAccessCode,
  hashShareToken,
  hashShareVisitorIp,
  normalizeBaseShareInput,
  normalizeOptionalShareLimit,
  verifyShareAccessCode,
} from './sharePolicy.js';

export const FILE_SHARE_DEFAULT_DAYS = SHARE_DEFAULT_DAYS;
export const FILE_SHARE_ALLOWED_DAYS = SHARE_ALLOWED_DAYS;
export const FILE_SHARE_MAX_LIMIT = SHARE_MAX_LIMIT;
export const FILE_SHARE_EVENT_RETENTION_DAYS = SHARE_EVENT_RETENTION_DAYS;

export {
  createShareToken,
  hashShareAccessCode,
  hashShareToken,
  hashShareVisitorIp,
  verifyShareAccessCode,
};

export function normalizeFileShareInput(input = {}) {
  const base = normalizeBaseShareInput(input);

  return {
    ...base,
    maxAccessCount: normalizeOptionalShareLimit(input.maxAccessCount, 'SHARE_ACCESS_LIMIT_INVALID'),
    maxDownloadCount: normalizeOptionalShareLimit(input.maxDownloadCount, 'SHARE_DOWNLOAD_LIMIT_INVALID'),
  };
}

export function getFileShareState(row, now = Date.now(), operation = 'any') {
  if (!row) return 'missing';
  if (row.status !== 'active' || row.revoked_at) return 'revoked';
  if (row.file_del_flag !== undefined && Number(row.file_del_flag) !== 0) return 'file_unavailable';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  if (
    operation !== 'download' &&
    operation !== 'session' &&
    row.max_access_count !== null &&
    Number(row.access_count) >= Number(row.max_access_count)
  ) {
    return 'access_limit_reached';
  }
  if (
    operation !== 'access' &&
    operation !== 'session' &&
    row.max_download_count !== null &&
    Number(row.download_count) >= Number(row.max_download_count)
  ) {
    return 'download_limit_reached';
  }
  return 'active';
}
