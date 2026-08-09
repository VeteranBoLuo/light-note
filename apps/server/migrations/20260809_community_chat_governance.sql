-- 社区客厅治理 MVP：用户屏蔽、举报证据、人工处置审计与临时禁言。
-- MySQL 5.7 兼容；只新增治理表，不会自动开放聊天室或改变现有成员资格。

CREATE TABLE IF NOT EXISTS `community_chat_blocks` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `blocked_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_block_pair` (`user_id`,`blocked_user_id`),
  KEY `idx_community_chat_block_target_time` (`blocked_user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_reports` (
  `id` char(36) NOT NULL,
  `reporter_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `message_id` bigint unsigned NOT NULL,
  `reason_code` varchar(32) NOT NULL,
  `detail` varchar(500) NOT NULL DEFAULT '',
  `evidence_snapshot` json NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `review_note` varchar(500) NOT NULL DEFAULT '',
  `reviewed_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_reporter_message` (`reporter_id`,`message_id`),
  KEY `idx_community_chat_report_status_time` (`status`,`create_time`,`id`),
  KEY `idx_community_chat_report_message_time` (`message_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_moderation_actions` (
  `id` char(36) NOT NULL,
  `report_id` char(36) DEFAULT NULL,
  `actor_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `target_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `message_id` bigint unsigned DEFAULT NULL,
  `action` varchar(32) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_moderation_report` (`report_id`),
  KEY `idx_community_chat_moderation_target_time` (`target_user_id`,`create_time`,`id`),
  KEY `idx_community_chat_moderation_actor_time` (`actor_user_id`,`create_time`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_chat_member_sanctions` (
  `id` char(36) NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `type` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `expires_at` datetime DEFAULT NULL,
  `reason` varchar(500) NOT NULL,
  `created_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `revoked_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_community_chat_sanction_user_status_expiry` (`user_id`,`status`,`expires_at`,`id`),
  KEY `idx_community_chat_sanction_status_expiry` (`status`,`expires_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
