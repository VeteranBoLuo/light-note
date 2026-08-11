import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  createGovernanceScan,
  getGovernanceFinding,
  getGovernanceScan,
  ignoreGovernanceFinding,
  queryGovernanceAudits,
  queryGovernanceFindings,
} from '../util/resourceGovernance/scanService.js';
import { cleanupInvalidOwnerFindings } from '../util/resourceGovernance/invalidOwnerCleanupService.js';
import {
  cancelCleanupJob,
  createCleanupJob,
  getCleanupJob,
  previewCleanupJob,
  queryCleanupJobs,
  retryCleanupJob,
} from '../util/resourceGovernance/jobService.js';
import {
  resourceGovernanceCleanupEnabled,
  resourceGovernanceScanEnabled,
} from '../util/resourceGovernance/registry.js';

function rootUser(req, res) {
  if (req.user?.role === 'root' && req.user?.id) return req.user;
  res.status(403).send(resultData({ code: 'RESOURCE_GOVERNANCE_ROOT_REQUIRED' }, 403, '仅 Root 可访问资源治理'));
  return null;
}

function sendError(res, scene, error) {
  const code = String(error?.code || 'RESOURCE_GOVERNANCE_INTERNAL_ERROR');
  const status = Number(error?.status || 500);
  console.error('[resource-governance] %s failed code=%s', scene, stableAgentErrorCode(error));
  const messages = {
    RESOURCE_GOVERNANCE_SCAN_DISABLED: '资源治理扫描当前已关闭',
    RESOURCE_GOVERNANCE_CLEANUP_DISABLED: '低风险清理尚未启用，当前仅提供只读扫描',
    RESOURCE_GOVERNANCE_TOKEN_SECRET_UNAVAILABLE: '清理确认密钥未就绪，已按安全策略拒绝操作',
    RESOURCE_GOVERNANCE_PREVIEW_EXPIRED: '清理确认已过期，请重新预览',
    RESOURCE_GOVERNANCE_PREVIEW_INVALID: '清理确认无效，请重新预览',
    RESOURCE_GOVERNANCE_PREVIEW_OWNER_MISMATCH: '清理确认不属于当前管理会话',
    RESOURCE_GOVERNANCE_CONFIRMATION_MISMATCH: '确认短语不匹配',
    RESOURCE_GOVERNANCE_FINDING_SCOPE_INVALID: '清理候选范围无效',
    RESOURCE_GOVERNANCE_FINDING_SCOPE_CHANGED: '候选状态已经变化，请刷新后重新确认',
    ACCOUNT_DELETION_RETRY_SCOPE_INVALID: '注销清理重试范围无效',
    ACCOUNT_DELETION_RETRY_SCOPE_CHANGED: '注销清理任务状态已经变化，请重新扫描',
    ACCOUNT_DELETION_RETRY_NOT_ALLOWED: '注销清理任务当前不可重试',
    ACCOUNT_DELETION_ACTIVE_ACCOUNT_BLOCKED: '账号当前仍处于可用状态，已拒绝物理清理',
    FINDING_NOT_CLEANABLE: '该候选不允许自动清理',
    EXECUTOR_NOT_REGISTERED: '该资源类型没有注册清理执行器',
    IMAGE_KIND_EXECUTOR_DISABLED: '该图片类型当前仅支持只读复核',
    IMAGE_REFERENCED: '资源已重新被引用，已拒绝清理',
    RESOURCE_GOVERNANCE_JOB_NOT_FOUND: '清理任务不存在',
    RESOURCE_GOVERNANCE_JOB_NOT_CANCELLABLE: '任务已被领取，不能再取消',
    RESOURCE_GOVERNANCE_JOB_NOT_RETRYABLE: '该任务当前没有可重试的明确失败项',
    RESOURCE_GOVERNANCE_JOB_NO_RETRYABLE_ITEMS: '失败项已变化或达到重试上限，请重新扫描',
  };
  return res.status(status).send(resultData({ code }, status, messages[code] || '资源治理暂时无法处理该请求'));
}

export async function createScan(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    return res.send(resultData(await createGovernanceScan({ createdBy: user.id, scopes: req.body?.scopes })));
  } catch (error) {
    return sendError(res, 'create-scan', error);
  }
}

