import crypto from 'node:crypto';
import { stripAiAnalysisCitations } from '@lightnote/shared/ai-citation-presentation';
import pool from '../../db/index.js';
import { getToolboxTool, TOOLBOX_PRICING_VERSION } from '@lightnote/shared/toolbox-protocol';
import { createTemporaryDocumentSource } from '../aiDocument/service.js';
import { validateDocumentDescriptor } from '../aiDocument/parser.js';
import { resolvePersonalKnowledgeResourceVersions } from '../personalKnowledgeSearch.js';
import { createNote } from '../services/noteService.js';
import { reserveToolboxPoints, settleToolboxBilling } from './billing.js';
import {
  getDisabledToolIds,
  getPublicToolboxCatalog,
  normalizeToolboxInput,
  normalizeToolboxBillingMedium,
  normalizeToolboxRequestId,
  quoteToolboxPoints,
  TOOLBOX_QUOTE_TTL_MS,
  toolboxInputDigest,
} from './catalog.js';
import { toolboxError } from './errors.js';

const JOB_RETENTION_DAYS = 30;
const ARTIFACT_RETENTION_DAYS = 90;
const SAVE_LEASE_MS = 2 * 60_000;
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'partial_succeeded', 'failed', 'cancelled', 'expired']);
const HOME_ACTIVE_TASK_LIMIT = 4;
const HOME_READY_TASK_LIMIT = 4;
const HOME_RECENT_TASK_LIMIT = 6;
const HOME_TASK_SCAN_LIMIT = 50;

