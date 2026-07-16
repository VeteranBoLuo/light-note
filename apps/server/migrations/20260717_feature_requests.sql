-- 共建轻笺：公开需求看板（MySQL 5.7）

CREATE TABLE IF NOT EXISTS `feature_requests` (
  `id` char(36) NOT NULL,
  `title` varchar(160) NOT NULL,
  `content` text NOT NULL,
  `category` varchar(32) NOT NULL DEFAULT 'other',
  `source_type` varchar(16) NOT NULL DEFAULT 'user' COMMENT 'user/official',
  `submitter_user_id` char(36) NOT NULL,
  `show_identity` tinyint NOT NULL DEFAULT 1,
  `moderation_status` varchar(32) NOT NULL DEFAULT 'pending_review',
  `progress_status` varchar(32) NOT NULL DEFAULT 'evaluating',
  `merged_to_id` char(36) DEFAULT NULL,
  `developer_reply` text,
  `release_url` varchar(500) DEFAULT NULL,
  `vote_count` int unsigned NOT NULL DEFAULT 0,
  `published_at` datetime DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `del_flag` tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_feature_public` (`moderation_status`, `progress_status`, `update_time`),
  KEY `idx_feature_submitter` (`submitter_user_id`, `create_time`),
  KEY `idx_feature_merged` (`merged_to_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_request_votes` (
  `request_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`, `user_id`),
  KEY `idx_feature_vote_user` (`user_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_request_updates` (
  `id` char(36) NOT NULL,
  `request_id` char(36) NOT NULL,
  `type` varchar(32) NOT NULL,
  `content` text,
  `from_status` varchar(32) DEFAULT NULL,
  `to_status` varchar(32) DEFAULT NULL,
  `actor_user_id` char(36) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_feature_update_time` (`request_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
