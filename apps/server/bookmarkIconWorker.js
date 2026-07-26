#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { claimTasks, processTaskBatch } from './util/bookmarkIconWorkerService.js';
import { bookmarkIconBackgroundJobsEnabled } from './util/bookmarkIconBatchService.js';
import { assertBookmarkIconWorkerRuntime } from './util/bookmarkIconRuntimeCheck.js';

const WORKER_ID =
  process.env.BOOKMARK_ICON_WORKER_ID ||
  `worker-${randomUUID().slice(0, 8)}`;

const BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.BOOKMARK_ICON_WORKER_BATCH_SIZE || '60', 10),
);

const POLL_MS = Math.max(
  100,
  Number.parseInt(process.env.BOOKMARK_ICON_WORKER_POLL_MS || '500', 10),
);

const LOCK_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(
    process.env.BOOKMARK_ICON_WORKER_LOCK_TIMEOUT_MS || '180000',
    10,
  ),
);

const LOCK_TIMEOUT_MINUTES = Math.max(
  1,
  Math.ceil(LOCK_TIMEOUT_MS / 60_000),
);

let running = true;

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mainLoop({
  runtimeCheck = assertBookmarkIconWorkerRuntime,
} = {}) {
  if (!bookmarkIconBackgroundJobsEnabled()) {
    console.log('[bookmark-icon-worker] disabled by feature flag');
    while (running) await sleep(1000);
    return;
  }

  await runtimeCheck();
  console.log(
    '[bookmark-icon-worker] started id=%s batch=%s poll=%sms',
    WORKER_ID,
    BATCH_SIZE,
    POLL_MS,
  );

  while (running) {
    try {
      const tasks = await claimTasks(WORKER_ID, BATCH_SIZE, LOCK_TIMEOUT_MINUTES);

      if (!tasks.length) {
        await sleep(POLL_MS);
        continue;
      }

      const startedAt = Date.now();
      const result = await processTaskBatch(tasks, WORKER_ID);

      console.log(
        '[bookmark-icon-worker] processed=%s claimed=%s durationMs=%s',
        result.processed,
        tasks.length,
        Date.now() - startedAt,
      );
    } catch (error) {
      console.error(
        '[bookmark-icon-worker] loop failed code=%s',
        String(error?.code || error?.name || 'UNKNOWN'),
      );
      await sleep(POLL_MS * 2);
    }
  }

  console.log('[bookmark-icon-worker] stopped');
}

// PM2 会通过自己的容器入口加载脚本，此时 process.argv[1] 不一定是业务脚本路径。
// NODE_APP_INSTANCE 是 PM2 为托管进程注入的稳定标识；保留 argv 判断以兼容直接 node 启动。
const isDirectRun =
  process.env.NODE_APP_INSTANCE !== undefined ||
  (process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false);

if (isDirectRun) {
  void mainLoop().catch((error) => {
    console.error(
      '[bookmark-icon-worker] startup failed code=%s',
      String(error?.code || error?.name || 'UNKNOWN'),
    );
    process.exitCode = 1;
  });
}
