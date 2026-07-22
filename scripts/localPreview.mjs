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
const previewPort = 4173;
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

async function ensurePortAvailable(port, serviceName) {
  if (await canConnect(port)) {
    throw new Error(
      `${serviceName}端口 ${port} 已被占用。请先关闭旧的本地服务，再重新执行 pnpm preview。`,
    );
  }
}

function runPnpm(label, args) {
  const child = spawn(pnpmCommand, args, {
    cwd: rootDir,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);

  child.once("error", (error) => {
    if (!shuttingDown)
      console.error(`\n[本地预览] 无法启动${label}：${error.message}`);
  });

  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? "未知"}`;
      console.error(
        `\n[本地预览] ${label}意外结束（${reason}），正在停止其余本地服务。`,
      );
      void stopAll(1);
    }
  });

  return child;
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

async function waitForPort(port, child, serviceName, timeout = 60_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${serviceName}启动失败，请查看上方日志。`);
    }
    if (await canConnect(port)) return;
    await sleep(250);
  }

  throw new Error(
    `${serviceName}在 ${Math.round(timeout / 1000)} 秒内没有监听端口 ${port}。`,
  );
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
  await ensurePortAvailable(backendPort, "本地后端");
  await ensurePortAvailable(previewPort, "前端预览");

  console.log(
    "\n[本地预览] 1/2 启动本机后端代码（依赖使用 apps/server/.env 的现有配置）…",
  );
  const backend = runPnpm("本机后端", ["--filter", "server", "run", "start"]);
  await waitForPort(backendPort, backend, "本机后端");

  console.log("\n[本地预览] 2/2 构建生产前端产物，并启动本地预览页…");
  const preview = runPnpm("前端预览", [
    "--filter",
    "web",
    "run",
    "preview:local",
  ]);
  await waitForPort(previewPort, preview, "前端预览");

  console.log(`\n✅ 本地上线预览已就绪：http://127.0.0.1:${previewPort}`);
  console.log("   前端与后端均为本机当前代码；按 Ctrl+C 会同时停止它们。\n");
}

process.on("SIGINT", () => void stopAll(0));
process.on("SIGTERM", () => void stopAll(0));

main().catch(async (error) => {
  console.error(`\n[本地预览] 启动失败：${error.message}`);
  await stopAll(1);
});
