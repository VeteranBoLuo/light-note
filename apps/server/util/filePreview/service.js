import crypto from 'node:crypto';
import { FILE_PREVIEW_STRATEGY, getFilePreviewExtension, resolveFilePreviewFormat } from '@lightnote/shared';
import pool from '../../db/index.js';
import {
  buildObjectKey,
  createDownloadSignedUrl,
  deleteObjectFromObs,
  getObjectBufferFromObs,
  getObjectMetadataFromObs,
  putObjectBodyToObs,
} from '../obsClient.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { buildArchiveDirectoryPage, createArchiveManifest } from './archive.js';
import { convertOfficeToPdf } from './office.js';
import { getFilePreviewRuntimeConfig, inspectFilePreviewRuntime } from './runtime.js';

export const FILE_PREVIEW_STRATEGY_VERSION = 1;
const MAX_JOB_ATTEMPTS = 3;
const PREVIEW_URL_EXPIRES_SECONDS = 600;
const NON_RETRYABLE_ERRORS = new Set([
  'FILE_CONTENT_INVALID',
  'FILE_SIZE_INVALID',
  'FILE_SIZE_MISMATCH',
  'FILE_PREVIEW_SOURCE_CHANGED',
  'ARCHIVE_PASSWORD_REQUIRED',
  'ARCHIVE_MULTIPART_OR_DAMAGED',
  'ARCHIVE_ENTRY_LIMIT_EXCEEDED',
  'ARCHIVE_MANIFEST_TOO_LARGE',
  'ARCHIVE_EMPTY_OR_UNREADABLE',
  'OFFICE_OUTPUT_INVALID',
  'OFFICE_OUTPUT_TOO_LARGE',
]);
const PROCESSING_ERROR_CODES = new Set([
  ...NON_RETRYABLE_ERRORS,
  'ARCHIVE_EMPTY_OR_UNREADABLE',
  'ARCHIVE_LIST_FAILED',
  'ARCHIVE_PREVIEW_TIMEOUT',
  'OFFICE_CONVERSION_FAILED',
  'OFFICE_CONVERSION_TIMEOUT',
  'FILE_PREVIEW_STRATEGY_INVALID',
]);

function previewError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeEtag(value) {
  return String(value || '')
    .trim()
    .replace(/^"|"$/gu, '')
    .slice(0, 160);
}

function sourceObjectKey(file) {
  return file.obs_key || buildObjectKey(file.create_by, file.file_name);
}

function resolveDescriptor(file) {
  const format = resolveFilePreviewFormat({ fileName: file.file_name, fileType: file.file_type });
  if (!format) throw previewError('FILE_PREVIEW_UNSUPPORTED', 415);
  const extension = getFilePreviewExtension(file.file_name) || format.extensions[0];
  return { format, extension };
}

async function selectOwnedFile(db, ownerUserId, fileId, lock = false) {
  const [rows] = await db.query(
    `SELECT id, create_by, file_name, file_type, file_size, obs_key
     FROM files WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [fileId, ownerUserId],
  );
  return rows[0] || null;
}

async function selectArtifact(db, fileId, strategy, lock = false) {
  const [rows] = await db.query(
    `SELECT * FROM file_preview_artifacts
     WHERE file_id = ? AND strategy = ? AND strategy_version = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [fileId, strategy, FILE_PREVIEW_STRATEGY_VERSION],
  );
  return rows[0] || null;
}

function createArtifactPreviewUrl(row) {
  if (row?.status !== 'ready' || row?.strategy !== FILE_PREVIEW_STRATEGY.CONVERTED_PDF) return '';
  if (!row.artifact_object_key) throw previewError('FILE_PREVIEW_ARTIFACT_MISSING', 503);
  const signed = createDownloadSignedUrl({
    objectKey: row.artifact_object_key,
    expires: PREVIEW_URL_EXPIRES_SECONDS,
  });
  if (!signed?.url) throw previewError('FILE_PREVIEW_URL_FAILED', 503);
  return signed.url;
}

