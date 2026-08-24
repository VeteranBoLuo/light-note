-- AI 用量调用详情：保存每个 Provider Span 的顺序、计费归属、保守预算与协议修复触发码。
-- 只记录稳定治理元数据，不保存 Prompt、正文、标题、URL、图片或 Provider 原始错误。
-- MySQL 5.7 无 ADD COLUMN IF NOT EXISTS，按 information_schema 幂等执行。

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_provider_spans' AND column_name='billing_scope'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_provider_spans` ADD COLUMN `billing_scope` VARCHAR(16) NOT NULL DEFAULT ''user'' AFTER `kind`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_provider_spans' AND column_name='sequence_no'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_provider_spans` ADD COLUMN `sequence_no` INT NOT NULL DEFAULT 0 AFTER `billing_scope`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_provider_spans' AND column_name='trigger_code'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_provider_spans` ADD COLUMN `trigger_code` VARCHAR(64) DEFAULT NULL AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_provider_spans' AND column_name='estimated_tokens'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `ai_provider_spans` ADD COLUMN `estimated_tokens` BIGINT NOT NULL DEFAULT 0 AFTER `usage_status`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史协议修复可由受限的 `_repair` 阶段可靠识别；具体触发原因在旧数据中不可逆，保持 NULL。
UPDATE ai_provider_spans
SET billing_scope='platform'
WHERE RIGHT(stage, 7) = '_repair'
  AND billing_scope <> 'platform';
