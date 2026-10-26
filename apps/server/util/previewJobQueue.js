import { withWorkerStage } from './workerDiagnostics.js';

const sourceTables = Object.freeze({
  image_asset: 'image_assets',
  cloud_file: 'files',
  community_chat_file: 'community_chat_message_files',
});

// All preview lanes share these rows. Match upload/prepare: source -> artifact ->
// job. Never acquire a queue-index range before a source or primary-key lock.
export async function withPreviewJobLock(db, candidate, work) {
  const c = typeof db.getConnection === 'function' ? await db.getConnection() : db;
  try {
    await c.beginTransaction();
    const table = Object.hasOwn(sourceTables, candidate.queue_source_type)
      ? sourceTables[candidate.queue_source_type]
      : null;
    if (table) {
      await withWorkerStage('preview.lock-source', () =>
        c.query(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [candidate.queue_source_id]),
      );
    }
    const [[artifact]] = await withWorkerStage('preview.lock-artifact', () =>
      c.query('SELECT id,source_type,file_id FROM file_preview_artifacts WHERE id=? FOR UPDATE', [
        candidate.artifact_id,
      ]),
    );
    if (
      !artifact ||
      artifact.source_type !== candidate.queue_source_type ||
      String(artifact.file_id) !== String(candidate.queue_source_id)
    ) {
      await c.commit();
      return null;
    }
    const [[job]] = await withWorkerStage('preview.lock-job', () =>
      c.query('SELECT id,artifact_id FROM file_preview_jobs WHERE artifact_id=? FOR UPDATE', [artifact.id]),
    );
    if (candidate.job_id != null && String(job?.id) !== String(candidate.job_id)) {
      await c.commit();
      return null;
    }
    const result = await work(c);
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    if (c !== db) c.release();
  }
}

// Discovery is an ordinary autocommit read. Empty/wrong-lane polls take no row or
// gap locks. The first snapshot inside BEGIN is created only after all locks are
// held, so a candidate changed while waiting is checked against committed facts.
export async function withNextPreviewJob(db, query, params, work) {
  const [[candidate]] = await withWorkerStage('preview.discover', () =>
    db.query(`${query} ORDER BY j.available_at,j.id LIMIT 1`, params),
  );
  if (!candidate) return null;
  return withPreviewJobLock(db, candidate, async (c) => {
    const [[current]] = await withWorkerStage('preview.recheck', () =>
      c.query(`${query} AND j.id=?`, [...params, candidate.job_id]),
    );
    return current ? work(c, current) : null;
  });
}

export async function expirePreviewLeases(db, { sourceTypes, seconds, code }) {
  const query = `SELECT j.id AS job_id,a.id AS artifact_id,
    a.source_type AS queue_source_type,a.file_id AS queue_source_id
    FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
    WHERE a.source_type IN (${sourceTypes.map(() => '?').join(',')})
      AND j.status='processing' AND j.attempts>=3
      AND j.locked_at<DATE_SUB(NOW(),INTERVAL ? SECOND)`;
  // Bound each pass without changing the normal retry/lease policy or touching
  // historical terminal records. Another pass can finish a larger expired batch.
  for (let n = 0; n < 50; n++) {
    const expired = await withNextPreviewJob(db, query, [...sourceTypes, seconds], async (c, job) => {
      await c.query("UPDATE file_preview_artifacts SET status='failed',error_code=? WHERE id=?", [
        code,
        job.artifact_id,
      ]);
      await c.query(
        "UPDATE file_preview_jobs SET status='failed',locked_at=NULL,locked_by=NULL,error_code=? WHERE id=?",
        [code, job.job_id],
      );
      return true;
    });
    if (!expired) break;
  }
}
