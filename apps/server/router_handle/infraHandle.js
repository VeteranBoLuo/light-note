import crypto from 'node:crypto';
import {
  HOST_AGENT_ACTIONS,
  isHostAgentServiceId,
  normalizeHostAgentLogLimit,
  validateHostAgentJobRequest,
} from '@lightnote/shared/host-agent-protocol';
import pool from '../db/index.js';
import { resultData, L } from '../util/common.js';
import { adminActionErrorResponse, beginAdminAction, finishAdminAction } from '../util/adminActionExecution.js';
import {
  HostAgentClientError,
  executeHostAgentJob,
  getHostAgentDashboard,
  getHostAgentLogs,
  getHostAgentSecurity,
  getHostAgentServices,
  getHostAgentStorage,
} from '../util/hostAgentClient.js';
import {
  deriveInfraDiagnostics,
  deriveSecurityFindings,
  diagnosticSourceErrorCode,
  loadInfraDiagnostics,
  thresholdState,
} from '../util/infraDiagnostics.js';
import {
  SILENCE_DURATION_DAYS,
  UPSERT_SILENCE_SQL,
  applyDiagnosticSilences,
  applyFindingSilences,
  isSilenceableCheckId,
  loadInfraAlertSilences,
} from '../util/infraAlertSilences.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9-]{16,64}$/u;
const ACTION_BODY_KEYS = new Set(['action', 'targetId', 'idempotencyKey', 'reason', 'confirmed', 'confirmText']);
const SILENCE_BODY_KEYS = new Set(['checkId', 'days', 'reason', 'confirmed', 'confirmText']);
const ACTION_REGISTRY_MAP = Object.freeze({
  [HOST_AGENT_ACTIONS.NGINX_RELOAD]: 'infra.nginx_reload',
  [HOST_AGENT_ACTIONS.SERVICE_RESTART]: 'infra.service_restart',
});

function ensureRootActor(req, res) {
  if (req.user?.id && req.user.role === 'root' && !req.adminContext) return true;
  res.send(
    resultData(
      null,
      403,
      L(req, '仅 Root 管理员本人可访问服务器管理', 'Only the Root administrator can access server management.'),
    ),
  );
  return false;
}

function offlinePayload(error) {
  return {
    agentStatus: error?.code === 'HOST_AGENT_PROTOCOL_INCOMPATIBLE' ? 'incompatible' : 'offline',
    code: String(error?.code || 'HOST_AGENT_OFFLINE'),
    dashboard: null,
  };
}

export async function getInfraDashboard(req, res) {
  if (!ensureRootActor(req, res)) return;
  if (req.query && Object.keys(req.query).length > 0) {
    return res.send(resultData(null, 400, L(req, '查询参数无效', 'Invalid query parameters.')));
  }
  try {
    const dashboard = await getHostAgentDashboard();
    return res.send(resultData({ agentStatus: 'online', code: 'OK', dashboard }));
  } catch (error) {
    if (error instanceof HostAgentClientError) {
      return res.send(resultData(offlinePayload(error)));
    }
    console.error('[infra] dashboard failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(offlinePayload(error)));
  }
}

async function sendReadOnlySnapshot(req, res, loader, label) {
  if (!ensureRootActor(req, res)) return;
  if (req.query && Object.keys(req.query).length > 0) {
    return res.send(resultData(null, 400, L(req, '查询参数无效', 'Invalid query parameters.')));
  }
  try {
    return res.send(resultData(await loader()));
  } catch (error) {
    const status = error instanceof HostAgentClientError ? 503 : 500;
    console.error('[infra] %s failed code=%s', label, stableAgentErrorCode(error));
    return res.send(
      resultData(
        { code: String(error?.code || 'HOST_AGENT_REQUEST_FAILED') },
        status,
        L(req, '服务器快照暂时不可用', 'The server snapshot is temporarily unavailable.'),
      ),
    );
  }
}

export function getInfraServices(req, res) {
  return sendReadOnlySnapshot(req, res, getHostAgentServices, 'services');
}

export function getInfraStorage(req, res) {
  return sendReadOnlySnapshot(req, res, getHostAgentStorage, 'storage');
}

export async function getInfraSecurity(req, res) {
  if (!ensureRootActor(req, res)) return;
  if (req.query && Object.keys(req.query).length > 0) {
    return res.send(resultData(null, 400, L(req, '查询参数无效', 'Invalid query parameters.')));
  }
  try {
    const snapshot = await getHostAgentSecurity();
    const findings = applyFindingSilences(deriveSecurityFindings(snapshot), await loadSilencesForView());
    const visible = findings.filter((item) => !item.silence);
    return res.send(
      resultData({
        ...snapshot,
        findings,
        summary: {
          failed: visible.filter((item) => item.state === 'fail').length,
          warning: visible.filter((item) => item.state === 'warning').length,
          passed: visible.filter((item) => item.state === 'pass').length,
          unknown: visible.filter((item) => item.state === 'unknown').length,
          silenced: findings.length - visible.length,
        },
      }),
    );
  } catch (error) {
    const status = error instanceof HostAgentClientError ? 503 : 500;
    console.error('[infra] security failed code=%s', stableAgentErrorCode(error));
    return res.send(
      resultData(
        { code: String(error?.code || 'HOST_AGENT_SECURITY_FAILED') },
        status,
        L(req, '安全快照暂时不可用', 'The security snapshot is temporarily unavailable.'),
      ),
    );
  }
}

export async function getInfraDiagnostics(req, res) {
  if (!ensureRootActor(req, res)) return;
  if (req.query && Object.keys(req.query).length > 0) {
    return res.send(resultData(null, 400, L(req, '查询参数无效', 'Invalid query parameters.')));
  }
  const diagnostics = await loadInfraDiagnostics({
    onSourceError: (domain, code) => console.error('[infra] diagnostics source failed domain=%s code=%s', domain, code),
  });
  return res.send(resultData(applyDiagnosticSilences(diagnostics, await loadSilencesForView())));
}

// 静默记录读取失败时按未静默展示：计数偏多可以接受，不能因此把真实异常藏起来。
async function loadSilencesForView() {
  try {
    return await loadInfraAlertSilences(pool, { withActors: true });
  } catch (error) {
    console.error('[infra] silences unavailable code=%s', stableAgentErrorCode(error));
    return [];
  }
}

function isPlainBody(body, allowedKeys) {
  return (
    Boolean(body) &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).every((key) => allowedKeys.has(key))
  );
}

