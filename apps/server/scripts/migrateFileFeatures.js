// Explicit, additive release migrations. Run only with authorization for these changes.
import fs from 'node:fs/promises';
import pool from '../db/index.js';

const files = [
  '20260909_image_preview_metadata.sql',
  '20260909_organize_file_evidence.sql',
  '20260909_note_import_tasks.sql',
  '20260909_visitor_examples.sql',
  '20260909_note_transfer_knowledge.sql',
  '20260909_organize_file_knowledge.sql',
];
let connection;
try {
  if (!process.argv.includes('--apply')) throw Object.assign(new Error(), { code: 'MIGRATION_APPLY_REQUIRED' });
  connection = await pool.getConnection();
  // All reviewed files terminate statements at line ends; literals do not contain line-end semicolons.
  // Keep one connection for MySQL session variables and PREPARE/EXECUTE pairs.
  for (const file of files) {
    const source = await fs.readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    const statements = source.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
      .split(/;\s*(?:\r?\n|$)/).map(sql => sql.trim()).filter(Boolean);
    for (const statement of statements) await connection.query(statement);
    console.log('[file-features-migration] applied %s', file);
  }
} catch (error) {
  if (connection) await connection.rollback();
  console.error('[file-features-migration] failed code=%s', /^[A-Z_]+$/.test(error?.code || '') ? error.code : 'MIGRATION_FAILED');
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
