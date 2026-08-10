-- 公共聊天室冷启动收敛：仅保留 general 公共消息流。
-- 旧频道不删除；其消息和已读位置先合并到 general，再把旧频道归档。
-- MySQL 5.7 兼容，可重复执行。

START TRANSACTION;

INSERT INTO `community_chat_rooms`
  (`slug`, `name_zh`, `name_en`, `description_zh`, `description_en`, `type`, `status`, `default_notification_level`, `sort_order`)
VALUES
  ('general', '轻笺聊天室', 'Light Note Chat', '聊使用问题、实用技巧、功能想法和日常见闻。', 'Discuss product questions, useful workflows, ideas, and everyday topics.', 'text', 'active', 'mentions', 10)
ON DUPLICATE KEY UPDATE
  `name_zh` = VALUES(`name_zh`),
  `name_en` = VALUES(`name_en`),
  `description_zh` = VALUES(`description_zh`),
  `description_en` = VALUES(`description_en`),
  `type` = 'text',
  `status` = 'active',
  `default_notification_level` = 'mentions',
  `sort_order` = 10;

INSERT INTO `community_chat_reads`
  (`room_id`, `user_id`, `last_read_message_id`, `create_time`, `update_time`)
SELECT target.id, reading.user_id, MAX(reading.last_read_message_id), MIN(reading.create_time), CURRENT_TIMESTAMP
  FROM `community_chat_reads` reading
  JOIN `community_chat_rooms` source ON source.id = reading.room_id
  JOIN `community_chat_rooms` target ON target.slug = 'general'
 WHERE source.slug IN ('announcements', 'newcomers', 'tips', 'co-build', 'topics', 'lounge')
 GROUP BY target.id, reading.user_id
ON DUPLICATE KEY UPDATE
  `last_read_message_id` = GREATEST(`last_read_message_id`, VALUES(`last_read_message_id`)),
  `update_time` = CURRENT_TIMESTAMP;

UPDATE `community_chat_messages` message
  JOIN `community_chat_rooms` source ON source.id = message.room_id
  JOIN `community_chat_rooms` target ON target.slug = 'general'
   SET message.room_id = target.id
 WHERE source.slug IN ('announcements', 'newcomers', 'tips', 'co-build', 'topics', 'lounge');

DELETE reading
  FROM `community_chat_reads` reading
  JOIN `community_chat_rooms` source ON source.id = reading.room_id
 WHERE source.slug IN ('announcements', 'newcomers', 'tips', 'co-build', 'topics', 'lounge');

UPDATE `community_chat_rooms`
   SET `status` = 'archived', `last_message_id` = NULL
 WHERE `slug` IN ('announcements', 'newcomers', 'tips', 'co-build', 'topics', 'lounge');

UPDATE `community_chat_rooms` target
   SET target.last_message_id = (
     SELECT MAX(message.id)
       FROM `community_chat_messages` message
      WHERE message.room_id = target.id AND message.status = 'active'
   )
 WHERE target.slug = 'general';

COMMIT;
