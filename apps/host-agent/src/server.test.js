import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVICE_DEFINITIONS } from "./config.js";
import { createHostAgent } from "./server.js";

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function request(socketPath, pathname, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        socketPath,
        path: pathname,
        method,
        headers: encoded
          ? {
              "Content-Type": "application/json",
              "Content-Length": encoded.length,
            }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      },
    );
    req.on("error", reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

describe("Host Agent Unix Socket API", () => {
  it("提供只读仪表盘，并按 jobId 复用操作回执", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "lightnote-host-agent-"),
    );
    const socketPath = path.join(directory, "agent.sock");
    const runner = vi.fn(async (file, args) => {
      if (args[0] === "jlist") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              name: "app",
              pid: 123,
              pm2_env: { status: "online", pm_uptime: Date.now() - 10_000 },
            },
            {
              name: "light-note-document-worker",
              pid: 456,
              pm2_env: { status: "online", pm_uptime: Date.now() - 10_000 },
            },
          ]),
          stderr: "",
        };
      }
      if (file === "/usr/bin/systemctl") {
        return {
          exitCode: 0,
          stdout: "ActiveState=active\nSubState=running\nMainPID=789\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "restarted", stderr: "" };
    });
    const config = {
      socketPath,
      stateDir: path.join(directory, "jobs"),
      privilegedHelperSocketPath: path.join(directory, "helper.sock"),
      systemctlBin: "/usr/bin/systemctl",
      journalctlBin: "/usr/bin/true",
      pm2Bin: "/usr/bin/true",
      pm2Home: path.join(directory, "pm2"),
      mountPoint: "/",
      sampleIntervalMs: 60_000,
      maxHistorySamples: 10,
      jobTtlMs: 60_000,
      requestBodyLimitBytes: 32 * 1024,
      socketMode: 0o660,
      services: SERVICE_DEFINITIONS,
    };
    const helperRequester = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"nginxReload":false}',
      stderr: "",
    }));
    const agent = await createHostAgent({
      config,
      commandRunner: runner,
      helperRequester,
    });
    await agent.listen();
    cleanups.push(async () => {
      await agent.close();
      await fs.rm(directory, { recursive: true, force: true });
    });

    const dashboard = await request(socketPath, "/v1/dashboard");
    expect(dashboard).toMatchObject({
      status: 200,
      body: { protocolVersion: 1, ok: true },
    });
    expect(dashboard.body.data.services).toHaveLength(
      SERVICE_DEFINITIONS.length,
    );
    expect(
      dashboard.body.data.services.find((item) => item.id === "lightnote-api"),
    ).toMatchObject({
      state: "running",
      actions: [],
    });
    const services = await request(socketPath, "/v1/services");
    expect(services).toMatchObject({
      status: 200,
      body: { ok: true, data: { services: expect.any(Array) } },
    });
    const storage = await request(socketPath, "/v1/storage");
    expect(storage).toMatchObject({
      status: 200,
      body: {
        ok: true,
        data: { mounts: expect.any(Array), history: expect.any(Array) },
      },
    });
    const security = await request(socketPath, "/v1/security");
    expect(security).toMatchObject({
      status: 200,
      body: {
        protocolVersion: 1,
        ok: true,
        data: { protocolVersion: 1, listeningPorts: expect.any(Array) },
      },
    });
    const unknownQuery = await request(
      socketPath,
      "/v1/dashboard?command=whoami",
    );
    expect(unknownQuery).toMatchObject({
      status: 400,
      body: { ok: false, error: { code: "HOST_AGENT_QUERY_INVALID" } },
    });

    const job = {
      jobId: "0123456789abcdef",
      action: "service.restart",
      targetId: "lightnote-document-worker",
    };
    const first = await request(socketPath, "/v1/jobs", {
      method: "POST",
      body: job,
    });
    const replay = await request(socketPath, "/v1/jobs", {
      method: "POST",
      body: job,
    });
    expect(first.body.data).toMatchObject({
      replayed: false,
      receipt: { state: "succeeded" },
    });
    expect(replay.body.data).toMatchObject({
      replayed: true,
      receipt: { state: "succeeded" },
    });
    const restartCalls = runner.mock.calls.filter(
      ([, args]) => args[0] === "restart",
    );
    expect(restartCalls).toHaveLength(1);
  });
});
