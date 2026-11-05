import { toolboxError } from './errors.js';
import { formatJob } from './service.js';
import { taskVisibleSql, hydrateTaskIdentities } from './taskIdentity.js';

const JOB_FILTERS = {
  all: '1=1',
  failed: "(status='failed' OR save_status='save_failed')",
  active: "status IN ('queued','processing')",
  ready:
    "artifact_id IS NOT NULL AND save_status IN ('unsaved','save_failed') AND status IN ('succeeded','partial_succeeded') AND EXISTS (SELECT 1 FROM toolbox_artifacts a WHERE a.id=job.artifact_id AND a.user_id=job.user_id AND a.status='ready' AND a.expires_at>NOW())",
  finished: "status IN ('succeeded','partial_succeeded','failed','cancelled','expired')",
};
function decodeCursor(cursor, filter) {
  if (!cursor) return null;
  try {
    if (typeof cursor !== 'string' || cursor.length > 512) throw new Error();
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      value.filter !== filter ||
      !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value.at) ||
      typeof value.id !== 'string' ||
      !value.id ||
      value.id.length > 128
    )
      throw new Error();
    return value;
  } catch {
    throw toolboxError('TOOLBOX_CURSOR_INVALID', '任务列表位置已失效，请刷新', 400);
  }
}
// Page identities before loading bounded summaries, so the cursor follows exactly what the list shows.
export async function listToolboxTaskPage({ userId, filter = 'all', cursor, limit = 20, database }) {
  if (!Object.hasOwn(JOB_FILTERS, filter)) throw toolboxError('TOOLBOX_FILTER_INVALID', '任务筛选无效', 400);
  const boundary = decodeCursor(cursor, filter);
  const take = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const params = [userId];
  let clause = '';
  if (boundary) {
    clause = 'WHERE (sort_at < ? OR (sort_at = ? AND id < ?))';
    params.push(boundary.at, boundary.at, boundary.id);
  }
  const [ids] = await database.query(
    `SELECT * FROM (
      SELECT id,DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') AS sort_at FROM toolbox_jobs job
      WHERE user_id=? AND tool_id<>'translation' AND ${taskVisibleSql()} AND ${JOB_FILTERS[filter]}
    ) tasks ${clause} ORDER BY sort_at DESC,id DESC LIMIT ?`,
    [...params, take + 1],
  );
  const page = ids.slice(0, take);
  const jobIds = page.map((row) => row.id);
  const [jobs] = jobIds.length
    ? await database.query(
        `SELECT job.*,artifact.artifact_type,artifact.title AS artifact_title,artifact.content_type AS artifact_content_type,
      artifact.artifact_version,artifact.status AS artifact_status,artifact.expires_at AS artifact_expires_at
     FROM toolbox_jobs job LEFT JOIN toolbox_artifacts artifact ON artifact.id=job.artifact_id AND artifact.user_id=job.user_id
     WHERE job.user_id=? AND job.id IN (${jobIds.map(() => '?').join(',')}) AND ${taskVisibleSql()}`,
        [userId, ...jobIds],
      )
    : [[]];
  const summaries = new Map((await hydrateTaskIdentities(database, userId, jobs)).map((row) => [row.id, formatJob(row)]));
  const last = page.at(-1);
  return {
    items: page.map((row) => summaries.get(row.id)).filter(Boolean),
    nextCursor:
      ids.length > take && last
        ? Buffer.from(JSON.stringify({ at: last.sort_at, id: last.id, filter })).toString('base64url')
        : null,
  };
}
