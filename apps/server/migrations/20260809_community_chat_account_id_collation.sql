-- 社区客厅早期基础表兼容修正：账号关联列与既有 user.id 的 utf8/utf8_general_ci 对齐。
-- CREATE TABLE IF NOT EXISTS 不会修复历史同名表，因此单独收敛已存在的 5 张基础表。
-- MySQL 5.7 的 ALTER TABLE 会隐式提交；本脚本可重复执行，但应在基础 migration 之后执行。

ALTER TABLE `community_chat_access_requests`
  MODIFY COLUMN `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  MODIFY COLUMN `reviewed_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL;

ALTER TABLE `community_chat_members`
  MODIFY COLUMN `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  MODIFY COLUMN `invited_by` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL;

ALTER TABLE `community_chat_user_settings`
  MODIFY COLUMN `user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL;

ALTER TABLE `community_chat_access_audit`
  MODIFY COLUMN `actor_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  MODIFY COLUMN `target_user_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL;
