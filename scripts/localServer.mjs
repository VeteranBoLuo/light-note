import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const backendPort = 9001;
const watchMode = process.argv.includes("--watch");
const children = new Set();
let shuttingDown = false;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function runChild(label, command, args, { persistent = true } = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);

  child.once("error", (error) => {
    if (!shuttingDown)
      console.error(`\n[本地后端] 无法启动${label}：${error.message}`);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && persistent) {
      const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? "未知"}`;
      console.error(
        `\n[本地后端] ${label}意外结束（${reason}），正在停止其余服务。`,
      );
      void stopAll(code || 1);
    }
  });
  return child;
}

function runPnpm(label, args) {
  return runChild(label, pnpmCommand, args);
}

function sendSignal(child, signal) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  child.kill(signal);
}

async function waitForExit(child, label) {
  await new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${label}执行失败（${signal ? `信号 ${signal}` : `退出码 ${code ?? "未知"}`}）。`,
          ),
        );
    });
    child.once("error", reject);
  });
}

async function waitForPort(port, child, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("HTTP 服务启动失败，请查看上方日志。");
    }
    if (await canConnect(port)) return;
    await sleep(250);
  }
  throw new Error(
    `HTTP 服务在 ${Math.round(timeout / 1000)} 秒内没有监听端口 ${port}。`,
  );
}

async function ensureChildStable(child, label, milliseconds = 800) {
  await sleep(milliseconds);
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`${label}启动失败，请查看上方日志。`);
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  sendSignal(child, "SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000),
  ]);
  if (child.exitCode === null && child.signalCode === null)
    sendSignal(child, "SIGKILL");
}

async function stopAll(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([...children].map(stopChild));
  process.exitCode = exitCode;
}

async function main() {
  console.log("\n[本地后端] 1/3 释放旧的 HTTP 服务端口…");
  const freePort = runChild(
    "端口清理",
    process.execPath,
    [path.join(rootDir, "scripts/freePort.mjs"), String(backendPort)],
    { persistent: false },
  );
  await waitForExit(freePort, "端口清理");

  console.log(
    `[本地后端] 2/3 启动 HTTP 服务${watchMode ? "（监听模式）" : ""}…`,
  );
  const backend = runPnpm("HTTP 服务", [
    "--filter",
    "server",
    "run",
    watchMode ? "dev" : "start",
  ]);

  console.log(
    `[本地后端] 3/3 启动文档与文件预览 Worker${watchMode ? "（监听模式）" : ""}…`,
  );
  const worker = runPnpm("文档与文件预览 Worker", [
    "--filter",
    "server",
    "run",
    watchMode ? "worker:documents:dev" : "worker:documents",
  ]);

  await Promise.all([
    waitForPort(backendPort, backend),
    ensureChildStable(worker, "文档与文件预览 Worker"),
  ]);
  console.log(
    "\n✅ 本地后端已就绪，HTTP 服务与异步文件处理 Worker 将共同运行；按 Ctrl+C 会同时停止。\n",
  );
}

process.on("SIGINT", () => void stopAll(0));
process.on("SIGTERM", () => void stopAll(0));

main().catch(async (error) => {
  console.error(`\n[本地后端] 启动失败：${error.message}`);
  await stopAll(1);
});
