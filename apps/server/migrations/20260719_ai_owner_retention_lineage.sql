-- AI 持久会话分支谱系：仅保存结构关系，不从标题或消息正文推断历史分支。
-- 执行顺序：ai_assistant_workspace -> ai_owner_retention_hardening -> 本脚本；文件名字典序同样满足该依赖。
-- MySQL 5.7 兼容：information_schema + PREPARE，允许安全重复执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @table_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations'
);

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations' AND COLUMN_NAME = 'root_conversation_id'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_conversations ADD COLUMN root_conversation_id VARCHAR(36) NULL AFTER expire_at',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations' AND COLUMN_NAME = 'parent_conversation_id'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_conversations ADD COLUMN parent_conversation_id VARCHAR(36) NULL AFTER root_conversation_id',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations' AND COLUMN_NAME = 'branch_from_message_id'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  'ALTER TABLE ai_conversations ADD COLUMN branch_from_message_id VARCHAR(36) NULL AFTER parent_conversation_id',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 遗留会话没有可证明的父分支，全部作为独立根；禁止根据标题或消息正文猜测关系。
SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations' AND COLUMN_NAME = 'root_conversation_id'
);
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 1,
  "UPDATE ai_conversations SET root_conversation_id = id WHERE root_conversation_id IS NULL OR root_conversation_id = ''",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations'
    AND INDEX_NAME = 'idx_ai_conversation_lineage_owner'
);
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE ai_conversations ADD KEY idx_ai_conversation_lineage_owner (actor_user_id, subject_user_id, admin_context_mode, admin_context_id, root_conversation_id, create_time)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations'
    AND INDEX_NAME = 'idx_ai_conversation_parent'
);
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE ai_conversations ADD KEY idx_ai_conversation_parent (parent_conversation_id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
