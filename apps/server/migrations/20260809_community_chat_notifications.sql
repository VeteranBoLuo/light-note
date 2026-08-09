-- 公共聊天室提醒闭环：显式提及关系、三级提醒范围与站内通知幂等投递。
-- 主开关继续沿用 community_chat_user_settings.global_notification_enabled，缺省开启为 mentions 档。

ALTER TABLE `community_chat_user_settings`
  MODIFY COLUMN `global_notification_enabled` tinyint unsigned NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS `community_chat_message_mentions` (
  `message_id` bigint unsigned NOT NULL,
  `mentioned_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`mentioned_user_id`),
  KEY `idx_community_chat_mention_user_message` (`mentioned_user_id`,`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 旧值 none 的语义收敛为“仅官方/管理员”，新策略使用 official / mentions / all。
UPDATE `community_chat_user_settings`
   SET `default_room_level` = 'official'
 WHERE `default_room_level` NOT IN ('official', 'mentions', 'all');
