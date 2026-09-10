import { execFileSync } from "node:child_process";

const workerScripts =
  /(?:^|\s)(?:\S*\/)?(?:documentWorker|noteImportWorker|browserPushWorker|resourceGovernanceWorker)\.js(?:\s|$)/;
const managedWorkerCommand =
  /(?:^|\s)\S*pnpm(?:\.c?js)?\s+--filter\s+server\s+run\s+worker:(?:documents|note-imports|browser-push|resource-governance)(?::dev)?\s*$/;
const runProcessCommand = (file, args) =>
  execFileSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

// 只回收本仓库启动器遗留的独立 pnpm 进程组；活跃启动器与手动 Worker 不自动停止。
export function inspectLocalWorkers(serverDirectory, run = runProcessCommand) {
  const processes = run("ps", ["-axo", "pid=,ppid=,pgid=,comm=,args="])
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
  const nodeProcess = (row) => /(^|\/)node$/.test(row.command);
  const workers = processes.filter(
    (row) =>
      nodeProcess(row) &&
      workerScripts.test(row.args) &&
      cwd(row.pid) === serverDirectory,
  );
  const rootDirectory = serverDirectory.replace(/\/apps\/server\/?$/, "");
  const orphanGroups = [...new Set(workers.map((row) => row.pgid))].filter(
    (pgid) => {
      const leader = processes.find((row) => row.pid === pgid);
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
  return { workers: workers.map((row) => row.pid), orphanGroups };
}
