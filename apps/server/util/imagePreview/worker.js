import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
import { classifyImageError, imageFailure } from './errors.js';
import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { putObjectBodyToObs, deleteObjectFromObs } from '../obsClient.js';
import { compressCardImage, imageError } from './compress.js';
import { readSource, storageAdapters, hash } from './sources.js';
import { generationEnabled } from './references.js';

export async function runSingleImagePreviewJob(
  workerId,
  {
    db = pool,
    compress = compressCardImage,
    read = readSource,
    put = putObjectBodyToObs,
    remove = deleteObjectFromObs,
    metadata = (asset) => storageAdapters[asset.storage_kind].metadata(asset.source_locator),
  } = {},
) {
  if (!generationEnabled()) return false;
  const connection = await db.getConnection();
  let job;
  let stage = 'processing';
  const lease = `${String(workerId).slice(0, 40)}:${randomUUID()}`;
  try {
    await connection.beginTransaction();
    const [rows] =
      await connection.query(`SELECT j.id AS job_id,j.attempts,j.output_object_key,a.id AS artifact_id,a.file_id,
      i.* FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
      JOIN image_assets i ON i.id=a.file_id AND a.source_type='image_asset'
      WHERE a.strategy='image_thumbnail' AND a.strategy_version=${CARD_IMAGE_PROFILE.version} AND a.source_revision=i.source_version AND i.status<>'deleting' AND j.attempts<3 AND
      ((j.status='queued' AND j.available_at<=NOW()) OR
       (j.status='processing' AND j.locked_at<DATE_SUB(NOW(),INTERVAL 2 MINUTE)))
      ORDER BY j.available_at,j.id LIMIT 1 FOR UPDATE`);
    job = rows[0];
    if (!job) {
      await connection.commit();
      return false;
    }
    await connection.query(
      "UPDATE file_preview_jobs SET status='processing',attempts=attempts+1,locked_at=NOW(),locked_by=? WHERE id=?",
      [lease, job.job_id],
    );
    await connection.query("UPDATE file_preview_artifacts SET status='processing',error_code=NULL WHERE id=?", [
      job.artifact_id,
    ]);
    await connection.commit();
    // Retain the previous key until its removal succeeds, including after a crash.
    if (job.output_object_key) await remove(job.output_object_key);
    stage = 'source';
    const source = await read(job);
    stage = 'decode';
    const output = await compress(source.body);
    const version = hash(source.body);
    const key = `image-previews/${job.id}/card-v${CARD_IMAGE_PROFILE.version}/${version}/${lease.slice(-36)}.webp`;
    const [registered] = await connection.query(
      "UPDATE file_preview_jobs SET output_object_key=?,output_keys_json=JSON_ARRAY_APPEND(COALESCE(output_keys_json,JSON_ARRAY()), '$', ?) WHERE id=? AND locked_by=? AND status='processing'",
      [key, key, job.job_id, lease],
    );
    if (!registered.affectedRows) return true;
    stage = 'upload';
    await put(key, output.body, 'image/webp');
    stage = 'source';
    const currentMeta = await metadata(job);
    if (currentMeta.version !== source.version) throw imageError('IMAGE_SOURCE_CHANGED');
    await connection.beginTransaction();
    const [[current]] = await connection.query('SELECT status,source_version FROM image_assets WHERE id=? FOR UPDATE', [
      job.id,
    ]);
    const [[claim]] = await connection.query('SELECT locked_by,status FROM file_preview_jobs WHERE id=? FOR UPDATE', [
      job.job_id,
    ]);
    if (
      !current ||
      current.status === 'deleting' ||
      current.source_version !== job.source_version ||
      claim?.locked_by !== lease ||
      claim.status !== 'processing'
    ) {
      throw imageError('IMAGE_LEASE_LOST');
    }
    await connection.query('UPDATE image_assets SET source_version=?,source_size=? WHERE id=?', [
      version,
      source.body.length,
      job.id,
    ]);
    await connection.query(
      `UPDATE file_preview_artifacts SET status='ready',artifact_object_key=?,artifact_size=?,
      image_width=?,image_height=?,preview_metadata_json=?,source_revision=?,source_etag=?,source_size=?,error_code=NULL WHERE id=?`,
      [
        key,
        output.body.length,
        output.width,
        output.height,
        JSON.stringify({ presentation: output.presentation || 'full' }),
        version,
        version,
        source.body.length,
        job.artifact_id,
      ],
    );
    await connection.query(
      "UPDATE file_preview_jobs SET status='completed',locked_at=NULL,locked_by=NULL,output_object_key=NULL,error_code=NULL WHERE id=? AND locked_by=?",
      [job.job_id, lease],
    );
    await connection.commit();
    console.info(
      '[image-preview] ready source=%s inputBytes=%d outputBytes=%d',
      job.source_type,
      source.body.length,
      output.body.length,
    );
    return true;
  } catch (error) {
    await connection.rollback();
    if (!job) throw error;
    const code = classifyImageError(error, stage);
    const stop = !imageFailure(code).retryable || Number(job.attempts) + 1 >= 3;
    await connection.query(
      `UPDATE file_preview_artifacts a JOIN file_preview_jobs j ON j.artifact_id=a.id
      SET a.status=?,a.error_code=? WHERE j.id=? AND j.locked_by=?`,
      [stop ? 'failed' : 'queued', code, job.job_id, lease],
    );
    await connection.query(
      `UPDATE file_preview_jobs SET status=?,error_code=?,locked_at=NULL,locked_by=NULL,
      available_at=DATE_ADD(NOW(),INTERVAL ? SECOND) WHERE id=? AND locked_by=?`,
      [stop ? 'failed' : 'queued', code, Number(job.attempts) === 0 ? 60 : 300, job.job_id, lease],
    );
    console.warn('[image-preview] processing failed code=%s', code);
    return true;
  } finally {
    connection.release();
  }
}

