import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fsP } from 'node:fs';
import pool from '../../db/index.js';
import { ensureResourceGovernanceSchema } from '../resourceGovernanceSchema.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { canCreateCleanupJob, resourceGovernanceCleanupEnabled } from './registry.js';
import { evidenceHash, hasAnyLocalImageReference, inspectLocalImage, parseJson } from './safety.js';
import { recordGovernanceAudit } from './scanService.js';
import { deleteNoteImageThumbnail } from '../noteImageThumbnail.js';

const TOKEN_TTL_MS = 5 * 60 * 1000;
const CLEANUP_LEASE_MINUTES = 5;
const MAX_BATCH_SIZE = 100;
const MAX_ITEM_ATTEMPTS = 3;

function cleanupError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function tokenSecret(env = process.env) {
  const secret = String(env.RESOURCE_GOVERNANCE_TOKEN_SECRET || env.SESSION_SECRET || '').trim();
  if (secret.length < 32) throw cleanupError('RESOURCE_GOVERNANCE_TOKEN_SECRET_UNAVAILABLE', 503);
  return secret;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPreview(payload, env = process.env) {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac('sha256', tokenSecret(env)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyPreview(token, env = process.env) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) throw cleanupError('RESOURCE_GOVERNANCE_PREVIEW_INVALID', 409);
  const expected = createHmac('sha256', tokenSecret(env)).update(body).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    throw cleanupError('RESOURCE_GOVERNANCE_PREVIEW_INVALID', 409);
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw cleanupError('RESOURCE_GOVERNANCE_PREVIEW_INVALID', 409);
  }
  const payload = parseJson(decode(body), null);
  if (!payload || Number(payload.exp || 0) < Date.now()) {
    throw cleanupError('RESOURCE_GOVERNANCE_PREVIEW_EXPIRED', 409);
  }
  return payload;
}

function normalizeFindingIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, MAX_BATCH_SIZE + 1);
}

