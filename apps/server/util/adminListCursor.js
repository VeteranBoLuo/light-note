const MAX_CURSOR_LENGTH = 1024;

function cursorError() {
  const error = new Error('查询游标无效');
  error.code = 'ADMIN_LIST_CURSOR_INVALID';
  return error;
}

export function normalizeAdminListLimit(value, fallback = 50) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function isAdminCursorRequest(body = {}) {
  return Object.prototype.hasOwnProperty.call(body, 'cursor') || Object.prototype.hasOwnProperty.call(body, 'limit');
}

export function encodeAdminListCursor(scope, row) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      scope: String(scope || ''),
      value: row?.value,
      id: String(row?.id || ''),
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeAdminListCursor(cursor, scope) {
  if (cursor == null || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > MAX_CURSOR_LENGTH) throw cursorError();
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      value?.version !== 1 ||
      value?.scope !== String(scope || '') ||
      value?.value == null ||
      typeof value?.id !== 'string' ||
      !value.id
    ) {
      throw cursorError();
    }
    return { value: value.value, id: value.id };
  } catch (error) {
    if (error?.code === 'ADMIN_LIST_CURSOR_INVALID') throw error;
    throw cursorError();
  }
}

export function adminCursorScope(name, parts = []) {
  const normalized = parts.map((part) => String(part ?? '').trim()).join('\u001f');
  return `${String(name || '')}:${normalized}`;
}

export function adminCursorTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw cursorError();
  return time;
}