function formatPreviewState(file, descriptor, artifact) {
  const base = {
    fileId: String(file.id),
    strategy: descriptor.format.strategy,
    previewType: descriptor.format.previewType,
    formatId: descriptor.format.id,
    status: artifact?.status || 'missing',
    errorCode: artifact?.error_code || '',
    pollAfterMs: artifact && ['queued', 'processing'].includes(artifact.status) ? 1500 : 0,
  };
  if (!artifact) return base;
  if (artifact.status === 'ready' && artifact.strategy === FILE_PREVIEW_STRATEGY.CONVERTED_PDF) {
    return {
      ...base,
      previewUrl: createArtifactPreviewUrl(artifact),
      expiresIn: PREVIEW_URL_EXPIRES_SECONDS,
      artifactSize: Number(artifact.artifact_size || 0),
    };
  }
  if (artifact.status === 'ready' && artifact.strategy === FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST) {
    return {
      ...base,
      archive: {
        entryCount: Number(artifact.entry_count || 0),
        totalUncompressedSize: Number(artifact.total_uncompressed_size || 0),
        containsEncrypted: Boolean(artifact.contains_encrypted),
        suspiciousExpansion: Boolean(artifact.suspicious_expansion),
      },
    };
  }
  return base;
}

function artifactMatchesFileIdentity(file, descriptor, artifact) {
  return (
    artifact?.owner_user_id === file.create_by &&
    Number(artifact.source_size) === Number(file.file_size) &&
    artifact.format_id === descriptor.format.id
  );
}

async function artifactMatchesCurrentSource(file, descriptor, artifact) {
  if (!artifactMatchesFileIdentity(file, descriptor, artifact)) return false;
  const metadata = await getObjectMetadataFromObs(sourceObjectKey(file));
  return (
    Number(metadata?.contentLength) === Number(artifact.source_size) &&
    normalizeEtag(metadata?.etag) === artifact.source_etag
  );
}

function touchArtifact(artifactId) {
  if (!artifactId) return;
  pool
    .query('UPDATE file_preview_artifacts SET last_access_at = NOW() WHERE id = ?', [artifactId])
    .catch((error) =>
      console.warn('[file-preview] touch failed artifact=%s code=%s', artifactId, stableAgentErrorCode(error)),
    );
}

export async function resolveFilePreview({ ownerUserId, fileId, touch = true }) {
  const file = await selectOwnedFile(pool, ownerUserId, fileId);
  if (!file) throw previewError('FILE_NOT_FOUND', 404);
  const descriptor = resolveDescriptor(file);
  let artifact = await selectArtifact(pool, file.id, descriptor.format.strategy);
  if (artifact && !artifactMatchesFileIdentity(file, descriptor, artifact)) {
    artifact = null;
  } else if (artifact?.status === 'ready' && !(await artifactMatchesCurrentSource(file, descriptor, artifact))) {
    artifact = null;
  }
  if (artifact?.status === 'ready' && touch) touchArtifact(artifact.id);
  return formatPreviewState(file, descriptor, artifact);
}

async function loadSourceMetadata(file, descriptor) {
  const runtime = await inspectFilePreviewRuntime(descriptor.format.strategy);
  if (!runtime.ready) throw previewError(runtime.errorCode, 503);
  const objectKey = sourceObjectKey(file);
  const metadata = await getObjectMetadataFromObs(objectKey);
  const sourceSize = Number(metadata?.contentLength);
  const sourceEtag = normalizeEtag(metadata?.etag);
  const maximum =
    descriptor.format.strategy === FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST
      ? runtime.config.limits.archiveMaxBytes
      : runtime.config.limits.officeMaxBytes;
  if (!Number.isSafeInteger(sourceSize) || sourceSize <= 0 || sourceSize > maximum) {
    throw previewError('FILE_SIZE_INVALID', 413);
  }
  if (sourceSize !== Number(file.file_size || 0)) throw previewError('FILE_SIZE_MISMATCH', 409);
  if (!sourceEtag) throw previewError('FILE_PREVIEW_SOURCE_METADATA_INVALID', 503);
  return { sourceSize, sourceEtag };
}

