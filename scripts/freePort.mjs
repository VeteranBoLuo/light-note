#!/usr/bin/env node
/**
 * 释放被占用的本地开发端口。
 *
 * 存在的理由：后端 `node app.js` 没有热重载，手动重启时上一个进程往往还在监听，
 * 新进程会因 EADDRINUSE 直接退出，而前端 proxy 仍打到旧进程上——表现为"重启了但代码没生效"。
 *
 * 安全边界：只结束处于 LISTEN 状态、且命令行确实是 Node 的进程；其他进程只报告不动，
 * 交给人判断。端口本来就空闲时静默成功，便于串在 `pnpm dev:server` 前面。
 */
import { execFileSync } from 'node:child_process';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[free-port] 无效端口：${process.argv[2]}`);
  process.exit(1);
}

function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function listeningPids() {
  // -sTCP:LISTEN 保证不会误伤只是连到该端口的客户端连接。
  const out = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return [...new Set(out.split('\n').map((line) => Number(line.trim())).filter(Boolean))];
}

function describe(pid) {
  return run('ps', ['-o', 'command=', '-p', String(pid)]).slice(0, 160);
}

const pids = listeningPids();
if (!pids.length) {
  process.exit(0);
}

let terminated = 0;
for (const pid of pids) {
  const command = describe(pid);
  if (!/(^|\/)node\b/.test(command)) {
    console.warn(`[free-port] 端口 ${port} 被非 Node 进程占用，未处理：pid=${pid} ${command}`);
    continue;
  }
  console.log(`[free-port] 结束占用 ${port} 的旧进程：pid=${pid} ${command}`);
  try {
    process.kill(pid, 'SIGTERM');
    terminated += 1;
  } catch (error) {
    console.warn(`[free-port] 无法结束 pid=${pid}：${error?.code || error?.message}`);
  }
}

if (!terminated) process.exit(0);

// 等待端口真正释放，避免 SIGTERM 尚未生效就启动新进程，重演 EADDRINUSE。
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  const remaining = listeningPids();
  if (!remaining.length) process.exit(0);
  for (const pid of remaining) {
    if (Date.now() > deadline - 2000) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* 进程可能刚好退出 */
      }
    }
  }
  run('sleep', ['0.2']);
}

if (listeningPids().length) {
  console.error(`[free-port] 端口 ${port} 仍被占用，请手动检查：lsof -nP -iTCP:${port} -sTCP:LISTEN`);
  process.exit(1);
}
