-- MySQL 5.7 没有 ALTER TABLE ... ADD COLUMN IF NOT EXISTS，使用 information_schema 保持幂等。
-- 应在 20260717_ai_document_attachments.sql 之后执行；若基础表尚未创建则安全空操作。
SET @ai_document_sources_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_document_sources'
);

SET @coverage_metadata_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_document_sources'
    AND COLUMN_NAME = 'coverage_metadata'
);

SET @coverage_metadata_ddl := IF(
  @ai_document_sources_exists = 1 AND @coverage_metadata_exists = 0,
  'ALTER TABLE ai_document_sources ADD COLUMN coverage_metadata JSON NULL AFTER chunk_count',
  'SELECT 1'
);

PREPARE coverage_metadata_statement FROM @coverage_metadata_ddl;
EXECUTE coverage_metadata_statement;
DEALLOCATE PREPARE coverage_metadata_statement;
