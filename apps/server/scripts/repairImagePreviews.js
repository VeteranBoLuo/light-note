import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../db/index.js';
import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
import { queuePreview } from '../util/imagePreview/references.js';
import { imageFailure } from '../util/imagePreview/errors.js';
const args = process.argv.slice(2);
const value = (key) => args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);
const apply = args.includes('--apply');
const checkpointPath = value('--checkpoint');
const ids = (value('--ids') || '').split(',').filter(Boolean);
const verified = new Set((value('--verified-ids') || '').split(',').filter(Boolean));
const batchSize = Number(value('--batch-size') || 5);
let checkpoint = { completed: [], pending: [], serviceFailureStreak: 0, results: [] };
async function save() {
  await fs.writeFile(`${checkpointPath}.tmp`, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
  await fs.rename(`${checkpointPath}.tmp`, checkpointPath);
}
try {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10 || ids.some((id) => !/^\d+$/.test(id)))
    throw new Error('INVALID_ARGUMENTS');
  if (
    apply &&
    (!checkpointPath || !path.isAbsolute(checkpointPath) || !ids.length || !args.includes('--workers-v2-confirmed'))
  )
    throw new Error('APPLY_REQUIRES_IDS_ABSOLUTE_CHECKPOINT_AND_V2_WORKERS');
  const [rows] = await pool.query(
    `SELECT j.id AS job_id,j.error_code,a.file_id,a.source_revision,i.status AS asset_status
    FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
    JOIN image_assets i ON a.source_type='image_asset' AND i.id=a.file_id AND i.source_version=a.source_revision
    WHERE j.status='failed' AND a.strategy='image_thumbnail' AND a.strategy_version<${CARD_IMAGE_PROFILE.version}
    AND i.status<>'deleting' ${ids.length ? 'AND j.id IN (?)' : ''} ORDER BY j.id LIMIT 500`,
    ids.length ? [ids] : [],
  );
  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'read-only',
      candidates: rows.map((r) => ({
        jobId: String(r.job_id),
        errorCode: r.error_code,
        eligible: r.error_code === 'IMAGE_SOURCE_PIXEL_LIMIT' || verified.has(String(r.job_id)),
      })),
    }),
  );
  if (apply) {
    try {
      checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (!Array.isArray(checkpoint.completed) || !Array.isArray(checkpoint.pending))
      throw new Error('INVALID_CHECKPOINT');
    if (checkpoint.serviceFailureStreak >= 3) throw new Error('SERVICE_FAILURE_THRESHOLD_REACHED');
    // Resume pending jobs before queueing more. Preserve IDs before waiting for workers.
    if (!checkpoint.pending.length) {
      for (const row of rows
        .filter(
          (r) =>
            !checkpoint.completed.includes(String(r.job_id)) &&
            (r.error_code === 'IMAGE_SOURCE_PIXEL_LIMIT' || verified.has(String(r.job_id))),
        )
        .slice(0, batchSize)) {
        const c = await pool.getConnection();
        try {
          await c.beginTransaction();
          const [[asset]] = await c.query('SELECT * FROM image_assets WHERE id=? FOR UPDATE', [row.file_id]);
          if (!asset || asset.status === 'deleting' || asset.source_version !== row.source_revision) {
            await c.rollback();
            continue;
          }
          await queuePreview(c, asset);
          const [[job]] = await c.query(
            `SELECT j.id FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
            WHERE a.source_type='image_asset' AND a.file_id=? AND a.source_revision=? AND a.strategy='image_thumbnail' AND a.strategy_version=${CARD_IMAGE_PROFILE.version}`,
            [asset.id, asset.source_version],
          );
          if (!job) throw new Error('JOB_NOT_QUEUED');
          await c.commit();
          checkpoint.pending.push({ oldId: String(row.job_id), id: String(job.id) });
          await save();
        } catch (e) {
          await c.rollback();
          throw e;
        } finally {
          c.release();
        }
      }
    }
    const deadline = Date.now() + 120000;
    while (checkpoint.pending.length && Date.now() < deadline) {
      for (const pending of [...checkpoint.pending]) {
        const [[job]] = await pool.query('SELECT status,error_code FROM file_preview_jobs WHERE id=?', [pending.id]);
        if (!job || !['completed', 'failed'].includes(job.status)) continue;
        checkpoint.pending = checkpoint.pending.filter((p) => p.id !== pending.id);
        checkpoint.completed.push(pending.oldId);
        checkpoint.results ||= [];
        checkpoint.results.push({
          oldId: pending.oldId,
          id: pending.id,
          status: job.status,
          errorCode: job.error_code,
        });
        checkpoint.serviceFailureStreak =
          job.status === 'failed' && imageFailure(job.error_code).failureKind === 'service'
            ? checkpoint.serviceFailureStreak + 1
            : 0;
        await save();
        console.log(JSON.stringify({ jobId: pending.id, status: job.status, errorCode: job.error_code }));
        if (checkpoint.serviceFailureStreak >= 3) throw new Error('SERVICE_FAILURE_THRESHOLD_REACHED');
      }
      if (checkpoint.pending.length) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (checkpoint.pending.length) throw new Error('JOBS_STILL_PENDING_RESUME_WITH_CHECKPOINT');
  }
} catch (e) {
  console.error(/^[A-Z_]+$/.test(e.message) ? e.message : 'IMAGE_REPAIR_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
