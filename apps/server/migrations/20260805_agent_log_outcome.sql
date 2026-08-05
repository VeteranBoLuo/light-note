-- AI 调用监控：结果轮廓与动作链路串联字段（幂等、兼容 MySQL 5.7）。
-- 背景：agent_logs 原本只记录提问与工具，看不出「有没有产出回复」「确认卡有没有发出去」
-- 「用户点了确认还是驳回」。首轮发卡与用户确认落地是两个独立请求、两个 request_id，
-- 此前无法关联，后台只能看到两条互不相关的记录。
--
-- 隐私口径：仍然不落回复全文。answer_chars/outcome_kind 是长期保留的结构化轮廓；
-- answer_digest 只存脱敏后的开头片段，由 operationalLogRetention 的每日调度按
-- AGENT_LOG_DIGEST_RETENTION_DAYS（默认 7 天）置空，轮廓字段不受影响。

SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs');

-- 同一动作链路的分组键：首轮发卡记录填自己的 request_id，确认/驳回记录回填首轮 request_id。
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'correlation_id');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `correlation_id` varchar(64) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'confirmation_id');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `confirmation_id` varchar(64) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 结果轮廓：answer / confirmation_card / rejected / action_only / error / aborted / blocked / empty
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'outcome_kind');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `outcome_kind` varchar(32) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'answer_chars');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `answer_chars` int DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 脱敏摘要，短保留。列宽 500 是为了容纳脱敏替换后可能变长的文本，写入侧仍按 200 字截断。
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'answer_digest');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `answer_digest` varchar(500) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 终态是否真的写给了客户端：区分「服务端产出了但连接已断」与「根本没产出」。
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND COLUMN_NAME = 'delivered');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `agent_logs` ADD COLUMN `delivered` tinyint(1) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 后台详情按链路分组查询：correlation_id + 时间正序。
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_logs' AND INDEX_NAME = 'idx_agent_logs_correlation');
SET @ddl := IF(@tbl = 1 AND @idx = 0, "ALTER TABLE `agent_logs` ADD KEY `idx_agent_logs_correlation` (`correlation_id`, `created_at`)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
