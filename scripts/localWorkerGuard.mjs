import { execFileSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";

// 非凭据标记，作为脚本参数传给 Worker，watch 子进程也会保留。
export function localWorkerOwnerArg(rootDirectory) {
  return `--lightnote-local-owner=${createHash("sha256").update(path.resolve(rootDirectory)).digest("hex")}`;
}

const workerScripts =
  /(?:^|\s)(?:\S*\/)?(?:dataExportWorker|documentWorker|noteImportWorker|browserPushWorker|resourceGovernanceWorker)\.js(?:\s|$)/;
const managedWorkerCommand =
  /(?:^|\s)\S*pnpm(?:\.c?js)?\s+--filter\s+server\s+run\s+worker:(?:data-exports|documents|note-imports|browser-push|resource-governance)(?::dev)?(?:\s+--lightnote-local-owner=[a-f0-9]{64})?\s*$/;
const runProcessCommand = (file, args) =>
  execFileSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

// 启动器按脚本路径和工作目录确认；手动 Worker 不自动停止。
export function inspectLocalWorkers(serverDirectory, run = runProcessCommand) {
  const processes = run("ps", ["-axww", "-o", "pid=,ppid=,pgid=,comm=,args="])
    .split("\n")
    .flatMap((row) => {
      const match = row.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      return match
        ? [
            {
              pid: Number(match[1]),
              ppid: Number(match[2]),
              pgid: Number(match[3]),
              command: match[4],
              args: match[5],
            },
          ]
        : [];
    });
  const cwd = (pid) => {
    try {
      return run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
        .split("\n")
        .find((line) => line.startsWith("n"))
        ?.slice(1);
    } catch {
      return null;
    }
  };
  const nodeProcess = (row) => {
    if (/(^|\/)node$/.test(row.command)) return true;
    // macOS 的 comm 列会截断绝对路径；watch 子进程使用完整 Node 路径。
    const executable = row.args.split(/\s+/, 1)[0];
    return row.command.startsWith("/") &&
      executable.startsWith(row.command) && /\/node$/.test(executable);
  };
  const workers = processes.filter(
    (row) =>
      nodeProcess(row) &&
      workerScripts.test(row.args) &&
      cwd(row.pid) === serverDirectory,
  );
  const rootDirectory = serverDirectory.replace(/\/apps\/server\/?$/, "");
  const launchers = processes.filter((row) => {
    if (row.pid === process.pid || !nodeProcess(row)) return false;
    const script = row.args.match(/^\S+\s+(\S+)(?:\s+--watch)?\s*$/)?.[1];
    return (
      script &&
      path.resolve(rootDirectory, script) === path.join(rootDirectory, "scripts/localServer.mjs") &&
      cwd(row.pid) === rootDirectory
    );
  }).map((row) => row.pid);
  const orphanGroups = [...new Set(workers.map((row) => row.pgid))].filter(
    (pgid) => {
      const leader = processes.find((row) => row.pid === pgid);
      if (!leader) {
        const members = processes.filter((row) => row.pgid === pgid);
        // 无领头进程时，必须所有成员均为本仓库明确托管的 Worker。
        // 旧版本无标记的残留继续失败关闭，不能猜测其来源。
        return members.length > 0 && members.every((row) =>
          workers.includes(row) &&
          row.args.split(/\s+/).includes(localWorkerOwnerArg(rootDirectory)) &&
          (row.ppid === 1 || members.some((parent) => parent.pid === row.ppid)),
        );
      }
      return (
        leader &&
        leader.ppid === 1 &&
        leader.pgid === leader.pid &&
        nodeProcess(leader) &&
        managedWorkerCommand.test(leader.args) &&
        cwd(leader.pid) === rootDirectory
      );
    },
  );
  return { workers: workers.map((row) => row.pid), orphanGroups, launchers };
}
