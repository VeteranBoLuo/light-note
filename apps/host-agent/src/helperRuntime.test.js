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
});
