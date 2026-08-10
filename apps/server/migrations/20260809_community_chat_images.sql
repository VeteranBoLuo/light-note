-- 公共聊天室图片附件：先登记归属与过期时间，再上传对象存储，发送消息时原子绑定。
-- 客户端只使用 public_id；object_key 与内部用户 ID 不返回浏览器。

CREATE TABLE IF NOT EXISTS `community_chat_message_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `owner_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `message_id` bigint unsigned DEFAULT NULL,
  `object_key` varchar(512) NOT NULL,
  `content_type` varchar(64) NOT NULL,
  `file_size` int unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'uploading',
  `sort_order` tinyint unsigned NOT NULL DEFAULT 0,
  `expires_at` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_chat_image_public` (`public_id`),
  UNIQUE KEY `uk_community_chat_image_object` (`object_key`),
  KEY `idx_community_chat_image_owner_status_expiry` (`owner_user_id`,`status`,`expires_at`),
  KEY `idx_community_chat_image_message_status_sort` (`message_id`,`status`,`sort_order`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
