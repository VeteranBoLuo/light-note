import crypto from 'node:crypto';
import pool from '../../db/index.js';
import {
  buildAiTemporaryObjectKey,
  createUploadSignedUrl,
  deleteObjectFromObs,
  getObjectBufferFromObs,
  getObjectMetadataFromObs,
} from '../obsClient.js';
import { AI_DOCUMENT_MAX_BYTES, parseDocumentBuffer, validateDocumentDescriptor } from './parser.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { getImageRecognitionPolicy } from '../imageRecognition/service.js';

const TEMPORARY_RETENTION_HOURS = 24;
const MAX_ACTIVE_TEMPORARY_SOURCES = 8;
const PARSE_TIMEOUT_MS = 180_000;
const NO_TEXT_ERROR_CODE = 'NO_TEXT_CONTENT';
const DELETE_RETRY_ERROR_CODE = 'DELETE_RETRY_PENDING';
const COVERAGE_METADATA_VERSION = 1;
const NON_RETRYABLE_PARSE_ERRORS = new Set([
  'FILE_CONTENT_INVALID',
  'DOCUMENT_TOO_LONG',
  'OCR_PAGE_LIMIT',
  'OCR_IMAGE_TOO_LARGE',
  'OCR_ENGINE_UNAVAILABLE',
  'OCR_LANGUAGE_UNAVAILABLE',
]);
const IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|webp)$/iu;

function serviceError(code, message, status = 400) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

function isDocumentDeleteRetryPending(source) {
  return source?.error_code === DELETE_RETRY_ERROR_CODE;
}

async function scheduleDocumentDeleteRetry({ userId, sourceId }) {
  try {
    // 先取消仍可能被 worker 领取的解析任务。claimNextJob 会在同一事务内锁住 job 并更新 source，
    // 因此这里先写 job 能与正在执行的解析串行，随后再写 source，避免清除请求被 worker 反向覆盖成 ready/parsing。
    await pool.query(
      `UPDATE ai_document_jobs
       SET status = 'failed', locked_at = NULL, locked_by = NULL, error_message = ?
       WHERE source_id = ? AND status IN ('queued', 'processing')`,
      ['删除操作等待自动重试', sourceId],
    );
    const [result] = await pool.query(
      `UPDATE ai_document_sources
       SET status = 'failed', error_code = ?, error_message = ?
       WHERE id = ? AND user_id = ?`,
      [DELETE_RETRY_ERROR_CODE, '删除操作等待自动重试', sourceId, userId],
    );
    return Number(result?.affectedRows || 0) > 0;
  } catch (error) {
    console.error('[AI 文档] 标记删除重试失败 source=%s code=%s', sourceId, stableAgentErrorCode(error));
    return false;
  }
}

function clampRatio(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, Number(number.toFixed(4))));
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeCoverageCounts(value = {}) {
  const count = (input) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
  };
  return {
    chars: count(value.chars),
    pages: count(value.pages),
    chunks: count(value.chunks),
  };
}

function normalizeRecognitionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const engine = String(value.engine || '').slice(0, 40);
  if (!engine) return null;
  const retryAfter = Date.parse(String(value.retryAfter || ''));
  return {
    engine,
    provider: value.provider == null ? null : String(value.provider).slice(0, 40),
    model: value.model == null ? null : String(value.model).slice(0, 120),
    policyVersion: nonNegativeInteger(value.policyVersion),
    preprocessVersion: nonNegativeInteger(value.preprocessVersion),
    mode: String(value.mode || '').slice(0, 40),
    fallbackReason: value.fallbackReason == null ? null : String(value.fallbackReason).slice(0, 80),
    retryAfter: Number.isFinite(retryAfter) ? new Date(retryAfter).toISOString() : null,
    documentType: String(value.documentType || 'unknown').slice(0, 80),
    uncertainSegments: [
      ...new Set(
        (Array.isArray(value.uncertainSegments) ? value.uncertainSegments : [])
          .map((item) =>
            String(item || '')
              .trim()
              .slice(0, 120),
          )
          .filter(Boolean),
      ),
    ].slice(0, 20),
    quality:
      value.quality && typeof value.quality === 'object'
        ? {
            status: String(value.quality.status || 'unknown').slice(0, 32),
            meaningfulRatio: clampRatio(value.quality.meaningfulRatio),
            chars: nonNegativeInteger(value.quality.chars),
          }
        : null,
    warnings: [
      ...new Set(
        (Array.isArray(value.warnings) ? value.warnings : [])
          .map((item) =>
            String(item || '')
              .trim()
              .slice(0, 64),
          )
          .filter(Boolean),
      ),
    ].slice(0, 20),
  };
}

