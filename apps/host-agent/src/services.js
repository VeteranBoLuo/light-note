import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { HOST_AGENT_ACTIONS } from "@lightnote/shared/host-agent-protocol";
import { runCommand, safeCommandEnvironment } from "./commandRunner.js";
import { requestPrivilegedHelper } from "./helperClient.js";
import { redactOperationalText, stableErrorCode } from "./redaction.js";

// 这些服务可能由宝塔面板托管，systemd unit 状态不可信，需经 helper 按固定 PID 文件判定。
const PANEL_AWARE_SERVICE_IDS = new Set(["nginx", "redis", "mysql"]);
const PM2_LOG_STREAMS = Object.freeze([
  ["stdout", "out"],
  ["stderr", "error"],
]);
const PM2_LOG_STREAM_BYTES = 64 * 1024;
const PM2_LOG_STREAM_LINES = 300;

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
  // restart_time 含每次部署与手动重启；只取 PM2 的不稳定重启（启动后未达 min_uptime 即退出），即崩溃循环。
  const restartCount = Number(item?.pm2_env?.unstable_restarts);
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
        PANEL_AWARE_SERVICE_IDS.has(definition.id)
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

function logReadFailed(exitCode) {
  return Object.assign(new Error("Service logs could not be read"), {
    code: "HOST_AGENT_LOG_READ_FAILED",
    ...(exitCode === undefined ? {} : { exitCode }),
  });
}

async function readLogTail(file) {
  let handle;
  try {
    handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stats = await handle.stat();
    if (!stats.isFile()) return null;
    const length = Math.min(stats.size, PM2_LOG_STREAM_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(
      buffer,
      0,
      length,
      stats.size - length,
    );
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    const clipped = length < stats.size;
    if (clipped) lines.shift();
    if (lines.at(-1) === "") lines.pop();
    return {
      modifiedAt: stats.mtime.toISOString(),
      lines: lines.slice(-PM2_LOG_STREAM_LINES),
      truncated: clipped || lines.length > PM2_LOG_STREAM_LINES,
    };
  } catch (error) {
    return error?.code === "ENOENT" ? undefined : null;
  } finally {
    await handle?.close();
  }
}

async function readPm2LogFiles(pm2Home, processName) {
  const streams = await Promise.all(
    PM2_LOG_STREAMS.map(async ([stream, suffix]) => ({
      stream,
      content: await readLogTail(
        path.join(pm2Home, "logs", `${processName}-${suffix}.log`),
      ),
    })),
  );
  // 单个文件缺失按空流处理；任一文件不可读或两个都不存在时按读取失败处理。
  if (
    streams.some((item) => item.content === null) ||
    streams.every((item) => item.content === undefined)
  ) {
    return null;
  }
  return streams.map(({ stream, content }) => ({
    stream,
    modifiedAt: content?.modifiedAt ?? null,
    lines: content?.lines ?? [],
    truncated: content?.truncated ?? false,
  }));
}

function parseHelperLogStreams(result) {
  if (result.exitCode !== 0) throw logReadFailed(result.exitCode);
  let streams;
  try {
    streams = JSON.parse(result.stdout || "{}")?.streams;
  } catch {
    streams = null;
  }
  const valid =
    Array.isArray(streams) &&
    streams.length <= PM2_LOG_STREAMS.length &&
    streams.every(
      (item) =>
        PM2_LOG_STREAMS.some(([stream]) => stream === item?.stream) &&
        (item.modifiedAt === null ||
          Number.isFinite(Date.parse(item.modifiedAt))) &&
        typeof item.truncated === "boolean" &&
        Array.isArray(item.lines) &&
        item.lines.length <= PM2_LOG_STREAM_LINES &&
        item.lines.every((line) => typeof line === "string"),
    );
  if (!valid) {
    throw Object.assign(new Error("helper log streams are invalid"), {
      code: "HOST_HELPER_RESPONSE_INVALID",
    });
  }
  return streams;
}

// 按流轮流分配行数，保证两条流都有内容时各自至少能看到一半；一条不足时余量让给另一条。
function shareLineLimit(lengths, limit) {
  const takes = lengths.map(() => 0);
  let remaining = limit;
  let pending = lengths.flatMap((length, index) => (length > 0 ? [index] : []));
  while (remaining > 0 && pending.length) {
    const share = Math.max(1, Math.floor(remaining / pending.length));
    for (const index of pending) {
      const add = Math.min(share, lengths[index] - takes[index], remaining);
      takes[index] += add;
      remaining -= add;
    }
    pending = pending.filter((index) => takes[index] < lengths[index]);
  }
  return takes;
}

function composePm2Logs(serviceId, streams, limit) {
  // 最近写入的流排在最后，符合“越往下越新”的阅读习惯；两条流各自保持文件内顺序。
  const ordered = streams
    .filter((item) => item.lines.length > 0)
    .sort(
      (a, b) =>
        (Date.parse(a.modifiedAt) || 0) - (Date.parse(b.modifiedAt) || 0),
    );
  const takes = shareLineLimit(
    ordered.map((item) => item.lines.length),
    limit,
  );
  const lines = [];
  const sections = [];
  ordered.forEach((item, index) => {
    if (!takes[index]) return;
    sections.push({
      stream: item.stream,
      modifiedAt: item.modifiedAt,
      start: lines.length,
    });
    lines.push(
      ...item.lines
        .slice(-takes[index])
        .map((line) => redactOperationalText(line, 4000)),
    );
  });
  return {
    serviceId,
    lines,
    sections,
    // 只有安全读取上限截掉了用户本可以看到的更早内容时才提示截断。
    truncated: ordered.some(
      (item, index) => item.truncated && takes[index] === item.lines.length,
    ),
    exitCode: 0,
    capturedAt: new Date().toISOString(),
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
  if (definition.kind === "pm2") {
    const streams =
      config.pm2AccessMode === "helper"
        ? parseHelperLogStreams(
            await runHelper(
              config,
              "pm2-logs",
              serviceId,
              { timeoutMs: 8000, maxOutputBytes: 512 * 1024 },
              helperRequester,
            ),
          )
        : config.pm2AccessMode === "direct"
          ? await readPm2LogFiles(config.pm2Home, definition.target)
          : null;
    if (!streams) throw logReadFailed();
    return composePm2Logs(serviceId, streams, limit);
  }
  let result;
  if (config.pm2AccessMode === "helper") {
    result = await runHelper(
      config,
      "journal-logs",
      serviceId,
      { timeoutMs: 8000, maxOutputBytes: 256 * 1024 },
      helperRequester,
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
  if (result.exitCode !== 0) throw logReadFailed(result.exitCode);
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
