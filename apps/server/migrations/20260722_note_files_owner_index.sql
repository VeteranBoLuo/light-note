-- note / files 补 owner 索引:两表此前只有主键(files 另有 folder_id FK),
-- 而所有热路径(列表/工作台统计/成长看板/搜索计数)都按 create_by + del_flag 过滤 → 全站全表扫描。
-- 项目无迁移 runner,本脚本由 DBA/owner 手工在生产执行;幂等(先查 information_schema);
-- 执行前以线上真实库为准复核索引是否已被手工添加过(schema 漂移现状见 docs/architecture.md)。

-- note: 覆盖 create_by + del_flag 过滤,附带 update_time 支撑默认排序
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note' AND INDEX_NAME = 'idx_note_owner'
);
SET @ddl := IF(
  @has_idx = 0,
  'ALTER TABLE `note` ADD INDEX `idx_note_owner` (`create_by`, `del_flag`, `update_time`)',
  'SELECT ''idx_note_owner already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- files: 覆盖 create_by + del_flag 过滤
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND INDEX_NAME = 'idx_files_owner'
);
SET @ddl := IF(
  @has_idx = 0,
  'ALTER TABLE `files` ADD INDEX `idx_files_owner` (`create_by`, `del_flag`)',
  'SELECT ''idx_files_owner already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
