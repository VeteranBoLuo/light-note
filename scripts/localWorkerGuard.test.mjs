import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectLocalWorkers } from "./localWorkerGuard.mjs";

test("仅回收同仓库已失去启动器的 pnpm Worker 组，保留活跃、手动和其他仓库进程", () => {
  const run = (file, args) => {
    if (file === "ps")
      return [
        "20 1 20 node node /bin/pnpm --filter server run worker:documents",
        "21 20 20 node node documentWorker.js",
        "30 99 30 node node /bin/pnpm --filter server run worker:note-imports",
        "31 30 30 node node noteImportWorker.js",
        "40 1 40 node node browserPushWorker.js",
        "50 1 50 node node /bin/pnpm --filter server run worker:resource-governance:dev",
        "51 50 50 node node --watch resourceGovernanceWorker.js",
        "60 1 60 node node /bin/pnpm --filter server run worker:documents",
        "61 60 60 node node documentWorker.js",
        "70 1 70 zsh zsh -c node documentWorker.js",
      ].join("\n");
    const pid = Number(args[2]);
    const root = pid >= 60 ? "/other" : "/repo";
    return `p${pid}\nfcwd\nn${root}${[20, 30, 50, 60].includes(pid) ? "" : "/apps/server"}`;
  };
  assert.deepEqual(inspectLocalWorkers("/repo/apps/server", run), {
    workers: [21, 31, 40, 51],
    orphanGroups: [20, 50],
    launchers: [],
  });
});

test("进程退出或无法确认工作目录时不回收进程组", () => {
  const run = (file, args) => {
    if (file === "ps")
      return "20 1 20 node node /bin/pnpm --filter server run worker:documents\n21 20 20 node node documentWorker.js";
    if (args[2] === "20") throw new Error("exited");
    return "n/repo/apps/server";
  };
  assert.deepEqual(inspectLocalWorkers("/repo/apps/server", run), {
    workers: [21],
    orphanGroups: [],
    launchers: [],
  });
});

test("识别同仓库普通和监听启动器，不接管其他脚本、其他仓库或自身", () => {
  const run = (file, args) => {
    if (file === "ps") return [
      "90 1 90 node node scripts/localServer.mjs",
      "91 1 91 node node /repo/scripts/localServer.mjs --watch",
      "92 1 92 node node scripts/localServer.mjs",
      "93 1 93 node node /other/scripts/localServer.mjs",
      "94 1 94 node node scripts/localServer.mjs.bak",
      "95 1 95 node node scripts/localServer.mjs --unknown",
      `${process.pid} 1 ${process.pid} node node scripts/localServer.mjs`,
    ].join("\n");
    return `n${args[2] === "92" ? "/other" : "/repo"}`;
  };
  assert.deepEqual(inspectLocalWorkers("/repo/apps/server", run), {
    workers: [], orphanGroups: [], launchers: [90, 91],
  });
});
