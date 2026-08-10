-- 社区客厅运行策略：Root 可即时切换全站只读，历史阅读和治理写入保持可用。
-- MySQL 5.7 兼容；环境变量 COMMUNITY_CHAT_EMERGENCY_READ_ONLY 仍可作为更高优先级硬开关。

CREATE TABLE IF NOT EXISTS `community_chat_runtime_policy` (
  `id` tinyint unsigned NOT NULL,
  `posting_enabled` tinyint unsigned NOT NULL DEFAULT 1,
  `updated_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `community_chat_runtime_policy` (`id`, `posting_enabled`)
VALUES (1, 1);
