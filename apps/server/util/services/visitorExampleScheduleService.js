import { createHash } from 'node:crypto';
import { normalizeTodoDate } from './todoService.js';
import { normalizeWorkspaceDate } from '../toolbox/workspace.js';
import { applyBoardOperation } from '@lightnote/shared/workspace-board';
import { Temporal } from '@js-temporal/polyfill';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';

export const VISITOR_EXAMPLE_VERSION = 'visitor-resources-v2';
export const visitorDate = (now = new Date()) =>
  Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO('Asia/Shanghai').toPlainDate().toString();
export const offsetDate = (date, offset) =>
  offset == null ? null : Temporal.PlainDate.from(date).add({ days: offset }).toString();
export const exampleError = (code) => Object.assign(new Error(code), { code });
const normalize = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  return value;
};
export const exampleHash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
export const parseExampleManifest = (value) => {
  const result = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !result ||
    result.version !== VISITOR_EXAMPLE_VERSION ||
    !Array.isArray(result.rolling) ||
    result.rolling.length > 100 ||
    !Array.isArray(result.notes) ||
    !Array.isArray(result.projects) ||
    new Set(result.rolling.map((e) => `${e.type}:${e.id}`)).size !== result.rolling.length
  )
    throw exampleError('VISITOR_MANIFEST_INVALID');
  return result;
};
export const ROLLING_TYPES = Object.freeze({
  todo: {
    table: 'todo_items',
    owner: 'user_id',
    dates: ['start_at', 'due_at', 'completed_at'],
    version: 'update_time',
  },
  project: { table: 'toolbox_workspaces', owner: 'user_id', dates: ['target_date'], version: 'board_version' },
  action: { table: 'toolbox_workspace_items', owner: 'user_id', dates: ['due_on'], version: 'updated_at' },
});
export async function assertVisitorOwner(db, userId, lock = false) {
  const [[user]] = await db.query(`SELECT id,role,del_flag FROM user WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [userId]);
  if (!user || user.role !== 'visitor' || Number(user.del_flag) !== 0) throw exampleError('VISITOR_OWNER_INVALID');
  return user;
}
export async function readRollingObject(db, owner, entry) {
  const config = ROLLING_TYPES[entry.type];
  if (!config || typeof entry.id !== 'string' || !entry.id) throw exampleError('VISITOR_ENTRY_INVALID');
  const [[row]] = await db.query(`SELECT * FROM ${config.table} WHERE id=? AND ${config.owner}=? FOR UPDATE`, [
    entry.id,
    owner,
  ]);
  if (
    !row ||
    (entry.type === 'todo' && (Number(row.del_flag) !== 0 || row.series_id)) ||
    (entry.type === 'project' && row.status !== 'active') ||
    (entry.type === 'action' && (row.lane !== 'action' || !['open', 'in_progress'].includes(row.status)))
  )
    throw exampleError('VISITOR_OBJECT_UNAVAILABLE');
  return row;
}
export function rollingValues(entry, date) {
  const config = ROLLING_TYPES[entry.type];
  if (!config || !entry.offsets || !Object.keys(entry.offsets).length) throw exampleError('VISITOR_ENTRY_INVALID');
  return Object.fromEntries(
    Object.entries(entry.offsets).map(([field, offset]) => {
      if (!config.dates.includes(field) || (offset !== null && (!Number.isInteger(offset) || Math.abs(offset) > 366)))
        throw exampleError('VISITOR_DATE_INVALID');
      const day = offsetDate(date, offset);
      return [
        field,
        field.endsWith('_at')
          ? normalizeTodoDate(day && `${day} ${field === 'completed_at' ? '16:00:00' : '18:00:00'}`, field)
          : normalizeWorkspaceDate(day, field),
      ];
    }),
  );
}
export async function rollVisitorExamples(
  database,
  userId,
  { now = new Date(), invalidate = invalidatePersonalKnowledgeCache } = {},
) {
  const date = visitorDate(now);
  const connection = await database.getConnection();
  let changed = false;
  try {
    await connection.beginTransaction();
    await assertVisitorOwner(connection, userId, true);
    const [[state]] = await connection.query(
      "SELECT *, DATE_FORMAT(last_success_date, '%Y-%m-%d') AS last_date FROM visitor_example_maintenance WHERE user_id=? FOR UPDATE",
      [userId],
    );
    if (!state || !Number(state.enabled) || state.version !== VISITOR_EXAMPLE_VERSION || state.last_date >= date) {
      await connection.commit();
      return { changed: false };
    }
    const manifest = parseExampleManifest(state.manifest_json);
    // Validate all targets before writing any date. The expected hash includes user edits, not just dates.
    for (const entry of manifest.rolling) {
      const row = await readRollingObject(connection, userId, entry);
      if (exampleHash(row) !== entry.expected) throw exampleError('VISITOR_OBJECT_CHANGED');
      const dates = rollingValues(entry, date);
      if (entry.type === 'action')
        applyBoardOperation(
          [{ id: row.id, title: row.title, content: row.content || '', status: row.status, lane: row.lane }],
          { type: 'edit', itemId: row.id, dueOn: dates.due_on },
          { now: now.toISOString(), id: row.id },
        );
    }
    for (const entry of manifest.rolling) {
      const config = ROLLING_TYPES[entry.type];
      const values = rollingValues(entry, date);
      await connection.query(
        `UPDATE ${config.table} SET ?, ${config.version}=${entry.type === 'project' ? 'board_version+1' : 'NOW()'} WHERE id=? AND ${config.owner}=?`,
        [values, entry.id, userId],
      );
      entry.expected = exampleHash(await readRollingObject(connection, userId, entry));
    }
    await connection.query(
      'UPDATE visitor_example_maintenance SET manifest_json=?,last_success_date=? WHERE user_id=?',
      [JSON.stringify(manifest), date, userId],
    );
    await connection.commit();
    changed = true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  // Commit remains successful even if a best-effort cache invalidation is unavailable.
  if (changed) await invalidate(userId, { persist: true }).catch(() => {});
  return { changed, date };
}

/** One bounded check per minute. Independent failure/backoff cannot stop governance work. */
export function createVisitorExampleMaintenancePoller(
  database,
  { clock = () => Date.now(), log = console.error, roll = rollVisitorExamples } = {},
) {
  let nextCheck = 0,
    failures = 0,
    running = false;
  return async () => {
    if (running || clock() < nextCheck) return;
    running = true;
    nextCheck = clock() + 60000;
    try {
      const [states] = await database.query(
        'SELECT user_id FROM visitor_example_maintenance WHERE enabled=1 AND (last_success_date IS NULL OR last_success_date < ?) ORDER BY user_id LIMIT 10',
        [visitorDate(new Date(clock()))],
      );
      for (const state of states) await roll(database, String(state.user_id), { now: new Date(clock()) });
      failures = 0;
    } catch (error) {
      failures++;
      nextCheck = clock() + Math.min(3600000, 60000 * 2 ** Math.min(failures, 6));
      log(
        '[visitor-examples] maintenance failed code=%s',
        /^VISITOR_[A-Z_]+$/.test(error?.code || '') ? error.code : 'VISITOR_MAINTENANCE_FAILED',
      );
    } finally {
      running = false;
    }
  };
}