function parseCoverageMetadata(value) {
  if (!value) return null;
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString('utf8');
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!parsed.total || !parsed.processed || !Object.prototype.hasOwnProperty.call(parsed, 'coverageRatio')) return null;
  const coverageRatio = clampRatio(parsed.coverageRatio);
  const metadataAvailable = parsed.metadataAvailable !== false;
  const rangeNumber = (input) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
  };
  const recognition = normalizeRecognitionMetadata(parsed.recognition);
  return {
    version: Number(parsed.version || COVERAGE_METADATA_VERSION),
    metadataAvailable,
    total: normalizeCoverageCounts(parsed.total),
    parsed: normalizeCoverageCounts(parsed.parsed),
    processed: normalizeCoverageCounts(parsed.processed),
    truncated: Boolean(parsed.truncated),
    complete: metadataAvailable && Boolean(parsed.complete) && coverageRatio != null && coverageRatio >= 0.9999,
    coverageRatio,
    failedRanges: (Array.isArray(parsed.failedRanges) ? parsed.failedRanges : []).map((item) => ({
      unit: String(item?.unit || 'document').slice(0, 32),
      start: rangeNumber(item?.start),
      end: rangeNumber(item?.end),
      code: String(item?.code || 'DOCUMENT_RANGE_FAILED').slice(0, 64),
      reason: String(item?.reason || '该范围未能处理').slice(0, 300),
    })),
    reasons: (Array.isArray(parsed.reasons) ? parsed.reasons : []).map((item) => ({
      code: String(item?.code || 'DOCUMENT_COVERAGE_LIMITED').slice(0, 64),
      message: String(item?.message || '文档覆盖范围受限').slice(0, 300),
    })),
    ...(recognition ? { recognition } : {}),
    ...(parsed.pdf
      ? {
          pdf: {
            policyVersion: Number(parsed.pdf.policyVersion || 0),
            blankPages: (Array.isArray(parsed.pdf.blankPages) ? parsed.pdf.blankPages : []).filter(
              (p) => Number.isInteger(p) && p > 0 && p <= 300,
            ),
            missingPages: (Array.isArray(parsed.pdf.missingPages) ? parsed.pdf.missingPages : []).filter(
              (p) => Number.isInteger(p) && p > 0 && p <= 300,
            ),
            ocrErrorCode: String(parsed.pdf.ocrErrorCode || '').slice(0, 64) || null,
          },
        }
      : {}),
  };
}

function fallbackCoverage(row) {
  const extractedChars = Math.max(0, Number(row?.extracted_chars || 0));
  const chunkCount = Math.max(0, Number(row?.chunk_count || 0));
  const noText =
    (row?.status === 'ready' && row?.error_code === NO_TEXT_ERROR_CODE) ||
    (row?.status === 'failed' && row?.error_code === 'EMPTY_DOCUMENT');
  const failed = row?.status === 'failed';
  const readyWithText = row?.status === 'ready' && !noText && extractedChars > 0 && chunkCount > 0;
  const code = noText
    ? NO_TEXT_ERROR_CODE
    : failed
      ? row.error_code || 'DOCUMENT_PARSE_FAILED'
      : readyWithText
        ? 'COVERAGE_METADATA_UNAVAILABLE'
        : 'COVERAGE_PENDING';
  const message = noText
    ? row?.error_message || '未识别到可用文字'
    : failed
      ? row?.error_message || '文件解析失败'
      : readyWithText
        ? '该文件在覆盖元数据上线前解析，无法证明是否覆盖全文'
        : '文件覆盖信息仍在生成中';
  return {
    version: COVERAGE_METADATA_VERSION,
    metadataAvailable: false,
    total: { chars: extractedChars, pages: extractedChars ? 1 : 0, chunks: chunkCount },
    parsed: { chars: extractedChars, pages: extractedChars ? 1 : 0, chunks: chunkCount },
    processed: { chars: extractedChars, pages: extractedChars ? 1 : 0, chunks: chunkCount },
    truncated: false,
    complete: false,
    coverageRatio: readyWithText ? null : 0,
    failedRanges: failed ? [{ unit: 'document', start: 1, end: 1, code, reason: message }] : [],
    reasons: [{ code, message }],
  };
}

function getSourceCoverage(row) {
  return parseCoverageMetadata(row?.coverage_metadata) || fallbackCoverage(row);
}

function buildTerminalCoverage(code, message, { noText = false } = {}) {
  return {
    version: COVERAGE_METADATA_VERSION,
    metadataAvailable: true,
    total: { chars: 0, pages: 0, chunks: 0 },
    parsed: { chars: 0, pages: 0, chunks: 0 },
    processed: { chars: 0, pages: 0, chunks: 0 },
    truncated: false,
    complete: false,
    coverageRatio: 0,
    failedRanges: noText ? [] : [{ unit: 'document', start: 1, end: 1, code, reason: message }],
    reasons: [{ code, message }],
  };
}

function isCoverageColumnMissing(error) {
  return error?.code === 'ER_BAD_FIELD_ERROR' && /coverage_metadata/i.test(String(error?.message || ''));
}

async function writeCoverageMetadata(db, sourceId, coverage) {
  try {
    const normalized =
      parseCoverageMetadata(coverage) ||
      buildTerminalCoverage('COVERAGE_METADATA_MISSING', '解析器没有返回可验证的覆盖元数据');
    await db.query('UPDATE ai_document_sources SET coverage_metadata = ? WHERE id = ?', [
      JSON.stringify(normalized),
      sourceId,
    ]);
    return true;
  } catch (error) {
    // 滚动升级期间应用可能先于结构迁移启动。覆盖信息降级为“未知”，不能让附件主链路直接报错。
    if (isCoverageColumnMissing(error)) return false;
    throw error;
  }
}

