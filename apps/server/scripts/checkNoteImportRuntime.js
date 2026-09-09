import fs from 'node:fs/promises';
import pool from '../db/index.js';
import { assertNoteImportSchema } from '../util/noteImport/runtime.js';
import { importRoot } from '../util/noteImport/storage.js';
let failed = false;
try {
  await assertNoteImportSchema(pool);
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS count FROM note_import_tasks WHERE status IN ('queued','running','parsing') AND update_time<DATE_SUB(NOW(),INTERVAL 10 MINUTE) AND (lease_until IS NULL OR lease_until<NOW())",
  );
  if (Number(row.count)) throw new Error('NOTE_IMPORT_WORKER_STALLED');
  await fs.mkdir(importRoot, { recursive: true, mode: 0o700 });
  await fs.access(importRoot, fs.constants.R_OK | fs.constants.W_OK);
  console.log('[note-import-check] schema and staging ready');
} catch (e) {
  failed = true;
  console.error(
    '[note-import-check] %s',
    /^NOTE_IMPORT_/.test(e.message) ? e.message : 'NOTE_IMPORT_RUNTIME_NOT_READY',
  );
} finally {
  await pool.end();
  if (failed) process.exitCode = 1;
}
