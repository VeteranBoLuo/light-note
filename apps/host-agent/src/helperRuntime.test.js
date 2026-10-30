import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const helperPath = fileURLToPath(
  new URL("../privileged/lightnote-host-helper.mjs", import.meta.url),
);

describe("privileged helper production runtime", () => {
  it("使用显式 ESM 扩展名，并可在脱离 package.json 的安装位置由 Node 18 直接启动", () => {
    expect(helperPath).toMatch(/\.mjs$/u);
    const installDir = mkdtempSync(path.join(tmpdir(), "lightnote-helper-runtime-"));
    const installedHelperPath = path.join(installDir, "lightnote-host-helper.mjs");
    copyFileSync(helperPath, installedHelperPath);
    chmodSync(installedHelperPath, 0o755);
    let result;
    try {
      result = spawnSync(process.execPath, [installedHelperPath, "capabilities"], {
        encoding: "utf8",
        env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
      });
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }

    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        nginxReload: expect.any(Boolean),
        pm2Status: expect.any(Boolean),
        workerRestart: expect.any(Boolean),
        serviceLogs: expect.any(Boolean),
      }),
    );
  });

  it("Socket 模式只接受固定字段并返回受限结果结构", () => {
    const accepted = spawnSync(process.execPath, [helperPath, "socket"], {
      encoding: "utf8",
      input: '{"action":"capabilities"}\n',
      env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
    });
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual({
      exitCode: 0,
      stdout: expect.any(String),
      stderr: "",
    });
    expect(JSON.parse(JSON.parse(accepted.stdout).stdout)).toEqual(
      expect.objectContaining({ pm2Status: expect.any(Boolean) }),
    );

    for (const targetId of ["redis", "mysql"]) {
      const status = spawnSync(process.execPath, [helperPath, "socket"], {
        encoding: "utf8",
        input: `{"action":"service-status","targetId":"${targetId}"}\n`,
        env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
      });
      expect(JSON.parse(JSON.parse(status.stdout).stdout)).toEqual(
        expect.objectContaining({
          state: expect.stringMatching(/^(running|stopped)$/u),
          detail: expect.any(String),
        }),
      );
    }

    // 测试环境无法进入宿主挂载命名空间，两条输出流都读不到时必须失败关闭，而不是返回空日志。
    const pm2Logs = spawnSync(process.execPath, [helperPath, "socket"], {
      encoding: "utf8",
      input: '{"action":"pm2-logs","targetId":"lightnote-api"}\n',
      env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
    });
    expect(JSON.parse(pm2Logs.stdout)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "pm2 logs failed\n",
    });

    const denied = spawnSync(process.execPath, [helperPath, "socket"], {
      encoding: "utf8",
      input: '{"action":"capabilities","command":"whoami"}\n',
      env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
    });
    expect(JSON.parse(denied.stdout)).toEqual({
      exitCode: 64,
      stdout: "",
      stderr: "action denied\n",
    });
  });
});
