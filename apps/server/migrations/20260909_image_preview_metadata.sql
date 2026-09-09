-- Additive and idempotent; apply before starting the v2 preview worker.
SET @preview_metadata_ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='file_preview_artifacts' AND COLUMN_NAME='preview_metadata_json'),
  'SELECT 1', 'ALTER TABLE file_preview_artifacts ADD COLUMN preview_metadata_json MEDIUMTEXT NULL');
PREPARE preview_metadata_stmt FROM @preview_metadata_ddl;
EXECUTE preview_metadata_stmt;
DEALLOCATE PREPARE preview_metadata_stmt;
