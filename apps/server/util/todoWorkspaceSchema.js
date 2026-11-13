import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';

// Reuse the reviewed, idempotent structure migration. It contains no data backfill.
export async function ensureTodoWorkspaceSchema(database = pool) {
  const connection = await database.getConnection();
  try {
    for (const file of ['20260908_todo_workspace.sql', '20261113_todo_reminder_pauses.sql']) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      // Session variables and PREPARE must stay on the same connection.
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await connection.query(statement);
      }
    }
  } finally {
    connection.release();
  }
}
