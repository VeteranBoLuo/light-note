-- MySQL 5.7 幂等加法迁移。历史记录保留 NULL，禁止按 GitHub 登录类型批量清除密码。
-- 新注册、设置/重置密码及成功密码登录由业务路径明确写入状态。
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'login_password_set'
);
SET @ddl := IF(@col_exists = 0,
  "ALTER TABLE `user` ADD COLUMN `login_password_set` tinyint(1) DEFAULT NULL COMMENT '独立登录密码: 1已设置/0未设置/NULL历史未知' AFTER `password_method`",
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
