-- AI 运行中心按统一根执行的创建时间 + 稳定 ID 做倒序游标扫描。
-- MySQL 5.7 不支持 ADD INDEX IF NOT EXISTS，按 information_schema 幂等执行。

SET @idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='ai_executions'
    AND index_name='idx_ai_execution_admin_created'
);
SET @ddl := IF(
  @idx = 0,
  'ALTER TABLE `ai_executions` ADD KEY `idx_ai_execution_admin_created` (`created_at`,`id`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Provider 筛选先按供应商收敛 Span，再用 execution_id 回到根执行，避免相关 EXISTS 扫描同供应商全部历史。
SET @provider_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='ai_provider_spans'
    AND index_name='idx_ai_provider_span_provider_execution'
);
SET @provider_ddl := IF(
  @provider_idx = 0,
  'ALTER TABLE `ai_provider_spans` ADD KEY `idx_ai_provider_span_provider_execution` (`provider`,`execution_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @provider_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
