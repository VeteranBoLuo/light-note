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
  sudoBin: "/usr/bin/sudo",
  privilegedHelperPath: "/usr/local/libexec/lightnote-host-helper.mjs",
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
    const runner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));
    await executeHostAction(
      { ...baseConfig, pm2AccessMode: "helper" },
      { action: "service.restart", targetId: "lightnote-document-worker" },
      runner,
    );
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/sudo",
      [
        "-n",
        "/usr/local/libexec/lightnote-host-helper.mjs",
        "pm2-restart",
        "lightnote-document-worker",
      ],
      expect.objectContaining({ timeoutMs: 20_000 }),
    );
  });

  it("Nginx 只通过固定 helper 执行校验后重载动作", async () => {
    const runner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));
    await executeHostAction(
      baseConfig,
      { action: "nginx.reload", targetId: "nginx" },
      runner,
    );
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/sudo",
      ["-n", "/usr/local/libexec/lightnote-host-helper.mjs", "nginx-reload"],
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
      readServiceLogs(baseConfig, "lightnote-document-worker", 120, runner),
    ).rejects.toMatchObject({
      code: "HOST_AGENT_LOG_READ_FAILED",
    });
  });

  it("root PM2 兼容模式只读取 helper 脱敏后的固定服务日志", async () => {
    const runner = vi.fn(async () => ({
      exitCode: 0,
      stdout: "worker online",
      stderr: "",
    }));
    await expect(
      readServiceLogs(
        { ...baseConfig, pm2AccessMode: "helper" },
        "lightnote-document-worker",
        120,
        runner,
      ),
    ).resolves.toMatchObject({
      serviceId: "lightnote-document-worker",
      lines: ["worker online"],
    });
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/sudo",
      [
        "-n",
        "/usr/local/libexec/lightnote-host-helper.mjs",
        "pm2-logs",
        "lightnote-document-worker",
      ],
      expect.anything(),
    );
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
    const runner = vi.fn(async (_file, args) => {
      if (args.at(-1) === "capabilities") {
        return { exitCode: 0, stdout: '{"nginxReload":true}', stderr: "" };
      }
      if (args.at(-1) === "pm2-status") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              name: "light-note-document-worker",
              pid: 42,
              pm2_env: { status: "online", pm_uptime: Date.now() - 1000 },
            },
          ]),
          stderr: "",
        };
      }
      throw new Error(`unexpected args: ${args.join(" ")}`);
    });

    const result = await collectServiceSnapshots(
      {
        ...baseConfig,
        pm2AccessMode: "helper",
        sudoBin: "/usr/bin/true",
        privilegedHelperPath: "/usr/bin/true",
        services,
      },
      runner,
    );

    expect(result.services[0]).toMatchObject({
      id: "lightnote-document-worker",
      state: "running",
      actions: ["service.restart"],
    });
    expect(result.capabilities).toEqual({
      nginxReload: true,
      workerRestart: true,
    });
  });
});
