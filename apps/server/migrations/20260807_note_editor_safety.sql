-- 笔记编辑安全底座：乐观并发 revision + 可审计历史版本来源。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，统一用 information_schema 幂等执行。
-- 只声明结构；发布前按 release gate 手工执行，应用启动时不自动改库。
-- 在线 DDL 无法成立或元数据锁超过 5 秒时直接失败，避免长时间阻塞线上请求。

SET SESSION lock_wait_timeout = 5;

SET @note_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note'
);

SET @note_revision_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note' AND COLUMN_NAME = 'revision'
);
SET @note_revision_ddl := IF(
  @note_table_exists = 1 AND @note_revision_exists = 0,
  'ALTER TABLE note ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''正文/标题乐观并发版本号'' AFTER type, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE note_revision_stmt FROM @note_revision_ddl;
EXECUTE note_revision_stmt;
DEALLOCATE PREPARE note_revision_stmt;

SET @note_versions_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note_versions'
);

SET @source_revision_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note_versions' AND COLUMN_NAME = 'source_revision'
);
SET @source_revision_ddl := IF(
  @note_versions_table_exists = 1 AND @source_revision_exists = 0,
  'ALTER TABLE note_versions ADD COLUMN source_revision BIGINT UNSIGNED NULL COMMENT ''快照对应的原笔记 revision'' AFTER type, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE source_revision_stmt FROM @source_revision_ddl;
EXECUTE source_revision_stmt;
DEALLOCATE PREPARE source_revision_stmt;

SET @version_reason_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note_versions' AND COLUMN_NAME = 'reason'
);
SET @version_reason_ddl := IF(
  @note_versions_table_exists = 1 AND @version_reason_exists = 0,
  'ALTER TABLE note_versions ADD COLUMN reason VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''autosave'' COMMENT ''快照来源'' AFTER source_revision, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'
);
PREPARE version_reason_stmt FROM @version_reason_ddl;
EXECUTE version_reason_stmt;
DEALLOCATE PREPARE version_reason_stmt;
