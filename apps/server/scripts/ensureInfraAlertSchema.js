import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';

try {
  const sql = await readFile(new URL('../migrations/20261030_infra_alerts.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('[infra-alert-schema] ready');
} catch (error) {
  console.error('[infra-alert-schema] failed code=%s', error?.code || 'SCHEMA_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