async function sendSilenceFailure(req, res, error, context, connection) {
  if (connection) {
    try {
      await connection.rollback();
    } catch {}
  }
  if (context) {
    try {
      await finishAdminAction(context, { outcome: 'failed', metadata: { errorCode: stableAgentErrorCode(error) } });
    } catch (auditError) {
      console.error('[infra] silence audit failed code=%s', stableAgentErrorCode(auditError));
    }
  }
  if (error?.code === 'ER_NO_SUCH_TABLE') {
    return res.send(
      resultData(
        { code: 'INFRA_SILENCE_SCHEMA_NOT_READY' },
        503,
        L(req, '风险静默尚未初始化，请稍后再试', 'Alert silencing is not ready yet. Try again later.'),
      ),
    );
  }
  const response = adminActionErrorResponse(error, L(req, '静默操作失败', 'The silence action failed.'));
  console.error('[infra] silence action failed code=%s', stableAgentErrorCode(error));
  return res.send(resultData({ code: response.code }, response.status, response.message));
}

export async function silenceInfraCheck(req, res) {
  if (!ensureRootActor(req, res)) return;
  const checkId = String(req.body?.checkId || '').trim();
  const days = Number(req.body?.days);
  if (
    !isPlainBody(req.body, SILENCE_BODY_KEYS) ||
    !isSilenceableCheckId(checkId) ||
    !SILENCE_DURATION_DAYS.includes(days)
  ) {
    return res.send(resultData(null, 400, L(req, '静默参数无效', 'Invalid silence parameters.')));
  }
  // DATETIME 只存到秒；先截掉毫秒，告警评估按截止时刻做条件写入时才能精确匹配。
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const until = new Date(now.getTime() + days * 86_400_000);
  let context;
  let connection;
  try {
    context = await beginAdminAction(req, {
      action: 'infra.alert_silence',
      targetId: checkId,
      metadata: { days, silencedUntil: until.toISOString() },
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(UPSERT_SILENCE_SQL, [checkId, context.reason, until, String(req.user.id), now]);
    const audit = await finishAdminAction(context, { outcome: 'succeeded', db: connection });
    await connection.commit();
    return res.send(
      resultData({
        checkId,
        silence: {
          reason: context.reason,
          until: until.toISOString(),
          createdAt: now.toISOString(),
          actorUserId: String(req.user.id),
          actorAlias: req.user.alias || null,
        },
        audit,
      }),
    );
  } catch (error) {
    return sendSilenceFailure(req, res, error, context, connection);
  } finally {
    connection?.release();
  }
}

export async function unsilenceInfraCheck(req, res) {
  if (!ensureRootActor(req, res)) return;
  const checkId = String(req.body?.checkId || '').trim();
  if (!isPlainBody(req.body, new Set(['checkId'])) || !isSilenceableCheckId(checkId)) {
    return res.send(resultData(null, 400, L(req, '静默参数无效', 'Invalid silence parameters.')));
  }
  // 取消静默只恢复告警、不扩大风险，界面只做二次确认；审计原因由服务端写入固定说明。
  req.body = {
    checkId,
    reason: L(req, '手动取消静默，恢复告警', 'Silence ended manually; alerts resume.'),
  };
  let context;
  let connection;
  try {
    context = await beginAdminAction(req, { action: 'infra.alert_unsilence', targetId: checkId });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [deleted] = await connection.query('DELETE FROM infra_alert_silences WHERE check_id=?', [checkId]);
    const removed = Number(deleted?.affectedRows || 0) > 0;
    const audit = await finishAdminAction(context, { outcome: 'succeeded', metadata: { removed }, db: connection });
    await connection.commit();
    return res.send(resultData({ checkId, removed, audit }));
  } catch (error) {
    return sendSilenceFailure(req, res, error, context, connection);
  } finally {
    connection?.release();
  }
}

export async function getInfraLogs(req, res) {
  if (!ensureRootActor(req, res)) return;
  if (req.query && Object.keys(req.query).some((key) => key !== 'limit')) {
    return res.send(resultData(null, 400, L(req, '查询参数无效', 'Invalid query parameters.')));
  }
  const serviceId = String(req.params?.serviceId || '');
  if (!isHostAgentServiceId(serviceId)) {
    return res.send(resultData(null, 400, L(req, '不支持的服务', 'Unsupported service.')));
  }
  try {
    const logs = await getHostAgentLogs(serviceId, normalizeHostAgentLogLimit(req.query?.limit));
    return res.send(resultData(logs));
  } catch (error) {
    const status = error instanceof HostAgentClientError ? 503 : 500;
    console.error('[infra] logs failed service=%s code=%s', serviceId, stableAgentErrorCode(error));
    return res.send(
      resultData(
        { code: String(error?.code || 'HOST_AGENT_LOGS_FAILED') },
        status,
        L(req, '日志暂时不可用', 'Logs are temporarily unavailable.'),
      ),
    );
  }
}

function jobIdFor(req, action, targetId, idempotencyKey) {
  return crypto
    .createHash('sha256')
    .update([String(req.user.id), action, targetId, idempotencyKey].join('\n'))
    .digest('hex');
}

export async function executeInfraAction(req, res) {
  if (!ensureRootActor(req, res)) return;
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => !ACTION_BODY_KEYS.has(key))
  ) {
    return res.send(resultData(null, 400, L(req, '操作参数无效', 'Invalid action parameters.')));
  }
  const action = String(req.body?.action || '').trim();
  const targetId = String(req.body?.targetId || '').trim();
  const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
  const registryAction = ACTION_REGISTRY_MAP[action];
  if (!registryAction || !isHostAgentServiceId(targetId) || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return res.send(resultData(null, 400, L(req, '操作参数无效', 'Invalid action parameters.')));
  }

  let job;
  try {
    job = validateHostAgentJobRequest({
      jobId: jobIdFor(req, action, targetId, idempotencyKey),
      action,
      targetId,
    });
  } catch {
    return res.send(resultData(null, 400, L(req, '操作目标不在安全白名单内', 'The action target is not allowlisted.')));
  }

  let context;
  try {
    context = await beginAdminAction(req, {
      action: registryAction,
      targetId,
      metadata: {
        hostScope: 'local',
        hostAction: action,
        idempotencyKeyHash: crypto.createHash('sha256').update(idempotencyKey).digest('hex'),
      },
    });
    const execution = await executeHostAgentJob(job);
    const receipt = execution?.receipt;
    const terminalMetadata = {
      jobId: job.jobId,
      replayed: execution?.replayed === true,
      agentState: String(receipt?.state || 'failed'),
      exitCode: Number.isInteger(receipt?.exitCode) ? receipt.exitCode : null,
      durationMs: Number(receipt?.durationMs || 0),
    };
    if (receipt?.state !== 'succeeded') {
      const audit = await finishAdminAction(context, { outcome: 'failed', metadata: terminalMetadata });
      const resultUnknown = receipt?.state === 'unknown';
      return res.send(
        resultData(
          {
            receipt,
            audit,
            retrySafe: true,
            requiresManualVerification: resultUnknown,
            idempotencyKey,
          },
          500,
          resultUnknown
            ? L(
                req,
                '操作结果未知，系统已阻止重复执行，请先人工核验服务状态',
                'The action result is unknown and replay is blocked. Verify the service state manually.',
              )
            : L(
                req,
                '服务器操作已失败，请查看回执并重新确认后再试',
                'The server action failed. Review the receipt and confirm a new attempt.',
              ),
        ),
      );
    }
    const audit = await finishAdminAction(context, { outcome: 'succeeded', metadata: terminalMetadata });
    return res.send(resultData({ receipt, audit, replayed: execution?.replayed === true, retrySafe: true }));
  } catch (error) {
    if (context) {
      try {
        await finishAdminAction(context, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch (auditError) {
        console.error('[infra] terminal audit failed code=%s', stableAgentErrorCode(auditError));
      }
    }
    const response = adminActionErrorResponse(error, L(req, '服务器操作失败', 'Server action failed.'));
    const status = error instanceof HostAgentClientError ? 503 : response.status;
    console.error('[infra] action failed action=%s target=%s code=%s', action, targetId, stableAgentErrorCode(error));
    return res.send(
      resultData(
        { code: String(error?.code || response.code), retrySafe: true, idempotencyKey },
        status,
        response.message,
      ),
    );
  }
}

export const infraHandleInternals = {
  ensureRootActor,
  jobIdFor,
  deriveSecurityFindings,
  deriveInfraDiagnostics,
  thresholdState,
  diagnosticSourceErrorCode,
  IDEMPOTENCY_KEY_PATTERN,
  ACTION_BODY_KEYS,
  SILENCE_BODY_KEYS,
};
