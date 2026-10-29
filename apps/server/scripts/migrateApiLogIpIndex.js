import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';

let connection;
try {
  connection = await pool.getConnection();
  const source = await readFile(new URL('../migrations/20261030_api_log_ip_index.sql', import.meta.url), 'utf8');
  for (const statement of source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((sql) => sql.trim())
    .filter(Boolean)) {
    await connection.query(statement);
  }
  const [indexes] = await connection.query("SHOW INDEX FROM api_logs WHERE Key_name = 'idx_api_logs_ip_time'");
  const columns = indexes.sort((a, b) => a.Seq_in_index - b.Seq_in_index).map((row) => row.Column_name);
  if (columns.join(',') !== 'ip,request_time' || indexes.some((row) => row.Sub_part != null)) {
    throw Object.assign(new Error(), { code: 'API_LOG_IP_INDEX_MISMATCH' });
  }
  console.log('[api-log-ip] index ready; historical logs unchanged');
} catch (error) {
  console.error('[api-log-ip] migration failed code=%s', error?.code || 'MIGRATION_FAILED');
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
