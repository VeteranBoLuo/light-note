import pool from './db/index.js';
import { assertSchema, runtime } from './util/dataExport/storage.js';
import { processTask, cleanup } from './util/dataExport/worker.js';
let stopping = false,
  lastCleanup = 0,
  warned = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
try {
  while (!stopping) {
    try {
      await assertSchema(pool);
      if (Date.now() - lastCleanup > 60000) {
        await cleanup();
        lastCleanup = Date.now();
      }
      if (await processTask()) continue;
    } catch (e) {
      if (runtime !== 'local' || !['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(e.code)) throw e;
      if (!warned) {
        console.warn('[data-export-worker] DATA_EXPORT_SCHEMA_NOT_READY');
        warned = true;
      }
      for (let i = 0; i < 30 && !stopping; i++) await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
} catch {
  console.error('[data-export-worker] DATA_EXPORT_WORKER_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
