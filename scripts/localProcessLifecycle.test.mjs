import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectLocalWorkers, localWorkerOwnerArg } from "./localWorkerGuard.mjs";
import { stopManagedChild, stopProcessGroup } from "./localProcessLifecycle.mjs";

// 不加载业务模块、数据库或真实队列，用真实操作系统进程复现 pnpm/Worker 两层结构。
async function fixture(t, { leaderExits = false, ignoresTerm = true } = {}) {
  const workerCode = `${ignoresTerm ? 'process.on("SIGTERM", () => {});' : ''}
    process.send("ready"); setInterval(() => {}, 1000);`;
  const leaderCode = `
    const { spawn } = require("node:child_process");
    const worker = spawn(process.execPath, ["-e", ${JSON.stringify(workerCode)}], {
      stdio: ["ignore", "ignore", "ignore", "ipc"]
    });
    worker.once("message", () => {
      process.send(worker.pid);
      ${leaderExits ? 'process.exit(0);' : ''}
    });
    setInterval(() => {}, 1000);
  `;
  const leader = spawn(process.execPath, ["-e", leaderCode], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  t.after(async () => {
    await stopProcessGroup(leader.pid, { graceMs: 0 });
  });
  const exit = once(leader, "exit");
  const [workerPid] = await once(leader, "message");
  if (leaderExits) await exit;
  return { leader, workerPid };
}

function assertGone(pid) {
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
}

test("pnpm 先退出也会等待并强制回收忽略 SIGTERM 的 Worker", { skip: process.platform === "win32", timeout: 10_000 }, async (t) => {
  const { leader, workerPid } = await fixture(t);
  await stopManagedChild(leader, { graceMs: 150 });
  assertGone(leader.pid);
  assertGone(workerPid);
});

test("调用停止前领头进程已退出，仍回收其进程组；重复停止无副作用", { skip: process.platform === "win32", timeout: 10_000 }, async (t) => {
  const { leader, workerPid } = await fixture(t, { leaderExits: true });
  assert.equal(leader.exitCode, 0);
  await stopManagedChild(leader, { graceMs: 150 });
  assertGone(workerPid);
  await stopManagedChild(leader);
});

test("正常响应 SIGTERM 的进程组自然退出", { skip: process.platform === "win32", timeout: 10_000 }, async (t) => {
  const { leader, workerPid } = await fixture(t, { ignoresTerm: false });
  await stopManagedChild(leader);
  assertGone(workerPid);
});

test("拒绝无效进程组，spawn 失败无 PID 时无需发信号", async () => {
  for (const pgid of [0, 1, -1, undefined, NaN])
    await assert.rejects(stopProcessGroup(pgid), /无效/);
  await stopManagedChild({ pid: undefined });
});

test("真实 pnpm watch 传递归属标记，领头进程丢失后可识别并回收", { skip: process.platform === "win32", timeout: 15_000 }, async (t) => {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "lightnote-process-test-")));
  const server = path.join(root, "apps/server");
  mkdirSync(server, { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ private: true }));
  writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(path.join(server, "package.json"), JSON.stringify({
    name: "server", scripts: { "worker:documents:dev": "node --watch documentWorker.js" },
  }));
  writeFileSync(path.join(server, "documentWorker.js"), `
    process.on("SIGTERM", () => {});
    console.log("LNREADY " + JSON.stringify(process.argv.slice(2)));
    setInterval(() => {}, 1000);
  `);
  const owner = localWorkerOwnerArg(root);
  const child = spawn("pnpm", ["--filter", "server", "run", "worker:documents:dev", owner], {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "ignore"],
  });
  t.after(async () => {
    try {
      await stopManagedChild(child, { graceMs: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("pnpm watch fixture 启动超时")), 8_000);
    let output = "";
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes(`LNREADY ${JSON.stringify([owner])}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const before = inspectLocalWorkers(server);
  assert.ok(before.workers.length >= 2, "watch 监督进程及实际 Worker 均应可识别");
  assert.deepEqual(before.orphanGroups, []);
  const exit = once(child, "exit");
  child.kill("SIGKILL");
  await exit;
  assert.deepEqual(inspectLocalWorkers(server).orphanGroups, [child.pid]);
  await stopManagedChild(child, { graceMs: 150 });
  assert.deepEqual(inspectLocalWorkers(server).workers, []);
});
