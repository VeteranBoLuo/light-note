import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

function signal(target, value) {
  try {
    process.kill(target, value);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitUntilGone(target, timeout) {
  const deadline = Date.now() + timeout;
  while (signal(target, 0)) {
    if (Date.now() >= deadline) return false;
    await sleep(50);
  }
  return true;
}

// detached 子进程的 PID 即 PGID；领头进程退出后仍须检查整个组。
export async function stopProcessGroup(pgid, { graceMs = 5_000, killMs = 2_000 } = {}) {
  if (!Number.isSafeInteger(pgid) || pgid <= 1)
    throw new Error("无效的托管进程组。");
  const target = -pgid;
  if (!signal(target, "SIGTERM")) return;
  if (await waitUntilGone(target, graceMs)) return;
  if (!signal(target, "SIGKILL")) return;
  if (!(await waitUntilGone(target, killMs)))
    throw new Error(`进程组 ${pgid} 在强制停止后仍未退出。`);
}

export async function stopManagedChild(child, options) {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    await stopProcessGroup(child.pid, options);
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (!(await waitUntilGone(child.pid, options?.graceMs ?? 5_000))) {
    child.kill("SIGKILL");
    if (!(await waitUntilGone(child.pid, options?.killMs ?? 2_000)))
      throw new Error(`进程 ${child.pid} 在强制停止后仍未退出。`);
  }
}
