import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  collectServiceSnapshots,
  executeHostAction,
  readServiceLogs,
} from "./services.js";

const baseConfig = {
  pm2Bin: "/usr/bin/pm2",
  pm2Home: "/var/lib/lightnote-pm2",
  pm2AccessMode: "direct",
  privilegedHelperSocketPath: "/run/lightnote-host-helper.sock",
  services: [
    {
      id: "lightnote-document-worker",
      kind: "pm2",
      target: "light-note-document-worker",
      restartable: true,
    },
  ],
};

describe("executeHostAction", () => {
  it("Worker 重启只执行白名单 PM2 目标，且不覆盖原进程环境", async () => {
    const runner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));
    await executeHostAction(
      baseConfig,
      { action: "service.restart", targetId: "lightnote-document-worker" },
      runner,
    );
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/pm2",
      ["restart", "light-note-document-worker"],
      expect.objectContaining({
        env: expect.objectContaining({ PM2_HOME: "/var/lib/lightnote-pm2" }),
      }),
    );
  });

  it("root PM2 兼容模式只通过固定 helper 重启枚举 Worker", async () => {
    const runner = vi.fn();
    const helperRequester = vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));
    await executeHostAction(
      { ...baseConfig, pm2AccessMode: "helper" },
      { action: "service.restart", targetId: "lightnote-document-worker" },
      runner,
      helperRequester,
    );
    expect(runner).not.toHaveBeenCalled();
    expect(helperRequester).toHaveBeenCalledWith(
      "/run/lightnote-host-helper.sock",
      "pm2-restart",
      "lightnote-document-worker",
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
  });

  it("Nginx 只通过 root Socket helper 执行校验后重载动作", async () => {
    const runner = vi.fn();
    const helperRequester = vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));
    await executeHostAction(
      baseConfig,
      { action: "nginx.reload", targetId: "nginx" },
      runner,
      helperRequester,
    );
    expect(runner).not.toHaveBeenCalled();
    expect(helperRequester).toHaveBeenCalledWith(
      "/run/lightnote-host-helper.sock",
      "nginx-reload",
      undefined,
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
  });

  it("非白名单服务重启失败关闭且不启动任何进程", async () => {
    const runner = vi.fn();
    await expect(
      executeHostAction(
        baseConfig,
        { action: "service.restart", targetId: "lightnote-api" },
        runner,
      ),
    ).rejects.toMatchObject({ code: "HOST_AGENT_TARGET_FORBIDDEN" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("日志命令失败时返回稳定错误，不把命令错误输出当作正常日志", async () => {
    const runner = vi.fn(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "permission denied",
    }));
    await expect(
      readServiceLogs(
        {
          ...baseConfig,
          services: [
            { id: "nginx", kind: "systemd", target: "nginx.service" },
          ],
        },
        "nginx",
        120,
        runner,
      ),
    ).rejects.toMatchObject({
      code: "HOST_AGENT_LOG_READ_FAILED",
    });
  });

  it("root PM2 兼容模式按最后写入时间排列输出流，较新的流排在最后", async () => {
    const runner = vi.fn();
    const helperRequester = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        streams: [
          {
            stream: "stdout",
            modifiedAt: "2026-10-30T09:13:25.000Z",
            lines: ["worker online", "job done token=abc123"],
            truncated: false,
          },
          {
            stream: "stderr",
            modifiedAt: "2026-10-29T03:00:00.000Z",
            lines: ["old failure"],
            truncated: false,
          },
        ],
      }),
      stderr: "",
    }));
    const result = await readServiceLogs(
      { ...baseConfig, pm2AccessMode: "helper" },
      "lightnote-document-worker",
      120,
      runner,
      helperRequester,
    );
    expect(result).toMatchObject({
      serviceId: "lightnote-document-worker",
      lines: ["old failure", "worker online", "job done token=[REDACTED]"],
      sections: [
        { stream: "stderr", modifiedAt: "2026-10-29T03:00:00.000Z", start: 0 },
        { stream: "stdout", modifiedAt: "2026-10-30T09:13:25.000Z", start: 1 },
      ],
      truncated: false,
    });
    expect(runner).not.toHaveBeenCalled();
    expect(helperRequester).toHaveBeenCalledWith(
      "/run/lightnote-host-helper.sock",
      "pm2-logs",
      "lightnote-document-worker",
      expect.anything(),
    );
  });

  it("行数上限在两条输出流之间分配，一条不足时余量让给另一条", async () => {
    const stream = (name, modifiedAt, count, truncated = false) => ({
      stream: name,
      modifiedAt,
      lines: Array.from({ length: count }, (_, index) => `${name}-${index}`),
      truncated,
    });
    const read = (streams, limit) =>
      readServiceLogs(
        { ...baseConfig, pm2AccessMode: "helper" },
        "lightnote-document-worker",
        limit,
        vi.fn(),
        async () => ({
          exitCode: 0,
          stdout: JSON.stringify({ streams }),
          stderr: "",
        }),
      );

    const balanced = await read(
      [
        stream("stdout", "2026-10-30T09:00:00.000Z", 10),
        stream("stderr", "2026-10-30T08:00:00.000Z", 10),
      ],
      6,
    );
    expect(balanced.lines).toEqual([
      "stderr-7",
      "stderr-8",
      "stderr-9",
      "stdout-7",
      "stdout-8",
      "stdout-9",
    ]);

    const uneven = await read(
      [
        stream("stdout", "2026-10-30T09:00:00.000Z", 10, true),
        stream("stderr", "2026-10-30T08:00:00.000Z", 1),
      ],
      4,
    );
    expect(uneven.lines).toEqual(["stderr-0", "stdout-7", "stdout-8", "stdout-9"]);
    expect(uneven.truncated).toBe(false);

    const exhausted = await read(
      [stream("stdout", "2026-10-30T09:00:00.000Z", 3, true)],
      80,
    );
    expect(exhausted).toMatchObject({
      lines: ["stdout-0", "stdout-1", "stdout-2"],
      sections: [{ stream: "stdout", start: 0 }],
      truncated: true,
    });
  });

  it("helper 返回的日志结构不合法时失败关闭", async () => {
    await expect(
      readServiceLogs(
        { ...baseConfig, pm2AccessMode: "helper" },
        "lightnote-document-worker",
        120,
        vi.fn(),
        async () => ({ exitCode: 0, stdout: "worker online", stderr: "" }),
      ),
    ).rejects.toMatchObject({ code: "HOST_HELPER_RESPONSE_INVALID" });
  });

  it("同账户 PM2 模式直接读取固定日志文件，缺失的输出流按空处理", async () => {
    const pm2Home = mkdtempSync(path.join(tmpdir(), "lightnote-pm2-home-"));
    try {
      mkdirSync(path.join(pm2Home, "logs"));
      const outFile = path.join(
        pm2Home,
        "logs",
        "light-note-document-worker-out.log",
      );
      writeFileSync(outFile, "ready\nprocessed 3 files\n");
      utimesSync(outFile, new Date("2026-10-30T09:00:00Z"), new Date("2026-10-30T09:00:00Z"));
      const result = await readServiceLogs(
        { ...baseConfig, pm2Home },
        "lightnote-document-worker",
        120,
        vi.fn(),
      );
      expect(result).toMatchObject({
        lines: ["ready", "processed 3 files"],
        sections: [
          { stream: "stdout", modifiedAt: "2026-10-30T09:00:00.000Z", start: 0 },
        ],
      });

      rmSync(outFile);
      await expect(
        readServiceLogs(
          { ...baseConfig, pm2Home },
          "lightnote-document-worker",
          120,
          vi.fn(),
        ),
      ).rejects.toMatchObject({ code: "HOST_AGENT_LOG_READ_FAILED" });
    } finally {
      rmSync(pm2Home, { recursive: true, force: true });
    }
  });

  it("root PM2 兼容模式的仪表盘只接收 helper 返回的受限状态字段", async () => {
    const services = [
      {
        id: "lightnote-document-worker",
        kind: "pm2",
        target: "light-note-document-worker",
        restartable: true,
      },
    ];
    const runner = vi.fn();
    const helperRequester = vi.fn(async (_socketPath, action) => {
      if (action === "capabilities") {
        return { exitCode: 0, stdout: '{"nginxReload":true}', stderr: "" };
      }
      if (action === "pm2-status") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              name: "light-note-document-worker",
              pid: 42,
              pm2_env: {
                status: "online",
                pm_uptime: Date.now() - 1000,
                restart_time: 366,
                unstable_restarts: 0,
              },
            },
          ]),
          stderr: "",
        };
      }
      throw new Error(`unexpected action: ${action}`);
    });

    const result = await collectServiceSnapshots(
      {
        ...baseConfig,
        pm2AccessMode: "helper",
        services,
      },
      runner,
      helperRequester,
    );

    expect(result.services[0]).toMatchObject({
      id: "lightnote-document-worker",
      state: "running",
      // 部署造成的累计重启不计入，只报告崩溃循环。
      restartCount: 0,
      actions: ["service.restart"],
    });
    expect(result.capabilities).toEqual({
      nginxReload: true,
      workerRestart: true,
      securitySnapshot: false,
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("面板托管的 Nginx、Redis 与 MySQL 通过 helper 返回已校验进程状态", async () => {
    const runner = vi.fn();
    const helperRequester = vi.fn(async (_socketPath, action, targetId) => {
      if (action === "capabilities") {
        return {
          exitCode: 0,
          stdout: '{"nginxReload":true}',
          stderr: "",
        };
      }
      if (action === "pm2-status") {
        return { exitCode: 0, stdout: "[]", stderr: "" };
      }
      if (action === "service-status") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            state: "running",
            detail: `active / panel-managed ${targetId}`,
            pid: { nginx: 101, redis: 102, mysql: 103 }[targetId],
            uptimeSeconds: targetId === "mysql" ? 3600 : null,
            memoryBytes: targetId === "mysql" ? 977_723_392 : null,
            startedAt:
              targetId === "mysql" ? "2026-10-26T01:01:39.000Z" : null,
          }),
          stderr: "",
        };
      }
      throw new Error(`unexpected action: ${action}`);
    });

    const result = await collectServiceSnapshots(
      {
        ...baseConfig,
        pm2AccessMode: "helper",
        services: [
          {
            id: "nginx",
            kind: "systemd",
            target: "nginx.service",
            restartable: false,
          },
          {
            id: "redis",
            kind: "systemd",
            target: "redis-server.service",
            restartable: false,
          },
          {
            id: "mysql",
            kind: "systemd",
            target: "mysql.service",
            restartable: false,
          },
        ],
      },
      runner,
      helperRequester,
    );

    expect(result.services).toEqual([
      expect.objectContaining({
        id: "nginx",
        state: "running",
        pid: 101,
        actions: ["nginx.reload"],
      }),
      expect.objectContaining({
        id: "redis",
        state: "running",
        pid: 102,
        actions: [],
      }),
      expect.objectContaining({
        id: "mysql",
        state: "running",
        pid: 103,
        uptimeSeconds: 3600,
        memoryBytes: 977_723_392,
        actions: [],
      }),
    ]);
    expect(helperRequester).toHaveBeenCalledWith(
      "/run/lightnote-host-helper.sock",
      "service-status",
      "mysql",
      expect.any(Object),
    );
    expect(runner).not.toHaveBeenCalled();
  });
});
