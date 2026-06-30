-- 幂等迁移: 为 user 表补充 password_method 列
-- 背景: login/registerUser/configPassword/verifyCode/util/migrate-passwords.js 均读写该列,
--       新建库缺列会报 Unknown column。生产库已有该列, 本迁移属 no-op。
-- 兼容 MySQL 5.7 (不支持 ADD COLUMN IF NOT EXISTS), 先查 INFORMATION_SCHEMA 确认列不存在再 ALTER。

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user'
    AND COLUMN_NAME = 'password_method'
);

SET @ddl := IF(
  @col_exists = 0,
  "ALTER TABLE `user` ADD COLUMN `password_method` varchar(20) NOT NULL DEFAULT 'plain' COMMENT '密码存储方式: plain(明文待升级)/scrypt' AFTER `password`",
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
