import { randomUUID } from 'node:crypto';
import { promises as fsP } from 'node:fs';
import pool from '../../db/index.js';
import { ensureResourceGovernanceSchema } from '../resourceGovernanceSchema.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import {
  ACCOUNT_DELETION_STALE_PROCESSING_MINUTES,
  classifyAccountResourceCleanup,
  isAccountDeletionRequestStalled,
} from '../accountDeletionPolicy.js';
import {
  canCreateCleanupJob,
  GOVERNANCE_RISK,
  getInvalidOwnerCleanupGovernanceRules,
  getOwnerStateGovernanceRules,
  normalizeGovernanceScopes,
  resourceGovernanceScanEnabled,
} from './registry.js';
import {
  classifyLocalImage,
  governanceFingerprint,
  hasAnyLocalImageReference,
  inspectLocalImage,
  parseJson,
  resolveGovernedImageRoots,
  resolveGovernedImagePath,
} from './safety.js';

const OWNER_RESOURCE_DEFINITIONS = Object.freeze([
  { scope: 'bookmark', resourceType: 'bookmark', table: 'bookmark', id: 'id', owner: 'user_id', deleted: 'del_flag' },
  { scope: 'note', resourceType: 'note', table: 'note', id: 'id', owner: 'create_by', deleted: 'del_flag' },
  { scope: 'file', resourceType: 'file', table: 'files', id: 'id', owner: 'create_by', deleted: 'del_flag' },
  { scope: 'file', resourceType: 'folder', table: 'folders', id: 'id', owner: 'create_by', deleted: 'del_flag' },
  { scope: 'todo', resourceType: 'todo', table: 'todo_items', id: 'id', owner: 'user_id', deleted: 'deleted_at' },
]);

const SCAN_LEASE_MINUTES = 5;
const PAGE_SIZE = 250;
const OWNER_STATE_ISSUES = new Set(getOwnerStateGovernanceRules().map((rule) => rule.issueCode));
const INVALID_OWNER_CLEANUP_ISSUES = new Set(getInvalidOwnerCleanupGovernanceRules().map((rule) => rule.issueCode));

function json(value) {
  return JSON.stringify(value ?? {});
}