function requiredUserId(userId) {
  const value = String(userId || '').trim();
  if (!value) throw toolboxError('TOOLBOX_USER_REQUIRED', '缺少用户身份', 401);
  return value;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function disabledToolSet() {
  return new Set(getDisabledToolIds());
}

function assertToolAvailable(toolId) {
  const definition = getToolboxTool(toolId);
  if (!definition) throw toolboxError('TOOLBOX_TOOL_NOT_FOUND', '不支持该工具', 404);
  if (!definition.availability.enabled || disabledToolSet().has(definition.id)) {
    throw toolboxError('TOOLBOX_TOOL_UNAVAILABLE', '该工具正在维护，请稍后再试', 503);
  }
  return definition;
}

function formatQuote(row) {
  return {
    id: row.id,
    toolId: row.tool_id,
    pricingVersion: row.pricing_version,
    billingMedium: String(row.billing_medium || 'points'),
    quotedPoints: Number(row.quoted_points || 0),
    status: row.status,
    expiresAt: row.expires_at,
    inputSummary: (() => {
      const snapshot = parseJson(row.input_snapshot_json, {});
      return {
        itemCount: (snapshot.resourceRefs?.length || 0) + (snapshot.sourceIds?.length || 0),
        resourceCount: snapshot.resourceRefs?.length || 0,
        uploadCount: snapshot.sourceIds?.length || 0,
      };
    })(),
  };
}

function formatJobError(row) {
  if (!row.error_code) return null;
  const code = String(row.error_code);
  const storedMessage = String(row.error_message || '').trim();
  if (row.status === 'queued' && row.stage === 'retrying') {
    return { code, message: '遇到临时问题，正在自动重试；无需重新提交任务。' };
  }
  if (
    row.status === 'failed' &&
    (!storedMessage || /工具任务(?:处理失败|遇到临时问题)|系统将自动重试/u.test(storedMessage))
  ) {
    return {
      code,
      message:
        String(row.billing_medium || 'points') === 'ai_quota'
          ? '多次尝试后仍未完成，未产生可用成果的 AI 额度已按规则释放；请稍后重新发起。'
          : '多次尝试后仍未完成，预占积分已退回；请稍后重新发起。',
    };
  }
  return { code, message: storedMessage || '任务处理失败' };
}

function formatJob(row, { includeArtifactSummary = true } = {}) {
  const artifactExpiresAt = row.artifact_expires_at ? new Date(row.artifact_expires_at).getTime() : null;
  const artifactState = !row.artifact_id
    ? 'none'
    : row.artifact_status === 'ready' && Number.isFinite(artifactExpiresAt) && artifactExpiresAt > Date.now()
      ? 'ready'
      : 'expired';
  const artifact =
    artifactState === 'ready'
      ? {
          id: row.artifact_id,
          type: row.artifact_type || null,
          title: row.artifact_title || '',
          contentType: row.artifact_content_type || null,
          version: row.artifact_version ? Number(row.artifact_version) : 1,
        }
      : null;
  const billingStatus = String(row.billing_status || '');
  const hasSettledRefund = ['partially_settled', 'released', 'refunded'].includes(billingStatus);
  return {
    id: row.id,
    toolId: row.tool_id,
    status: row.status,
    stage: row.stage,
    billing: {
      medium: String(row.billing_medium || 'points'),
      status: billingStatus,
      quotedPoints: Number(row.quoted_points || 0),
      actualPoints: Number(row.actual_points || 0),
      refundedPoints: hasSettledRefund
        ? Math.max(0, Number(row.quoted_points || 0) - Number(row.actual_points || 0))
        : 0,
    },
    save: { status: row.save_status },
    error: formatJobError(row),
    artifact: includeArtifactSummary ? artifact : null,
    artifactState,
    canCancel: row.status === 'queued' && !Number(row.external_cost_committed || 0),
    createdAt: row.create_time,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function resolveOwnedToolboxInput({ userId, toolId, rawInput, database = pool }) {
  const definition = getToolboxTool(toolId);
  const input = normalizeToolboxInput(toolId, rawInput);
  const authoritativeRefs = await resolvePersonalKnowledgeResourceVersions({
    userId,
    resourceRefs: input.resourceRefs,
    database,
  });
  if (authoritativeRefs.length !== input.resourceRefs.length) {
    throw toolboxError('TOOLBOX_RESOURCE_UNAVAILABLE', '部分材料不存在、已删除或不属于当前账号', 404);
  }
  authoritativeRefs.forEach((ref, index) => {
    const expectedVersion = input.resourceRefs[index]?.version;
    if (expectedVersion && expectedVersion !== ref.version) {
      throw toolboxError('TOOLBOX_RESOURCE_STALE', '部分材料已更新，请重新选择后报价', 409);
    }
  });

  let sourceRows = [];
  if (input.sourceIds.length) {
    const placeholders = input.sourceIds.map(() => '?').join(',');
    const [rows] = await database.query(
      `SELECT id, file_type, file_size, status, expires_at
         FROM ai_document_sources
        WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...input.sourceIds],
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    sourceRows = input.sourceIds.map((id) => byId.get(id)).filter(Boolean);
    if (sourceRows.length !== input.sourceIds.length) {
      throw toolboxError('TOOLBOX_DOCUMENT_SOURCE_UNAVAILABLE', '部分上传文件不存在或不属于当前账号', 404);
    }
    if (sourceRows.some((row) => row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
      throw toolboxError('TOOLBOX_DOCUMENT_SOURCE_EXPIRED', '部分上传文件已过期，请重新上传', 410);
    }
    if (
      definition?.input.accept?.length &&
      sourceRows.some((row) => !definition.input.accept.includes(String(row.file_type || '').toLowerCase()))
    ) {
      throw toolboxError('TOOLBOX_UPLOAD_TYPE_UNSUPPORTED', '部分上传文件的格式不受该工具支持');
    }
    if (
      definition?.input.maxBytes &&
      sourceRows.some((row) => Number(row.file_size || 0) > Number(definition.input.maxBytes))
    ) {
      throw toolboxError('TOOLBOX_UPLOAD_TOO_LARGE', '部分上传文件超过单文件大小限制', 413);
    }
  }

  let cloudFileBytes = 0;
  const fileRefs = authoritativeRefs.filter((ref) => ref.type === 'file');
  if (fileRefs.length) {
    const placeholders = fileRefs.map(() => '?').join(',');
    const [rows] = await database.query(
      `SELECT id, file_name, file_type, file_size FROM files
        WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`,
      [userId, ...fileRefs.map((ref) => ref.id)],
    );
    if (rows.length !== fileRefs.length) {
      throw toolboxError('TOOLBOX_RESOURCE_UNAVAILABLE', '部分云文件已不存在，请重新选择后报价', 404);
    }
    let descriptors;
    try {
      descriptors = rows.map((row) =>
        validateDocumentDescriptor({
          fileName: row.file_name,
          fileType: row.file_type,
          fileSize: row.file_size,
        }),
      );
    } catch (error) {
      const code = String(error?.code || 'FILE_NOT_SUPPORTED');
      const message = String(error?.message || '文件暂时无法处理').replace(/^[A-Z0-9_]+:\s*/u, '');
      const toolboxCode =
        code === 'FILE_TOO_LARGE'
          ? 'TOOLBOX_UPLOAD_TOO_LARGE'
          : ['UNSUPPORTED_FILE_TYPE', 'FILE_TYPE_MISMATCH'].includes(code)
            ? 'TOOLBOX_UPLOAD_TYPE_UNSUPPORTED'
            : `TOOLBOX_${code}`;
      throw toolboxError(toolboxCode, message, code === 'FILE_TOO_LARGE' ? 413 : 400);
    }
    if (definition?.input.kind === 'documents') {
      if (
        definition.input.accept?.length &&
        descriptors.some((descriptor) => !definition.input.accept.includes(descriptor.expectedType))
      ) {
        throw toolboxError('TOOLBOX_UPLOAD_TYPE_UNSUPPORTED', '部分云文件的格式不支持 OCR 识别');
      }
      if (
        definition.input.maxBytes &&
        rows.some((row) => Number(row.file_size || 0) > Number(definition.input.maxBytes))
      ) {
        throw toolboxError('TOOLBOX_UPLOAD_TOO_LARGE', '部分云文件超过单文件大小限制', 413);
      }
    }
    cloudFileBytes = rows.reduce((total, row) => total + Math.max(0, Number(row.file_size || 0)), 0);
  }

  const snapshot = Object.freeze({
    resourceRefs: Object.freeze(authoritativeRefs.map((ref) => Object.freeze({ ...ref }))),
    sourceIds: Object.freeze([...input.sourceIds]),
    options: input.options,
  });
  return {
    snapshot,
    inputDigest: toolboxInputDigest({ toolId, input: snapshot }),
    itemCount: snapshot.resourceRefs.length + snapshot.sourceIds.length,
    totalBytes: cloudFileBytes + sourceRows.reduce((total, row) => total + Math.max(0, Number(row.file_size || 0)), 0),
  };
}

export function getToolboxCatalog() {
  return getPublicToolboxCatalog({ disabledToolIds: getDisabledToolIds() });
}

export async function createToolboxQuote({
  userId,
  toolId,
  rawInput,
  billingMedium,
  clientRequestId,
  database = pool,
}) {
  const definition = assertToolAvailable(toolId);
  if (definition.billingMedium === 'free') {
    throw toolboxError('TOOLBOX_QUOTE_NOT_REQUIRED', '该工具免费在浏览器本地运行，无需报价');
  }
  const normalizedBillingMedium = normalizeToolboxBillingMedium(toolId, billingMedium);
  const requestId = normalizeToolboxRequestId(clientRequestId, '报价请求标识');
  const resolved = await resolveOwnedToolboxInput({ userId, toolId, rawInput, database });
  const quotedPoints = normalizedBillingMedium === 'points' ? quoteToolboxPoints(toolId, resolved) : 0;

  const [existingRows] = await database.query(
    `SELECT * FROM toolbox_quotes WHERE user_id = ? AND request_id = ? LIMIT 1`,
    [userId, requestId],
  );
  if (existingRows.length) {
    const existing = existingRows[0];
    if (
      existing.tool_id !== toolId ||
      existing.input_digest !== resolved.inputDigest ||
      String(existing.billing_medium || 'points') !== normalizedBillingMedium
    ) {
      throw toolboxError('TOOLBOX_IDEMPOTENCY_KEY_REUSED', '该报价标识已用于其他输入，请刷新后重试', 409);
    }
    return formatQuote(existing);
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOOLBOX_QUOTE_TTL_MS);
  try {
    await database.query(
      `INSERT INTO toolbox_quotes
        (id, user_id, request_id, tool_id, pricing_version, billing_medium, input_digest, input_snapshot_json,
         quoted_points, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        userId,
        requestId,
        toolId,
        TOOLBOX_PRICING_VERSION,
        normalizedBillingMedium,
        resolved.inputDigest,
        JSON.stringify(resolved.snapshot),
        quotedPoints,
        expiresAt,
      ],
    );
  } catch (error) {
    if (String(error?.code || '') !== 'ER_DUP_ENTRY') throw error;
    const [racedRows] = await database.query(
      'SELECT * FROM toolbox_quotes WHERE user_id = ? AND request_id = ? LIMIT 1',
      [userId, requestId],
    );
    const raced = racedRows[0];
    if (
      !raced ||
      raced.tool_id !== toolId ||
      raced.input_digest !== resolved.inputDigest ||
      String(raced.billing_medium || 'points') !== normalizedBillingMedium
    ) {
      throw toolboxError('TOOLBOX_IDEMPOTENCY_KEY_REUSED', '该报价标识已用于其他输入，请刷新后重试', 409);
    }
    return formatQuote(raced);
  }
  return formatQuote({
    id,
    tool_id: toolId,
    pricing_version: TOOLBOX_PRICING_VERSION,
    billing_medium: normalizedBillingMedium,
    input_digest: resolved.inputDigest,
    input_snapshot_json: resolved.snapshot,
    quoted_points: quotedPoints,
    status: 'active',
    expires_at: expiresAt,
  });
}

async function selectJobWithArtifact(database, userId, jobId, lock = false) {
  const [rows] = await database.query(
    `SELECT job.*, artifact.artifact_type, artifact.title AS artifact_title,
            artifact.content_type AS artifact_content_type, artifact.artifact_version,
            artifact.status AS artifact_status, artifact.expires_at AS artifact_expires_at
       FROM toolbox_jobs job
       LEFT JOIN toolbox_artifacts artifact ON artifact.id = job.artifact_id
      WHERE job.user_id = ? AND job.id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId, jobId],
  );
  return rows[0] || null;
}

export async function createToolboxJob({ userId, quoteId, clientRequestId, database = pool }) {
  const normalizedQuoteId = String(quoteId || '').trim();
  if (!normalizedQuoteId) throw toolboxError('TOOLBOX_QUOTE_REQUIRED', '请先获取并确认报价');
  const requestId = normalizeToolboxRequestId(clientRequestId, '任务请求标识');
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      'SELECT * FROM toolbox_jobs WHERE user_id = ? AND client_request_id = ? LIMIT 1 FOR UPDATE',
      [userId, requestId],
    );
    if (existingRows.length) {
      const existing = existingRows[0];
      if (String(existing.quote_id || '') !== normalizedQuoteId) {
        throw toolboxError('TOOLBOX_IDEMPOTENCY_KEY_REUSED', '该任务标识已用于其他报价，请刷新后重试', 409);
      }
      const hydrated = await selectJobWithArtifact(connection, userId, existing.id, true);
      await connection.commit();
      return formatJob(hydrated || existing);
    }

    const [quoteRows] = await connection.query(
      'SELECT * FROM toolbox_quotes WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
      [normalizedQuoteId, userId],
    );
    const quote = quoteRows[0];
    if (!quote) throw toolboxError('TOOLBOX_QUOTE_NOT_FOUND', '报价不存在，请重新报价', 404);
    assertToolAvailable(quote.tool_id);
    if (quote.pricing_version !== TOOLBOX_PRICING_VERSION) {
      throw toolboxError('TOOLBOX_PRICING_CHANGED', '计费规则已更新，请重新确认', 409, { refresh: true });
    }
    if (quote.status === 'consumed' && quote.consumed_job_id) {
      const existing = await selectJobWithArtifact(connection, userId, quote.consumed_job_id, true);
      if (!existing) throw toolboxError('TOOLBOX_QUOTE_STATE_INVALID', '报价关联任务暂不可用，请联系客服', 500);
      await connection.commit();
      return formatJob(existing);
    }
    if (quote.status !== 'active' || new Date(quote.expires_at).getTime() <= Date.now()) {
      if (quote.status === 'active') {
        await connection.query("UPDATE toolbox_quotes SET status = 'expired' WHERE id = ?", [quote.id]);
      }
      throw toolboxError('TOOLBOX_QUOTE_EXPIRED', '报价已过期，请重新确认', 409, { refresh: true });
    }
    const snapshot = parseJson(quote.input_snapshot_json);
    if (!snapshot) throw toolboxError('TOOLBOX_QUOTE_SNAPSHOT_INVALID', '报价快照无效，请重新报价', 500);
    const digest = toolboxInputDigest({ toolId: quote.tool_id, input: snapshot });
    if (digest !== quote.input_digest) {
      throw toolboxError('TOOLBOX_QUOTE_SNAPSHOT_INVALID', '报价快照校验失败，请重新报价', 500);
    }

    const billingMedium = normalizeToolboxBillingMedium(quote.tool_id, quote.billing_medium || 'points');
    const jobId = crypto.randomUUID();
    const reservation =
      billingMedium === 'points'
        ? await reserveToolboxPoints(connection, {
            userId,
            clientRequestId: requestId,
            quote,
            jobId,
            toolId: quote.tool_id,
            inputDigest: quote.input_digest,
          })
        : { reservedPoints: 0, operationId: null };
    const initialBillingStatus = billingMedium === 'points' ? 'reserved' : 'quoted';
    const expiresAt = new Date(Date.now() + JOB_RETENTION_DAYS * 24 * 60 * 60_000);
    await connection.query(
      `INSERT INTO toolbox_jobs
        (id, user_id, client_request_id, tool_id, quote_id, billing_medium, input_digest, options_json,
         status, billing_status, save_status, quoted_points, actual_points, points_operation_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 'unsaved', ?, 0, ?, ?)`,
      [
        jobId,
        userId,
        requestId,
        quote.tool_id,
        quote.id,
        billingMedium,
        quote.input_digest,
        JSON.stringify(snapshot.options || {}),
        initialBillingStatus,
        reservation.reservedPoints,
        reservation.operationId,
        expiresAt,
      ],
    );
    let inputIndex = 0;
    for (const ref of snapshot.resourceRefs || []) {
      await connection.query(
        `INSERT INTO toolbox_job_inputs
          (job_id, input_index, input_type, resource_type, resource_id, resource_version)
         VALUES (?, ?, 'resource', ?, ?, ?)`,
        [jobId, inputIndex++, ref.type, ref.id, ref.version || null],
      );
    }
    for (const sourceId of snapshot.sourceIds || []) {
      await connection.query(
        `INSERT INTO toolbox_job_inputs
          (job_id, input_index, input_type, document_source_id)
         VALUES (?, ?, 'document_source', ?)`,
        [jobId, inputIndex++, sourceId],
      );
    }
    await connection.query("UPDATE toolbox_quotes SET status = 'consumed', consumed_job_id = ? WHERE id = ?", [
      jobId,
      quote.id,
    ]);
    await connection.commit();
    return formatJob({
      id: jobId,
      user_id: userId,
      tool_id: quote.tool_id,
      quote_id: quote.id,
      billing_medium: billingMedium,
      status: 'queued',
      billing_status: initialBillingStatus,
      save_status: 'unsaved',
      progress: 0,
      stage: 'queued',
      quoted_points: reservation.reservedPoints,
      actual_points: 0,
      external_cost_committed: 0,
      create_time: new Date(),
      updated_at: new Date(),
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listToolboxJobs({ userId, limit = 20, database = pool }) {
  const take = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const [rows] = await database.query(
    `SELECT job.*, artifact.artifact_type, artifact.title AS artifact_title,
            artifact.content_type AS artifact_content_type, artifact.artifact_version,
            artifact.status AS artifact_status, artifact.expires_at AS artifact_expires_at
       FROM toolbox_jobs job
       LEFT JOIN toolbox_artifacts artifact ON artifact.id = job.artifact_id
      WHERE job.user_id = ?
      ORDER BY job.create_time DESC, job.id DESC
      LIMIT ?`,
    [userId, take],
  );
  return rows.map((row) => formatJob(row));
}

export async function listToolboxHomeTasks({ userId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const [rows] = await database.query(
    `SELECT job.id, job.tool_id, job.status, job.stage, job.billing_medium, job.billing_status, job.save_status,
            job.quoted_points, job.actual_points, job.external_cost_committed,
            job.error_code, job.error_message, job.create_time, job.updated_at,
            job.started_at, job.completed_at, job.artifact_id,
            artifact.artifact_type, artifact.title AS artifact_title,
            artifact.content_type AS artifact_content_type, artifact.artifact_version,
            artifact.status AS artifact_status, artifact.expires_at AS artifact_expires_at
       FROM toolbox_jobs job
       LEFT JOIN toolbox_artifacts artifact ON artifact.id = job.artifact_id
      WHERE job.user_id = ?
      ORDER BY CASE
                 WHEN job.status IN ('queued', 'processing') THEN 0
                 WHEN artifact.status = 'ready'
                  AND artifact.expires_at > CURRENT_TIMESTAMP
                  AND job.save_status IN ('unsaved', 'save_failed') THEN 1
                 ELSE 2
               END,
               COALESCE(job.updated_at, job.create_time) DESC,
               job.id DESC
      LIMIT ${HOME_TASK_SCAN_LIMIT}`,
    [ownerId],
  );
  const jobs = rows.map((row) => formatJob(row));
  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'processing');
  const activeIds = new Set(activeJobs.map((job) => job.id));
  const readyJobs = jobs.filter(
    (job) =>
      !activeIds.has(job.id) &&
      job.artifactState === 'ready' &&
      (job.save.status === 'unsaved' || job.save.status === 'save_failed'),
  );
  const active = activeJobs.slice(0, HOME_ACTIVE_TASK_LIMIT);
  const ready = readyJobs.slice(0, HOME_READY_TASK_LIMIT);
  // “待你继续”是行动队列，“最近用过”是独立的工具历史；同一任务可以同时为两个读模型提供信息。
  const recent = [...jobs]
    .sort(
      (left, right) =>
        new Date(right.updatedAt || right.createdAt || 0).getTime() -
        new Date(left.updatedAt || left.createdAt || 0).getTime(),
    )
    .slice(0, HOME_RECENT_TASK_LIMIT);
  return { active, ready, recent };
}

export async function getToolboxJob({ userId, jobId, database = pool }) {
  const job = await selectJobWithArtifact(database, userId, String(jobId || '').trim());
  if (!job) throw toolboxError('TOOLBOX_JOB_NOT_FOUND', '任务不存在', 404);
  return formatJob(job);
}

export async function cancelToolboxJob({ userId, jobId, database = pool }) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const job = await selectJobWithArtifact(connection, userId, String(jobId || '').trim(), true);
    if (!job) throw toolboxError('TOOLBOX_JOB_NOT_FOUND', '任务不存在', 404);
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      await connection.commit();
      return formatJob(job);
    }
    if (job.status !== 'queued' || Number(job.external_cost_committed || 0)) {
      throw toolboxError('TOOLBOX_JOB_CANNOT_CANCEL', '任务已开始消耗处理资源，当前不能取消', 409);
    }
    const settlement = await settleToolboxBilling(connection, job, {
      outcome: 'cancelled',
      reasonCode: 'USER_CANCELLED_BEFORE_PROCESSING',
    });
    await connection.query(
      `UPDATE toolbox_jobs
          SET status = 'cancelled', progress = 100, stage = 'cancelled', cancel_requested_at = CURRENT_TIMESTAMP,
              completed_at = CURRENT_TIMESTAMP, locked_at = NULL, locked_by = NULL
        WHERE id = ?`,
      [job.id],
    );
    await connection.commit();
    return formatJob({
      ...job,
      status: 'cancelled',
      progress: 100,
      stage: 'cancelled',
      billing_status: settlement.billingStatus,
      actual_points: settlement.actualPoints,
      completed_at: new Date(),
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getToolboxArtifact({ userId, artifactId, database = pool }) {
  const [rows] = await database.query(
    `SELECT artifact.*, job.save_status, receipt.target_type AS saved_target_type,
            receipt.target_id AS saved_target_id, receipt.save_generation,
            CASE
              WHEN receipt.target_id IS NULL THEN 'none'
              WHEN saved_note.id IS NULL THEN 'missing'
              WHEN COALESCE(saved_note.del_flag, 0) = 0 THEN 'available'
              ELSE 'trashed'
            END AS saved_target_availability
       FROM toolbox_artifacts artifact
       JOIN toolbox_jobs job ON job.id = artifact.job_id AND job.user_id = artifact.user_id
       LEFT JOIN toolbox_save_receipts receipt
         ON receipt.artifact_id = artifact.id
        AND receipt.artifact_version = artifact.artifact_version
        AND receipt.status = 'saved'
       LEFT JOIN note saved_note
         ON saved_note.id = CONVERT(receipt.target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND saved_note.create_by = CONVERT(artifact.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE artifact.id = ? AND artifact.user_id = ? AND artifact.status = 'ready'
        AND artifact.expires_at > NOW()
      LIMIT 1`,
    [String(artifactId || '').trim(), userId],
  );
  const artifact = rows[0];
  if (!artifact) throw toolboxError('TOOLBOX_ARTIFACT_NOT_FOUND', '产物不存在或已过期', 404);
  return {
    id: artifact.id,
    jobId: artifact.job_id,
    toolId: artifact.tool_id,
    type: artifact.artifact_type,
    version: Number(artifact.artifact_version || 1),
    title: artifact.title,
    content: artifact.content,
    contentType: artifact.content_type,
    sources: parseJson(artifact.source_json, []),
    coverage: parseJson(artifact.coverage_json, { complete: false, warnings: [] }),
    meta: parseJson(artifact.meta_json, {}),
    save: {
      status: artifact.save_status,
      targetAvailability: artifact.saved_target_availability || 'none',
      ...(artifact.saved_target_id
        ? { targetType: artifact.saved_target_type || 'note', targetId: artifact.saved_target_id }
        : {}),
    },
    createdAt: artifact.create_time,
    expiresAt: artifact.expires_at,
  };
}

function saveReceiptKey({ userId, artifactId, version, targetType }) {
  return toolboxInputDigest({ userId, artifactId, version, targetType });
}

function saveIdempotencyKey({ userId, artifactId, version, targetType, generation = 1 }) {
  const receiptKey = saveReceiptKey({ userId, artifactId, version, targetType });
  if (Number(generation || 1) <= 1) return `save:${receiptKey.slice(0, 48)}`;
  return `save:${toolboxInputDigest({ receiptKey, generation: Number(generation) }).slice(0, 48)}`;
}

function noteSaveIdempotencyKey(artifact, generation) {
  const base = `toolbox:${artifact.id}:v${artifact.version}`;
  return Number(generation || 1) <= 1 ? base : `${base}:g${Number(generation)}`;
}

async function selectSavedTargetAvailability(connection, { userId, targetId }) {
  if (!targetId) return 'missing';
  const [rows] = await connection.query(
    'SELECT id, del_flag FROM note WHERE id = ? AND create_by = ? LIMIT 1 FOR UPDATE',
    [targetId, userId],
  );
  if (!rows.length) return 'missing';
  return Number(rows[0].del_flag || 0) === 0 ? 'available' : 'trashed';
}

async function persistToolboxSaveState({
  database,
  receiptKey,
  leaseToken,
  artifact,
  userId,
  status,
  targetId = null,
  errorCode = null,
  errorMessage = null,
}) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [receiptResult] = await connection.query(
      `UPDATE toolbox_save_receipts
          SET status = ?, target_id = ?, error_code = ?, error_message = ?, lease_token = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE receipt_key = ? AND lease_token = ? AND status = 'saving'`,
      [status, targetId, errorCode, errorMessage, receiptKey, leaseToken],
    );
    if (!receiptResult?.affectedRows) {
      throw toolboxError('TOOLBOX_SAVE_STATE_MISSING', '保存租约已被更新，请刷新查看最新状态', 409);
    }
    const [jobResult] = await connection.query(
      'UPDATE toolbox_jobs SET save_status = ? WHERE id = ? AND user_id = ? AND artifact_id = ?',
      [status, artifact.jobId, userId, artifact.id],
    );
    if (!jobResult?.affectedRows) {
      throw toolboxError('TOOLBOX_SAVE_STATE_MISSING', '保存状态关联数据不存在，请刷新后重试', 409);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function saveToolboxArtifactToNote({
  userId,
  userRole,
  artifactId,
  clientRequestId,
  action = 'save',
  request,
  database = pool,
  createNoteFn = createNote,
}) {
  // 客户端请求号只用于请求格式与链路诊断；保存效果的幂等身份由服务端的
  // user + artifact + version + targetType 固定派生，不能被换一个客户端请求号绕开。
  normalizeToolboxRequestId(clientRequestId, '保存请求标识');
  const saveAction = String(action || 'save').trim();
  if (!['save', 'recreate_missing_target'].includes(saveAction)) {
    throw toolboxError('TOOLBOX_SAVE_ACTION_INVALID', '保存动作无效', 400);
  }
  const artifact = await getToolboxArtifact({ userId, artifactId, database });
  const definition = getToolboxTool(artifact.toolId);
  if (!definition?.output.canSaveToNote) throw toolboxError('TOOLBOX_ARTIFACT_NOT_SAVABLE', '该产物不能保存到笔记');
  const receiptKey = saveReceiptKey({ userId, artifactId: artifact.id, version: artifact.version, targetType: 'note' });
  let saveGeneration = 1;
  let idempotencyKey = saveIdempotencyKey({
    userId,
    artifactId: artifact.id,
    version: artifact.version,
    targetType: 'note',
    generation: saveGeneration,
  });
  const receiptId = crypto.randomUUID();
  const leaseToken = crypto.randomUUID();
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [requestRows] = await connection.query(
      'SELECT * FROM toolbox_save_receipts WHERE user_id = ? AND idempotency_key = ? LIMIT 1 FOR UPDATE',
      [userId, idempotencyKey],
    );
    if (requestRows.length && requestRows[0].receipt_key !== receiptKey) {
      throw toolboxError('TOOLBOX_IDEMPOTENCY_KEY_REUSED', '该保存标识已用于其他产物，请刷新后重试', 409);
    }
    const [receiptRows] = await connection.query(
      'SELECT * FROM toolbox_save_receipts WHERE receipt_key = ? LIMIT 1 FOR UPDATE',
      [receiptKey],
    );
    const existing = receiptRows[0] || requestRows[0] || null;
    if (existing?.status === 'saved' && existing.target_id) {
      const targetAvailability = await selectSavedTargetAvailability(connection, {
        userId,
        targetId: existing.target_id,
      });
      if (targetAvailability !== 'available') {
        if (saveAction !== 'recreate_missing_target') {
          throw toolboxError(
            'TOOLBOX_SAVED_TARGET_UNAVAILABLE',
            targetAvailability === 'trashed'
              ? '原笔记已在回收站，可明确选择重新存为新笔记'
              : '原笔记已删除，可明确选择重新存为新笔记',
            409,
          );
        }
        saveGeneration = Math.max(1, Number(existing.save_generation || 1)) + 1;
        idempotencyKey = saveIdempotencyKey({
          userId,
          artifactId: artifact.id,
          version: artifact.version,
          targetType: 'note',
          generation: saveGeneration,
        });
      } else {
        // 回执是幂等结果的唯一事实源；若上一次响应在任务状态落库前中断，重放时顺手自愈任务摘要。
        await connection.query(
          "UPDATE toolbox_jobs SET save_status = 'saved' WHERE id = ? AND user_id = ? AND artifact_id = ?",
          [artifact.jobId, userId, artifact.id],
        );
        await connection.commit();
        return {
          status: 'saved',
          targetType: 'note',
          targetId: existing.target_id,
          targetAvailability: 'available',
          idempotent: true,
        };
      }
    }
    if (
      existing?.status === 'saving' &&
      Date.now() - new Date(existing.updated_at || existing.create_time || 0).getTime() < SAVE_LEASE_MS
    ) {
      throw toolboxError('TOOLBOX_SAVE_IN_PROGRESS', '产物正在保存，请稍后刷新', 409);
    }
    if (existing) {
      saveGeneration = Math.max(1, Number(existing.save_generation || 1), saveGeneration);
      await connection.query(
        `UPDATE toolbox_save_receipts
            SET status = 'saving', target_id = NULL, save_generation = ?, idempotency_key = ?, lease_token = ?,
                error_code = NULL, error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [saveGeneration, idempotencyKey, leaseToken, existing.id],
      );
    } else {
      await connection.query(
        `INSERT INTO toolbox_save_receipts
          (id, receipt_key, user_id, artifact_id, artifact_version, target_type, save_generation,
           idempotency_key, status, lease_token)
         VALUES (?, ?, ?, ?, ?, 'note', ?, ?, 'saving', ?)`,
        [receiptId, receiptKey, userId, artifact.id, artifact.version, saveGeneration, idempotencyKey, leaseToken],
      );
    }
    await connection.query("UPDATE toolbox_jobs SET save_status = 'saving' WHERE id = ? AND user_id = ?", [
      artifact.jobId,
      userId,
    ]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    const note = await createNoteFn({
      userId,
      userRole,
      note: { title: artifact.title, content: stripAiAnalysisCitations(artifact.content), type: 'markdown' },
      request,
      suppressUserRewards: true,
      idempotencyKey: noteSaveIdempotencyKey(artifact, saveGeneration),
    });
    try {
      await persistToolboxSaveState({
        database,
        receiptKey,
        leaseToken,
        artifact,
        userId,
        status: 'saved',
        targetId: note.id,
      });
    } catch (error) {
      if (error?.code !== 'TOOLBOX_SAVE_STATE_MISSING') throw error;
      const [rows] = await database.query(
        `SELECT status, target_id
           FROM toolbox_save_receipts
          WHERE receipt_key = ? AND user_id = ?
          LIMIT 1`,
        [receiptKey, userId],
      );
      if (rows[0]?.status === 'saved' && rows[0].target_id) {
        return {
          status: 'saved',
          targetType: 'note',
          targetId: rows[0].target_id,
          targetAvailability: 'available',
          idempotent: true,
        };
      }
      throw error;
    }
    return {
      status: 'saved',
      targetType: 'note',
      targetId: note.id,
      targetAvailability: 'available',
      idempotent: false,
    };
  } catch (error) {
    const code = String(error?.code || 'TOOLBOX_SAVE_FAILED').slice(0, 64);
    try {
      await persistToolboxSaveState({
        database,
        receiptKey,
        leaseToken,
        artifact,
        userId,
        status: 'save_failed',
        errorCode: code,
        errorMessage: '保存到笔记失败，可稍后重试',
      });
    } catch {
      // 状态库暂时不可用时保留原始失败；同一 idempotencyKey 会在租约过期后安全重放，不会重复创建笔记。
    }
    throw toolboxError(code, '保存到笔记失败，产物仍已保留，可稍后重试', Number(error?.status || 500));
  }
}

export async function prepareToolboxUpload({ userId, sessionId, toolId, fileName, fileType, fileSize }) {
  const definition = assertToolAvailable(toolId);
  if (definition.input.kind !== 'documents') {
    throw toolboxError('TOOLBOX_UPLOAD_NOT_SUPPORTED', '该工具不接受云端上传');
  }
  const mime = String(fileType || '')
    .trim()
    .toLowerCase();
  if (!definition.input.accept?.includes(mime)) {
    throw toolboxError('TOOLBOX_UPLOAD_TYPE_UNSUPPORTED', '仅支持 PDF、JPG、PNG 或 WebP 文件');
  }
  if (Number(fileSize) > Number(definition.input.maxBytes || 0)) {
    throw toolboxError('TOOLBOX_UPLOAD_TOO_LARGE', '单个文件不能超过 20MB', 413);
  }
  return createTemporaryDocumentSource({ userId, sessionId, fileName, fileType: mime, fileSize });
}

export const toolboxServiceInternals = Object.freeze({
  ARTIFACT_RETENTION_DAYS,
  HOME_ACTIVE_TASK_LIMIT,
  HOME_READY_TASK_LIMIT,
  HOME_RECENT_TASK_LIMIT,
  JOB_RETENTION_DAYS,
  SAVE_LEASE_MS,
  TERMINAL_JOB_STATUSES,
  assertToolAvailable,
  formatJob,
  formatJobError,
  formatQuote,
  parseJson,
  resolveOwnedToolboxInput,
  persistToolboxSaveState,
  saveIdempotencyKey,
  noteSaveIdempotencyKey,
  saveReceiptKey,
  selectSavedTargetAvailability,
});
