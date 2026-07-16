CREATE TABLE IF NOT EXISTS log_exclude_devices (
  device_id VARCHAR(128) NOT NULL,
  fingerprint VARCHAR(128) NOT NULL,
  create_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_id),
  KEY idx_log_exclude_devices_fingerprint (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日志白名单稳定设备标识';

-- 兼容旧版“升级为稳定白名单”已经写入 log_exclude.device_id 的数据。
INSERT IGNORE INTO log_exclude_devices (device_id, fingerprint)
SELECT device_id, fingerprint FROM log_exclude
WHERE device_id IS NOT NULL AND device_id <> '';

UPDATE log_exclude SET device_id = NULL
WHERE device_id IS NOT NULL AND device_id <> '';
