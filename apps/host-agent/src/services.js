import { constants } from "node:fs";
import fs from "node:fs/promises";
import { HOST_AGENT_ACTIONS } from "@lightnote/shared/host-agent-protocol";
import { runCommand, safeCommandEnvironment } from "./commandRunner.js";
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
  return {
    state: serviceState(fields.ActiveState),
    detail:
      [fields.ActiveState, fields.SubState].filter(Boolean).join(" / ") ||
      "unknown",
    pid: pid > 0 ? pid : null,
    uptimeSeconds: null,
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
  return {
    state,
    detail: status,
    pid: Number(item?.pid || 0) || null,
    uptimeSeconds:
      startedAt > 0
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        : null,
  };
}

async function readPrivilegedCapabilities(config, runner = runCommand) {
  try {
    await Promise.all([
      fs.access(config.sudoBin, constants.X_OK),
      fs.access(config.privilegedHelperPath, constants.X_OK),
    ]);
    const result = await runner(
      config.sudoBin,
      ["-n", config.privilegedHelperPath, "capabilities"],
      {
        timeoutMs: 5000,
        maxOutputBytes: 16 * 1024,
        env: safeCommandEnvironment(),
      },
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

export async function canExecuteNginxReload(config, runner = runCommand) {
  const capabilities = await readPrivilegedCapabilities(config, runner);
  return capabilities?.nginxReload === true;
}

async function readPm2Items(config, runner) {
  if (config.pm2AccessMode === "disabled") {
    throw Object.assign(new Error("PM2 access is disabled"), {
      code: "PM2_ACCESS_DISABLED",
    });
  }
  const command =
    config.pm2AccessMode === "helper"
      ? {
          file: config.sudoBin,
          args: ["-n", config.privilegedHelperPath, "pm2-status"],
          env: safeCommandEnvironment(),
        }
      : {
          file: config.pm2Bin,
          args: ["jlist"],
          env: safeCommandEnvironment({ PM2_HOME: config.pm2Home }),
        };
  const result = await runner(command.file, command.args, {
    timeoutMs: 5000,
    maxOutputBytes: 512 * 1024,
    env: command.env,
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

export async function collectServiceSnapshots(config, runner = runCommand) {
  const errors = [];
  let pm2Items = [];
  let pm2Available = false;
  try {
    pm2Items = await readPm2Items(config, runner);
    pm2Available = true;
  } catch (error) {
    errors.push({ source: "pm2", code: stableErrorCode(error) });
  }

  const nginxReload = await canExecuteNginxReload(config, runner);
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
              }),
          actions,
        };
      }
      try {
        const result = await runner(
          config.systemctlBin,
          [
            "show",
            definition.target,
            "--property=ActiveState,SubState,MainPID",
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
          actions,
        };
      }
    }),
  );
  return {
    services: snapshots,
    errors,
    capabilities: { nginxReload, workerRestart: pm2Available },
  };
}

export async function readServiceLogs(
  config,
  serviceId,
  limit,
  runner = runCommand,
) {
  const definition = config.services.find((item) => item.id === serviceId);
  if (!definition)
    throw Object.assign(new Error("Service is not allowlisted"), {
      code: "HOST_AGENT_SERVICE_FORBIDDEN",
    });
  const command =
    config.pm2AccessMode === "helper"
      ? {
          file: config.sudoBin,
          args: [
            "-n",
            config.privilegedHelperPath,
            definition.kind === "pm2" ? "pm2-logs" : "journal-logs",
            serviceId,
          ],
          env: safeCommandEnvironment(),
        }
      : definition.kind === "pm2"
      ? {
          file: config.pm2Bin,
          args: [
            "logs",
            definition.target,
            "--lines",
            String(limit),
            "--nostream",
            "--raw",
          ],
          env: safeCommandEnvironment({ PM2_HOME: config.pm2Home }),
        }
      : {
          file: config.journalctlBin,
          args: [
            "--unit",
            definition.target,
            "--lines",
            String(limit),
            "--no-pager",
            "--output=short-iso",
          ],
          env: safeCommandEnvironment(),
        };
  const result = await runner(command.file, command.args, {
    timeoutMs: 8000,
    maxOutputBytes: 256 * 1024,
    env: command.env,
  });
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

export async function executeHostAction(config, request, runner = runCommand) {
  const startedAt = Date.now();
  let result;
  if (request.action === HOST_AGENT_ACTIONS.NGINX_RELOAD) {
    result = await runner(
      config.sudoBin,
      ["-n", config.privilegedHelperPath, "nginx-reload"],
      {
        timeoutMs: 20_000,
        maxOutputBytes: 64 * 1024,
        env: safeCommandEnvironment(),
      },
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
    const command =
      config.pm2AccessMode === "helper"
        ? {
            file: config.sudoBin,
            args: [
              "-n",
              config.privilegedHelperPath,
              "pm2-restart",
              request.targetId,
            ],
            env: safeCommandEnvironment(),
          }
        : {
            file: config.pm2Bin,
            args: ["restart", definition.target],
            env: safeCommandEnvironment({ PM2_HOME: config.pm2Home }),
          };
    result = await runner(command.file, command.args, {
      timeoutMs: 20_000,
      maxOutputBytes: 64 * 1024,
      env: command.env,
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
