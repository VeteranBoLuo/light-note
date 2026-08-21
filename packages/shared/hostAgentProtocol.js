/**
 * 轻笺服务器管理的本机 Agent 契约。
 *
 * 这里仅保存前后端/Agent 都需要的公开协议，不包含主机名、账号、路径或凭据。
 * v1 是封闭世界：未知服务、动作和额外参数全部失败关闭。
 */
export const HOST_AGENT_PROTOCOL_VERSION = 1;
export const HOST_AGENT_API_PREFIX = "/v1";

export const HOST_AGENT_ENDPOINTS = Object.freeze({
  health: `${HOST_AGENT_API_PREFIX}/health`,
  dashboard: `${HOST_AGENT_API_PREFIX}/dashboard`,
  services: `${HOST_AGENT_API_PREFIX}/services`,
  storage: `${HOST_AGENT_API_PREFIX}/storage`,
  security: `${HOST_AGENT_API_PREFIX}/security`,
  jobs: `${HOST_AGENT_API_PREFIX}/jobs`,
  logsPrefix: `${HOST_AGENT_API_PREFIX}/logs`,
});

export const HOST_AGENT_SERVICE_IDS = Object.freeze([
  "lightnote-api",
  "lightnote-document-worker",
  "lightnote-bookmark-icon-worker",
  "lightnote-resource-governance-worker",
  "nginx",
  "mysql",
  "redis",
]);

export const HOST_AGENT_RESTARTABLE_SERVICE_IDS = Object.freeze([
  "lightnote-document-worker",
  "lightnote-bookmark-icon-worker",
  "lightnote-resource-governance-worker",
]);

export const HOST_AGENT_ACTIONS = Object.freeze({
  NGINX_RELOAD: "nginx.reload",
  SERVICE_RESTART: "service.restart",
});

export const HOST_AGENT_SERVICE_STATES = Object.freeze([
  "running",
  "stopped",
  "degraded",
  "unknown",
]);
export const HOST_AGENT_JOB_STATES = Object.freeze([
  "succeeded",
  "failed",
  "unknown",
]);

const SERVICE_ID_SET = new Set(HOST_AGENT_SERVICE_IDS);
const RESTARTABLE_SERVICE_ID_SET = new Set(HOST_AGENT_RESTARTABLE_SERVICE_IDS);
const ACTION_SET = new Set(Object.values(HOST_AGENT_ACTIONS));
const JOB_ID_PATTERN = /^[a-zA-Z0-9._:-]{16,128}$/u;

export class HostAgentProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HostAgentProtocolError";
    this.code = code;
  }
}

export function isHostAgentServiceId(value) {
  return SERVICE_ID_SET.has(String(value || ""));
}

export function isRestartableHostAgentServiceId(value) {
  return RESTARTABLE_SERVICE_ID_SET.has(String(value || ""));
}

export function normalizeHostAgentLogLimit(value, fallback = 120) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(300, Math.max(20, parsed));
}

export function assertHostAgentProtocolVersion(value) {
  if (Number(value) !== HOST_AGENT_PROTOCOL_VERSION) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_PROTOCOL_INCOMPATIBLE",
      `Host Agent protocol ${String(value || "unknown")} is not supported`,
    );
  }
  return HOST_AGENT_PROTOCOL_VERSION;
}

export function validateHostAgentJobRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_JOB_INVALID",
      "Job payload must be an object",
    );
  }
  const allowedKeys = new Set(["jobId", "action", "targetId"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_JOB_UNKNOWN_FIELD",
      "Job payload contains unknown fields",
    );
  }

  const jobId = String(input.jobId || "").trim();
  const action = String(input.action || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_JOB_ID_INVALID",
      "Job id is invalid",
    );
  }
  if (!ACTION_SET.has(action)) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_ACTION_FORBIDDEN",
      "Action is not allowlisted",
    );
  }
  if (action === HOST_AGENT_ACTIONS.NGINX_RELOAD && targetId !== "nginx") {
    throw new HostAgentProtocolError(
      "HOST_AGENT_TARGET_FORBIDDEN",
      "Nginx reload target is invalid",
    );
  }
  if (
    action === HOST_AGENT_ACTIONS.SERVICE_RESTART &&
    !RESTARTABLE_SERVICE_ID_SET.has(targetId)
  ) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_TARGET_FORBIDDEN",
      "Service restart target is not allowlisted",
    );
  }
  return Object.freeze({ jobId, action, targetId });
}

export function hostAgentLogsPath(serviceId, limit = 120) {
  if (!isHostAgentServiceId(serviceId)) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_SERVICE_FORBIDDEN",
      "Service is not allowlisted",
    );
  }
  return `${HOST_AGENT_ENDPOINTS.logsPrefix}/${encodeURIComponent(serviceId)}?limit=${normalizeHostAgentLogLimit(limit)}`;
}
