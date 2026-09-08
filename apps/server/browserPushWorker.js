import { assertBrowserPushRuntime } from './util/browserPushRuntime.js';
import { pathToFileURL } from 'node:url';
import pool from './db/index.js';
import { browserPushEnabled } from './util/browserPushPolicy.js';
import { expandPushOutbox, processNextPush } from './util/browserPushService.js';
export async function mainLoop() {
  let running = true;
  const stop = () => {
    running = false;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  if (process.env.BROWSER_PUSH_ENABLED === 'true') await assertBrowserPushRuntime(pool);
  const counts = {};
  let lastReport = Date.now();
  while (running) {
    if (!browserPushEnabled()) {
      await pause(1000);
      continue;
    }
    try {
      await expandPushOutbox();
      let hadWork = false;
      for (let i = 0; i < 20 && running; i++) {
        const result = await processNextPush();
        if (!result) break;
        hadWork = true;
        counts[result.status] = (counts[result.status] || 0) + 1;
        counts.maxDelaySeconds = Math.max(counts.maxDelaySeconds || 0, result.delaySeconds);
      }
      if (Date.now() - lastReport > 60000) {
        console.log('[browser-push-worker] outcomes=%j', counts);
        for (const key of Object.keys(counts)) delete counts[key];
        lastReport = Date.now();
        await pool.query(
          'DELETE FROM browser_push_subscriptions WHERE active <> 1 AND enabled_at < DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1000',
        );
        await pool.query(
          "DELETE FROM browser_push_jobs WHERE status NOT IN ('pending', 'sending') AND expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1000",
        );
      }
      if (!hadWork) await pause(1000);
    } catch {
      console.error('[browser-push-worker] code=PUSH_WORKER_FAILED');
      await pause(2000);
    }
  }
  await pool.end();
}
if (
  process.env.NODE_APP_INSTANCE !== undefined ||
  (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
) {
  mainLoop().catch(() => {
    console.error('[browser-push-worker] code=PUSH_START_FAILED');
    process.exitCode = 1;
    void pool.end();
  });
}
