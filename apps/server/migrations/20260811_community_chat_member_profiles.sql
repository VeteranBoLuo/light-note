-- 社区名片扩展：个人简介、社区资历隐私、精选成就与乐观并发版本。
-- 公开查看仍以聊天室消息 public_id 为入口，不对外暴露 user_id。

CREATE TABLE IF NOT EXISTS community_chat_member_profiles (
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  bio varchar(255) NOT NULL DEFAULT '',
  show_community_tenure tinyint unsigned NOT NULL DEFAULT 1,
  featured_achievements json DEFAULT NULL,
  revision bigint unsigned NOT NULL DEFAULT 1,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 回滚参考（仅在确认没有用户资料后手工执行）：
-- DROP TABLE community_chat_member_profiles;