async function audit(db, { actorUserId = null, action, targetType, targetId = null, outcome, summary = null }) {
  await db.query(
    `INSERT INTO resource_governance_audit
      (actor_user_id, action, target_type, target_id, outcome, summary_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorUserId, action, targetType, targetId, outcome, summary == null ? null : json(summary)],
  );
}

export async function createGovernanceScan({ createdBy, scopes, db = pool }) {
  if (!resourceGovernanceScanEnabled()) {
    const error = new Error('RESOURCE_GOVERNANCE_SCAN_DISABLED');
    error.code = 'RESOURCE_GOVERNANCE_SCAN_DISABLED';
    throw error;
  }
  await ensureResourceGovernanceSchema({ db });
  const normalizedScopes = normalizeGovernanceScopes(scopes);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [active] = await connection.query(
      `SELECT id, status
         FROM resource_governance_scans
        WHERE status IN ('pending', 'running')
          AND (status = 'pending' OR lease_expires_at IS NULL OR lease_expires_at > NOW())
        ORDER BY create_time ASC
        LIMIT 1
        FOR UPDATE`,
    );
    if (active.length) {
      await connection.rollback();
      return { id: active[0].id, status: active[0].status, scopes: normalizedScopes, reused: true };
    }
    const id = randomUUID();
    await connection.query(
      `INSERT INTO resource_governance_scans (id, created_by, status, scope_json)
       VALUES (?, ?, 'pending', ?)`,
      [id, createdBy, json({ scopes: normalizedScopes })],
    );
    await audit(connection, {
      actorUserId: createdBy,
      action: 'scan_created',
      targetType: 'scan',
      targetId: id,
      outcome: 'pending',
      summary: { scopes: normalizedScopes },
    });
    await connection.commit();
    return { id, status: 'pending', scopes: normalizedScopes, reused: false };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function claimGovernanceScan(workerId, { db = pool } = {}) {
  await ensureResourceGovernanceSchema({ db });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, created_by, scope_json
         FROM resource_governance_scans
        WHERE status = 'pending'
           OR (status = 'running' AND lease_expires_at < NOW())
        ORDER BY create_time ASC
        LIMIT 1
        FOR UPDATE`,
    );
    const row = rows[0];
    if (!row) {
      await connection.commit();
      return null;
    }
    await connection.query(
      `UPDATE resource_governance_scans
          SET status = 'running', lease_owner = ?,
              lease_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
              started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), last_error_code = NULL
        WHERE id = ?`,
      [workerId, SCAN_LEASE_MINUTES, row.id],
    );
    await connection.commit();
    return {
      id: row.id,
      createdBy: row.created_by,
      scopes: normalizeGovernanceScopes(parseJson(row.scope_json)?.scopes),
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function heartbeat(scanId, workerId, db) {
  const [result] = await db.query(
    `UPDATE resource_governance_scans
        SET heartbeat_at = NOW(), lease_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
      WHERE id = ? AND status = 'running' AND lease_owner = ?`,
    [SCAN_LEASE_MINUTES, scanId, workerId],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    const error = new Error('RESOURCE_GOVERNANCE_SCAN_LEASE_LOST');
    error.code = 'RESOURCE_GOVERNANCE_SCAN_LEASE_LOST';
    throw error;
  }
}

async function getExistingFinding(fingerprint, db) {
  const [rows] = await db.query(
    `SELECT id, risk_level, state, observation_count, first_seen_at, last_seen_at
       FROM resource_governance_findings WHERE fingerprint = ? LIMIT 1`,
    [fingerprint],
  );
  return rows[0] || null;
}

async function recordFinding(scan, finding, db) {
  const fingerprint = governanceFingerprint(finding.issueCode, finding.resourceType, finding.stableTarget);
  const existing = await getExistingFinding(fingerprint, db);
  const id = existing?.id || randomUUID();
  const observationCount = Number(existing?.observation_count || 0) + 1;
  const firstSeenAt = existing?.first_seen_at || scan.startedAt;
  let riskLevel = finding.riskLevel;
  if (finding.issueCode === 'LOCAL_IMAGE_UNREFERENCED') {
    const verifiedLongEnough =
      existing && new Date(scan.startedAt).getTime() - new Date(firstSeenAt).getTime() >= 24 * 60 * 60 * 1000;
    riskLevel = verifiedLongEnough && observationCount >= 2 ? GOVERNANCE_RISK.SAFE : GOVERNANCE_RISK.BLOCKED;
  }
  const evidence = {
    ...(finding.evidence || {}),
    observationCount,
    requiredObservations: finding.issueCode === 'LOCAL_IMAGE_UNREFERENCED' ? 2 : 1,
    verificationWindowHours: finding.issueCode === 'LOCAL_IMAGE_UNREFERENCED' ? 24 : 0,
  };
  await db.query(
    `INSERT INTO resource_governance_findings
      (id, scan_id, fingerprint, issue_code, resource_type, target_id, target_locator, owner_id,
       risk_level, state, estimated_bytes, evidence_json, observation_count, first_seen_at, last_seen_at,
       last_verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       scan_id = VALUES(scan_id), issue_code = VALUES(issue_code), resource_type = VALUES(resource_type),
       target_id = VALUES(target_id), target_locator = VALUES(target_locator), owner_id = VALUES(owner_id),
       risk_level = VALUES(risk_level),
       state = IF(state IN ('ignored', 'queued'), state, 'open'),
       estimated_bytes = VALUES(estimated_bytes), evidence_json = VALUES(evidence_json),
       observation_count = VALUES(observation_count), last_seen_at = VALUES(last_seen_at),
       last_verified_at = VALUES(last_verified_at), resolution_code = NULL,
       resolved_by = NULL, resolved_at = NULL`,
    [
      id,
      scan.id,
      fingerprint,
      finding.issueCode,
      finding.resourceType,
      finding.targetId == null ? null : String(finding.targetId),
      finding.targetLocator == null ? null : json(finding.targetLocator),
      finding.ownerId == null ? null : String(finding.ownerId),
      riskLevel,
      Math.max(0, Number(finding.estimatedBytes || 0)),
      json(evidence),
      observationCount,
      firstSeenAt,
      scan.startedAt,
      scan.startedAt,
    ],
  );
  return riskLevel;
}

async function scanLocalImages(scan, db) {
  let scanned = 0;
  let findings = 0;
  for (const root of resolveGovernedImageRoots()) {
    let directory;
    try {
      directory = await fsP.opendir(root);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for await (const entry of directory) {
      scanned += 1;
      if (!entry.isFile()) continue;
      const fileName = String(entry.name || '');
      const filePath = resolveGovernedImagePath(root, fileName);
      if (!filePath) continue;
      const kind = classifyLocalImage(fileName);
      if (kind === 'unsupported' || kind === 'bookmark_icon') {
        // 未知命名可能来自尚未纳入引用索引的真实业务，只有提示，没有删除执行器。
        if (!/\.(?:png|svg|jpe?g|gif|webp|ico)$/i.test(fileName)) continue;
        const referenced = await hasAnyLocalImageReference(fileName, { db });
        if (referenced) continue;
        const stat = await fsP.lstat(filePath).catch(() => null);
        if (!stat?.isFile() || stat.isSymbolicLink()) continue;
        await recordFinding(
          scan,
          {
            issueCode: 'LOCAL_IMAGE_UNSUPPORTED',
            resourceType: 'image',
            stableTarget: `${root}:${fileName}`,
            targetId: fileName,
            targetLocator: { root, fileName },
            riskLevel: GOVERNANCE_RISK.BLOCKED,
            estimatedBytes: stat.size,
            evidence: {
              kind,
              fileName,
              modifiedAt: stat.mtime,
              referenced: false,
              reasonCode:
                kind === 'bookmark_icon' ? 'BOOKMARK_ICON_DOMAIN_CLEANUP_ONLY' : 'IMAGE_NAMING_NOT_WHITELISTED',
            },
          },
          db,
        );
        findings += 1;
        continue;
      }
      const inspection = await inspectLocalImage({ root, fileName }, { db, now: new Date(scan.startedAt) });
      if (!inspection.eligible) continue;
      await recordFinding(
        scan,
        {
          issueCode: 'LOCAL_IMAGE_UNREFERENCED',
          resourceType: 'image',
          stableTarget: `${root}:${fileName}`,
          targetId: fileName,
          targetLocator: { root, fileName },
          riskLevel: GOVERNANCE_RISK.SAFE,
          estimatedBytes: inspection.bytes,
          evidence: {
            kind: inspection.kind,
            fileName,
            modifiedAt: inspection.mtime,
            referenced: false,
            cooldownHours: 24,
          },
        },
        db,
      );
      findings += 1;
    }
  }
  return { scanned, findings };
}

async function loadTableNames(db) {
  const [rows] = await db.query('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()');
  return new Set((rows || []).map((row) => String(row.table_name || row.TABLE_NAME || '')));
}

function ownerJoin(definition) {
  return `CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(r.${definition.owner} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

async function scanOwnerIntegrity(scan, db, tables) {
  const scopes = new Set(scan.scopes);
  let scanned = 0;
  let findings = 0;
  const ownersWithDeletionWorkflow = new Set();
  if (tables.has('account_deletion_requests')) {
    const [deletionRequests] = await db.query(
      `SELECT CONVERT(user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_id
         FROM account_deletion_requests
        WHERE status IN ('pending', 'processing', 'retry_wait')`,
    );
    for (const request of deletionRequests) ownersWithDeletionWorkflow.add(String(request.owner_id || ''));
  }
  for (const definition of OWNER_RESOURCE_DEFINITIONS) {
    if (!scopes.has(definition.scope) || !tables.has(definition.table)) continue;
    let cursor = '';
    while (true) {
      const cursorSql = cursor ? `AND CONVERT(r.${definition.id} USING utf8mb4) > ?` : '';
      const params = cursor ? [cursor, PAGE_SIZE] : [PAGE_SIZE];
      const [rows] = await db.query(
        `SELECT CONVERT(r.${definition.id} USING utf8mb4) AS resource_id,
                CONVERT(r.${definition.owner} USING utf8mb4) AS owner_id,
                CONVERT(r.${definition.deleted} USING utf8mb4) AS deleted_state
           FROM ${definition.table} r
           LEFT JOIN user u ON ${ownerJoin(definition)}
          WHERE r.${definition.owner} IS NOT NULL
            AND CONVERT(r.${definition.owner} USING utf8mb4) <> ''
            AND u.id IS NULL
            ${cursorSql}
          ORDER BY CONVERT(r.${definition.id} USING utf8mb4) ASC
          LIMIT ?`,
        params,
      );
      if (!rows.length) break;
      for (const row of rows) {
        scanned += 1;
        await recordFinding(
          scan,
          {
            issueCode: 'OWNER_MISSING',
            resourceType: definition.resourceType,
            stableTarget: row.resource_id,
            targetId: row.resource_id,
            ownerId: row.owner_id,
            riskLevel: GOVERNANCE_RISK.REVIEW,
            evidence: {
              ownerRowExists: false,
              resourceState: String(row.deleted_state ?? ''),
              cleanupExecutorRegistered: true,
              actionKind: 'cleanup_invalid_owner',
              reasonCode: 'OWNER_ROW_NOT_FOUND',
            },
          },
          db,
        );
        findings += 1;
      }
      cursor = String(rows.at(-1).resource_id || '');
      if (rows.length < PAGE_SIZE) break;
    }

    const [accountCleanupCandidates] = await db.query(
      `SELECT CONVERT(r.${definition.owner} USING utf8mb4) AS owner_id,
              u.role AS owner_role, u.del_flag AS owner_del_flag,
              COUNT(*) AS resource_count
         FROM ${definition.table} r
         JOIN user u ON ${ownerJoin(definition)}
        WHERE u.del_flag = 1
        GROUP BY r.${definition.owner}, u.role, u.del_flag
        ORDER BY r.${definition.owner} ASC`,
    );
    for (const row of accountCleanupCandidates) {
      const ownerCleanup = classifyAccountResourceCleanup({
        role: row.owner_role,
        del_flag: row.owner_del_flag,
      });
      if (!ownerCleanup.eligible) continue;
      // 已进入正式账号注销工作流的资源由 accountDeletion 领域服务处理，
      // 不再为同一账号制造重复的人工复核项。
      if (ownersWithDeletionWorkflow.has(String(row.owner_id || ''))) continue;
      await recordFinding(
        scan,
        {
          issueCode: 'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
          resourceType: definition.resourceType,
          stableTarget: `${row.owner_id}:${definition.resourceType}`,
          targetId: row.owner_id,
          ownerId: row.owner_id,
          riskLevel: GOVERNANCE_RISK.REVIEW,
          evidence: {
            ownerRowExists: true,
            ownerFormallyDeleted: true,
            resourceCount: Number(row.resource_count || 0),
            cleanupExecutorRegistered: true,
            actionKind: 'cleanup_invalid_owner',
            reasonCode: 'FORMALLY_DELETED_OWNER_HAS_RESOURCES',
          },
        },
        db,
      );
      findings += 1;
    }
  }
  return { scanned, findings };
}

async function scanAccountDeletionJobs(scan, db, tables) {
  if (!scan.scopes.includes('account_job') || !tables.has('account_deletion_requests'))
    return { scanned: 0, findings: 0 };
  const [rows] = await db.query(
    `SELECT id, user_id, status, attempts, last_error_code, update_time
      FROM account_deletion_requests
      WHERE status = 'retry_wait'
         OR (status = 'processing' AND (
           processing_started_at IS NULL
           OR processing_started_at < DATE_SUB(NOW(), INTERVAL ${ACCOUNT_DELETION_STALE_PROCESSING_MINUTES} MINUTE)
         ))
      ORDER BY update_time ASC
      LIMIT 1000`,
  );
  for (const row of rows) {
    await recordFinding(
      scan,
      {
        issueCode: 'ACCOUNT_DELETION_STALLED',
        resourceType: 'account_job',
        stableTarget: row.id,
        targetId: row.id,
        ownerId: row.user_id,
        riskLevel: GOVERNANCE_RISK.BLOCKED,
        evidence: {
          status: row.status,
          attempts: Number(row.attempts || 0),
          lastErrorCode: row.last_error_code || null,
          updatedAt: row.update_time,
          cleanupExecutorRegistered: true,
          actionKind: 'cleanup_invalid_owner',
          reasonCode: 'EXISTING_DELETION_WORKFLOW_RETRY_REQUIRED',
        },
      },
      db,
    );
  }
  return { scanned: rows.length, findings: rows.length };
}

async function decorateFindingActions(items, db) {
  const invalidOwnerItems = items.filter((item) => OWNER_STATE_ISSUES.has(item.issue_code) && item.owner_id);
  const ownerStates = new Map();
  const accountStates = new Map();
  if (invalidOwnerItems.length) {
    const ownerIds = [...new Set(invalidOwnerItems.map((item) => String(item.owner_id)))];
    const ownerPlaceholders = ownerIds.map(() => '?').join(',');
    const [owners] = await db.query(
      `SELECT id, role, del_flag
         FROM user
        WHERE id IN (${ownerPlaceholders})`,
      ownerIds,
    );
    for (const owner of owners) ownerStates.set(String(owner.id), owner);

    const requestIds = [
      ...new Set(
        invalidOwnerItems
          .filter((item) => item.issue_code === 'ACCOUNT_DELETION_STALLED' && item.target_id)
          .map((item) => String(item.target_id)),
      ),
    ];
    if (requestIds.length) {
      const placeholders = requestIds.map(() => '?').join(',');
      const [requests] = await db.query(
        `SELECT id, user_id, status, processing_started_at
           FROM account_deletion_requests
          WHERE id IN (${placeholders})`,
        requestIds,
      );
      for (const request of requests) accountStates.set(String(request.id), request);
    }
  }

  return items.map((item) => {
    if (OWNER_STATE_ISSUES.has(item.issue_code)) {
      const owner = ownerStates.get(String(item.owner_id || ''));
      const ownerCleanup = classifyAccountResourceCleanup(owner);
      const request =
        item.issue_code === 'ACCOUNT_DELETION_STALLED' ? accountStates.get(String(item.target_id || '')) : null;
      const requestMatches =
        item.issue_code !== 'ACCOUNT_DELETION_STALLED' ||
        (request &&
          String(request.user_id || '') === String(item.owner_id || '') &&
          isAccountDeletionRequestStalled(request));
      const actionKind = INVALID_OWNER_CLEANUP_ISSUES.has(item.issue_code) ? 'cleanup_invalid_owner' : null;
      return {
        ...item,
        owner_cleanup_state: ownerCleanup.state,
        action_kind: actionKind,
        action_eligible: Boolean(actionKind && item.state === 'open' && ownerCleanup.eligible && requestMatches),
      };
    }
    return {
      ...item,
      action_kind: canCreateCleanupJob(item) ? 'cleanup' : null,
      action_eligible: canCreateCleanupJob(item),
    };
  });
}

async function summarizeOpenFindings(db) {
  const [rows] = await db.query(
    `SELECT risk_level, COUNT(*) AS total, COALESCE(SUM(estimated_bytes), 0) AS estimated_bytes
       FROM resource_governance_findings
      WHERE state = 'open'
      GROUP BY risk_level`,
  );
  const summary = { total: 0, safe: 0, review: 0, blocked: 0, estimatedBytes: 0 };
  for (const row of rows) {
    const total = Number(row.total || 0);
    summary.total += total;
    if (row.risk_level in summary) summary[row.risk_level] = total;
    summary.estimatedBytes += Number(row.estimated_bytes || 0);
  }
  return summary;
}

export async function runGovernanceScan(scanJob, workerId, { db = pool } = {}) {
  const scan = { ...scanJob, startedAt: new Date() };
  try {
    await heartbeat(scan.id, workerId, db);
    const tableNames = await loadTableNames(db);
    const parts = {};
    if (scan.scopes.includes('image')) parts.image = await scanLocalImages(scan, db);
    await heartbeat(scan.id, workerId, db);
    parts.ownerIntegrity = await scanOwnerIntegrity(scan, db, tableNames);
    await heartbeat(scan.id, workerId, db);
    parts.accountJobs = await scanAccountDeletionJobs(scan, db, tableNames);

    // 只有整次扫描成功后才把未再次命中的旧候选标记为 stale；扫描失败绝不改变旧候选的可见状态。
    const scopeTypes = new Set();
    for (const definition of OWNER_RESOURCE_DEFINITIONS)
      if (scan.scopes.includes(definition.scope)) scopeTypes.add(definition.resourceType);
    if (scan.scopes.includes('image')) scopeTypes.add('image');
    if (scan.scopes.includes('account_job')) scopeTypes.add('account_job');
    if (scopeTypes.size) {
      const placeholders = [...scopeTypes].map(() => '?').join(',');
      await db.query(
        `UPDATE resource_governance_findings
            SET state = 'stale', resolution_code = 'NOT_FOUND_IN_LATEST_SCAN', resolved_at = NOW()
          WHERE state = 'open' AND resource_type IN (${placeholders}) AND last_seen_at < ?`,
        [...scopeTypes, scan.startedAt],
      );
    }
    const summary = await summarizeOpenFindings(db);
    await db.query(
      `UPDATE resource_governance_scans
          SET status = 'completed', summary_json = ?, finished_at = NOW(), heartbeat_at = NOW(),
              lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL
        WHERE id = ? AND lease_owner = ?`,
      [json({ ...summary, parts }), scan.id, workerId],
    );
    await audit(db, {
      actorUserId: scan.createdBy,
      action: 'scan_completed',
      targetType: 'scan',
      targetId: scan.id,
      outcome: 'completed',
      summary,
    });
    return { ...summary, parts };
  } catch (error) {
    const errorCode = stableAgentErrorCode(error);
    await db
      .query(
        `UPDATE resource_governance_scans
            SET status = 'failed', finished_at = NOW(), heartbeat_at = NOW(),
                lease_owner = NULL, lease_expires_at = NULL, last_error_code = ?
          WHERE id = ? AND lease_owner = ?`,
        [errorCode, scan.id, workerId],
      )
      .catch(() => {});
    await audit(db, {
      actorUserId: scan.createdBy,
      action: 'scan_failed',
      targetType: 'scan',
      targetId: scan.id,
      outcome: 'failed',
      summary: { errorCode },
    }).catch(() => {});
    throw error;
  }
}

export async function queryGovernanceFindings(filters = {}, { db = pool } = {}) {
  await ensureResourceGovernanceSchema({ db });
  const page = Math.max(1, Math.min(100000, Number(filters.page || 1)));
  const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize || 20)));
  const where = [];
  const params = [];
  const allowedStates = new Set(['open', 'ignored', 'queued', 'resolved', 'stale']);
  const allowedRisks = new Set(['safe', 'review', 'blocked']);
  const allowedTypes = new Set(['image', 'bookmark', 'note', 'file', 'folder', 'todo', 'account_job']);
  if (allowedStates.has(filters.state)) {
    where.push('state = ?');
    params.push(filters.state);
  } else {
    where.push("state IN ('open', 'queued')");
  }
  if (allowedRisks.has(filters.riskLevel)) {
    where.push('risk_level = ?');
    params.push(filters.riskLevel);
  }
  if (allowedTypes.has(filters.resourceType)) {
    where.push('resource_type = ?');
    params.push(filters.resourceType);
  }
  const keyword = String(filters.keyword || '')
    .trim()
    .slice(0, 80);
  if (keyword) {
    where.push('(target_id LIKE ? OR issue_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[countRow]] = await db.query(`SELECT COUNT(*) AS total FROM resource_governance_findings ${whereSql}`, params);
  const [items] = await db.query(
    `SELECT id, scan_id, issue_code, resource_type, target_id, owner_id, risk_level, state,
            estimated_bytes, evidence_json, observation_count, first_seen_at, last_seen_at,
            last_verified_at, resolution_code
       FROM resource_governance_findings
       ${whereSql}
      ORDER BY last_seen_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const decoratedItems = await decorateFindingActions(items, db);
  const summary = await summarizeOpenFindings(db);
  const [latestScans] = await db.query(
    `SELECT id, status, scope_json, summary_json, started_at, heartbeat_at, finished_at, last_error_code, create_time
       FROM resource_governance_scans ORDER BY create_time DESC LIMIT 1`,
  );
  return {
    items: decoratedItems.map((item) => ({ ...item, evidence_json: parseJson(item.evidence_json) })),
    total: Number(countRow?.total || 0),
    page,
    pageSize,
    summary,
    latestScan: latestScans[0]
      ? {
          ...latestScans[0],
          scope_json: parseJson(latestScans[0].scope_json),
          summary_json: parseJson(latestScans[0].summary_json),
        }
      : null,
  };
}

export async function getGovernanceScan(id, { db = pool } = {}) {
  await ensureResourceGovernanceSchema({ db });
  const [rows] = await db.query(
    `SELECT id, created_by, status, scope_json, summary_json, started_at, heartbeat_at,
            finished_at, last_error_code, create_time
       FROM resource_governance_scans WHERE id = ? LIMIT 1`,
    [String(id || '')],
  );
  if (!rows.length) return null;
  return {
    ...rows[0],
    scope_json: parseJson(rows[0].scope_json),
    summary_json: parseJson(rows[0].summary_json),
  };
}

export async function getGovernanceFinding(id, { db = pool } = {}) {
  await ensureResourceGovernanceSchema({ db });
  const [rows] = await db.query(
    `SELECT id, scan_id, issue_code, resource_type, target_id, owner_id, risk_level, state,
            estimated_bytes, evidence_json, observation_count, first_seen_at, last_seen_at,
            last_verified_at, resolution_code
       FROM resource_governance_findings WHERE id = ? LIMIT 1`,
    [String(id || '')],
  );
  if (!rows[0]) return null;
  const [decorated] = await decorateFindingActions(rows, db);
  return { ...decorated, evidence_json: parseJson(decorated.evidence_json) };
}

export async function ignoreGovernanceFinding({ id, actorUserId, reasonCode, db = pool }) {
  const allowedReasons = new Set(['accepted_risk', 'false_positive', 'handled_elsewhere']);
  if (!allowedReasons.has(reasonCode)) return false;
  await ensureResourceGovernanceSchema({ db });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE resource_governance_findings
          SET state = 'ignored', resolution_code = ?, resolved_by = ?, resolved_at = NOW()
        WHERE id = ? AND state = 'open'`,
      [reasonCode.toUpperCase(), actorUserId, id],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      await connection.rollback();
      return false;
    }
    await audit(connection, {
      actorUserId,
      action: 'finding_ignored',
      targetType: 'finding',
      targetId: id,
      outcome: 'ignored',
      summary: { reasonCode },
    });
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function queryGovernanceAudits({ page = 1, pageSize = 20 } = {}, { db = pool } = {}) {
  const normalizedPage = Math.max(1, Number(page || 1));
  const normalizedSize = Math.max(1, Math.min(100, Number(pageSize || 20)));
  const [[countRow]] = await db.query('SELECT COUNT(*) AS total FROM resource_governance_audit');
  const [items] = await db.query(
    `SELECT id, actor_user_id, action, target_type, target_id, outcome, summary_json, create_time
       FROM resource_governance_audit ORDER BY create_time DESC, id DESC LIMIT ? OFFSET ?`,
    [normalizedSize, (normalizedPage - 1) * normalizedSize],
  );
  return {
    items: items.map((item) => ({ ...item, summary_json: parseJson(item.summary_json) })),
    total: Number(countRow?.total || 0),
    page: normalizedPage,
    pageSize: normalizedSize,
  };
}

export { audit as recordGovernanceAudit };