export async function cleanupImageAssets({
  db = pool,
  remove = deleteObjectFromObs,
  removeSource = (asset) => storageAdapters[asset.storage_kind].remove(asset.source_locator),
} = {}) {
  // Failed final attempts must not remain processing forever after a process crash.
  await db.query(`UPDATE file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
    SET j.status='failed',a.status='failed',j.error_code='IMAGE_WORKER_INTERRUPTED',a.error_code='IMAGE_WORKER_INTERRUPTED'
    WHERE a.source_type='image_asset' AND j.status='processing' AND j.attempts>=3
      AND j.locked_at<DATE_SUB(NOW(),INTERVAL 2 MINUTE)`);
  const [outputs] = await db.query(`SELECT j.id,j.output_object_key FROM file_preview_jobs j
    JOIN file_preview_artifacts a ON a.id=j.artifact_id WHERE a.source_type='image_asset'
    AND j.status='failed' AND j.output_object_key IS NOT NULL LIMIT 50`);
  for (const out of outputs) {
    try {
      await remove(out.output_object_key);
      await db.query('UPDATE file_preview_jobs SET output_object_key=NULL WHERE id=? AND output_object_key=?', [
        out.id,
        out.output_object_key,
      ]);
    } catch {
      /* Keep the durable key for next cleanup. */
    }
  }
  const [ledgers] = await db.query(`SELECT j.id,j.output_keys_json,a.artifact_object_key FROM file_preview_jobs j
    JOIN file_preview_artifacts a ON a.id=j.artifact_id WHERE a.source_type='image_asset'
    AND j.status IN ('completed','failed') AND j.output_keys_json IS NOT NULL ORDER BY j.update_time,j.id LIMIT 50`);
  for (const ledger of ledgers) {
    for (const key of JSON.parse(ledger.output_keys_json || '[]')) {
      if (key === ledger.artifact_object_key) continue;
      try {
        await remove(key);
      } catch {
        /* Next sweep retries from the durable ledger. */
      }
    }
    await db.query('UPDATE file_preview_jobs SET update_time=NOW() WHERE id=?', [ledger.id]);
  }
  if (process.env.IMAGE_PREVIEW_CLEANUP_ENABLED !== 'true') return;
  const [candidates] = await db.query(`SELECT id FROM image_assets WHERE reconciled=1
    AND status IN ('pending_delete','deleting') AND cleanup_after<=NOW() ORDER BY cleanup_after LIMIT 50`);
  for (const candidate of candidates) {
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      const [[asset]] = await c.query('SELECT * FROM image_assets WHERE id=? FOR UPDATE', [candidate.id]);
      const [refs] = await c.query('SELECT asset_id FROM image_asset_refs WHERE asset_id=? LIMIT 1', [candidate.id]);
      const [[running]] = await c.query(
        `SELECT j.id FROM file_preview_jobs j JOIN file_preview_artifacts a ON a.id=j.artifact_id
        WHERE a.source_type='image_asset' AND a.file_id=? AND j.status='processing'
        AND j.locked_at>=DATE_SUB(NOW(),INTERVAL 2 MINUTE) LIMIT 1`,
        [candidate.id],
      );
      const [shared] = asset
        ? await c.query('SELECT id FROM image_assets WHERE storage_kind=? AND source_locator=? AND id<>? LIMIT 1', [
            asset.storage_kind,
            asset.source_locator,
            asset.id,
          ])
        : [[]];
      if (!asset || refs.length || running || shared.length || !asset.reconciled) {
        await c.rollback();
        continue;
      }
      await c.query(
        "UPDATE image_assets SET status='deleting',delete_started_at=COALESCE(delete_started_at,NOW()),cleanup_after=DATE_ADD(NOW(),INTERVAL 5 MINUTE) WHERE id=?",
        [asset.id],
      );
      await c.commit();
      const [artifacts] = await c.query(
        `SELECT a.id,a.artifact_object_key,j.output_object_key,j.output_keys_json FROM file_preview_artifacts a
        LEFT JOIN file_preview_jobs j ON j.artifact_id=a.id WHERE a.source_type='image_asset' AND a.file_id=?`,
        [asset.id],
      );
      for (const key of new Set(
        artifacts
          .flatMap((a) => [a.artifact_object_key, a.output_object_key, ...JSON.parse(a.output_keys_json || '[]')])
          .filter(Boolean),
      ))
        await remove(key);
      if (asset.storage_kind === 'local') {
        const { deleteNoteImageThumbnail } = await import('../noteImageThumbnail.js');
        await deleteNoteImageThumbnail(`https://boluo66.top/uploads/${asset.source_locator}`);
      }
      await removeSource(asset);
      // Retain the object ledger for 24h after deletion starts, covering a late response from an expired upload lease.
      if (!asset.delete_started_at || Date.now() - new Date(asset.delete_started_at).getTime() < 86400000) continue;
      await c.beginTransaction();
      await c.query("DELETE FROM file_preview_artifacts WHERE source_type='image_asset' AND file_id=?", [asset.id]);
      await c.query("DELETE FROM image_assets WHERE id=? AND status='deleting'", [asset.id]);
      await c.commit();
    } catch (error) {
      await c.rollback();
      await c.query('UPDATE image_assets SET cleanup_attempts=cleanup_attempts+1,cleanup_error=? WHERE id=?', [
        classifyImageError(error, 'upload'),
        candidate.id,
      ]);
    } finally {
      c.release();
    }
  }
}
