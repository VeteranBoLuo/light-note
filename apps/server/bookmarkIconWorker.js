#!/usr/bin/env node
/**
 * bookmarkIconWorker.js
 *
 * 书签图标后台补全 Worker。
 * 独立进程运行：node bookmarkIconWorker.js
 *
 * 通过 MySQL 5.7 兼容的事务 FOR UPDATE 抢占任务。
 * 循环：抢占 → 按 Origin 分组 → 抓取 → 更新 → 等待 → 重复
 */

import { claimTasks, processTaskBatch } from './util/bookmarkIconWorkerService.js';

const WORKER_ID = process.env.BOOKMARK_ICON_WORKER_ID || `worker-${require('crypto').randomUUID().slice(0, 8)}`;
const BATCH_SIZE = parseInt(process.env.BOOKMARK_ICON_WORKER_BATCH_SIZE || "30", 10);
const POLL_MS = parseInt(process.env.BOOKMARK_ICON_WORKER_POLL_MS || "1500", 10);
const LOCK_TIMEOUT_MINUTES = Math.ceil(
  (parseInt(process.env.BOOKMARK_ICON_WORKER_LOCK_TIMEOUT_MS || "300000", 10)) / 60000
);

console.log(`[bookmark-icon-worker] 启动 Worker ID=${WORKER_ID}, batchSize=${BATCH_SIZE}, poll=${POLL_MS}ms`);

let running = true;

process.on('SIGINT', () => { running = false; console.log('[bookmark-icon-worker] 收到 SIGINT，优雅停止...'); });
process.on('SIGTERM', () => { running = false; console.log('[bookmark-icon-worker] 收到 SIGTERM，优雅停止...'); });

async function mainLoop() {
  while (running) {
    try {
      const tasks = await claimTasks(WORKER_ID, BATCH_SIZE, LOCK_TIMEOUT_MINUTES);
      if (tasks.length > 0) {
        const result = await processTaskBatch(tasks, WORKER_ID);
        console.log(`[bookmark-icon-worker] 处理 ${result.processed}/${tasks.length} 个任务`);
      } else {
        // 无任务时指数退避
        await sleep(POLL_MS);
      }
    } catch (err) {
      console.error('[bookmark-icon-worker] 错误:', err.message);
      await sleep(POLL_MS * 2);
    }
  }
  console.log('[bookmark-icon-worker] 已停止');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

mainLoop();
