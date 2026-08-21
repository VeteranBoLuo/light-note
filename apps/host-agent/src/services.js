import { HOST_AGENT_ACTIONS } from "@lightnote/shared/host-agent-protocol";
import { runCommand, safeCommandEnvironment } from "./commandRunner.js";
import { requestPrivilegedHelper } from "./helperClient.js";
import { redactOperationalText, stableErrorCode } from "./redaction.js";

function serviceState(value) {
  if (value === "active") return "running";
  if (value === "inactive" || value === "failed")
    return value === "failed" ? "degraded" : "stopped";
  return "unknown";
}

function parseSystemdShow(stdout) {
  const fields = Object.fromEntries(
    stdout
      .split("\n")
      .map((line) => line.split("="))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key, rest.join("=")]),
  );
  const pid = Number(fields.MainPID || 0);
  const memoryBytes = Number(fields.MemoryCurrent || 0);
  const restartCount = Number(fields.NRestarts || 0);
  const startedAtMs = Date.parse(fields.ActiveEnterTimestamp || "");
  return {
    state: serviceState(fields.ActiveState),
    detail:
      [fields.ActiveState, fields.SubState].filter(Boolean).join(" / ") ||
      "unknown",
    pid: pid > 0 ? pid : null,
    uptimeSeconds: null,
    cpuPercent: null,
    memoryBytes: memoryBytes > 0 ? memoryBytes : null,
    restartCount:
      Number.isSafeInteger(restartCount) && restartCount >= 0
        ? restartCount
        : null,
    startedAt: Number.isFinite(startedAtMs)
      ? new Date(startedAtMs).toISOString()
      : null,
  };
}

function parsePm2Item(item) {
  const status = String(item?.pm2_env?.status || "unknown");
  const state =
    status === "online"
      ? "running"
      : status === "errored"
        ? "degraded"
        : status === "stopped"
          ? "stopped"
          : "unknown";
  const startedAt = Number(item?.pm2_env?.pm_uptime || 0);
  const cpuPercent = Number(item?.monit?.cpu);
  const memoryBytes = Number(item?.monit?.memory);
  const restartCount = Number(item?.pm2_env?.restart_time);
  return {
    state,
    detail: status,
    pid: Number(item?.pid || 0) || null,
    uptimeSeconds:
      startedAt > 0
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        : null,
    cpuPercent:
      Number.isFinite(cpuPercent) && cpuPercent >= 0 ? cpuPercent : null,
    memoryBytes:
      Number.isFinite(memoryBytes) && memoryBytes >= 0 ? memoryBytes : null,
    restartCount:
      Number.isSafeInteger(restartCount) && restartCount >= 0
        ? restartCount
        : null,
    startedAt: startedAt > 0 ? new Date(startedAt).toISOString() : null,
  };
}

function parseHelperServiceStatus(stdout) {
  const payload = JSON.parse(stdout || "{}");
  const cpuPercent = payload?.cpuPercent ?? null;
  const memoryBytes = payload?.memoryBytes ?? null;
  const restartCount = payload?.restartCount ?? null;
  const startedAt = payload?.startedAt ?? null;
  if (
    !payload ||
    !["running", "degraded", "stopped", "unknown"].includes(payload.state) ||
    typeof payload.detail !== "string" ||
    payload.detail.length > 120 ||
    !(
      payload.pid === null ||
      (Number.isSafeInteger(payload.pid) && payload.pid > 0)
    ) ||
    !(
      payload.uptimeSeconds === null ||
      (Number.isSafeInteger(payload.uptimeSeconds) &&
        payload.uptimeSeconds >= 0)
    ) ||
    !(
      cpuPercent === null ||
      (Number.isFinite(cpuPercent) && cpuPercent >= 0)
    ) ||
    !(
      memoryBytes === null ||
      (Number.isSafeInteger(memoryBytes) && memoryBytes >= 0)
    ) ||
    !(
      restartCount === null ||
      (Number.isSafeInteger(restartCount) && restartCount >= 0)
    ) ||
    !(startedAt === null || Number.isFinite(Date.parse(startedAt)))
  ) {
    throw Object.assign(new Error("helper service status is invalid"), {
      code: "HOST_HELPER_RESPONSE_INVALID",
    });
  }
  return {
    state: payload.state,
    detail: payload.detail,
    pid: payload.pid,
    uptimeSeconds: payload.uptimeSeconds,
    cpuPercent,
    memoryBytes,
    restartCount,
    startedAt,
  };
}

