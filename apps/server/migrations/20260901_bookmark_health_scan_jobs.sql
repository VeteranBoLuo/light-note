-- 书签健康检测改为可恢复的持久化后台任务。
-- MySQL 5.7 兼容；任务按账号唯一，重复启动复用当前 pending/running 任务。

CREATE TABLE IF NOT EXISTS `bookmark_health_scan_jobs` (
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `run_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` varchar(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  `total` int unsigned NOT NULL DEFAULT 0,
  `processed` int unsigned NOT NULL DEFAULT 0,
  `alive` int unsigned NOT NULL DEFAULT 0,
  `suspect` int unsigned NOT NULL DEFAULT 0,
  `unknown_count` int unsigned NOT NULL DEFAULT 0,
  `skipped` int unsigned NOT NULL DEFAULT 0,
  `failed` int unsigned NOT NULL DEFAULT 0,
  `lease_owner` varchar(128) DEFAULT NULL,
  `lease_expires_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `heartbeat_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `last_error_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_bookmark_health_scan_run` (`run_id`),
  KEY `idx_bookmark_health_scan_claim` (`status`,`lease_expires_at`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每个账号当前一次书签健康全量检测任务';

CREATE TABLE IF NOT EXISTS `bookmark_health_scan_items` (
  `run_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `bookmark_id` varchar(64) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `status` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  `attempts` tinyint unsigned NOT NULL DEFAULT 0,
  `result_status` varchar(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `result_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`run_id`,`bookmark_id`),
  KEY `idx_bookmark_health_scan_item_claim` (`run_id`,`status`,`attempts`,`bookmark_id`),
  KEY `idx_bookmark_health_scan_item_user` (`user_id`,`run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书签健康全量检测任务快照与逐项结果';
