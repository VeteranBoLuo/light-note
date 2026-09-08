import pool from '../db/index.js';
import { inspectImagePreviewRuntime } from '../util/imagePreview/runtime.js';
try {
  const runtime = await inspectImagePreviewRuntime();
  const [tables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('image_assets','image_asset_refs','file_preview_artifacts','file_preview_jobs')",
  );
  const [columns] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='file_preview_artifacts' AND COLUMN_NAME IN ('source_revision','image_width','image_height')) OR (TABLE_NAME='file_preview_jobs' AND COLUMN_NAME='output_keys_json') OR (TABLE_NAME='image_assets' AND COLUMN_NAME IN ('reconciled','delete_started_at')))",
  );
  const ok = runtime.ready && tables.length === 4 && columns.length === 6;
  console.log(
    '[image-preview-runtime] runtime=%s schema=%s',
    runtime.ready ? 'ready' : 'unavailable',
    tables.length === 4 && columns.length === 6 ? 'ready' : 'incomplete',
  );
  if (!ok) process.exitCode = 1;
} catch {
  console.error('[image-preview-runtime] check failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
