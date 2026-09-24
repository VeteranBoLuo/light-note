-- 管理员排查摘要；历史记录保持 NULL，不回填用户材料。MySQL 5.7 兼容、幂等。
SET @diagnostics_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_executions' AND COLUMN_NAME = 'input_diagnostics_json'),
  'SELECT 1',
  'ALTER TABLE ai_executions ADD COLUMN input_diagnostics_json JSON NULL'
);
PREPARE diagnostics_stmt FROM @diagnostics_ddl;
EXECUTE diagnostics_stmt;
DEALLOCATE PREPARE diagnostics_stmt;
