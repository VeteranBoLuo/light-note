-- 旧版本曾把“OAuth 已换码”误记为“用户资料已刷新”。
-- 仅重置从未拿到昵称和头像的记录，使新版本首次读取时立即补全；可安全重复执行。

UPDATE `support_account_links`
   SET `identity_refreshed_at` = NULL
 WHERE `provider_name` IS NULL
   AND `provider_avatar_url` IS NULL;
