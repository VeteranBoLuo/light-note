import path from "node:path";

function integer(environment, key, fallback, min, max) {
  const value = Number(environment[key]);
  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function absolutePath(environment, key, fallback) {
  const value = String(environment[key] || fallback).trim();
  if (!path.isAbsolute(value) || value.includes("\0") || value.includes("\n")) {
    throw Object.assign(new Error(`${key} must be an absolute path`), {
      code: "HOST_AGENT_CONFIG_INVALID",
    });
  }
  return path.normalize(value);
}

function enumValue(environment, key, fallback, allowedValues) {
  const value = String(environment[key] || fallback).trim();
  if (!allowedValues.includes(value)) {
    throw Object.assign(new Error(`${key} is invalid`), {
      code: "HOST_AGENT_CONFIG_INVALID",
    });
  }
  return value;
}

export const SERVICE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "lightnote-api",
    kind: "pm2",
    target: "app",
    restartable: false,
  }),
  Object.freeze({
    id: "lightnote-document-worker",
    kind: "pm2",
    target: "light-note-document-worker",
    restartable: true,
  }),
  Object.freeze({
    id: "lightnote-bookmark-icon-worker",
    kind: "pm2",
    target: "light-note-bookmark-icon-worker",
    restartable: true,
  }),
  Object.freeze({
    id: "lightnote-resource-governance-worker",
    kind: "pm2",
    target: "light-note-resource-governance-worker",
    restartable: true,
  }),
  Object.freeze({
    id: "nginx",
    kind: "systemd",
    target: "nginx.service",
    restartable: false,
  }),
  Object.freeze({
    id: "mysql",
    kind: "systemd",
    target: "mysql.service",
    restartable: false,
  }),
  Object.freeze({
    id: "redis",
    kind: "systemd",
    target: "redis-server.service",
    restartable: false,
  }),
]);

export function loadHostAgentConfig(environment = process.env) {
  const sampleIntervalMs = integer(
    environment,
    "HOST_AGENT_SAMPLE_INTERVAL_MS",
    3_000,
    1_000,
    60_000,
  );
  const historyMinutes = integer(
    environment,
    "HOST_AGENT_HISTORY_MINUTES",
    60,
    5,
    24 * 60,
  );
  return Object.freeze({
    socketPath: absolutePath(
      environment,
      "HOST_AGENT_SOCKET_PATH",
      "/run/lightnote-host-agent/agent.sock",
    ),
    stateDir: absolutePath(
      environment,
      "HOST_AGENT_STATE_DIR",
      "/var/lib/lightnote-host-agent/jobs",
    ),
    privilegedHelperSocketPath: absolutePath(
      environment,
      "HOST_AGENT_PRIVILEGED_HELPER_SOCKET",
      "/run/lightnote-host-helper.sock",
    ),
    systemctlBin: absolutePath(
      environment,
      "HOST_AGENT_SYSTEMCTL_BIN",
      "/usr/bin/systemctl",
    ),
    journalctlBin: absolutePath(
      environment,
      "HOST_AGENT_JOURNALCTL_BIN",
      "/usr/bin/journalctl",
    ),
    pm2Bin: absolutePath(environment, "HOST_AGENT_PM2_BIN", "/usr/bin/pm2"),
    pm2Home: absolutePath(
      environment,
      "HOST_AGENT_PM2_HOME",
      "/var/lib/lightnote-pm2",
    ),
    pm2AccessMode: enumValue(
      environment,
      "HOST_AGENT_PM2_ACCESS_MODE",
      "direct",
      ["direct", "helper", "disabled"],
    ),
    mountPoint: absolutePath(environment, "HOST_AGENT_MOUNT_POINT", "/"),
    sampleIntervalMs,
    maxHistorySamples: Math.ceil((historyMinutes * 60_000) / sampleIntervalMs),
    jobTtlMs: integer(
      environment,
      "HOST_AGENT_JOB_TTL_MS",
      24 * 60 * 60_000,
      15 * 60_000,
      7 * 24 * 60 * 60_000,
    ),
    requestBodyLimitBytes: integer(
      environment,
      "HOST_AGENT_REQUEST_BODY_LIMIT_BYTES",
      32 * 1024,
      1024,
      128 * 1024,
    ),
    socketMode: 0o660,
    services: SERVICE_DEFINITIONS,
  });
}