function runHelper(
  config,
  action,
  targetId,
  options,
  helperRequester = requestPrivilegedHelper,
) {
  return helperRequester(
    config.privilegedHelperSocketPath,
    action,
    targetId,
    options,
  );
}

async function readPrivilegedCapabilities(
  config,
  helperRequester = requestPrivilegedHelper,
) {
  try {
    const result = await runHelper(
      config,
      "capabilities",
      undefined,
      {
        timeoutMs: 5000,
        maxOutputBytes: 16 * 1024,
      },
      helperRequester,
    );
    if (result.exitCode !== 0) return null;
    const capabilities = JSON.parse(result.stdout || "{}");
    return capabilities && typeof capabilities === "object"
      ? capabilities
      : null;
  } catch {
    return null;
  }
}

export async function canExecuteNginxReload(
  config,
  helperRequester = requestPrivilegedHelper,
) {
  const capabilities = await readPrivilegedCapabilities(
    config,
    helperRequester,
  );
  return capabilities?.nginxReload === true;
}

async function readPm2Items(config, runner, helperRequester) {
  if (config.pm2AccessMode === "disabled") {
    throw Object.assign(new Error("PM2 access is disabled"), {
      code: "PM2_ACCESS_DISABLED",
    });
  }
  const result =
    config.pm2AccessMode === "helper"
      ? await runHelper(
          config,
          "pm2-status",
          undefined,
          { timeoutMs: 5000, maxOutputBytes: 512 * 1024 },
          helperRequester,
        )
      : await runner(config.pm2Bin, ["jlist"], {
          timeoutMs: 5000,
          maxOutputBytes: 512 * 1024,
          env: safeCommandEnvironment({ PM2_HOME: config.pm2Home }),
        });
  if (result.exitCode !== 0)
    throw Object.assign(new Error("pm2 status failed"), {
      code: "PM2_QUERY_FAILED",
    });
  const items = JSON.parse(result.stdout || "[]");
  if (!Array.isArray(items))
    throw Object.assign(new Error("pm2 status is invalid"), {
      code: "PM2_QUERY_INVALID",
    });
  return items;
}

export async function collectServiceSnapshots(
  config,
  runner = runCommand,
  helperRequester = requestPrivilegedHelper,
) {
  const errors = [];
  let pm2Items = [];
  let pm2Available = false;
  try {
    pm2Items = await readPm2Items(config, runner, helperRequester);
    pm2Available = true;
  } catch (error) {
    errors.push({ source: "pm2", code: stableErrorCode(error) });
  }

  const privilegedCapabilities = await readPrivilegedCapabilities(
    config,
    helperRequester,
  );
  const nginxReload = privilegedCapabilities?.nginxReload === true;
  const snapshots = await Promise.all(
    config.services.map(async (definition) => {
      const actions = [];
      if (definition.id === "nginx" && nginxReload)
        actions.push(HOST_AGENT_ACTIONS.NGINX_RELOAD);
      if (definition.kind === "pm2" && definition.restartable && pm2Available) {
        actions.push(HOST_AGENT_ACTIONS.SERVICE_RESTART);
      }
      if (definition.kind === "pm2") {
        const item = pm2Items.find(
          (entry) => entry?.name === definition.target,
        );
        return {
          id: definition.id,
          ...(item
            ? parsePm2Item(item)
            : {
                state: pm2Available ? "stopped" : "unknown",
                detail: pm2Available ? "not found" : "unavailable",
                pid: null,
                uptimeSeconds: null,
                cpuPercent: null,
                memoryBytes: null,
                restartCount: null,
                startedAt: null,
              }),
          actions,
        };
      }
      if (
        config.pm2AccessMode === "helper" &&
        (definition.id === "nginx" || definition.id === "redis")
      ) {
        try {
          const result = await runHelper(
            config,
            "service-status",
            definition.id,
            { timeoutMs: 5000, maxOutputBytes: 16 * 1024 },
            helperRequester,
          );
          if (result.exitCode !== 0) {
            throw Object.assign(new Error("helper service status failed"), {
              code: "HOST_HELPER_QUERY_FAILED",
            });
          }
          return {
            id: definition.id,
            ...parseHelperServiceStatus(result.stdout),
            actions,
          };
        } catch (error) {
          errors.push({
            source: definition.id,
            code: stableErrorCode(error),
          });
        }
      }
      try {
        const result = await runner(
          config.systemctlBin,
          [
            "show",
            definition.target,
            "--property=ActiveState,SubState,MainPID,MemoryCurrent,NRestarts,ActiveEnterTimestamp",
            "--no-pager",
          ],
          { timeoutMs: 5000, env: safeCommandEnvironment() },
        );
        if (result.exitCode !== 0)
          throw Object.assign(new Error("systemctl show failed"), {
            code: "SYSTEMD_QUERY_FAILED",
          });
        return {
          id: definition.id,
          ...parseSystemdShow(result.stdout),
          actions,
        };
      } catch (error) {
        errors.push({ source: definition.id, code: stableErrorCode(error) });
        return {
          id: definition.id,
          state: "unknown",
          detail: "unavailable",
          pid: null,
          uptimeSeconds: null,
          cpuPercent: null,
          memoryBytes: null,
          restartCount: null,
          startedAt: null,
          actions,
        };
      }
    }),
  );
  return {
    services: snapshots,
    errors,
    capabilities: {
      nginxReload,
      workerRestart: pm2Available,
      securitySnapshot: privilegedCapabilities?.securitySnapshot === true,
    },
  };
}

