import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const assertionPath = path.resolve(scriptDir, '../migrations/schema-assertions.sql');

function splitStatements(source) {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

let failed = false;
try {
  const source = await readFile(assertionPath, 'utf8');
  const statements = splitStatements(source);
  for (const statement of statements) {
    if (!/^SELECT\b/i.test(statement)) {
      throw new Error('SCHEMA_ASSERTION_MUST_BE_READ_ONLY');
    }
    const [rows] = await pool.query(statement);
    if (!Array.isArray(rows) || rows.length === 0) continue;
    failed = true;
    for (const row of rows) {
      console.error('[schema-check] %s: %s', row.check_name || 'failed', row.detail || JSON.stringify(row));
    }
  }
  if (failed) {
    console.error('[schema-check] failed: apply pending migrations before release');
    process.exitCode = 1;
  } else {
    console.log('[schema-check] all assertions passed');
  }
} catch (error) {
  console.error('[schema-check] could not complete code=%s', String(error?.code || error?.message || 'UNKNOWN'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
