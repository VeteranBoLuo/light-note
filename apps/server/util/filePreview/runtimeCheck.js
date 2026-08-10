import pool from '../../db/index.js';
import { inspectAllFilePreviewRuntimes } from './runtime.js';

const requiredColumns = {
  file_preview_artifacts: ['file_id', 'strategy', 'strategy_version', 'source_etag', 'status', 'manifest_json'],
  file_preview_jobs: ['artifact_id', 'status', 'attempts', 'available_at', 'locked_at', 'output_object_key'],
};

const requiredIndexes = {
  file_preview_artifacts: ['uk_file_preview_artifact', 'idx_file_preview_owner_status'],
  file_preview_jobs: ['uk_file_preview_job_artifact', 'idx_file_preview_job_queue'],
};

export async function checkFilePreviewRuntime() {
  const missing = [];
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const [rows] = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    const actual = new Set(rows.map((row) => String(row.column_name)));
    if (!actual.size) missing.push(`table:${table}`);
    for (const column of columns) if (!actual.has(column)) missing.push(`column:${table}.${column}`);
  }
  for (const [table, indexes] of Object.entries(requiredIndexes)) {
    const [rows] = await pool.query(
      `SELECT DISTINCT index_name FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [table],
    );
    const actual = new Set(rows.map((row) => String(row.index_name)));
    for (const index of indexes) if (!actual.has(index)) missing.push(`index:${table}.${index}`);
  }
  const runtimes = await inspectAllFilePreviewRuntimes({ force: true });
  const runtimeReady =
    (!runtimes.archive.config.archiveEnabled || runtimes.archive.ready) &&
    (!runtimes.office.config.officeEnabled || runtimes.office.ready);
  return { ok: !missing.length && runtimeReady, schema: { ok: !missing.length, missing }, runtimes };
}