async function loadCleanupFindings(ids, db, { lock = false } = {}) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id, issue_code, resource_type, target_id, target_locator, risk_level, state,
            estimated_bytes, evidence_json, observation_count, last_verified_at
       FROM resource_governance_findings
      WHERE id IN (${placeholders})${lock ? ' FOR UPDATE' : ''}`,
    ids,
  );
  return rows;
}

async function revalidateCleanupFinding(finding, { db = pool, allowQueued = false } = {}) {
  const cleanable = allowQueued
    ? finding?.risk_level === 'safe' && finding?.state === 'queued'
    : canCreateCleanupJob(finding);
  if (!cleanable) return { eligible: false, resultCode: 'FINDING_NOT_CLEANABLE' };
  if (finding.issue_code !== 'LOCAL_IMAGE_UNREFERENCED') {
    return { eligible: false, resultCode: 'EXECUTOR_NOT_REGISTERED' };
  }
  const inspection = await inspectLocalImage(finding.target_locator, { db });
  // 首期只允许 note-* 文件进入物理删除。共享书签图标仍保留既有领域清理链，治理模块只读展示。
  if (inspection.eligible && inspection.kind !== 'note') {
    return { eligible: false, resultCode: 'IMAGE_KIND_EXECUTOR_DISABLED' };
  }
  return inspection;
}

export async function previewCleanupJob({ findingIds, actorUserId, sessionId, db = pool, env = process.env }) {
  if (!resourceGovernanceCleanupEnabled(env)) throw cleanupError('RESOURCE_GOVERNANCE_CLEANUP_DISABLED', 409);
  await ensureResourceGovernanceSchema({ db });
  const ids = normalizeFindingIds(findingIds);
  if (!ids.length || ids.length > MAX_BATCH_SIZE) throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_INVALID');
  const findings = await loadCleanupFindings(ids, db);
  if (findings.length !== ids.length) throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', 409);

  const verified = [];
  for (const finding of findings) {
    const inspection = await revalidateCleanupFinding(finding, { db });
    if (!inspection.eligible) {
      throw cleanupError(inspection.resultCode || 'RESOURCE_GOVERNANCE_REVALIDATION_FAILED', 409);
    }
    verified.push({ id: finding.id, evidenceHash: evidenceHash(finding), bytes: inspection.bytes });
  }
  const confirmationPhrase = `清理 ${verified.length} 项`;
  const payload = {
    actorUserId: String(actorUserId || ''),
    sessionId: String(sessionId || ''),
    findings: verified.map(({ id, evidenceHash: hash }) => ({ id, hash })),
    riskLevel: 'safe',
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: randomUUID(),
  };
  return {
    previewToken: signPreview(payload, env),
    confirmationPhrase,
    count: verified.length,
    estimatedBytes: verified.reduce((total, item) => total + Number(item.bytes || 0), 0),
    expiresAt: new Date(payload.exp),
  };
}

export async function createCleanupJob({
  previewToken,
  confirmationPhrase,
  actorUserId,
  sessionId,
  db = pool,
  env = process.env,
}) {
  if (!resourceGovernanceCleanupEnabled(env)) throw cleanupError('RESOURCE_GOVERNANCE_CLEANUP_DISABLED', 409);
  const payload = verifyPreview(previewToken, env);
  if (payload.actorUserId !== String(actorUserId || '') || payload.sessionId !== String(sessionId || '')) {
    throw cleanupError('RESOURCE_GOVERNANCE_PREVIEW_OWNER_MISMATCH', 403);
  }
  const ids = payload.findings.map((item) => String(item.id || ''));
  const expectedPhrase = `清理 ${ids.length} 项`;
  if (String(confirmationPhrase || '').trim() !== expectedPhrase) {
    throw cleanupError('RESOURCE_GOVERNANCE_CONFIRMATION_MISMATCH');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const findings = await loadCleanupFindings(ids, connection, { lock: true });
    if (findings.length !== ids.length) throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', 409);
    const hashById = new Map(payload.findings.map((item) => [item.id, item.hash]));
    for (const finding of findings) {
      if (!canCreateCleanupJob(finding) || evidenceHash(finding) !== hashById.get(finding.id)) {
        throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', 409);
      }
    }
    const jobId = randomUUID();
    const estimatedBytes = findings.reduce((total, item) => total + Number(item.estimated_bytes || 0), 0);
    const digest = createHash('sha256')
      .update(`${actorUserId}\0${ids.sort().join('\0')}\0${payload.nonce}`)
      .digest('hex');
    await connection.query(
      `INSERT INTO resource_cleanup_jobs
        (id, created_by, risk_level, status, total, estimated_bytes, confirmation_digest)
       VALUES (?, ?, 'safe', 'pending', ?, ?, ?)`,
      [jobId, actorUserId, findings.length, estimatedBytes, digest],
    );
    for (const finding of findings) {
      await connection.query(
        `INSERT INTO resource_cleanup_job_items (job_id, finding_id, status, precondition_hash)
         VALUES (?, ?, 'pending', ?)`,
        [jobId, finding.id, evidenceHash(finding)],
      );
    }
    const placeholders = ids.map(() => '?').join(',');
    const [updated] = await connection.query(
      `UPDATE resource_governance_findings SET state = 'queued'
        WHERE id IN (${placeholders}) AND state = 'open' AND risk_level = 'safe'`,
      ids,
    );
    if (Number(updated?.affectedRows || 0) !== ids.length) {
      throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', 409);
    }
    await recordGovernanceAudit(connection, {
      actorUserId,
      action: 'cleanup_job_created',
      targetType: 'cleanup_job',
      targetId: jobId,
      outcome: 'pending',
      summary: { count: ids.length, riskLevel: 'safe', estimatedBytes },
    });
    await connection.commit();
    return { id: jobId, status: 'pending', total: ids.length, estimatedBytes };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function claimCleanupJob(workerId, { db = pool } = {}) {
  await ensureResourceGovernanceSchema({ db });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, created_by
         FROM resource_cleanup_jobs
        WHERE status = 'pending'
           OR (status = 'running' AND lease_expires_at < NOW())
        ORDER BY create_time ASC LIMIT 1 FOR UPDATE`,
    );
    if (!rows.length) {
      await connection.commit();
      return null;
    }
    const job = rows[0];
    // 只有 Job 租约已经过期才会走到这里。把上一个 Worker 未落终态的 item 退回 pending，
    // 新 Worker 仍会重新查引用；若旧 Worker 已删文件但未落库，ENOENT 会被安全地记为状态变化。
    await connection.query(
      `UPDATE resource_cleanup_job_items
          SET status = 'pending', result_code = 'WORKER_LEASE_RECOVERED', finished_at = NULL
        WHERE job_id = ? AND status = 'running'`,
      [job.id],
    );
    await connection.query(
      `UPDATE resource_cleanup_jobs
          SET status = 'running', lease_owner = ?, lease_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
              started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), last_error_code = NULL
        WHERE id = ?`,
      [workerId, CLEANUP_LEASE_MINUTES, job.id],
    );
    await connection.commit();
    return { id: job.id, createdBy: job.created_by };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function settleCleanupItem(job, item, outcome, db) {
  const status = outcome.status;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [itemResult] = await connection.query(
      `UPDATE resource_cleanup_job_items
          SET status = ?, result_code = ?, released_bytes = ?, finished_at = NOW()
        WHERE job_id = ? AND finding_id = ? AND status = 'running'`,
      [status, outcome.resultCode, Number(outcome.releasedBytes || 0), job.id, item.finding_id],
    );
    if (Number(itemResult?.affectedRows || 0) !== 1) {
      throw cleanupError('RESOURCE_GOVERNANCE_ITEM_STATE_CHANGED', 409);
    }
    if (status === 'deleted') {
      await connection.query(
        `UPDATE resource_governance_findings
            SET state = 'resolved', resolution_code = ?, resolved_by = ?, resolved_at = NOW()
          WHERE id = ? AND state = 'queued'`,
        [outcome.resultCode, job.createdBy, item.finding_id],
      );
    } else if (status === 'failed') {
      // 明确失败时文件没有被当作成功删除，恢复为 open 才能经人工操作重新 preview；绝不自动重试。
      await connection.query(
        `UPDATE resource_governance_findings
            SET state = 'open', resolution_code = ?, resolved_at = NULL
          WHERE id = ? AND state = 'queued'`,
        [outcome.resultCode, item.finding_id],
      );
    } else {
      await connection.query(
        `UPDATE resource_governance_findings
            SET state = 'stale', resolution_code = ?, resolved_at = NOW()
          WHERE id = ? AND state = 'queued'`,
        [outcome.resultCode, item.finding_id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function executeCleanupItem(job, item, db) {
  const finding = item;
  if (evidenceHash(finding) !== item.precondition_hash) {
    return { status: 'skipped_changed', resultCode: 'FINDING_EVIDENCE_CHANGED', releasedBytes: 0 };
  }
  const inspection = await revalidateCleanupFinding(finding, { db, allowQueued: true });
  if (inspection.missing) return { status: 'skipped_changed', resultCode: inspection.resultCode, releasedBytes: 0 };
  if (inspection.referenced)
    return { status: 'skipped_referenced', resultCode: inspection.resultCode, releasedBytes: 0 };
  if (!inspection.eligible) return { status: 'skipped_changed', resultCode: inspection.resultCode, releasedBytes: 0 };

  // 引用检查完成后再核对同一路径仍是同一个普通文件，避免人工替换、符号链接或同名覆盖跨过前置检查。
  const finalStat = await fsP.lstat(inspection.filePath).catch(() => null);
  const identityChanged =
    !finalStat ||
    finalStat.isSymbolicLink() ||
    !finalStat.isFile() ||
    Number(finalStat.size || 0) !== inspection.bytes ||
    Number(finalStat.mtimeMs || 0) !== inspection.mtimeMs ||
    (inspection.inode > 0 && Number(finalStat.ino || 0) !== inspection.inode) ||
    (inspection.device > 0 && Number(finalStat.dev || 0) !== inspection.device);
  if (identityChanged) {
    return { status: 'skipped_changed', resultCode: 'IMAGE_IDENTITY_CHANGED', releasedBytes: 0 };
  }
  // 在 unlink 紧前再查一次全部权威引用；包括软删除/回收站资源，任一命中立即跳过。
  if (await hasAnyLocalImageReference(inspection.fileName, { db })) {
    return { status: 'skipped_referenced', resultCode: 'IMAGE_REFERENCED', releasedBytes: 0 };
  }
  try {
    await deleteNoteImageThumbnail(`https://boluo66.top/uploads/${inspection.fileName}`).catch(() => false);
    await fsP.unlink(inspection.filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'skipped_changed', resultCode: 'IMAGE_ALREADY_MISSING', releasedBytes: 0 };
    }
    throw error;
  }
  return { status: 'deleted', resultCode: 'IMAGE_DELETED', releasedBytes: inspection.bytes };
}

export async function runCleanupJob(job, workerId, { db = pool } = {}) {
  try {
    while (true) {
      if (!resourceGovernanceCleanupEnabled()) {
        await db.query(
          `UPDATE resource_cleanup_jobs
              SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NOW()
            WHERE id = ? AND status = 'running' AND lease_owner = ?`,
          [job.id, workerId],
        );
        return { status: 'pending', paused: true };
      }
      const connection = await db.getConnection();
      let item;
      try {
        await connection.beginTransaction();
        const [ownedJobs] = await connection.query(
          `SELECT id FROM resource_cleanup_jobs
            WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_expires_at > NOW()
            LIMIT 1 FOR UPDATE`,
          [job.id, workerId],
        );
        if (!ownedJobs.length) throw cleanupError('RESOURCE_GOVERNANCE_CLEANUP_LEASE_LOST', 409);
        const [rows] = await connection.query(
          `SELECT i.job_id, i.finding_id, i.precondition_hash, f.id,
                  f.issue_code, f.resource_type, f.target_locator, f.risk_level, f.state,
                  f.estimated_bytes, f.evidence_json, f.observation_count, f.last_verified_at
             FROM resource_cleanup_job_items i
             JOIN resource_governance_findings f ON f.id = i.finding_id
            WHERE i.job_id = ? AND i.status = 'pending'
            ORDER BY i.finding_id ASC LIMIT 1 FOR UPDATE`,
          [job.id],
        );
        item = rows[0] || null;
        if (item) {
          await connection.query(
            `UPDATE resource_cleanup_job_items
                SET status = 'running', attempts = attempts + 1, claimed_at = NOW()
              WHERE job_id = ? AND finding_id = ? AND status = 'pending'`,
            [job.id, item.finding_id],
          );
          const [heartbeatResult] = await connection.query(
            `UPDATE resource_cleanup_jobs
                SET heartbeat_at = NOW(), lease_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
              WHERE id = ? AND status = 'running' AND lease_owner = ?`,
            [CLEANUP_LEASE_MINUTES, job.id, workerId],
          );
          if (Number(heartbeatResult?.affectedRows || 0) !== 1) {
            throw cleanupError('RESOURCE_GOVERNANCE_CLEANUP_LEASE_LOST', 409);
          }
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
      if (!item) break;
      try {
        const outcome = await executeCleanupItem(job, item, db);
        await settleCleanupItem(job, item, outcome, db);
      } catch (error) {
        await settleCleanupItem(
          job,
          item,
          { status: 'failed', resultCode: stableAgentErrorCode(error), releasedBytes: 0 },
          db,
        );
      }
    }
    const [[counts]] = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'deleted') AS succeeded,
              SUM(status IN ('skipped_changed', 'skipped_referenced')) AS skipped,
              SUM(status = 'failed') AS failed,
              COALESCE(SUM(released_bytes), 0) AS released_bytes
         FROM resource_cleanup_job_items WHERE job_id = ?`,
      [job.id],
    );
    const failed = Number(counts.failed || 0);
    const status = failed ? 'completed_with_errors' : 'completed';
    const [jobResult] = await db.query(
      `UPDATE resource_cleanup_jobs
          SET status = ?, succeeded = ?, skipped = ?, failed = ?, released_bytes = ?,
              finished_at = NOW(), heartbeat_at = NOW(), lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ? AND lease_owner = ?`,
      [
        status,
        Number(counts.succeeded || 0),
        Number(counts.skipped || 0),
        failed,
        Number(counts.released_bytes || 0),
        job.id,
        workerId,
      ],
    );
    if (Number(jobResult?.affectedRows || 0) !== 1) {
      throw cleanupError('RESOURCE_GOVERNANCE_CLEANUP_LEASE_LOST', 409);
    }
    await recordGovernanceAudit(db, {
      actorUserId: job.createdBy,
      action: 'cleanup_job_completed',
      targetType: 'cleanup_job',
      targetId: job.id,
      outcome: status,
      summary: {
        succeeded: Number(counts.succeeded || 0),
        skipped: Number(counts.skipped || 0),
        failed,
        releasedBytes: Number(counts.released_bytes || 0),
      },
    });
    return { status, ...counts };
  } catch (error) {
    const errorCode = stableAgentErrorCode(error);
    await db
      .query(
        `UPDATE resource_cleanup_jobs
            SET status = 'pending', last_error_code = ?, finished_at = NULL, lease_owner = NULL, lease_expires_at = NULL
          WHERE id = ? AND lease_owner = ?`,
        [errorCode, job.id, workerId],
      )
      .catch(() => {});
    throw error;
  }
}

export async function cancelCleanupJob({ id, actorUserId, db = pool }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [jobs] = await connection.query(
      `SELECT id, status FROM resource_cleanup_jobs WHERE id = ? LIMIT 1 FOR UPDATE`,
      [String(id || '')],
    );
    if (!jobs.length) throw cleanupError('RESOURCE_GOVERNANCE_JOB_NOT_FOUND', 404);
    if (jobs[0].status !== 'pending') throw cleanupError('RESOURCE_GOVERNANCE_JOB_NOT_CANCELLABLE', 409);
    const [items] = await connection.query(
      `SELECT finding_id FROM resource_cleanup_job_items WHERE job_id = ? AND status = 'pending' FOR UPDATE`,
      [id],
    );
    if (items.length) {
      const findingIds = items.map((item) => item.finding_id);
      const placeholders = findingIds.map(() => '?').join(',');
      await connection.query(
        `UPDATE resource_cleanup_job_items
            SET status = 'cancelled', result_code = 'JOB_CANCELLED', finished_at = NOW()
          WHERE job_id = ? AND status = 'pending'`,
        [id],
      );
      const [findingResult] = await connection.query(
        `UPDATE resource_governance_findings
            SET state = 'open', resolution_code = 'JOB_CANCELLED', resolved_at = NULL
          WHERE id IN (${placeholders}) AND state = 'queued'`,
        findingIds,
      );
      if (Number(findingResult?.affectedRows || 0) !== findingIds.length) {
        throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', 409);
      }
    }
    await connection.query(
      `UPDATE resource_cleanup_jobs
          SET status = 'cancelled', skipped = skipped + ?, finished_at = NOW(), lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ?`,
      [items.length, id],
    );
    await recordGovernanceAudit(connection, {
      actorUserId,
      action: 'cleanup_job_cancelled',
      targetType: 'cleanup_job',
      targetId: id,
      outcome: 'cancelled',
      summary: { cancelledItems: items.length },
    });
    await connection.commit();
    return { id, status: 'cancelled', cancelledItems: items.length };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function retryCleanupJob({ id, actorUserId, db = pool, env = process.env }) {
  if (!resourceGovernanceCleanupEnabled(env)) throw cleanupError('RESOURCE_GOVERNANCE_CLEANUP_DISABLED', 409);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [jobs] = await connection.query(
      `SELECT id, status FROM resource_cleanup_jobs WHERE id = ? LIMIT 1 FOR UPDATE`,
      [String(id || '')],
    );
    if (!jobs.length) throw cleanupError('RESOURCE_GOVERNANCE_JOB_NOT_FOUND', 404);
    if (jobs[0].status !== 'completed_with_errors') {
      throw cleanupError('RESOURCE_GOVERNANCE_JOB_NOT_RETRYABLE', 409);
    }
    const [failedItems] = await connection.query(
      `SELECT i.finding_id, i.attempts, f.id, f.issue_code, f.resource_type, f.target_locator,
              f.risk_level, f.state, f.estimated_bytes, f.evidence_json, f.observation_count, f.last_verified_at
         FROM resource_cleanup_job_items i
         JOIN resource_governance_findings f ON f.id = i.finding_id
        WHERE i.job_id = ? AND i.status = 'failed' AND i.attempts < ?
        ORDER BY i.finding_id ASC FOR UPDATE`,
      [id, MAX_ITEM_ATTEMPTS],
    );
    if (!failedItems.length) throw cleanupError('RESOURCE_GOVERNANCE_JOB_NO_RETRYABLE_ITEMS', 409);

    const eligible = [];
    for (const item of failedItems) {
      if (!canCreateCleanupJob(item)) continue;
      const inspection = await revalidateCleanupFinding(item, { db: connection });
      if (inspection.eligible) eligible.push(item);
    }
    if (!eligible.length) throw cleanupError('RESOURCE_GOVERNANCE_JOB_NO_RETRYABLE_ITEMS', 409);
    const findingIds = eligible.map((item) => item.finding_id);
    const placeholders = findingIds.map(() => '?').join(',');
    for (const item of eligible) {
      await connection.query(
        `UPDATE resource_cleanup_job_items
            SET status = 'pending', precondition_hash = ?, result_code = NULL,
                claimed_at = NULL, finished_at = NULL, released_bytes = 0
          WHERE job_id = ? AND finding_id = ? AND status = 'failed'`,
        [evidenceHash(item), id, item.finding_id],
      );
    }
    const [findingResult] = await connection.query(
      `UPDATE resource_governance_findings
          SET state = 'queued', resolution_code = NULL, resolved_at = NULL
        WHERE id IN (${placeholders}) AND state = 'open'`,
      findingIds,
    );
    if (Number(findingResult?.affectedRows || 0) !== findingIds.length) {
      throw cleanupError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', 409);
    }
    await connection.query(
      `UPDATE resource_cleanup_jobs
          SET status = 'pending', failed = GREATEST(failed - ?, 0), finished_at = NULL, last_error_code = NULL,
              lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ?`,
      [eligible.length, id],
    );
    await recordGovernanceAudit(connection, {
      actorUserId,
      action: 'cleanup_job_retried',
      targetType: 'cleanup_job',
      targetId: id,
      outcome: 'pending',
      summary: { retriedItems: eligible.length },
    });
    await connection.commit();
    return { id, status: 'pending', retriedItems: eligible.length };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function queryCleanupJobs({ page = 1, pageSize = 20 } = {}, { db = pool } = {}) {
  await ensureResourceGovernanceSchema({ db });
  const normalizedPage = Math.max(1, Number(page || 1));
  const normalizedSize = Math.max(1, Math.min(100, Number(pageSize || 20)));
  const [[countRow]] = await db.query('SELECT COUNT(*) AS total FROM resource_cleanup_jobs');
  const [items] = await db.query(
    `SELECT id, created_by, risk_level, status, total, succeeded, skipped, failed,
            estimated_bytes, released_bytes, started_at, heartbeat_at, finished_at,
            last_error_code, create_time
       FROM resource_cleanup_jobs ORDER BY create_time DESC LIMIT ? OFFSET ?`,
    [normalizedSize, (normalizedPage - 1) * normalizedSize],
  );
  return { items, total: Number(countRow?.total || 0), page: normalizedPage, pageSize: normalizedSize };
}

export async function getCleanupJob(id, { db = pool } = {}) {
  const [jobs] = await db.query(
    `SELECT id, created_by, risk_level, status, total, succeeded, skipped, failed,
            estimated_bytes, released_bytes, started_at, heartbeat_at, finished_at,
            last_error_code, create_time
       FROM resource_cleanup_jobs WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!jobs.length) return null;
  const [items] = await db.query(
    `SELECT finding_id, status, attempts, result_code, claimed_at, finished_at, released_bytes
       FROM resource_cleanup_job_items WHERE job_id = ? ORDER BY finding_id ASC`,
    [id],
  );
  return { ...jobs[0], items };
}

export { cleanupError, executeCleanupItem, revalidateCleanupFinding, verifyPreview };
