-- 通知中心(随 level_up):user_growth 增"已知晓的最高等级"位。
-- 升级后 level > last_notified_level 即有未读升级通知;用户查看成长页后抬平。
ALTER TABLE `user_growth`
  ADD COLUMN `last_notified_level` int NOT NULL DEFAULT 1 COMMENT '用户已知晓的最高等级(升级通知已读位)';