export async function getScan(req, res) {
  if (!rootUser(req, res)) return;
  try {
    const scan = await getGovernanceScan(req.params.id);
    if (!scan) return res.status(404).send(resultData({ code: 'SCAN_NOT_FOUND' }, 404, '扫描任务不存在'));
    return res.send(resultData(scan));
  } catch (error) {
    return sendError(res, 'get-scan', error);
  }
}

export async function queryFindings(req, res) {
  if (!rootUser(req, res)) return;
  try {
    const data = await queryGovernanceFindings(req.body || {});
    return res.send(
      resultData({
        ...data,
        capabilities: {
          scanEnabled: resourceGovernanceScanEnabled(),
          cleanupEnabled: resourceGovernanceCleanupEnabled(),
          reviewCleanupEnabled: true,
        },
      }),
    );
  } catch (error) {
    return sendError(res, 'query-findings', error);
  }
}

export async function getFinding(req, res) {
  if (!rootUser(req, res)) return;
  try {
    const finding = await getGovernanceFinding(req.params.id);
    if (!finding) return res.status(404).send(resultData({ code: 'FINDING_NOT_FOUND' }, 404, '候选不存在'));
    return res.send(resultData(finding));
  } catch (error) {
    return sendError(res, 'get-finding', error);
  }
}

export async function ignoreFinding(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    const ignored = await ignoreGovernanceFinding({
      id: String(req.body?.id || ''),
      actorUserId: user.id,
      reasonCode: String(req.body?.reasonCode || ''),
    });
    if (!ignored) return res.status(409).send(resultData({ code: 'FINDING_STATE_CHANGED' }, 409, '候选状态已变化'));
    return res.send(resultData({ ignored: true }));
  } catch (error) {
    return sendError(res, 'ignore-finding', error);
  }
}

export async function cleanupInvalidOwners(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    return res.send(
      resultData(
        await cleanupInvalidOwnerFindings({
          findingIds: req.body?.findingIds,
          confirmationPhrase: req.body?.confirmationPhrase,
          actorUserId: user.id,
        }),
      ),
    );
  } catch (error) {
    return sendError(res, 'cleanup-invalid-owners', error);
  }
}

export async function previewJob(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    return res.send(
      resultData(
        await previewCleanupJob({
          findingIds: req.body?.findingIds,
          actorUserId: user.id,
          sessionId: user.sessionId,
        }),
      ),
    );
  } catch (error) {
    return sendError(res, 'preview-job', error);
  }
}

export async function createJob(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    return res.send(
      resultData(
        await createCleanupJob({
          previewToken: req.body?.previewToken,
          confirmationPhrase: req.body?.confirmationPhrase,
          actorUserId: user.id,
          sessionId: user.sessionId,
        }),
      ),
    );
  } catch (error) {
    return sendError(res, 'create-job', error);
  }
}

export async function queryJobs(req, res) {
  if (!rootUser(req, res)) return;
  try {
    return res.send(resultData(await queryCleanupJobs(req.body || {})));
  } catch (error) {
    return sendError(res, 'query-jobs', error);
  }
}

export async function getJob(req, res) {
  if (!rootUser(req, res)) return;
  try {
    const job = await getCleanupJob(req.params.id);
    if (!job) return res.status(404).send(resultData({ code: 'JOB_NOT_FOUND' }, 404, '清理任务不存在'));
    return res.send(resultData(job));
  } catch (error) {
    return sendError(res, 'get-job', error);
  }
}

export async function retryJob(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    return res.send(resultData(await retryCleanupJob({ id: req.params.id, actorUserId: user.id })));
  } catch (error) {
    return sendError(res, 'retry-job', error);
  }
}

export async function cancelJob(req, res) {
  const user = rootUser(req, res);
  if (!user) return;
  try {
    return res.send(resultData(await cancelCleanupJob({ id: req.params.id, actorUserId: user.id })));
  } catch (error) {
    return sendError(res, 'cancel-job', error);
  }
}

export async function queryAudits(req, res) {
  if (!rootUser(req, res)) return;
  try {
    return res.send(resultData(await queryGovernanceAudits(req.body || {})));
  } catch (error) {
    return sendError(res, 'query-audits', error);
  }
}
