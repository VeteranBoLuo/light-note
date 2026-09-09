import { resolveLightNoteRuntime } from '../databaseConnectionSafety.js';

export async function assertNoteImportSchema(db) {
  await db.query(
    'SELECT progress_json,finished_at,id,owner_id,status,parent_id,share_fingerprint,upload_bytes,lease_token,lease_until,stop_requested,error_code,create_time,update_time,expires_at FROM note_import_tasks LIMIT 0',
  );
  await db.query(
    'SELECT warning_details,id,task_id,title,source_name,type,status,selected,warnings,image_count,error_code,note_id,position FROM note_import_items LIMIT 0',
  );
}

// Local development can continue before this feature's explicit migration.
// Keep the consumer idle until both tables are ready; production still fails closed.
export async function waitForNoteImportSchema(
  db,
  {
    env = process.env,
    isStopping = () => false,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    warn = (message) => console.warn(message),
  } = {},
) {
  let warned = false;
  while (!isStopping()) {
    try {
      await assertNoteImportSchema(db);
      return true;
    } catch (error) {
      if (
        resolveLightNoteRuntime(env).runtime !== 'local' ||
        !['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)
      )
        throw error;
      if (!warned) {
        warn(
          '[note-import-worker] NOTE_IMPORT_SCHEMA_NOT_READY：笔记导入暂不可用，等待显式迁移 20260909_note_import_tasks.sql 和 20260909_note_import_progress.sql；其他本地服务可继续运行。',
        );
        warned = true;
      }
      // Check shutdown every second while limiting schema probes to once per 30 seconds.
      for (let i = 0; i < 30 && !isStopping(); i++) await pause(1000);
    }
  }
  return false;
}
