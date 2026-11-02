import pool from '../../db/index.js';
import { preferences } from '../toolbox/projectPreference.js';
import { getDisabledToolIds, getPublicToolboxCatalog } from '../toolbox/catalog.js';
import { toolboxError } from '../toolbox/errors.js';

const FIELD = 'toolboxPinnedTools';
const LIMIT = 6;
function requireMember(user) {
  if (!user?.id || !['user', 'test', 'root'].includes(user.role)) {
    throw toolboxError('TOOLBOX_LOGIN_REQUIRED', '请先登录', 403);
  }
}
function allowedIds() {
  return new Set(
    getPublicToolboxCatalog({ disabledToolIds: getDisabledToolIds() })
      .tools.filter((tool) => tool.availability.enabled)
      .map((tool) => tool.id),
  );
}
function normalize(ids, allowed = allowedIds()) {
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && allowed.has(id)))].slice(0, LIMIT)
    : [];
}
function read(value) {
  const saved = preferences(value)[FIELD];
  return { initialized: Array.isArray(saved), toolIds: normalize(saved) };
}
export function preserveToolboxPinnedTools(incoming, persisted) {
  const next = { ...preferences(incoming) };
  const saved = preferences(persisted);
  if (Object.hasOwn(saved, FIELD)) next[FIELD] = saved[FIELD];
  else delete next[FIELD];
  delete next.toolbox_pinned_tools;
  return JSON.stringify(next);
}
export async function getToolboxPinnedTools({ user, db = pool }) {
  requireMember(user);
  const [[account]] = await db.query('SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [user.id]);
  if (!account) throw toolboxError('TOOLBOX_ACCOUNT_UNAVAILABLE', '账号不可用', 403);
  return read(account.preferences);
}
export async function updateToolboxPinnedTools({ user, input, db = pool }) {
  requireMember(user);
  const migration = input?.action === 'migrate';
  const allowed = allowedIds();
  const valid =
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (migration
      ? Object.keys(input).every((key) => ['action', 'toolIds'].includes(key)) &&
        Array.isArray(input.toolIds) &&
        input.toolIds.length <= LIMIT &&
        input.toolIds.every((id) => typeof id === 'string' && id.length <= 128)
      : Object.keys(input).every((key) => ['toolId', 'pinned'].includes(key)) &&
        typeof input.toolId === 'string' &&
        allowed.has(input.toolId) &&
        typeof input.pinned === 'boolean');
  if (!valid) throw toolboxError('TOOLBOX_INVALID_PIN', '无效的工具置顶参数', 400);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[account]] = await connection.query(
      'SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
      [user.id],
    );
    if (!account) throw toolboxError('TOOLBOX_ACCOUNT_UNAVAILABLE', '账号不可用', 403);
    const current = read(account.preferences);
    let next = current.toolIds;
    if (migration) {
      if (!current.initialized) next = normalize(input.toolIds, allowed);
    } else if (input.pinned && !next.includes(input.toolId)) {
      if (next.length >= LIMIT) throw toolboxError('TOOLBOX_PIN_LIMIT', '最多固定 6 个工具', 409);
      next = [...next, input.toolId];
    } else if (!input.pinned) {
      next = next.filter((id) => id !== input.toolId);
    }
    // An empty array is an explicit initialized state, including after unpinning everything.
    const updated = { ...preferences(account.preferences), [FIELD]: next };
    await connection.query('UPDATE user SET preferences = ? WHERE id = ? AND del_flag = 0', [
      JSON.stringify(updated),
      user.id,
    ]);
    await connection.commit();
    return { initialized: true, toolIds: next };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
