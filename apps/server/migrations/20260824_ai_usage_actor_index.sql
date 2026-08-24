-- 用户 AI 用量明细按“实际支付者 + 时间”查询。管理员代管时 actor 与 subject 可能不同，
-- 不能复用 subject_user_id 索引。MySQL 5.7 无 ADD INDEX IF NOT EXISTS，按目录幂等执行。

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='ai_executions'
    AND index_name='idx_ai_execution_actor_created'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `ai_executions` ADD KEY `idx_ai_execution_actor_created` (`actor_user_id`,`created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