async function clearCoverageMetadata(db, sourceId) {
  try {
    await db.query('UPDATE ai_document_sources SET coverage_metadata = NULL WHERE id = ?', [sourceId]);
    return true;
  } catch (error) {
    if (isCoverageColumnMissing(error)) return false;
    throw error;
  }
}

function formatSource(row) {
  if (!row) return null;
  // 发布前已因 EMPTY_DOCUMENT 落为 failed 的临时附件也即时兼容成 no_text，
  // 用户无需重新上传或手动重试；新任务统一写 ready + NO_TEXT_CONTENT。
  const noText =
    (row.status === 'ready' && row.error_code === NO_TEXT_ERROR_CODE) ||
    (row.status === 'failed' && row.error_code === 'EMPTY_DOCUMENT');
  const status = noText ? 'no_text' : row.status;
  return {
    id: String(row.id),
    sourceType: row.source_type,
    fileId: row.file_id == null ? null : String(row.file_id),
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    status,
    errorCode: row.error_code || '',
    errorMessage: row.error_message || '',
    extractedChars: Number(row.extracted_chars || 0),
    chunkCount: Number(row.chunk_count || 0),
    coverage: getSourceCoverage(row),
    expiresAt: row.expires_at || null,
    createTime: row.create_time,
    updateTime: row.update_time,
  };
}