export async function readServiceLogs(
  config,
  serviceId,
  limit,
  runner = runCommand,
  helperRequester = requestPrivilegedHelper,
) {
  const definition = config.services.find((item) => item.id === serviceId);
  if (!definition)
    throw Object.assign(new Error("Service is not allowlisted"), {
      code: "HOST_AGENT_SERVICE_FORBIDDEN",
    });
  let result;
  if (config.pm2AccessMode === "helper") {
    result = await runHelper(
      config,
      definition.kind === "pm2" ? "pm2-logs" : "journal-logs",
      serviceId,
      { timeoutMs: 8000, maxOutputBytes: 256 * 1024 },
      helperRequester,
    );
  } else if (definition.kind === "pm2") {
    result = await runner(
      config.pm2Bin,
      [
        "logs",
        definition.target,
        "--lines",
        String(limit),
        "--nostream",
        "--raw",
      ],
      {
        timeoutMs: 8000,
        maxOutputBytes: 256 * 1024,
        env: safeCommandEnvironment({ PM2_HOME: config.pm2Home }),
      },
    );
  } else {
    result = await runner(
      config.journalctlBin,
      [
        "--unit",
        definition.target,
        "--lines",
        String(limit),
        "--no-pager",
        "--output=short-iso",
      ],
      {
        timeoutMs: 8000,
        maxOutputBytes: 256 * 1024,
        env: safeCommandEnvironment(),
      },
    );
  }
  if (result.exitCode !== 0) {
    throw Object.assign(new Error("Service logs could not be read"), {
      code: "HOST_AGENT_LOG_READ_FAILED",
      exitCode: result.exitCode,
    });
  }
  const output = redactOperationalText(
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  return {
    serviceId,
    lines: output ? output.split("\n").slice(-limit) : [],
    truncated: output.length >= 24_000,
    exitCode: result.exitCode,
    capturedAt: new Date().toISOString(),
  };
}

export async function executeHostAction(
  config,
  request,
  runner = runCommand,
  helperRequester = requestPrivilegedHelper,
) {
  const startedAt = Date.now();
  let result;
  if (request.action === HOST_AGENT_ACTIONS.NGINX_RELOAD) {
    result = await runHelper(
      config,
      "nginx-reload",
      undefined,
      {
        timeoutMs: 20_000,
        maxOutputBytes: 64 * 1024,
      },
      helperRequester,
    );
  } else {
    const definition = config.services.find(
      (item) =>
        item.id === request.targetId && item.kind === "pm2" && item.restartable,
    );
    if (!definition) {
      throw Object.assign(
        new Error("Service restart target is not allowlisted"),
        { code: "HOST_AGENT_TARGET_FORBIDDEN" },
      );
    }
    if (config.pm2AccessMode === "disabled") {
      throw Object.assign(new Error("PM2 access is disabled"), {
        code: "PM2_ACCESS_DISABLED",
      });
    }
    result =
      config.pm2AccessMode === "helper"
        ? await runHelper(
            config,
            "pm2-restart",
            request.targetId,
            { timeoutMs: 20_000, maxOutputBytes: 64 * 1024 },
            helperRequester,
          )
        : await runner(config.pm2Bin, ["restart", definition.target], {
            timeoutMs: 20_000,
            maxOutputBytes: 64 * 1024,
            env: safeCommandEnvironment({ PM2_HOME: config.pm2Home }),
          });
  }
  const summary = redactOperationalText(
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
    2000,
  );
  return {
    state: result.exitCode === 0 ? "succeeded" : "failed",
    action: request.action,
    targetId: request.targetId,
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    summary,
    completedAt: new Date().toISOString(),
  };
}
