import { resolvePersonalKnowledgeResourceMetadata } from '../personalKnowledgeSearch.js';

export const taskVisibleSql = (alias = 'job') =>
  `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.options_json, '$.homeDismissed')), 'false') NOT IN ('true', '1')`;
export function taskOptions(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) || {} : value || {};
  } catch {
    return {};
  }
}
const clean = (value) =>
  String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
export function taskIdentity(row) {
  const options = taskOptions(row.options_json);
  const materials = Array.isArray(options.taskMaterials) ? options.taskMaterials : [];
  return {
    title: clean(row.artifact_title || row.title || options.title || materials[0]?.title || options.question).slice(
      0,
      120,
    ),
    materialCount: materials.length,
    materialTitles: materials
      .map((item) => clean(item.title).slice(0, 120))
      .filter(Boolean)
      .slice(0, 3),
    dismissed: options.homeDismissed === true || options.homeDismissed === 1 || options.homeDismissed === 'true',
  };
}

// Legacy jobs have no material-name snapshot. Resolve only these bounded, owned jobs in a batch.
export async function hydrateTaskIdentities(database, userId, rows) {
  const legacy = rows.filter(
    (row) => !taskOptions(row.options_json).taskMaterials && !row.artifact_title && !row.title,
  );
  if (!legacy.length) return rows;
  const inputs = await readTaskInputs(
    database,
    userId,
    legacy.map((row) => row.id),
  );
  return rows.map((row) => {
    if (!legacy.includes(row)) return row;
    const materials = inputs.filter((item) => item.jobId === row.id);
    return { ...row, options_json: { ...taskOptions(row.options_json), taskMaterials: materials } };
  });
}

export async function readTaskInputs(database, userId, jobIds) {
  if (!jobIds.length) return [];
  const [rows] = await database.query(
    `SELECT i.job_id, i.input_index, i.input_type, i.resource_type, i.resource_id, i.document_source_id
     FROM toolbox_job_inputs i JOIN toolbox_jobs j ON j.id=i.job_id
     WHERE j.user_id=? AND j.id IN (${jobIds.map(() => '?').join(',')}) ORDER BY i.job_id, i.input_index`,
    [userId, ...jobIds],
  );
  const refs = rows
    .filter((row) => row.input_type === 'resource')
    .map((row) => ({ type: row.resource_type, id: String(row.resource_id) }));
  const metadata = refs.length
    ? await resolvePersonalKnowledgeResourceMetadata({ userId, resourceRefs: refs, database })
    : [];
  const byRef = new Map(metadata.map((item) => [`${item.type}:${item.id}`, item]));
  const sourceIds = [...new Set(rows.map((row) => row.document_source_id).filter(Boolean))];
  const [sources] = sourceIds.length
    ? await database.query(
        `SELECT id,file_name,status,expires_at FROM ai_document_sources WHERE user_id=? AND id IN (${sourceIds.map(() => '?').join(',')})`,
        [userId, ...sourceIds],
      )
    : [[]];
  const bySource = new Map(sources.map((item) => [item.id, item]));
  return rows.map((row) => {
    const source = bySource.get(row.document_source_id);
    const resource = byRef.get(`${row.resource_type}:${row.resource_id}`);
    return {
      jobId: row.job_id,
      type: row.input_type === 'resource' ? row.resource_type : 'document_source',
      id: String(row.resource_id || row.document_source_id || ''),
      title: clean(resource?.title || source?.file_name).slice(0, 255),
      available:
        row.input_type === 'resource'
          ? Boolean(resource)
          : Boolean(source && (!source.expires_at || new Date(source.expires_at).getTime() > Date.now())),
      ...(resource ? { version: resource.version } : {}),
    };
  });
}