async function selectOwnedSource(db, userId, sourceId, lock = false) {
  const [rows] = await db.query(
    `SELECT * FROM ai_document_sources
     WHERE id = ? AND user_id = ?
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [sourceId, userId],
  );
  return rows[0] || null;
}

async function resetJob(db, sourceId) {
  await db.query(
    `INSERT INTO ai_document_jobs (source_id, status, attempts, available_at, locked_at, locked_by, error_message)
     VALUES (?, 'queued', 0, NOW(), NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE status = 'queued', attempts = 0, available_at = NOW(), locked_at = NULL,
       locked_by = NULL, error_message = NULL`,
    [sourceId],
  );
}

async function ensureTemporarySourceCapacity(userId) {
  const [rows] = await pool.query(
    `SELECT id, status, create_time FROM ai_document_sources
     WHERE user_id = ? AND source_type = 'temporary' AND expires_at > NOW()
     ORDER BY create_time ASC`,
    [userId],
  );
  let activeCount = rows.length;
  if (activeCount < MAX_ACTIVE_TEMPORARY_SOURCES) return;

  const uploadGraceTime = Date.now() - 20 * 60_000;
  const reclaimable = rows.filter((row) => {
    if (['ready', 'failed'].includes(row.status)) return true;
    return row.status === 'awaiting_upload' && new Date(row.create_time).getTime() < uploadGraceTime;
  });
  for (const row of reclaimable) {
    try {
      if (await deleteDocumentSource({ userId, sourceId: String(row.id) })) activeCount -= 1;
    } catch (error) {
      await scheduleDocumentDeleteRetry({ userId, sourceId: String(row.id) });
      console.error('[AI 文档] 自动回收临时文件失败 source=%s code=%s', row.id, stableAgentErrorCode(error));
    }
    if (activeCount < MAX_ACTIVE_TEMPORARY_SOURCES) return;
  }
  throw serviceError('TOO_MANY_PROCESSING_ATTACHMENTS', '当前正在处理的文件较多，请稍后再试');
}

export async function createTemporaryDocumentSource({ userId, sessionId = '', fileName, fileType, fileSize }) {
  const descriptor = validateDocumentDescriptor({ fileName, fileType, fileSize });
  await ensureTemporarySourceCapacity(userId);
  const id = crypto.randomUUID();
  const objectKey = buildAiTemporaryObjectKey(userId, id, descriptor.fileName);
  await pool.query(
    `INSERT INTO ai_document_sources
      (id, user_id, session_id, source_type, file_id, file_name, file_type, file_size, object_key, status, expires_at)
     VALUES (?, ?, ?, 'temporary', NULL, ?, ?, ?, ?, 'awaiting_upload', DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [
      id,
      userId,
      String(sessionId || '').slice(0, 96) || null,
      descriptor.fileName,
      descriptor.fileType,
      descriptor.fileSize,
      objectKey,
      TEMPORARY_RETENTION_HOURS,
    ],
  );
  const signed = createUploadSignedUrl({ objectKey, contentType: descriptor.fileType, expires: 900 });
  return {
    attachment: {
      id,
      sourceType: 'temporary',
      fileId: null,
      fileName: descriptor.fileName,
      fileType: descriptor.fileType,
      fileSize: descriptor.fileSize,
      status: 'awaiting_upload',
      coverage: fallbackCoverage({ status: 'awaiting_upload' }),
      expiresAt: new Date(Date.now() + TEMPORARY_RETENTION_HOURS * 3600_000),
    },
    uploadUrl: signed.url,
    headers: signed.headers,
    expiresIn: signed.expiresIn,
  };
}

export async function confirmTemporaryDocumentSource({ userId, sourceId }) {
  const source = await selectOwnedSource(pool, userId, sourceId);
  if (!source) throw serviceError('ATTACHMENT_NOT_FOUND', '附件不存在', 404);
  if (isDocumentDeleteRetryPending(source)) {
    throw serviceError('ATTACHMENT_DELETE_PENDING', '附件正在删除，请重新上传后再使用', 409);
  }
  if (source.source_type !== 'temporary') throw serviceError('ATTACHMENT_TYPE_INVALID', '该附件无需确认上传');
  if (source.expires_at && new Date(source.expires_at).getTime() <= Date.now()) {
    throw serviceError('ATTACHMENT_EXPIRED', '附件已过期，请重新上传', 410);
  }
  if (['queued', 'parsing', 'ready'].includes(source.status)) return formatSource(source);

  let metadata;
  try {
    metadata = await getObjectMetadataFromObs(source.object_key);
  } catch {
    throw serviceError('UPLOAD_NOT_FOUND', '尚未检测到已上传的文件，请重试');
  }
  if (metadata.contentLength <= 0 || metadata.contentLength > AI_DOCUMENT_MAX_BYTES) {
    throw serviceError('FILE_SIZE_INVALID', '上传文件大小无效或超过 20MB');
  }
  if (Number(source.file_size || 0) !== metadata.contentLength) {
    throw serviceError('FILE_SIZE_MISMATCH', '上传文件大小与声明不一致，请重新上传');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const current = await selectOwnedSource(connection, userId, sourceId, true);
    if (!current) throw serviceError('ATTACHMENT_NOT_FOUND', '附件不存在', 404);
    if (isDocumentDeleteRetryPending(current)) {
      throw serviceError('ATTACHMENT_DELETE_PENDING', '附件正在删除，请重新上传后再使用', 409);
    }
    if (current.status === 'awaiting_upload' || current.status === 'failed') {
      await connection.query(
        `UPDATE ai_document_sources
         SET status = 'queued', error_code = NULL, error_message = NULL
         WHERE id = ?`,
        [sourceId],
      );
      await clearCoverageMetadata(connection, sourceId);
      await resetJob(connection, sourceId);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return formatSource({
    ...source,
    status: 'queued',
    error_code: null,
    error_message: null,
    coverage_metadata: null,
  });
}

export async function attachCloudDocumentSource({ userId, fileId, sessionId = '', refresh = false }) {
  const [rows] = await pool.query(
    `SELECT id, file_name, file_type, file_size, obs_key
     FROM files WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1`,
    [fileId, userId],
  );
  const file = rows[0];
  if (!file) throw serviceError('FILE_NOT_FOUND', '云空间文件不存在', 404);
  if (!file.obs_key) throw serviceError('FILE_NOT_AVAILABLE', '该文件暂时无法用于 AI 解析');
  const descriptor = validateDocumentDescriptor({
    fileName: file.file_name,
    fileType: file.file_type,
    fileSize: file.file_size,
  });
  const id = crypto.randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      'SELECT * FROM ai_document_sources WHERE user_id = ? AND file_id = ? LIMIT 1 FOR UPDATE',
      [userId, file.id],
    );
    const existing = existingRows[0];
    const sourceId = existing?.id || id;
    if (existing) {
      const sameCloudObject =
        existing.source_type === 'cloud' &&
        existing.object_key === file.obs_key &&
        Number(existing.file_size || 0) === descriptor.fileSize;
      // 同一云文件已经完成或正在解析时直接复用。尤其游客共享展示空间不能因为多人反复点击
      // 就清空分块并重置同一任务，否则会让正在运行的解析永远无法完成。
      if (
        sameCloudObject &&
        ['ready', 'queued', 'parsing'].includes(existing.status) &&
        !(refresh && existing.status === 'ready')
      ) {
        await connection.query('UPDATE ai_document_sources SET session_id = ? WHERE id = ?', [
          String(sessionId || '').slice(0, 96) || null,
          sourceId,
        ]);
        await connection.commit();
        return formatSource({ ...existing, session_id: sessionId });
      }
      const temporaryObjectKey = existing.source_type === 'temporary' ? existing.object_key : '';
      await connection.query('DELETE FROM ai_document_chunks WHERE source_id = ?', [sourceId]);
      await connection.query(
        `UPDATE ai_document_sources SET session_id = ?, source_type = 'cloud', file_name = ?, file_type = ?, file_size = ?, object_key = ?,
           status = 'queued', error_code = NULL, error_message = NULL, extracted_chars = 0, chunk_count = 0,
           expires_at = NULL
         WHERE id = ?`,
        [
          String(sessionId || '').slice(0, 96) || null,
          descriptor.fileName,
          descriptor.fileType,
          descriptor.fileSize,
          file.obs_key,
          sourceId,
        ],
      );
      if (!sameCloudObject)
        await connection.query(
          'UPDATE ai_document_sources SET visual_evidence_json=NULL,visual_lease_token=NULL,visual_lease_expires_at=NULL WHERE id=?',
          [sourceId],
        );
      await clearCoverageMetadata(connection, sourceId);
      await resetJob(connection, sourceId);
      await connection.commit();
      if (temporaryObjectKey && temporaryObjectKey !== file.obs_key) {
        await deleteObjectFromObs(temporaryObjectKey).catch((error) => {
          console.error(
            '[AI 文档] 临时附件转为云文件后清理原对象失败 source=%s code=%s',
            sourceId,
            stableAgentErrorCode(error),
          );
        });
      }
      return {
        id: sourceId,
        sourceType: 'cloud',
        fileId: String(file.id),
        fileName: descriptor.fileName,
        fileType: descriptor.fileType,
        fileSize: descriptor.fileSize,
        status: 'queued',
        coverage: fallbackCoverage({ status: 'queued' }),
        expiresAt: null,
      };
    } else {
      await connection.query(
        `INSERT INTO ai_document_sources
          (id, user_id, session_id, source_type, file_id, file_name, file_type, file_size, object_key, status)
         VALUES (?, ?, ?, 'cloud', ?, ?, ?, ?, ?, 'queued')`,
        [
          sourceId,
          userId,
          String(sessionId || '').slice(0, 96) || null,
          file.id,
          descriptor.fileName,
          descriptor.fileType,
          descriptor.fileSize,
          file.obs_key,
        ],
      );
    }
    await resetJob(connection, sourceId);
    await connection.commit();
    return {
      id: sourceId,
      sourceType: 'cloud',
      fileId: String(file.id),
      fileName: descriptor.fileName,
      fileType: descriptor.fileType,
      fileSize: descriptor.fileSize,
      status: 'queued',
      coverage: fallbackCoverage({ status: 'queued' }),
      expiresAt: null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function reusableImageRecognition(source, policy, currentTime = Date.now()) {
  if (source?.status !== 'ready') return false;
  const recognition = parseCoverageMetadata(source.coverage_metadata)?.recognition;
  if (!recognition || Number(recognition.policyVersion || 0) !== Number(policy.version)) return false;
  if (policy.mode === 'local_only') return recognition.engine === 'local_ocr';
  if (recognition.engine === 'deepseek_vision' && recognition.model === policy.visionModel) return true;
  const retryAfter = Date.parse(String(recognition.retryAfter || ''));
  return recognition.engine === 'local_ocr' && Number.isFinite(retryAfter) && retryAfter > currentTime;
}

async function claimInlineImageRecognition({ userId, sourceId, leaseId, policy }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [jobRows] = await connection.query('SELECT * FROM ai_document_jobs WHERE source_id = ? LIMIT 1 FOR UPDATE', [
      sourceId,
    ]);
    const source = await selectOwnedSource(connection, userId, sourceId, true);
    if (!source) throw serviceError('ATTACHMENT_NOT_FOUND', '待识别图片已不存在', 404);
    if (!IMAGE_FILE_PATTERN.test(String(source.file_name || ''))) {
      await connection.commit();
      return { source, job: jobRows[0] || null, claimed: false };
    }
    if (reusableImageRecognition(source, policy)) {
      await connection.commit();
      return { source, job: jobRows[0] || null, claimed: false };
    }
    let job = jobRows[0];
    const activeInlineLease =
      job?.status === 'processing' &&
      String(job.locked_by || '').startsWith('inline-vision:') &&
      Date.now() - new Date(job.locked_at || 0).getTime() < 2 * 60_000;
    if (activeInlineLease) {
      await connection.commit();
      return { source: { ...source, status: 'parsing' }, job, claimed: false };
    }
    if (!job) {
      const [insertResult] = await connection.query(
        `INSERT INTO ai_document_jobs
          (source_id, status, attempts, available_at, locked_at, locked_by, error_message)
         VALUES (?, 'processing', 0, NOW(), NOW(), ?, NULL)`,
        [sourceId, leaseId],
      );
      job = { id: insertResult.insertId, source_id: sourceId, attempts: 0 };
    } else {
      await connection.query(
        `UPDATE ai_document_jobs SET status = 'processing', locked_at = NOW(), locked_by = ?, error_message = NULL
         WHERE id = ?`,
        [leaseId, job.id],
      );
    }
    await connection.query(
      `UPDATE ai_document_sources SET status = 'parsing', error_code = NULL, error_message = NULL WHERE id = ?`,
      [sourceId],
    );
    await connection.commit();
    return { source, job, claimed: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function persistInlineImageRecognition({ source, job, leaseId, parsed }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [leaseRows] = await connection.query(
      `SELECT id FROM ai_document_jobs
       WHERE id = ? AND status = 'processing' AND locked_by = ?
       LIMIT 1 FOR UPDATE`,
      [job.id, leaseId],
    );
    if (!leaseRows.length) {
      await connection.rollback();
      return false;
    }
    const [sourceRows] = await connection.query('SELECT id FROM ai_document_sources WHERE id = ? LIMIT 1 FOR UPDATE', [
      source.id,
    ]);
    if (!sourceRows.length) {
      await connection.rollback();
      return false;
    }
    await connection.query('DELETE FROM ai_document_chunks WHERE source_id = ?', [source.id]);
    for (const chunk of parsed.chunks) {
      await connection.query(
        `INSERT INTO ai_document_chunks
          (source_id, chunk_index, content, locator_type, locator_value, content_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [source.id, chunk.chunkIndex, chunk.content, chunk.locatorType, chunk.locatorValue, chunk.contentHash],
      );
    }
    await connection.query(
      `UPDATE ai_document_sources SET status = 'ready', error_code = NULL, error_message = NULL,
         extracted_chars = ?, chunk_count = ? WHERE id = ?`,
      [parsed.extractedChars, parsed.chunks.length, source.id],
    );
    await writeCoverageMetadata(connection, source.id, parsed.coverage);
    await connection.query(
      `UPDATE ai_document_jobs SET status = 'completed', locked_at = NULL, locked_by = NULL,
         error_message = NULL WHERE id = ?`,
      [job.id],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function releaseInlineImageRecognition({ source, job, leaseId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [leaseRows] = await connection.query(
      `SELECT id FROM ai_document_jobs
       WHERE id = ? AND status = 'processing' AND locked_by = ?
       LIMIT 1 FOR UPDATE`,
      [job.id, leaseId],
    );
    if (!leaseRows.length) {
      await connection.rollback();
      return false;
    }
    const restoreReady = source.status === 'ready';
    await connection.query(
      `UPDATE ai_document_jobs SET status = ?, available_at = NOW(), locked_at = NULL,
         locked_by = NULL, error_message = ? WHERE id = ?`,
      [restoreReady ? 'completed' : 'queued', restoreReady ? job.error_message || null : null, job.id],
    );
    await connection.query(
      `UPDATE ai_document_sources SET status = ?, error_code = ?, error_message = ? WHERE id = ?`,
      [
        restoreReady ? 'ready' : 'queued',
        restoreReady ? source.error_code || null : null,
        restoreReady ? source.error_message || null : null,
        source.id,
      ],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 云图片只在用户明确发起 AI Skill 后进入视觉模型。调用发生在当前 AI Execution 内，
 * 成功结果覆盖后台本地解析；job 租约保证迟到 Worker 不会再把 Vision 结果覆盖回 OCR。
 */
export async function recognizeCloudImageDocumentSource({
  userId,
  sourceId,
  signal,
  parseBuffer = parseDocumentBuffer,
}) {
  const policy = getImageRecognitionPolicy();
  const leaseId = `inline-vision:${crypto.randomUUID()}`;
  const claimed = await claimInlineImageRecognition({ userId, sourceId, leaseId, policy });
  if (!claimed.claimed) return formatSource(claimed.source);
  const { source, job } = claimed;
  try {
    const metadata = await getObjectMetadataFromObs(source.object_key);
    if (metadata.contentLength <= 0 || metadata.contentLength > AI_DOCUMENT_MAX_BYTES) {
      throw serviceError('FILE_SIZE_INVALID', '文件大小无效或超过 20MB');
    }
    if (Number(source.file_size || 0) !== metadata.contentLength) {
      throw serviceError('FILE_SIZE_MISMATCH', '文件大小与记录不一致');
    }
    const buffer = await getObjectBufferFromObs(source.object_key);
    const parsed = await parseBuffer(
      buffer,
      { fileName: source.file_name, fileType: source.file_type, fileSize: source.file_size },
      { signal },
    );
    await persistInlineImageRecognition({ source, job, leaseId, parsed });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      await releaseInlineImageRecognition({ source, job, leaseId });
      throw error;
    }
    const parsedError = parseError(error);
    if (['EMPTY_DOCUMENT', 'PDF_NO_RELIABLE_TEXT'].includes(parsedError.code))
      await markJobNoText(job, error.coverage, leaseId);
    else await markJobFailure(job, error, leaseId);
  }
  const [rows] = await pool.query('SELECT * FROM ai_document_sources WHERE id = ? AND user_id = ? LIMIT 1', [
    source.id,
    userId,
  ]);
  return rows[0] ? formatSource(rows[0]) : formatSource(source);
}

export async function getDocumentSourceStatuses({ userId, sourceIds }) {
  const ids = [...new Set((Array.isArray(sourceIds) ? sourceIds : []).map(String).filter(Boolean))].slice(0, 20);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(`SELECT * FROM ai_document_sources WHERE user_id = ? AND id IN (${placeholders})`, [
    userId,
    ...ids,
  ]);
  const byId = new Map(rows.map((row) => [String(row.id), formatSource(row)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function deleteDocumentSource({ userId, sourceId }) {
  const existing = await selectOwnedSource(pool, userId, sourceId);
  if (!existing) return false;
  // 临时对象先删 OBS、后删索引记录。对象存储短暂异常时保留数据库记录，清理任务下次还能重试，
  // 避免先删记录后留下再也无法追踪的孤儿原文件。
  if (existing.source_type === 'temporary' && existing.object_key) {
    await deleteObjectFromObs(existing.object_key);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const source = await selectOwnedSource(connection, userId, sourceId, true);
    if (!source) {
      await connection.rollback();
      return false;
    }
    await connection.query('DELETE FROM ai_document_chunks WHERE source_id = ?', [sourceId]);
    await connection.query('DELETE FROM ai_document_jobs WHERE source_id = ?', [sourceId]);
    await connection.query('DELETE FROM ai_document_sources WHERE id = ? AND user_id = ?', [sourceId, userId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return true;
}

export async function purgeDocumentSourcesForCloudFiles(connection, userId, fileIds) {
  const ids = [...new Set((Array.isArray(fileIds) ? fileIds : []).map(String).filter(Boolean))];
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  let rows;
  try {
    [rows] = await connection.query(
      `SELECT id FROM ai_document_sources
       WHERE user_id = ? AND source_type = 'cloud' AND file_id IN (${placeholders})`,
      [userId, ...ids],
    );
  } catch (error) {
    // 发布切换窗口里表结构初始化可能仍在进行。解析缓存清理不能反向阻断云文件本身的
    // 覆盖、重命名或永久删除；表不存在时没有可清理的数据，安全降级为空操作。
    if (error?.code === 'ER_NO_SUCH_TABLE') return 0;
    throw error;
  }
  const sourceIds = rows.map((row) => String(row.id));
  if (!sourceIds.length) return 0;
  const sourcePlaceholders = sourceIds.map(() => '?').join(',');
  await connection.query(`DELETE FROM ai_document_chunks WHERE source_id IN (${sourcePlaceholders})`, sourceIds);
  await connection.query(`DELETE FROM ai_document_jobs WHERE source_id IN (${sourcePlaceholders})`, sourceIds);
  const [result] = await connection.query(
    `DELETE FROM ai_document_sources WHERE user_id = ? AND id IN (${sourcePlaceholders})`,
    [userId, ...sourceIds],
  );
  return Number(result.affectedRows || 0);
}

function normalizeNoTextCoverage(coverage) {
  const message = '未识别到文字，不影响保存原文件或将图片插入笔记';
  const normalized =
    parseCoverageMetadata(coverage) ||
    buildTerminalCoverage(NO_TEXT_ERROR_CODE, message, {
      noText: true,
    });
  if (!normalized.reasons.some((item) => item.code === NO_TEXT_ERROR_CODE)) {
    normalized.reasons.push({ code: NO_TEXT_ERROR_CODE, message });
  }
  return { ...normalized, complete: false, coverageRatio: 0 };
}

async function markJobNoText(job, coverage, expectedLockedBy = '') {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (expectedLockedBy) {
      const [leaseRows] = await connection.query(
        `SELECT id FROM ai_document_jobs
         WHERE id = ? AND status = 'processing' AND locked_by = ?
         LIMIT 1 FOR UPDATE`,
        [job.id, expectedLockedBy],
      );
      if (!leaseRows.length) {
        await connection.rollback();
        return false;
      }
    }
    await connection.query('DELETE FROM ai_document_chunks WHERE source_id = ?', [job.source_id]);
    await connection.query(
      `UPDATE ai_document_sources SET status = 'ready', error_code = ?, error_message = ?,
         extracted_chars = 0, chunk_count = 0 WHERE id = ?`,
      [NO_TEXT_ERROR_CODE, '未识别到文字，不影响保存原文件或将图片插入笔记', job.source_id],
    );
    await writeCoverageMetadata(connection, job.source_id, normalizeNoTextCoverage(coverage));
    await connection.query(
      `UPDATE ai_document_jobs SET status = 'completed', locked_at = NULL, locked_by = NULL,
         error_message = NULL WHERE id = ?`,
      [job.id],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function claimNextJob(workerId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM ai_document_jobs
       WHERE attempts < 3 AND (
         (status = 'queued' AND available_at <= NOW()) OR
         (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
       )
       ORDER BY available_at ASC, id ASC LIMIT 1 FOR UPDATE`,
    );
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return null;
    }
    await connection.query(
      `UPDATE ai_document_jobs SET status = 'processing', attempts = attempts + 1, locked_at = NOW(),
         locked_by = ?, error_message = NULL WHERE id = ?`,
      [workerId, job.id],
    );
    await connection.query(
      `UPDATE ai_document_sources SET status = 'parsing', error_code = NULL, error_message = NULL WHERE id = ?`,
      [job.source_id],
    );
    await clearCoverageMetadata(connection, job.source_id);
    await connection.commit();
    return { ...job, attempts: Number(job.attempts || 0) + 1 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function parseError(error) {
  const match = /^([A-Z][A-Z0-9_]+):\s*(.+)$/.exec(String(error?.message || ''));
  return {
    code: match?.[1] || 'DOCUMENT_PARSE_FAILED',
    message: (match?.[2] || '文件解析失败，请确认格式和内容后重试').slice(0, 500),
  };
}

async function markJobFailure(job, error, expectedLockedBy = '') {
  const parsed = parseError(error);
  const finalFailure = NON_RETRYABLE_PARSE_ERRORS.has(parsed.code) || Number(job.attempts || 0) >= 3;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (expectedLockedBy) {
      const [leaseRows] = await connection.query(
        `SELECT id FROM ai_document_jobs
         WHERE id = ? AND status = 'processing' AND locked_by = ?
         LIMIT 1 FOR UPDATE`,
        [job.id, expectedLockedBy],
      );
      if (!leaseRows.length) {
        await connection.rollback();
        return false;
      }
    }
    await connection.query(
      `UPDATE ai_document_jobs SET status = ?, available_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
         locked_at = NULL, locked_by = NULL, error_message = ? WHERE id = ?`,
      [
        finalFailure ? 'failed' : 'queued',
        Math.min(60, 5 * 2 ** Math.max(0, job.attempts - 1)),
        parsed.message,
        job.id,
      ],
    );
    await connection.query(
      `UPDATE ai_document_sources SET status = ?, error_code = ?, error_message = ? WHERE id = ?`,
      [finalFailure ? 'failed' : 'queued', parsed.code, parsed.message, job.source_id],
    );
    await writeCoverageMetadata(
      connection,
      job.source_id,
      parseCoverageMetadata(error?.coverage) || buildTerminalCoverage(parsed.code, parsed.message),
    );
    await connection.commit();
    return true;
  } catch (dbError) {
    await connection.rollback();
    throw dbError;
  } finally {
    connection.release();
  }
}

export async function runSingleDocumentJob(workerId) {
  const job = await claimNextJob(workerId);
  if (!job) return false;
  try {
    const [rows] = await pool.query('SELECT * FROM ai_document_sources WHERE id = ? LIMIT 1', [job.source_id]);
    const source = rows[0];
    if (!source) throw serviceError('ATTACHMENT_NOT_FOUND', '待解析附件已不存在', 404);
    if (source.expires_at && new Date(source.expires_at).getTime() <= Date.now()) {
      throw serviceError('ATTACHMENT_EXPIRED', '附件已过期', 410);
    }
    const metadata = await getObjectMetadataFromObs(source.object_key);
    if (metadata.contentLength <= 0 || metadata.contentLength > AI_DOCUMENT_MAX_BYTES) {
      throw serviceError('FILE_SIZE_INVALID', '文件大小无效或超过 20MB');
    }
    if (Number(source.file_size || 0) !== metadata.contentLength) {
      throw serviceError('FILE_SIZE_MISMATCH', '文件大小与记录不一致');
    }
    const buffer = await getObjectBufferFromObs(source.object_key);
    const abortController = new AbortController();
    let timeout;
    const parsed = await Promise.race([
      parseDocumentBuffer(
        buffer,
        {
          fileName: source.file_name,
          fileType: source.file_type,
          fileSize: source.file_size,
        },
        { signal: abortController.signal },
      ),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          abortController.abort();
          reject(serviceError('DOCUMENT_PARSE_TIMEOUT', '文件解析超时，请缩小文件或减少页数后重试'));
        }, PARSE_TIMEOUT_MS);
      }),
    ]).finally(() => {
      clearTimeout(timeout);
      abortController.abort();
    });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [leaseRows] = await connection.query(
        `SELECT id FROM ai_document_jobs
         WHERE id = ? AND status = 'processing' AND locked_by = ?
         LIMIT 1 FOR UPDATE`,
        [job.id, workerId],
      );
      if (!leaseRows.length) {
        await connection.rollback();
        return true;
      }
      const [currentRows] = await connection.query(
        'SELECT id FROM ai_document_sources WHERE id = ? LIMIT 1 FOR UPDATE',
        [source.id],
      );
      if (!currentRows.length) {
        await connection.rollback();
        return true;
      }
      await connection.query('DELETE FROM ai_document_chunks WHERE source_id = ?', [source.id]);
      for (const chunk of parsed.chunks) {
        await connection.query(
          `INSERT INTO ai_document_chunks
            (source_id, chunk_index, content, locator_type, locator_value, content_hash)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [source.id, chunk.chunkIndex, chunk.content, chunk.locatorType, chunk.locatorValue, chunk.contentHash],
        );
      }
      await connection.query(
        `UPDATE ai_document_sources SET status = 'ready', error_code = NULL, error_message = NULL,
           extracted_chars = ?, chunk_count = ? WHERE id = ?`,
        [parsed.extractedChars, parsed.chunks.length, source.id],
      );
      await writeCoverageMetadata(connection, source.id, parsed.coverage);
      await connection.query(
        `UPDATE ai_document_jobs SET status = 'completed', locked_at = NULL, locked_by = NULL,
           error_message = NULL WHERE id = ?`,
        [job.id],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const parsedError = parseError(error);
    if (['EMPTY_DOCUMENT', 'PDF_NO_RELIABLE_TEXT'].includes(parsedError.code)) {
      const persisted = await markJobNoText(job, error.coverage, workerId);
      if (persisted) console.info(`[AI 文档] 解析任务 ${job.id} 完成，未提取到文字`);
    } else {
      const persisted = await markJobFailure(job, error, workerId);
      if (persisted) console.error('[AI 文档] 解析任务 %s 失败 code=%s', job.id, stableAgentErrorCode(error));
    }
  }
  return true;
}

export async function cleanupExpiredDocumentSources() {
  let cleaned = 0;
  for (let batch = 0; batch < 10; batch += 1) {
    const [rows] = await pool.query(
      `SELECT id, user_id FROM ai_document_sources
       WHERE error_code = ?
          OR (source_type = 'temporary' AND expires_at IS NOT NULL AND expires_at <= NOW())
       ORDER BY create_time ASC LIMIT 100`,
      [DELETE_RETRY_ERROR_CODE],
    );
    if (!rows.length) break;
    for (const row of rows) {
      try {
        if (await deleteDocumentSource({ userId: row.user_id, sourceId: row.id })) cleaned += 1;
      } catch (error) {
        await scheduleDocumentDeleteRetry({ userId: row.user_id, sourceId: String(row.id) });
        console.error('[AI 文档] 清理过期附件 %s 失败 code=%s', row.id, stableAgentErrorCode(error));
      }
    }
    if (rows.length < 100) break;
  }
  return cleaned;
}
