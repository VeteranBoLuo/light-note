import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  HOST_AGENT_ENDPOINTS,
  HOST_AGENT_PROTOCOL_VERSION,
  HostAgentProtocolError,
  isHostAgentServiceId,
  normalizeHostAgentLogLimit,
  validateHostAgentJobRequest,
} from "@lightnote/shared/host-agent-protocol";
import { loadHostAgentConfig } from "./config.js";
import { PersistentJobStore } from "./jobStore.js";
import { hostIdentity, MetricSampler } from "./metrics.js";
import { stableErrorCode } from "./redaction.js";
import {
  collectServiceSnapshots,
  executeHostAction,
  readServiceLogs,
} from "./services.js";

const AGENT_VERSION = "1.0.0";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify({
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    ...payload,
  });
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function statusCodeForError(code) {
  if (code.includes("FORBIDDEN")) return 403;
  if (code.includes("TOO_LARGE")) return 413;
  if (code.includes("TIMEOUT") || code.includes("UNAVAILABLE")) return 503;
  if (code.includes("INVALID") || code.includes("UNSAFE")) return 400;
  return 500;
}

async function readJsonBody(req, limit) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit)
      throw Object.assign(new Error("Request body is too large"), {
        code: "HOST_AGENT_BODY_TOO_LARGE",
      });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Request body is not valid JSON"), {
      code: "HOST_AGENT_JSON_INVALID",
    });
  }
}

function assertAllowedQuery(url, allowedKeys = []) {
  const allowed = new Set(allowedKeys);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
    throw new HostAgentProtocolError(
      "HOST_AGENT_QUERY_INVALID",
      "Query contains unknown fields",
    );
  }
}

export async function createHostAgent({
  config = loadHostAgentConfig(),
  commandRunner,
} = {}) {
  const startedAt = new Date().toISOString();
  const sampler = new MetricSampler({
    mountPoint: config.mountPoint,
    intervalMs: config.sampleIntervalMs,
    maxSamples: config.maxHistorySamples,
  });
  const jobStore = new PersistentJobStore({
    stateDir: config.stateDir,
    ttlMs: config.jobTtlMs,
  });
  await jobStore.init();
  sampler.start();
  await sampler.sample();

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (
        req.method === "GET" &&
        url.pathname === HOST_AGENT_ENDPOINTS.health
      ) {
        assertAllowedQuery(url);
        return sendJson(res, 200, {
          ok: true,
          data: {
            agentVersion: AGENT_VERSION,
            startedAt,
            sampledAt: sampler.latest?.sampledAt || null,
          },
        });
      }
      if (
        req.method === "GET" &&
        url.pathname === HOST_AGENT_ENDPOINTS.dashboard
      ) {
        assertAllowedQuery(url);
        const [metricState, serviceState] = await Promise.all([
          sampler.latest ? Promise.resolve(sampler.latest) : sampler.sample(),
          collectServiceSnapshots(config, commandRunner),
        ]);
        const sampled = sampler.snapshot();
        return sendJson(res, 200, {
          ok: true,
          data: {
            protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
            agentVersion: AGENT_VERSION,
            startedAt,
            sampledAt: metricState.sampledAt,
            host: hostIdentity(),
            metrics: metricState,
            history: sampled.history,
            services: serviceState.services,
            capabilities: serviceState.capabilities,
            collectionErrors: [
              ...metricState.collectionErrors,
              ...serviceState.errors,
            ],
          },
        });
      }
      if (
        req.method === "GET" &&
        url.pathname.startsWith(`${HOST_AGENT_ENDPOINTS.logsPrefix}/`)
      ) {
        assertAllowedQuery(url, ["limit"]);
        const serviceId = decodeURIComponent(
          url.pathname.slice(HOST_AGENT_ENDPOINTS.logsPrefix.length + 1),
        );
        if (!isHostAgentServiceId(serviceId)) {
          throw new HostAgentProtocolError(
            "HOST_AGENT_SERVICE_FORBIDDEN",
            "Service is not allowlisted",
          );
        }
        const data = await readServiceLogs(
          config,
          serviceId,
          normalizeHostAgentLogLimit(url.searchParams.get("limit")),
          commandRunner,
        );
        return sendJson(res, 200, { ok: true, data });
      }
      if (req.method === "POST" && url.pathname === HOST_AGENT_ENDPOINTS.jobs) {
        const request = validateHostAgentJobRequest(
          await readJsonBody(req, config.requestBodyLimitBytes),
        );
        const data = await jobStore.execute(
          request.jobId,
          () => executeHostAction(config, request, commandRunner),
          { action: request.action, targetId: request.targetId },
        );
        return sendJson(res, 200, { ok: true, data });
      }
      return sendJson(res, 404, {
        ok: false,
        error: {
          code: "HOST_AGENT_ROUTE_NOT_FOUND",
          message: "Route not found",
        },
      });
    } catch (error) {
      const code = stableErrorCode(error);
      return sendJson(res, statusCodeForError(code), {
        ok: false,
        error: {
          code,
          message: String(error?.message || "Request failed").slice(0, 200),
        },
      });
    }
  };

  const server = http.createServer((req, res) => void handler(req, res));
  async function listen() {
    await fs.mkdir(path.dirname(config.socketPath), {
      recursive: true,
      mode: 0o750,
    });
    try {
      const current = await fs.lstat(config.socketPath);
      if (!current.isSocket())
        throw Object.assign(
          new Error("Configured socket path is occupied by a non-socket file"),
          { code: "HOST_AGENT_SOCKET_PATH_UNSAFE" },
        );
      await fs.unlink(config.socketPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await fs.chmod(config.socketPath, config.socketMode);
  }
  async function close() {
    sampler.stop();
    await new Promise((resolve) => server.close(() => resolve()));
    await fs.unlink(config.socketPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  return { config, server, sampler, jobStore, listen, close };
}
