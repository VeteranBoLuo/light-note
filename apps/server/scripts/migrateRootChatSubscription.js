import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';
let connection;
try {
  connection = await pool.getConnection();
  const sql = await readFile(new URL('../migrations/20261012_root_chat_subscription.sql', import.meta.url), 'utf8');
  for (const statement of sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await connection.query(statement);
  }
  const [[column]] = await connection.query(
    "SELECT column_default FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='community_chat_user_settings' AND column_name='root_all_messages_enabled'",
  );
  if (String(column?.column_default) !== '1') throw new Error('ROOT_CHAT_SCHEMA_MISMATCH');
  console.log('[root-chat] subscription schema ready; no historical notifications generated');
} catch (error) {
  console.error('[root-chat] migration failed', error.code || 'ROOT_CHAT_SCHEMA_MISMATCH');
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
