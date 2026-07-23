const MAX_CURSOR_LENGTH = 256;
const MAX_CURSOR_OFFSET = 10_000;

function cursorError() {
  const error = new Error('查询游标无效');
  error.code = 'PAGE_CURSOR_INVALID';
  return error;
}

/**
 * 读取型列表统一使用不透明 offset cursor。游标带 scope，避免把待办和待整理的
 * 游标交叉使用；offset 同时设上限，防止无意义的大偏移拖慢数据库查询。
 */
export function encodeOffsetCursor(scope, offset) {
  return Buffer.from(
    JSON.stringify({ version: 1, scope: String(scope || ''), offset: Number(offset) || 0 }),
    'utf8',
  ).toString('base64url');
}

export function decodeOffsetCursor(cursor, scope) {
  if (cursor == null || cursor === '') return 0;
  if (typeof cursor !== 'string' || cursor.length > MAX_CURSOR_LENGTH) throw cursorError();
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const offset = Number(value?.offset);
    if (
      value?.version !== 1 ||
      value?.scope !== String(scope || '') ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > MAX_CURSOR_OFFSET
    ) {
      throw cursorError();
    }
    return offset;
  } catch (error) {
    if (error?.code === 'PAGE_CURSOR_INVALID') throw error;
    throw cursorError();
  }
}

/**
 * schema 层会拦截模型的不合法参数；Service 仍自行归一化，确保页面和内部调用
 * 不会把超大 LIMIT 直接带到数据库。
 */
export function normalizePageLimit(value, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.trunc(parsed)));
}
