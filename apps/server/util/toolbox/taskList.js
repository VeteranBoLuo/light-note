import { toolboxError } from './errors.js';
import { formatJob } from './service.js';
import { taskVisibleSql, hydrateTaskIdentities } from './taskIdentity.js';
import { extractionSchemaReady } from '../extraction/schema.js';

const JOB_FILTERS = {
  all: '1=1',
  failed: "(status='failed' OR save_status='save_failed')",
  active: "status IN ('queued','processing')",
  paused: '1=0',
  ready:
    "artifact_id IS NOT NULL AND save_status IN ('unsaved','save_failed') AND status IN ('succeeded','partial_succeeded') AND EXISTS (SELECT 1 FROM toolbox_artifacts a WHERE a.id=job.artifact_id AND a.user_id=job.user_id AND a.status='ready' AND a.expires_at>NOW())",
  finished: "status IN ('succeeded','partial_succeeded','failed','cancelled','expired')",
};
const EXTRACTION_FILTERS = {
  all: '1=1',
  failed: "status IN ('failed','partial')",
  active: "status IN ('preparing','queued','analyzing','processing')",
  paused: "status='paused'",
  ready: '1=0',
  finished: "status IN ('ready','preview','completed','ended','failed','partial')",
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
      value.id.length > 128 ||
      !['job', 'extraction'].includes(value.kind)
    )
      throw new Error();
    return value;
  } catch {
    throw toolboxError('TOOLBOX_CURSOR_INVALID', '任务列表位置已失效，请刷新', 400);
  }
}
export function extractionTask(row) {
  return {
    ...formatJob({
      id: row.id,
      tool_id: 'extraction',
      status: ['failed', 'partial'].includes(row.status)
        ? 'failed'
        : ['completed', 'ended', 'ready', 'preview'].includes(row.status)
          ? 'succeeded'
          : 'processing',
      stage: row.status,
      billing_medium: 'ai_quota',
      save_status: 'saved',
      create_time: row.created_at,
      updated_at: row.updated_at,
    }),
    title: row.title,
    canCancel: false,
    extraction: {
      title: row.title,
      status: row.status,
      processed: Number(row.processed || 0),
      total: Number(row.total || 0),
    },
  };
}
// Page identities across both domains before loading bounded summaries; never concatenate two truncated lists.
export async function listToolboxTaskPage({ userId, filter = 'all', cursor, limit = 20, database }) {
  if (!Object.hasOwn(JOB_FILTERS, filter)) throw toolboxError('TOOLBOX_FILTER_INVALID', '任务筛选无效', 400);
  const boundary = decodeCursor(cursor, filter);
  const take = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const withExtraction = await extractionSchemaReady(database);
  const params = [userId, ...(withExtraction ? [userId] : [])];
  let clause = '';
  if (boundary) {
    clause = 'WHERE (sort_at < ? OR (sort_at = ? AND (id < ? OR (id = ? AND kind < ?))))';
    params.push(boundary.at, boundary.at, boundary.id, boundary.id, boundary.kind);
  }
  const [ids] = await database.query(
    `SELECT * FROM (
      SELECT 'job' AS kind,id,DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') AS sort_at FROM toolbox_jobs job
      WHERE user_id=? AND tool_id<>'translation' AND ${taskVisibleSql()} AND ${JOB_FILTERS[filter]}
      ${withExtraction ? `UNION ALL SELECT 'extraction' AS kind,id,DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') AS sort_at FROM toolbox_extractions WHERE user_id=? AND ${EXTRACTION_FILTERS[filter]}` : ''}
    ) tasks ${clause} ORDER BY sort_at DESC,id DESC,kind DESC LIMIT ?`,
    [...params, take + 1],
  );
  const page = ids.slice(0, take);
  const jobIds = page.filter((row) => row.kind === 'job').map((row) => row.id);
  const extractionIds = page.filter((row) => row.kind === 'extraction').map((row) => row.id);
  const [jobs] = jobIds.length
    ? await database.query(
        `SELECT job.*,artifact.artifact_type,artifact.title AS artifact_title,artifact.content_type AS artifact_content_type,
      artifact.artifact_version,artifact.status AS artifact_status,artifact.expires_at AS artifact_expires_at
     FROM toolbox_jobs job LEFT JOIN toolbox_artifacts artifact ON artifact.id=job.artifact_id AND artifact.user_id=job.user_id
     WHERE job.user_id=? AND job.id IN (${jobIds.map(() => '?').join(',')}) AND ${taskVisibleSql()}`,
        [userId, ...jobIds],
      )
    : [[]];
  const [extractions] = extractionIds.length
    ? await database.query(
        `SELECT e.id,e.title,e.status,e.created_at,e.updated_at,
      (SELECT COALESCE(SUM(s.processed_windows),0) FROM toolbox_extraction_sources s WHERE s.extraction_id=e.id AND s.user_id=e.user_id) processed,
      (SELECT COALESCE(SUM(s.window_count),0) FROM toolbox_extraction_sources s WHERE s.extraction_id=e.id AND s.user_id=e.user_id) total
     FROM toolbox_extractions e WHERE e.user_id=? AND e.id IN (${extractionIds.map(() => '?').join(',')})`,
        [userId, ...extractionIds],
      )
    : [[]];
  const summaries = new Map([
    ...(await hydrateTaskIdentities(database, userId, jobs)).map((row) => [`job:${row.id}`, formatJob(row)]),
    ...extractions.map((row) => [`extraction:${row.id}`, extractionTask(row)]),
  ]);
  const last = page.at(-1);
  return {
    items: page.map((row) => summaries.get(`${row.kind}:${row.id}`)).filter(Boolean),
    nextCursor:
      ids.length > take && last
        ? Buffer.from(JSON.stringify({ at: last.sort_at, id: last.id, kind: last.kind, filter })).toString('base64url')
        : null,
  };
}
