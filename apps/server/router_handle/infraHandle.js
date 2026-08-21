import crypto from 'node:crypto';
import {
  HOST_AGENT_ACTIONS,
  isHostAgentServiceId,
  normalizeHostAgentLogLimit,
  validateHostAgentJobRequest,
} from '@lightnote/shared/host-agent-protocol';
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
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9-]{16,64}$/u;
const ACTION_BODY_KEYS = new Set(['action', 'targetId', 'idempotencyKey', 'reason', 'confirmed', 'confirmText']);
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

function securityFinding(id, state, severity, evidence = {}) {
  return { id, state, severity, evidence };
}

export function deriveSecurityFindings(snapshot) {
  const findings = [];
  const ssh = snapshot?.ssh || {};
  findings.push(
    securityFinding(
      'ssh-root-login',
      !ssh.available ? 'unknown' : ssh.permitRootLogin === 'no' ? 'pass' : 'fail',
      'high',
      { value: ssh.permitRootLogin || null },
    ),
    securityFinding(
      'ssh-password-authentication',
      !ssh.available || ssh.passwordAuthentication == null ? 'unknown' : ssh.passwordAuthentication ? 'fail' : 'pass',
      'high',
      { value: ssh.passwordAuthentication ?? null },
    ),
    securityFinding(
      'ssh-public-key-authentication',
      !ssh.available || ssh.publicKeyAuthentication == null ? 'unknown' : ssh.publicKeyAuthentication ? 'pass' : 'fail',
      'high',
      { value: ssh.publicKeyAuthentication ?? null },
    ),
  );
  findings.push(
    securityFinding(
      'firewall',
      !snapshot?.firewall?.available ? 'unknown' : snapshot.firewall.state === 'enabled' ? 'pass' : 'fail',
      'high',
      { provider: snapshot?.firewall?.provider || null, value: snapshot?.firewall?.state || 'unknown' },
    ),
    securityFinding(
      'fail2ban',
      !snapshot?.fail2ban?.available ? 'unknown' : snapshot.fail2ban.state === 'enabled' ? 'pass' : 'fail',
      'medium',
      { value: snapshot?.fail2ban?.state || 'unknown' },
    ),
  );
  const securityUpdates = snapshot?.updates?.security;
  findings.push(
    securityFinding(
      'security-updates',
      !snapshot?.updates?.available || securityUpdates == null ? 'unknown' : securityUpdates > 0 ? 'fail' : 'pass',
      'high',
      { pending: snapshot?.updates?.pending ?? null, security: securityUpdates ?? null },
    ),
  );
  const allowedPublicPorts = new Set([80, 443, Number(ssh.port || 22)]);
  const unexpectedPublicPorts = (snapshot?.listeningPorts || []).filter(
    (item) => item.exposure === 'public' && !allowedPublicPorts.has(Number(item.port)),
  );
  const internalPorts = new Set([3000, 3306, 6379, 9001]);
  findings.push(
    securityFinding(
      'unexpected-public-ports',
      unexpectedPublicPorts.length ? 'fail' : 'pass',
      unexpectedPublicPorts.some((item) => internalPorts.has(Number(item.port))) ? 'high' : 'medium',
      { ports: unexpectedPublicPorts.map((item) => `${item.protocol}/${item.port}`).slice(0, 20) },
    ),
  );
  const failures24h = ssh.failures24h;
  findings.push(
    securityFinding(
      'ssh-login-failures',
      failures24h == null ? 'unknown' : failures24h >= 50 ? 'fail' : 'pass',
      'medium',
      { failures24h: failures24h ?? null, successes24h: ssh.successes24h ?? null },
    ),
  );
  return findings;
}

export async function getInfraSecurity(req, res) {
  if (!ensureRootActor(req, res)) return;
  if (req.query && Object.keys(req.query).length > 0) {
    return res.send(resultData(null, 400, L(req, '查询参数无效', 'Invalid query parameters.')));
  }
  try {
    const snapshot = await getHostAgentSecurity();
    const findings = deriveSecurityFindings(snapshot);
    return res.send(
      resultData({
        ...snapshot,
        findings,
        summary: {
          failed: findings.filter((item) => item.state === 'fail').length,
          passed: findings.filter((item) => item.state === 'pass').length,
          unknown: findings.filter((item) => item.state === 'unknown').length,
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
    return res.send(resultData({ receipt, audit, retrySafe: true }));
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
  IDEMPOTENCY_KEY_PATTERN,
  ACTION_BODY_KEYS,
};
