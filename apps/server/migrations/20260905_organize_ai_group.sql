-- 同次整理的资源类型共享 group_id；旧记录保留 NULL，不按时间推断关联。
SET @group_column_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organize_ai_tag_batches' AND COLUMN_NAME = 'group_id'),
  'SELECT 1',
  'ALTER TABLE organize_ai_tag_batches ADD COLUMN group_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL'
);
PREPARE group_column_stmt FROM @group_column_sql;
EXECUTE group_column_stmt;
DEALLOCATE PREPARE group_column_stmt;
SET @group_index_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organize_ai_tag_batches' AND INDEX_NAME = 'idx_organize_ai_tag_group'),
  'SELECT 1',
  'ALTER TABLE organize_ai_tag_batches ADD KEY idx_organize_ai_tag_group (user_id, group_id)'
);
PREPARE group_index_stmt FROM @group_index_sql;
EXECUTE group_index_stmt;
DEALLOCATE PREPARE group_index_stmt;
