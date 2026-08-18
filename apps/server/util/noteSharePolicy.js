import {
  SHARE_EVENT_RETENTION_DAYS,
  normalizeBaseShareInput,
  normalizeOptionalShareLimit,
} from './sharePolicy.js';

export const NOTE_SHARE_EVENT_RETENTION_DAYS = SHARE_EVENT_RETENTION_DAYS;
export const NOTE_SHARE_SCOPES = Object.freeze(['single', 'subtree']);

export function normalizeNoteShareInput(input = {}) {
  const base = normalizeBaseShareInput(input);
  const scopeType = String(input.scopeType || 'single').trim();
  if (!NOTE_SHARE_SCOPES.includes(scopeType)) {
    const error = new Error('NOTE_SHARE_SCOPE_INVALID');
    error.code = 'NOTE_SHARE_SCOPE_INVALID';
    throw error;
  }
  return {
    ...base,
    scopeType,
    maxAccessCount: normalizeOptionalShareLimit(input.maxAccessCount, 'SHARE_ACCESS_LIMIT_INVALID'),
  };
}

export function getNoteShareState(row, now = Date.now(), operation = 'access') {
  if (!row) return 'missing';
  if (row.status !== 'active' || row.revoked_at) return 'revoked';
  if (row.root_del_flag !== undefined && Number(row.root_del_flag) !== 0) return 'note_unavailable';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  if (
    operation !== 'session' &&
    row.max_access_count !== null &&
    Number(row.access_count) >= Number(row.max_access_count)
  ) {
    return 'access_limit_reached';
  }
  return 'active';
}
