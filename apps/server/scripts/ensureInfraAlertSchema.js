import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';

const MIGRATIONS = ['20261030_infra_alerts.sql', '20261030_infra_alert_silences.sql'];

try {
  for (const name of MIGRATIONS) {
    await pool.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  console.log('[infra-alert-schema] ready');
} catch (error) {
  console.error('[infra-alert-schema] failed code=%s', error?.code || 'SCHEMA_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
