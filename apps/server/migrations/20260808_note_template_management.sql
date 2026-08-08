-- 自定义笔记模板统一管理：增加显式 revision 乐观锁（幂等，兼容 MySQL 5.7）。
-- 现有模板自动从 revision=1 起步，不改正文、归属、ID 或删除语义。

SET @col := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'note_template'
     AND COLUMN_NAME = 'revision'
);
SET @ddl := IF(
  @col = 0,
  'ALTER TABLE `note_template` ADD COLUMN `revision` int unsigned NOT NULL DEFAULT 1 COMMENT ''模板乐观锁版本'' AFTER `content`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
