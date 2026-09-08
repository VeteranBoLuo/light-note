-- Browser push transactional outbox; intentionally no historical backfill.
SET @push_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'browser_push_pending') = 0, 'ALTER TABLE notification ADD COLUMN browser_push_pending tinyint NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE push_stmt FROM @push_ddl; EXECUTE push_stmt; DEALLOCATE PREPARE push_stmt;
SET @push_ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'browser_push_created_at') = 0, 'ALTER TABLE notification ADD COLUMN browser_push_created_at datetime(6) DEFAULT NULL', 'SELECT 1');
PREPARE push_stmt FROM @push_ddl; EXECUTE push_stmt; DEALLOCATE PREPARE push_stmt;
SET @push_ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND INDEX_NAME = 'idx_notification_push') = 0, 'ALTER TABLE notification ADD INDEX idx_notification_push (browser_push_pending, browser_push_created_at)', 'SELECT 1');
PREPARE push_stmt FROM @push_ddl; EXECUTE push_stmt; DEALLOCATE PREPARE push_stmt;
CREATE TABLE IF NOT EXISTS browser_push_subscriptions (
 id char(36) NOT NULL PRIMARY KEY, user_id char(36) NOT NULL,
 endpoint_hash char(64) NOT NULL, endpoint varchar(2048) NOT NULL,
 p256dh varchar(128) NOT NULL, auth varchar(64) NOT NULL,
 generation char(36) NOT NULL, locale varchar(16) NOT NULL DEFAULT 'zh-CN',
 active tinyint NOT NULL DEFAULT 2 COMMENT '0 disabled, 1 enabled, 2 awaiting client binding', enabled_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uk_push_endpoint(endpoint_hash), KEY idx_push_user(user_id, active, enabled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS browser_push_jobs (
 id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
 notification_id char(36) NOT NULL, subscription_id char(36) NOT NULL, generation char(36) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0,
 available_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), expires_at datetime(6) NOT NULL,
 lease_token char(36) DEFAULT NULL, lease_until datetime(6) DEFAULT NULL,
 last_code varchar(32) DEFAULT NULL, created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uk_push_delivery(notification_id, subscription_id),
 KEY idx_push_claim(status, available_at, id), KEY idx_push_subscription(subscription_id, status),
 KEY idx_push_lease(lease_token), KEY idx_push_expiry(status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
