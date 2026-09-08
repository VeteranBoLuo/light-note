import pool from '../db/index.js';
import { ensureTodoWorkspaceSchema } from '../util/todoWorkspaceSchema.js';
try {
  await ensureTodoWorkspaceSchema();
  console.log('[todo-workspace-schema] ready');
} catch {
  console.error('[todo-workspace-schema] failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
