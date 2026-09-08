import { readFile } from 'node:fs/promises';
import pool from '../db/index.js';

// Reuse the reviewed, idempotent structure migration. It contains no data backfill.
export async function ensureTodoWorkspaceSchema(database = pool) {
  const sql = await readFile(new URL('../migrations/20260908_todo_workspace.sql', import.meta.url), 'utf8');
  const connection = await database.getConnection();
  try {
    // Session variables and PREPARE must stay on the same connection.
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
  } finally {
    connection.release();
  }
}