export async function prepareFilePreview({ ownerUserId, fileId, retry = false }) {
  const initialFile = await selectOwnedFile(pool, ownerUserId, fileId);
  if (!initialFile) throw previewError('FILE_NOT_FOUND', 404);
  const descriptor = resolveDescriptor(initialFile);
  const metadata = await loadSourceMetadata(initialFile, descriptor);
  const connection = await pool.getConnection();
  let artifact;
  let oldArtifactObjectKey = '';
  let oldPendingObjectKey = '';
  let resetJob = false;
  try {
    await connection.beginTransaction();
    const file = await selectOwnedFile(connection, ownerUserId, fileId, true);
    if (!file) throw previewError('FILE_NOT_FOUND', 404);
    if (Number(file.file_size || 0) !== metadata.sourceSize || sourceObjectKey(file) !== sourceObjectKey(initialFile)) {
      throw previewError('FILE_PREVIEW_SOURCE_CHANGED', 409);
    }
    artifact = await selectArtifact(connection, file.id, descriptor.format.strategy, true);
    const sourceMatches =
      artifact &&
      artifact.source_etag === metadata.sourceEtag &&
      Number(artifact.source_size) === metadata.sourceSize &&
      artifact.format_id === descriptor.format.id;

    if (!artifact) {
      const [insertResult] = await connection.query(
        `INSERT INTO file_preview_artifacts
          (file_id, owner_user_id, strategy, strategy_version, format_id, source_etag, source_size, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
        [
          file.id,
          ownerUserId,
          descriptor.format.strategy,
          FILE_PREVIEW_STRATEGY_VERSION,
          descriptor.format.id,
          metadata.sourceEtag,
          metadata.sourceSize,
        ],
      );
      artifact = await selectArtifact(connection, file.id, descriptor.format.strategy, true);
      if (!artifact) artifact = { id: insertResult.insertId, status: 'queued' };
      resetJob = true;
    } else if (!sourceMatches || (retry && ['failed', 'ready'].includes(artifact.status))) {
      oldArtifactObjectKey = artifact.artifact_object_key || '';
      await connection.query(
        `UPDATE file_preview_artifacts
         SET owner_user_id = ?, format_id = ?, source_etag = ?, source_size = ?, status = 'queued',
             artifact_object_key = NULL, artifact_size = 0, manifest_json = NULL, entry_count = 0,
             total_uncompressed_size = 0, contains_encrypted = 0, suspicious_expansion = 0,
             error_code = NULL, last_access_at = NOW()
         WHERE id = ?`,
        [ownerUserId, descriptor.format.id, metadata.sourceEtag, metadata.sourceSize, artifact.id],
      );
      artifact = { ...artifact, ...metadata, status: 'queued', error_code: null, artifact_object_key: null };
      resetJob = true;
    }

    if (artifact.status === 'queued') {
      if (resetJob) {
        const [jobRows] = await connection.query(
          'SELECT output_object_key FROM file_preview_jobs WHERE artifact_id = ? LIMIT 1 FOR UPDATE',
          [artifact.id],
        );
        oldPendingObjectKey = jobRows[0]?.output_object_key || '';
      }
      const duplicateUpdate = resetJob
        ? `status = 'queued', attempts = 0, available_at = NOW(),
           locked_at = NULL, locked_by = NULL, error_code = NULL, output_object_key = NULL`
        : 'artifact_id = VALUES(artifact_id)';
      await connection.query(
        `INSERT INTO file_preview_jobs (artifact_id, status, attempts, available_at, locked_at, locked_by, error_code)
         VALUES (?, 'queued', 0, NOW(), NULL, NULL, NULL)
         ON DUPLICATE KEY UPDATE ${duplicateUpdate}`,
        [artifact.id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (oldArtifactObjectKey) {
    deleteObjectFromObs(oldArtifactObjectKey).catch((error) =>
      console.warn('[file-preview] stale artifact cleanup failed code=%s', stableAgentErrorCode(error)),
    );
  }
  if (oldPendingObjectKey && oldPendingObjectKey !== oldArtifactObjectKey) {
    deleteObjectFromObs(oldPendingObjectKey).catch((error) =>
      console.warn('[file-preview] pending artifact cleanup failed code=%s', stableAgentErrorCode(error)),
    );
  }
  return resolveFilePreview({ ownerUserId, fileId });
}

export async function listArchivePreview({ ownerUserId, fileId, directory, query, offset, limit, touch = true }) {
  const file = await selectOwnedFile(pool, ownerUserId, fileId);
  if (!file) throw previewError('FILE_NOT_FOUND', 404);
  const descriptor = resolveDescriptor(file);
  if (descriptor.format.strategy !== FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST) {
    throw previewError('FILE_PREVIEW_UNSUPPORTED', 415);
  }
  const artifact = await selectArtifact(pool, file.id, descriptor.format.strategy);
  if (!artifact || artifact.status !== 'ready' || !artifact.manifest_json) {
    throw previewError('FILE_PREVIEW_NOT_READY', 409);
  }
  if (!artifactMatchesFileIdentity(file, descriptor, artifact)) {
    throw previewError('FILE_PREVIEW_SOURCE_CHANGED', 409);
  }
  let manifest;
  try {
    manifest = JSON.parse(artifact.manifest_json);
  } catch {
    throw previewError('FILE_PREVIEW_ARTIFACT_INVALID', 503);
  }
  if (touch) touchArtifact(artifact.id);
  return {
    ...buildArchiveDirectoryPage(manifest, { directory, query, offset, limit }),
    summary: {
      entryCount: Number(artifact.entry_count || 0),
      totalUncompressedSize: Number(artifact.total_uncompressed_size || 0),
      containsEncrypted: Boolean(artifact.contains_encrypted),
      suspiciousExpansion: Boolean(artifact.suspicious_expansion),
      skippedUnsafeEntries: Number(manifest.skippedUnsafeEntries || 0),
    },
  };
}

async function claimNextJob(workerId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE file_preview_jobs j
       INNER JOIN file_preview_artifacts a ON a.id = j.artifact_id
       SET j.status = 'failed', j.locked_at = NULL, j.locked_by = NULL,
           j.error_code = 'FILE_PREVIEW_WORKER_INTERRUPTED',
           a.status = 'failed', a.error_code = 'FILE_PREVIEW_WORKER_INTERRUPTED'
       WHERE j.status = 'processing' AND j.attempts >= ?
         AND j.locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
      [MAX_JOB_ATTEMPTS],
    );
    const [rows] = await connection.query(
      `SELECT j.id AS job_id, j.attempts, j.output_object_key AS previous_output_object_key,
              a.*, f.file_name, f.file_type, f.file_size, f.obs_key,
              f.create_by, f.del_flag
       FROM file_preview_jobs j
       INNER JOIN file_preview_artifacts a ON a.id = j.artifact_id
       INNER JOIN files f ON f.id = a.file_id AND f.create_by = a.owner_user_id
       WHERE f.del_flag = 0 AND j.attempts < ? AND (
         (j.status = 'queued' AND j.available_at <= NOW()) OR
         (j.status = 'processing' AND j.locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
       )
       ORDER BY j.available_at ASC, j.id ASC LIMIT 1 FOR UPDATE`,
      [MAX_JOB_ATTEMPTS],
    );
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return null;
    }
    const attempts = Number(job.attempts || 0) + 1;
    const leaseOwner = `${String(workerId || 'worker').slice(0, 48)}:${crypto.randomUUID()}`;
    await connection.query(
      `UPDATE file_preview_jobs SET status = 'processing', attempts = ?, locked_at = NOW(),
         locked_by = ?, error_code = NULL, output_object_key = NULL WHERE id = ?`,
      [attempts, leaseOwner, job.job_id],
    );
    await connection.query(`UPDATE file_preview_artifacts SET status = 'processing', error_code = NULL WHERE id = ?`, [
      job.id,
    ]);
    await connection.commit();
    if (job.previous_output_object_key) {
      deleteObjectFromObs(job.previous_output_object_key).catch((error) =>
        console.warn('[file-preview] reclaimed artifact cleanup failed code=%s', stableAgentErrorCode(error)),
      );
    }
    return { ...job, attempts, worker_id: leaseOwner };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function artifactObjectKey(job) {
  const digest = crypto
    .createHash('sha256')
    .update(
      `${job.file_id}:${job.source_etag}:${job.source_size}:${job.strategy_version}:${job.job_id}:${job.attempts}:${job.worker_id}`,
      'utf8',
    )
    .digest('hex');
  return `file-previews/${job.owner_user_id}/${job.file_id}/${digest}.pdf`;
}

async function recordPendingObjectKey(job, objectKey) {
  const [result] = await pool.query(
    `UPDATE file_preview_jobs SET output_object_key = ?
     WHERE id = ? AND status = 'processing' AND attempts = ? AND locked_by = ?`,
    [objectKey, job.job_id, job.attempts, job.worker_id],
  );
  if (!result.affectedRows) throw previewError('FILE_PREVIEW_JOB_STALE', 409);
}

async function completeJob(job, result) {
  const connection = await pool.getConnection();
  let current = false;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT a.*, j.status AS job_status, j.attempts AS job_attempts, j.locked_by AS job_locked_by
       FROM file_preview_artifacts a
       INNER JOIN file_preview_jobs j ON j.artifact_id = a.id
       WHERE a.id = ? AND j.id = ? FOR UPDATE`,
      [job.id, job.job_id],
    );
    const artifact = rows[0];
    current =
      artifact &&
      artifact.source_etag === job.source_etag &&
      Number(artifact.source_size) === Number(job.source_size) &&
      artifact.status === 'processing' &&
      artifact.job_status === 'processing' &&
      Number(artifact.job_attempts) === Number(job.attempts) &&
      artifact.job_locked_by === job.worker_id;
    if (current) {
      await connection.query(
        `UPDATE file_preview_artifacts
         SET status = 'ready', artifact_object_key = ?, artifact_size = ?, manifest_json = ?, entry_count = ?,
             total_uncompressed_size = ?, contains_encrypted = ?, suspicious_expansion = ?, error_code = NULL,
             last_access_at = NOW()
         WHERE id = ?`,
        [
          result.objectKey || null,
          result.artifactSize || 0,
          result.serializedManifest || null,
          result.entryCount || 0,
          result.totalUncompressedSize || 0,
          result.containsEncrypted ? 1 : 0,
          result.suspiciousExpansion ? 1 : 0,
          job.id,
        ],
      );
      await connection.query(
        `UPDATE file_preview_jobs SET status = 'completed', locked_at = NULL, locked_by = NULL,
           error_code = NULL, output_object_key = NULL WHERE id = ?`,
        [job.job_id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (!current && result.objectKey) await deleteObjectFromObs(result.objectKey).catch(() => undefined);
  return current;
}

async function failJob(job, error, clearPendingObject = true) {
  const rawCode = String(error?.code || '');
  const code = PROCESSING_ERROR_CODES.has(rawCode) ? rawCode : 'FILE_PREVIEW_PROCESSING_FAILED';
  const finalFailure = NON_RETRYABLE_ERRORS.has(code) || job.attempts >= MAX_JOB_ATTEMPTS;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT a.source_etag, a.source_size, j.status AS job_status, j.attempts AS job_attempts,
              j.locked_by AS job_locked_by
       FROM file_preview_artifacts a
       INNER JOIN file_preview_jobs j ON j.artifact_id = a.id
       WHERE a.id = ? AND j.id = ? FOR UPDATE`,
      [job.id, job.job_id],
    );
    const artifact = rows[0];
    if (
      artifact &&
      artifact.source_etag === job.source_etag &&
      Number(artifact.source_size) === Number(job.source_size) &&
      artifact.job_status === 'processing' &&
      Number(artifact.job_attempts) === Number(job.attempts) &&
      artifact.job_locked_by === job.worker_id
    ) {
      await connection.query(
        `UPDATE file_preview_jobs SET status = ?, available_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
           locked_at = NULL, locked_by = NULL, error_code = ?,
           output_object_key = ${clearPendingObject ? 'NULL' : 'output_object_key'} WHERE id = ?`,
        [finalFailure ? 'failed' : 'queued', Math.min(60, 5 * 2 ** Math.max(0, job.attempts - 1)), code, job.job_id],
      );
      await connection.query('UPDATE file_preview_artifacts SET status = ?, error_code = ? WHERE id = ?', [
        finalFailure ? 'failed' : 'queued',
        code,
        job.id,
      ]);
    }
    await connection.commit();
  } catch (dbError) {
    await connection.rollback();
    throw dbError;
  } finally {
    connection.release();
  }
}

export async function runSingleFilePreviewJob(workerId) {
  const job = await claimNextJob(workerId);
  if (!job) return false;
  let uploadedObjectKey = '';
  let completed = false;
  try {
    const config = getFilePreviewRuntimeConfig();
    const objectKey = sourceObjectKey(job);
    const metadata = await getObjectMetadataFromObs(objectKey);
    if (
      Number(metadata.contentLength) !== Number(job.source_size) ||
      normalizeEtag(metadata.etag) !== job.source_etag
    ) {
      throw previewError('FILE_PREVIEW_SOURCE_CHANGED', 409);
    }
    const buffer = await getObjectBufferFromObs(objectKey);
    if (buffer.length !== Number(job.source_size)) throw previewError('FILE_SIZE_MISMATCH', 409);
    if (job.strategy === FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST) {
      const descriptor = resolveDescriptor(job);
      const { manifest, serialized } = await createArchiveManifest({
        buffer,
        extension: descriptor.extension,
        bin: config.sevenZipBin,
        limits: config.limits,
      });
      await completeJob(job, {
        serializedManifest: serialized,
        entryCount: manifest.entryCount,
        totalUncompressedSize: manifest.totalUncompressedSize,
        containsEncrypted: manifest.containsEncrypted,
        suspiciousExpansion: manifest.suspiciousExpansion,
      });
    } else if (job.strategy === FILE_PREVIEW_STRATEGY.CONVERTED_PDF) {
      const descriptor = resolveDescriptor(job);
      const pdf = await convertOfficeToPdf({
        buffer,
        extension: descriptor.extension,
        bin: config.officeBin,
        limits: config.limits,
      });
      const outputKey = artifactObjectKey(job);
      await recordPendingObjectKey(job, outputKey);
      uploadedObjectKey = outputKey;
      await putObjectBodyToObs(outputKey, pdf, 'application/pdf');
      completed = await completeJob(job, { objectKey: outputKey, artifactSize: pdf.length });
    } else {
      throw previewError('FILE_PREVIEW_STRATEGY_INVALID');
    }
  } catch (error) {
    let pendingObjectCleaned = true;
    if (uploadedObjectKey && !completed) {
      try {
        await deleteObjectFromObs(uploadedObjectKey);
      } catch (cleanupError) {
        pendingObjectCleaned = false;
        console.warn('[file-preview] failed upload cleanup code=%s', stableAgentErrorCode(cleanupError));
      }
    }
    await failJob(job, error, pendingObjectCleaned);
    console.error('[file-preview] job=%s failed code=%s', job.job_id, stableAgentErrorCode(error));
  }
  return true;
}

export async function cleanupStaleFilePreviewArtifacts() {
  const configuredRetentionDays = Number(process.env.FILE_PREVIEW_RETENTION_DAYS);
  const retentionDays = Number.isFinite(configuredRetentionDays)
    ? Math.min(365, Math.max(1, Math.trunc(configuredRetentionDays)))
    : 30;
  let cleaned = 0;
  const [failedOutputs] = await pool.query(
    `SELECT id, output_object_key FROM file_preview_jobs
     WHERE status = 'failed' AND output_object_key IS NOT NULL LIMIT 100`,
  );
  for (const job of failedOutputs) {
    try {
      await deleteObjectFromObs(job.output_object_key);
      await pool.query('UPDATE file_preview_jobs SET output_object_key = NULL WHERE id = ? AND output_object_key = ?', [
        job.id,
        job.output_object_key,
      ]);
    } catch (error) {
      console.warn('[file-preview] failed job artifact cleanup code=%s', stableAgentErrorCode(error));
    }
  }
  for (let batch = 0; batch < 10; batch += 1) {
    const [rows] = await pool.query(
      `SELECT a.id, a.artifact_object_key, j.output_object_key
       FROM file_preview_artifacts a
       LEFT JOIN file_preview_jobs j ON j.artifact_id = a.id
       LEFT JOIN files f ON f.id = a.file_id AND f.create_by = a.owner_user_id
       WHERE f.id IS NULL OR (
         COALESCE(a.last_access_at, a.update_time) < DATE_SUB(NOW(), INTERVAL ${retentionDays} DAY)
         AND a.status IN ('ready', 'failed')
       )
       ORDER BY a.update_time ASC LIMIT 100`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const [result] = await pool.query(
        `DELETE a FROM file_preview_artifacts a
         LEFT JOIN files f ON f.id = a.file_id AND f.create_by = a.owner_user_id
         WHERE a.id = ? AND (
           f.id IS NULL OR (
             COALESCE(a.last_access_at, a.update_time) < DATE_SUB(NOW(), INTERVAL ${retentionDays} DAY)
             AND a.status IN ('ready', 'failed')
           )
         )`,
        [row.id],
      );
      if (!result.affectedRows) continue;
      cleaned += 1;
      if (row.artifact_object_key) {
        await deleteObjectFromObs(row.artifact_object_key).catch((error) =>
          console.warn('[file-preview] retained artifact cleanup failed code=%s', stableAgentErrorCode(error)),
        );
      }
      if (row.output_object_key && row.output_object_key !== row.artifact_object_key) {
        await deleteObjectFromObs(row.output_object_key).catch((error) =>
          console.warn('[file-preview] pending object cleanup failed code=%s', stableAgentErrorCode(error)),
        );
      }
    }
    if (rows.length < 100) break;
  }
  return cleaned;
}

export function getFilePreviewErrorStatus(error) {
  if (error?.status) return Number(error.status);
  const code = String(error?.code || '');
  if (code === 'ARCHIVE_PATH_INVALID' || NON_RETRYABLE_ERRORS.has(code)) return 400;
  if (code.endsWith('_RUNTIME_UNAVAILABLE') || code.startsWith('FILE_PREVIEW_ARTIFACT_')) return 503;
  return 500;
}
