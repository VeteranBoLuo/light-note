import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';
import { localSqlStatements } from '../util/localSqlStatements.js';

try {
  for (const filename of ['20261116_points_leaderboard.sql', '20261116_points_leaderboard_freeze_lock.sql']) {
    const sql = await readFile(new URL('../migrations/' + filename, import.meta.url), 'utf8');
    for (const statement of localSqlStatements(sql)) await pool.query(statement);
  }
  console.log('Points leaderboard schema installed.');
} catch (error) {
  console.error('LEADERBOARD_MIGRATION_FAILED code=%s', error?.code || 'UNKNOWN');
  process.exitCode = 1;
} finally {
  await pool.end();
}
