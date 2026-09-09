import pool from './db/index.js';
import { waitForNoteImportSchema } from './util/noteImport/runtime.js';
import { processImportTask, cleanupImports } from './util/noteImport/service.js';
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
try {
  await waitForNoteImportSchema(pool, { isStopping: () => stopping });
  let lastCleanup = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastCleanup > 60000) {
        await cleanupImports();
        lastCleanup = Date.now();
      }
      if (await processImportTask()) continue;
    } catch {
      console.error('[note-import-worker] NOTE_IMPORT_WORKER_FAILED');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
} catch (error) {
  const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code || '') ? error.code : 'NOTE_IMPORT_START_FAILED';
  console.error('[note-import-worker] %s', code);
  process.exitCode = 1;
} finally {
  await pool.end();
}
