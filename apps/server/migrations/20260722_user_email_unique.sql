-- user.email 唯一索引:注册是 SELECT-then-INSERT,并发双注册可绕过预检插入两条同邮箱账号;
-- 代码层已在 registerUser 捕获 ER_DUP_ENTRY 返回 409(见 userHandle.js),但需要本索引才真正生效。
-- 项目无迁移 runner,由 DBA/owner 手工在生产执行;幂等;以线上真实库为准(schema 漂移现状见 docs/architecture.md)。
--
-- ⚠️ 执行前先查重复邮箱(有历史脏数据会导致加索引失败,需人工先处置):
--   SELECT email, COUNT(*) c FROM user GROUP BY email HAVING c > 1;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND INDEX_NAME = 'uk_user_email'
);
SET @ddl := IF(
  @has_idx = 0,
  'ALTER TABLE `user` ADD UNIQUE INDEX `uk_user_email` (`email`)',
  'SELECT ''uk_user_email already exists'''
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
