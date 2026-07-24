#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { claimTasks, processTaskBatch } from './util/bookmarkIconWorkerService.js';

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

async function mainLoop() {
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

void mainLoop();
