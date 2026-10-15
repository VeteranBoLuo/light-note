import crypto from 'node:crypto';
import pool from '../db/index.js';
import { asyncJobSpec } from './adminAsyncJobHealth.js';
import { recordAdminOperationAudit } from './adminOperationAudit.js';
import { CARD_IMAGE_PROFILE } from '@lightnote/shared';

const ARCHIVABLE = Object.freeze({
  ai_document: "j.status='failed'",
  bookmark_icon: "j.status='failed'",
  file_preview: "j.status='failed'",
  todo_reminder: "j.status IN ('failed','unknown')",
  email_delivery: "j.status IN ('failed','sending')",
});

const scopeError = (code) => Object.assign(new Error(code), { code });

// 快照只含任务身份和状态。当前版本最近 24 小时的失败不能批量归档；已退役旧版本单独核验。
export async function planHistoricalAsyncJobArchive({ db = pool, lock = false } = {}) {
  const entries = [];
  for (const [source, terminal] of Object.entries(ARCHIVABLE)) {
    const { table } = asyncJobSpec(source);
    const historical =
      source === 'file_preview'
        ? `(j.update_time<DATE_SUB(NOW(),INTERVAL 1 DAY) OR
          (j.create_time<DATE_SUB(NOW(),INTERVAL 1 DAY) AND EXISTS
            (SELECT 1 FROM file_preview_artifacts artifact WHERE artifact.id=j.artifact_id
              AND artifact.strategy='image_thumbnail' AND artifact.strategy_version<${CARD_IMAGE_PROFILE.version})))`
        : 'j.update_time<DATE_SUB(NOW(),INTERVAL 1 DAY)';
    const [rows] = await db.query(`SELECT CAST(j.id AS CHAR) AS id,j.status,
        CAST(UNIX_TIMESTAMP(j.update_time) AS CHAR) AS updated_epoch
      FROM ${table} j WHERE ${terminal} AND ${historical}
        AND NOT EXISTS (SELECT 1 FROM admin_async_job_archives archived
          WHERE archived.source='${source}' AND archived.job_id=CAST(j.id AS CHAR CHARACTER SET ascii)
            AND archived.job_status=j.status AND archived.job_updated_at_epoch=UNIX_TIMESTAMP(j.update_time))
      ORDER BY j.id ${lock ? 'FOR UPDATE' : ''}`);
    for (const row of rows) {
      if (!/^[A-Za-z0-9_-]{1,255}$/.test(String(row.id)) || !/^\d+(?:\.\d+)?$/.test(String(row.updated_epoch))) {
        throw scopeError('ASYNC_ARCHIVE_SNAPSHOT_INVALID');
      }
      entries.push({ source, id: String(row.id), status: row.status, updatedEpoch: String(row.updated_epoch) });
    }
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  const counts = Object.fromEntries(
    Object.keys(ARCHIVABLE).map((source) => [source, entries.filter((e) => e.source === source).length]),
  );
  return { entries, total: entries.length, digest, counts };
}

export async function archiveHistoricalAsyncJobs({ expectedTotal, expectedDigest, actorUserId, reason, db = pool }) {
  if (
    !Number.isInteger(expectedTotal) ||
    expectedTotal < 1 ||
    !/^[a-f0-9]{64}$/.test(expectedDigest || '') ||
    !String(actorUserId || '').trim() ||
    String(actorUserId).length > 255 ||
    String(reason || '').trim().length < 6 ||
    String(reason).length > 500
  )
    throw scopeError('ASYNC_ARCHIVE_CONFIRMATION_REQUIRED');
  const requestId = crypto.randomUUID();
  const audit = {
    actorUserId,
    action: 'async_job.archive',
    targetType: 'historical_async_jobs',
    targetId: requestId,
    requestId,
    reason: String(reason).trim(),
    metadata: { expectedTotal, expectedDigest, noRetry: true },
  };
  const intentAuditId = await recordAdminOperationAudit({ ...audit, outcome: 'intent' }, { db, required: true });
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const plan = await planHistoricalAsyncJobArchive({ db: connection, lock: true });
    if (plan.total !== expectedTotal || plan.digest !== expectedDigest) throw scopeError('ASYNC_ARCHIVE_SCOPE_CHANGED');
    for (let i = 0; i < plan.entries.length; i += 200) {
      await connection.query(
        `INSERT INTO admin_async_job_archives
        (source,job_id,job_status,job_updated_at_epoch,archived_by,reason,request_id) VALUES ?
        ON DUPLICATE KEY UPDATE job_status=VALUES(job_status),job_updated_at_epoch=VALUES(job_updated_at_epoch),
          archived_by=VALUES(archived_by),reason=VALUES(reason),request_id=VALUES(request_id),archived_at=NOW()`,
        [
          plan.entries
            .slice(i, i + 200)
            .map((e) => [e.source, e.id, e.status, e.updatedEpoch, actorUserId, audit.reason, requestId]),
        ],
      );
    }
    await recordAdminOperationAudit(
      {
        ...audit,
        outcome: 'succeeded',
        metadata: {
          ...audit.metadata,
          intentAuditId,
          archivedTotal: plan.total,
          counts: plan.counts,
        },
      },
      { db: connection, required: true },
    );
    await connection.commit();
    return { total: plan.total, counts: plan.counts, requestId };
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    await recordAdminOperationAudit(
      {
        ...audit,
        outcome: 'failed',
        metadata: {
          intentAuditId,
          errorCode: error?.code || 'ASYNC_ARCHIVE_FAILED',
        },
      },
      { db, required: true },
    ).catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
}
