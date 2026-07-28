-- 更新日志 Markdown 与 OBS 图片支持（MySQL 5.7 兼容、可重复执行）
-- 单表保存日志正文、重点更新、标签及该日志拥有的 OBS object key。
-- 旧 config_json「更新日志」仅迁移一次，原记录继续保留作为回滚来源。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `update_logs` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `publish_date` date NOT NULL,
  `summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `highlights` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'JSON 字符串数组，供列表与工作台摘要使用',
  `tags` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'JSON 字符串数组',
  `content_markdown` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_keys` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '该日志拥有的 OBS object key JSON 数组',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `sort` int(11) NOT NULL DEFAULT '0',
  `created_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_update_logs_public` (`status`, `publish_date`, `sort`),
  KEY `idx_update_logs_updated` (`updated_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='更新日志';

DROP PROCEDURE IF EXISTS `migrate_legacy_update_logs`;
DELIMITER $$
CREATE PROCEDURE `migrate_legacy_update_logs`()
BEGIN
  DECLARE v_index INT DEFAULT 0;
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_json LONGTEXT DEFAULT NULL;
  DECLARE v_entry LONGTEXT DEFAULT NULL;
  DECLARE v_title VARCHAR(200) DEFAULT NULL;
  DECLARE v_date_text VARCHAR(32) DEFAULT NULL;
  DECLARE v_highlights LONGTEXT DEFAULT NULL;
  DECLARE v_id VARCHAR(64) DEFAULT NULL;

  SELECT `json_content`
    INTO v_json
    FROM `config_json`
   WHERE `name` = CONVERT('更新日志' USING utf8mb4) COLLATE utf8mb4_general_ci
     AND `del_flag` = 0
   LIMIT 1;

  IF v_json IS NOT NULL AND JSON_VALID(v_json) = 1 AND JSON_TYPE(JSON_EXTRACT(v_json, '$')) = 'ARRAY' THEN
    SET v_count = JSON_LENGTH(v_json);
    WHILE v_index < v_count DO
      SET v_entry = JSON_EXTRACT(v_json, CONCAT('$[', v_index, ']'));
      SET v_title = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v_entry, '$.label')), '');
      SET v_date_text = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v_entry, '$.time')), '');
      SET v_highlights = JSON_EXTRACT(v_entry, '$.list');

      IF v_title IS NULL THEN
        SET v_title = CONCAT('历史更新 ', v_index + 1);
      END IF;
      IF v_highlights IS NULL OR JSON_TYPE(JSON_EXTRACT(v_entry, '$.list')) <> 'ARRAY' THEN
        SET v_highlights = '[]';
      END IF;

      SET v_id = CONCAT(
        'legacy-',
        LEFT(SHA2(CONCAT(v_index, '\n', COALESCE(v_date_text, ''), '\n', v_title), 256), 32)
      );

      INSERT IGNORE INTO `update_logs`
        (`id`, `title`, `publish_date`, `summary`, `highlights`, `tags`,
         `content_markdown`, `image_keys`, `status`, `sort`, `created_by`)
      VALUES
        (v_id, LEFT(v_title, 200), COALESCE(STR_TO_DATE(v_date_text, '%Y-%m-%d'), CURDATE()),
         NULL, v_highlights, '[]', '', '[]', 'published', v_index, NULL);

      SET v_index = v_index + 1;
    END WHILE;
  END IF;
END$$
DELIMITER ;

START TRANSACTION;
CALL `migrate_legacy_update_logs`();
COMMIT;

DROP PROCEDURE IF EXISTS `migrate_legacy_update_logs`;

SELECT
  COUNT(*) AS `entry_count`,
  SUM(`status` = 'published') AS `published_count`,
  SUM(`status` = 'draft') AS `draft_count`
FROM `update_logs`;
