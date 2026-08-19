-- Agent Turn Contract V2 shadow trace（MySQL 5.7 兼容、幂等）。
-- 仅记录枚举、计数、资源集合摘要和稳定错误码；禁止写入用户正文、资源标题、真实 ID 或模型回答。

SET @col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agent_logs'
    AND COLUMN_NAME = 'turn_contract_trace'
);
SET @ddl := IF(
  @col = 0,
  "ALTER TABLE `agent_logs` ADD COLUMN `turn_contract_trace` text DEFAULT NULL AFTER `selected_tools`",
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
