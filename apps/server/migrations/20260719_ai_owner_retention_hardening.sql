-- AI 持久对象 owner 域与临时会话保留策略加固。
-- MySQL 5.7 兼容：通过 information_schema + PREPARE 保持重复执行安全。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 普通上下文的 owner 必须使用 NULL；非 normal 且缺 context id 的历史脏数据保持不可访问，等待人工审计。
SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations');
SET @ddl := IF(@table_exists = 1, "UPDATE ai_conversations SET admin_context_id = NULL WHERE admin_context_mode = 'normal' AND admin_context_id IS NOT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  @table_exists = 1,
  "UPDATE ai_conversations
     SET expire_at = CASE
       WHEN expire_at IS NULL THEN CURRENT_TIMESTAMP
       WHEN expire_at > DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
         THEN DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
       ELSE expire_at
     END
   WHERE retention_mode = 'temporary'
     AND (expire_at IS NULL OR expire_at > DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY))",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets');
SET @ddl := IF(@table_exists = 1, "UPDATE ai_change_sets SET admin_context_id = NULL WHERE admin_context_mode = 'normal' AND admin_context_id IS NOT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_memories');
SET @ddl := IF(@table_exists = 1, "UPDATE ai_memories SET admin_context_id = NULL WHERE admin_context_mode = 'normal' AND admin_context_id IS NOT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_response_events');
SET @ddl := IF(@table_exists = 1, "UPDATE ai_response_events SET admin_context_id = NULL WHERE admin_context_mode = 'normal' AND admin_context_id IS NOT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- nullable admin_context_id 不能直接承担 UNIQUE 域（MySQL 允许多个 NULL）；使用 STORED 归一化列。
SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets');
SET @column_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND COLUMN_NAME = 'admin_context_scope');
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  "ALTER TABLE ai_change_sets ADD COLUMN admin_context_scope VARCHAR(64)
     GENERATED ALWAYS AS (IFNULL(admin_context_id, '')) STORED AFTER admin_context_id",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND INDEX_NAME = 'uk_ai_change_set_request_context');
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE ai_change_sets ADD UNIQUE KEY uk_ai_change_set_request_context (actor_user_id, subject_user_id, admin_context_mode, admin_context_scope, request_id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 先成功建立四维唯一索引，再移除旧索引。若历史重复数据导致建索引失败，旧保护仍然保留。
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND INDEX_NAME = 'uk_ai_change_set_request');
SET @ddl := IF(@table_exists = 1 AND @index_exists > 0, 'ALTER TABLE ai_change_sets DROP INDEX uk_ai_change_set_request', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_response_events');
SET @column_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_response_events' AND COLUMN_NAME = 'admin_context_scope');
SET @ddl := IF(
  @table_exists = 1 AND @column_exists = 0,
  "ALTER TABLE ai_response_events ADD COLUMN admin_context_scope VARCHAR(64)
     GENERATED ALWAYS AS (IFNULL(admin_context_id, '')) STORED AFTER admin_context_id",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_response_events' AND INDEX_NAME = 'uk_ai_response_event_context');
SET @ddl := IF(
  @table_exists = 1 AND @index_exists = 0,
  'ALTER TABLE ai_response_events ADD UNIQUE KEY uk_ai_response_event_context (actor_user_id, subject_user_id, admin_context_mode, admin_context_scope, request_id, event_id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_response_events' AND INDEX_NAME = 'uk_ai_response_event');
SET @ddl := IF(@table_exists = 1 AND @index_exists > 0, 'ALTER TABLE ai_response_events DROP INDEX uk_ai_response_event', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- owner 列顺序与服务层 actor + subject + mode + context 精确谓词一致。
SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations');
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations' AND INDEX_NAME = 'idx_ai_conversation_owner');
SET @ddl := IF(@table_exists = 1 AND @index_exists > 0, 'ALTER TABLE ai_conversations DROP INDEX idx_ai_conversation_owner', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_conversations' AND INDEX_NAME = 'idx_ai_conversation_owner');
SET @ddl := IF(@table_exists = 1 AND @index_exists = 0, 'ALTER TABLE ai_conversations ADD KEY idx_ai_conversation_owner (actor_user_id, subject_user_id, admin_context_mode, admin_context_id, status, last_message_at)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets');
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND INDEX_NAME = 'idx_ai_change_set_owner');
SET @ddl := IF(@table_exists = 1 AND @index_exists > 0, 'ALTER TABLE ai_change_sets DROP INDEX idx_ai_change_set_owner', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_change_sets' AND INDEX_NAME = 'idx_ai_change_set_owner');
SET @ddl := IF(@table_exists = 1 AND @index_exists = 0, 'ALTER TABLE ai_change_sets ADD KEY idx_ai_change_set_owner (actor_user_id, subject_user_id, admin_context_mode, admin_context_id, status, create_time)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @table_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_memories');
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_memories' AND INDEX_NAME = 'idx_ai_memory_owner');
SET @ddl := IF(@table_exists = 1 AND @index_exists > 0, 'ALTER TABLE ai_memories DROP INDEX idx_ai_memory_owner', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @index_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_memories' AND INDEX_NAME = 'idx_ai_memory_owner');
SET @ddl := IF(@table_exists = 1 AND @index_exists = 0, 'ALTER TABLE ai_memories ADD KEY idx_ai_memory_owner (actor_user_id, subject_user_id, admin_context_mode, admin_context_id, status, update_time)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
