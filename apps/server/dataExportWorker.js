import pool from './db/index.js';
import { assertSchema, runtime } from './util/dataExport/storage.js';
import { processTask, cleanup } from './util/dataExport/worker.js';
import { runExportWorker } from './util/dataExport/workerLoop.js';
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
// 按秒切分等待，收到停止信号后尽快退出。
const sleep = async (ms) => {
  for (let waited = 0; waited < ms && !stopping; waited += 1000)
    await new Promise((r) => setTimeout(r, Math.min(1000, ms - waited)));
};
try {
  await runExportWorker({
    assertSchema: () => assertSchema(pool),
    cleanup,
    processTask,
    isStopping: () => stopping,
    sleep,
    runtime,
  });
} catch {
  console.error('[data-export-worker] DATA_EXPORT_WORKER_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
  // Redis 等长连接会让事件循环一直存活：必须显式退出，交给 pm2 重新拉起，不能留下只显示在线的空进程。
  process.exit();
}
