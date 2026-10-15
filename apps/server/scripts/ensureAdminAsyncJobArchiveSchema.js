import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';

try {
  const sql = await readFile(new URL('../migrations/20261015_admin_async_job_archives.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('[async-job-archive-schema] ready');
} catch (error) {
  console.error('[async-job-archive-schema] failed code=%s', error?.code || 'SCHEMA_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
