-- C9 个人背景。MySQL 5.7 兼容、可重复执行；永久持有复用 user_cosmetics。
-- 先执行此结构迁移，再启动引用新列的服务。无历史用户资产回填。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @profile_background_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_growth' AND COLUMN_NAME = 'equipped_background'
);
SET @profile_background_sql := IF(@profile_background_exists = 0,
  'ALTER TABLE `user_growth` ADD COLUMN `equipped_background` VARCHAR(64) DEFAULT NULL COMMENT ''社区名片与公开主页共用背景''',
  'SELECT 1');
PREPARE profile_background_stmt FROM @profile_background_sql;
EXECUTE profile_background_stmt;
DEALLOCATE PREPARE profile_background_stmt;
