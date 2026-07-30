-- AI 会话侧栏轻量管理：置顶（MySQL 5.7 兼容、可重复执行）

SET @col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_conversations'
    AND COLUMN_NAME = 'is_pinned'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE ai_conversations ADD COLUMN is_pinned tinyint(1) NOT NULL DEFAULT 0 COMMENT '会话是否置顶' AFTER status",
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_conversations'
    AND INDEX_NAME = 'idx_ai_conversation_sidebar'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE ai_conversations ADD INDEX idx_ai_conversation_sidebar (actor_user_id, subject_user_id, admin_context_mode, status, is_pinned, last_message_at)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
