-- 支持者榜默认公开规则的公开帮助同步。
-- MySQL 5.7 兼容、幂等；只替换现行帮助文章中的旧默认说明。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

UPDATE `knowledge_base`
SET `content` = REPLACE(
      `content`,
      '已确认支持默认以匿名身份参与累计榜，你可以公开昵称头像或退出排行榜。',
      '已确认支持默认以轻笺昵称和头像参与累计榜，你可以随时改为匿名或退出排行榜；已经保存过的展示选择不会被覆盖。'
    ),
    `updated_by` = NULL
WHERE (`id` = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae' OR `title` = '如何自愿支持轻笺')
  AND LOCATE('已确认支持默认以匿名身份参与累计榜', COALESCE(`content`, '')) > 0;

COMMIT;

SELECT `id`, `title`, `status`, `type`, `sort`, CHAR_LENGTH(`content`) AS `content_length`
FROM `knowledge_base`
WHERE `id` = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae' OR `title` = '如何自愿支持轻笺';
