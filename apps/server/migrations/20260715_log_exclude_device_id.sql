CREATE TABLE IF NOT EXISTS log_exclude (
  fingerprint VARCHAR(128) NOT NULL,
  note VARCHAR(255) DEFAULT NULL,
  create_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日志白名单:自己人设备指纹,免记 api/操作/转化';

SET @device_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'log_exclude' AND COLUMN_NAME = 'device_id'
);
SET @ddl := IF(
  @device_col = 0,
  'ALTER TABLE log_exclude ADD COLUMN device_id VARCHAR(128) DEFAULT NULL AFTER fingerprint',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @device_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'log_exclude' AND INDEX_NAME = 'uniq_log_exclude_device_id'
);
SET @ddl := IF(
  @device_idx = 0,
  'ALTER TABLE log_exclude ADD UNIQUE KEY uniq_log_exclude_device_id (device_id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
