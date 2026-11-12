-- 更新日志产品版本（MySQL 5.7 兼容、可重复执行）。
-- 前置：20260728_update_logs_markdown.sql；仅显式发版时执行，不在服务启动时迁移。
-- 历史补记只匹配已发布的 2026-10-30 知识庄园里程碑，不修改标题、日期或正文。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS `migrate_update_log_product_version`;
DELIMITER $$
CREATE PROCEDURE `migrate_update_log_product_version`()
BEGIN
  DECLARE v_matches INT DEFAULT 0;
  -- 显式排序规则：库默认 utf8mb4_general_ci 时，与表列 utf8mb4_unicode_ci 比较会报 1267。
  DECLARE v_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_version VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'update_logs' AND column_name = 'product_version'
  ) THEN
    ALTER TABLE `update_logs`
      ADD COLUMN `product_version` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL
      COMMENT '产品发布版本 X.Y.Z；历史日志可为空' AFTER `publish_date`;
  END IF;

  START TRANSACTION;
  SELECT COUNT(*) INTO v_matches FROM `update_logs`
    WHERE `publish_date` = '2026-10-30' AND `status` = 'published'
      AND `title` = '知识庄园开放：资料处理、公开分享与创作体验升级';
  IF v_matches > 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UPDATE_LOG_MILESTONE_AMBIGUOUS';
  END IF;
  IF v_matches = 0 AND EXISTS (
    SELECT 1 FROM `update_logs` WHERE `publish_date` = '2026-10-30' AND `status` = 'published'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UPDATE_LOG_MILESTONE_TARGET_CHANGED';
  END IF;
  IF v_matches = 1 THEN
    SELECT `id`, COALESCE(`product_version`, '') INTO v_id, v_version FROM `update_logs`
      WHERE `publish_date` = '2026-10-30' AND `status` = 'published'
        AND `title` = '知识庄园开放：资料处理、公开分享与创作体验升级'
      FOR UPDATE;
    IF v_version = '' THEN
      UPDATE `update_logs` SET `product_version` = '1.0.0', `updated_time` = `updated_time`
        WHERE `id` = v_id AND COALESCE(`product_version`, '') = '';
      IF ROW_COUNT() <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UPDATE_LOG_MILESTONE_CHANGED';
      END IF;
    ELSEIF v_version <> '1.0.0' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UPDATE_LOG_MILESTONE_VERSION_CONFLICT';
    END IF;
  END IF;
  COMMIT;
END$$
DELIMITER ;

CALL `migrate_update_log_product_version`();
DROP PROCEDURE IF EXISTS `migrate_update_log_product_version`;

SELECT COUNT(*) AS `milestone_count`, SUM(`product_version` = '1.0.0') AS `versioned_count`
FROM `update_logs`
WHERE `publish_date` = '2026-10-30' AND `status` = 'published'
  AND `title` = '知识庄园开放：资料处理、公开分享与创作体验升级';
