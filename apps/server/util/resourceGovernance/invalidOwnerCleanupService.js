import pool from '../../db/index.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { cleanupInvalidOwnerResourcesNow } from '../accountDeletion.js';
import { ensureResourceGovernanceSchema } from '../resourceGovernanceSchema.js';

const INVALID_OWNER_ISSUES = new Set(['OWNER_MISSING', 'SOFT_DELETED_OWNER_HAS_RESOURCES', 'ACCOUNT_DELETION_STALLED']);

function governanceError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeFindingIds(findingIds) {
  const ids = [...new Set((Array.isArray(findingIds) ? findingIds : []).map((id) => String(id || '').trim()))]
    .filter(Boolean)
    .slice(0, 51);
  if (!ids.length || ids.length > 50) {
    throw governanceError('RESOURCE_GOVERNANCE_FINDING_SCOPE_INVALID', '失效资源候选范围无效');
  }
  return ids;
}

async function writeAudit(db, { actorUserId, ownerId, outcome, summary }) {
  await db.query(
    `INSERT INTO resource_governance_audit
      (actor_user_id, action, target_type, target_id, outcome, summary_json)
     VALUES (?, 'invalid_owner_cleanup', 'invalid_owner', ?, ?, ?)`,
    [actorUserId, ownerId, outcome, JSON.stringify(summary || {})],
  );
}

/**
 * Root 手工确认后的失效 owner 清理入口。
 * 只接受扫描表中仍为 open 的 owner 缺失/软删除/已注销候选；真正执行前还会由
 * accountDeletion 领域服务再次锁定账号行，避免扫描后账号状态变化造成误删。
 */
export async function cleanupInvalidOwnerFindings({ findingIds, confirmationPhrase, actorUserId, db = pool }) {
  await ensureResourceGovernanceSchema({ db });
  const ids = normalizeFindingIds(findingIds);
  const expectedPhrases = new Set([`删除 ${ids.length} 项失效资源`, `Delete ${ids.length} invalid resources`]);
  if (!expectedPhrases.has(String(confirmationPhrase || '').trim())) {
    throw governanceError('RESOURCE_GOVERNANCE_CONFIRMATION_MISMATCH', '确认短语不匹配');
  }

  const placeholders = ids.map(() => '?').join(',');
  const [findings] = await db.query(
    `SELECT id, issue_code, resource_type, target_id, owner_id, state
       FROM resource_governance_findings
      WHERE id IN (${placeholders})`,
    ids,
  );
  if (
    findings.length !== ids.length ||
    findings.some(
      (finding) =>
        finding.state !== 'open' ||
        !INVALID_OWNER_ISSUES.has(String(finding.issue_code || '')) ||
        !String(finding.owner_id || '').trim(),
    )
  ) {
    throw governanceError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', '候选状态已经变化', 409);
  }

  const ownerGroups = new Map();
  for (const finding of findings) {
    const ownerId = String(finding.owner_id).trim();
    const group = ownerGroups.get(ownerId) || { ownerId, findingIds: [], expectedRequestId: null };
    group.findingIds.push(String(finding.id));
    if (finding.issue_code === 'ACCOUNT_DELETION_STALLED') {
      const requestId = String(finding.target_id || '').trim();
      if (!requestId || (group.expectedRequestId && group.expectedRequestId !== requestId)) {
        throw governanceError('RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED', '注销任务范围已经变化', 409);
      }
      group.expectedRequestId = requestId;
    }
    ownerGroups.set(ownerId, group);
  }

  const results = [];
  for (const group of ownerGroups.values()) {
    try {
      const execution = await cleanupInvalidOwnerResourcesNow({
        userId: group.ownerId,
        expectedRequestId: group.expectedRequestId,
        db,
      });
      const completed = execution?.completed === true;
      if (completed) {
        await db.query(
          `UPDATE resource_governance_findings
              SET state = 'resolved', resolution_code = 'INVALID_OWNER_RESOURCES_DELETED',
                  resolved_by = ?, resolved_at = NOW()
            WHERE state = 'open'
              AND owner_id = ?
              AND issue_code IN ('OWNER_MISSING', 'SOFT_DELETED_OWNER_HAS_RESOURCES', 'ACCOUNT_DELETION_STALLED')`,
          [actorUserId, group.ownerId],
        );
      }
      await writeAudit(db, {
        actorUserId,
        ownerId: group.ownerId,
        outcome: completed ? 'completed' : 'processing',
        summary: { selectedFindingCount: group.findingIds.length, requestId: execution?.requestId || null },
      });
      results.push({
        ownerId: group.ownerId,
        findingIds: group.findingIds,
        status: completed ? 'completed' : 'processing',
      });
    } catch (error) {
      const errorCode = stableAgentErrorCode(error);
      await writeAudit(db, {
        actorUserId,
        ownerId: group.ownerId,
        outcome: 'failed',
        summary: { selectedFindingCount: group.findingIds.length, errorCode },
      }).catch(() => {});
      results.push({ ownerId: group.ownerId, findingIds: group.findingIds, status: 'failed', errorCode });
    }
  }

  return {
    total: ids.length,
    ownerTotal: results.length,
    completed: results
      .filter((item) => item.status === 'completed')
      .reduce((total, item) => total + item.findingIds.length, 0),
    processing: results
      .filter((item) => item.status === 'processing')
      .reduce((total, item) => total + item.findingIds.length, 0),
    failed: results
      .filter((item) => item.status === 'failed')
      .reduce((total, item) => total + item.findingIds.length, 0),
    results,
  };
}
