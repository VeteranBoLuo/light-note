-- 短期赠礼风控事实；不发放资产，不保存原始 IP、正文或账号凭据。
CREATE TABLE IF NOT EXISTS ai_level_gift_registrations (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  user_id varchar(64) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  network_key char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  registered_at datetime NOT NULL,
  checked_at datetime(3) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_gift_registration_user (user_id),
  KEY idx_gift_registration_time (registered_at),
  KEY idx_gift_registration_pending (checked_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_level_gift_risk_usage (
  execution_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_tokens bigint unsigned NOT NULL DEFAULT 0,
  known_tokens bigint unsigned NOT NULL DEFAULT 0,
  created_at datetime NOT NULL,
  PRIMARY KEY (execution_id),
  KEY idx_gift_risk_usage_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @gift_known_col := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='ai_level_gift_risk_usage' AND column_name='known_tokens');
SET @gift_known_ddl := IF(@gift_known_col=0,
  'ALTER TABLE ai_level_gift_risk_usage ADD known_tokens bigint unsigned NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE gift_known_stmt FROM @gift_known_ddl;
EXECUTE gift_known_stmt;
DEALLOCATE PREPARE gift_known_stmt;
