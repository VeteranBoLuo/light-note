-- 游客转化漏斗事件表(无 auto-runner,DBA 手动执行;幂等 CREATE IF NOT EXISTS)
-- 漏斗:page_view → wall_hit(撞写操作墙) → cta_click(点立即注册) → register(注册成功)
CREATE TABLE IF NOT EXISTS `conversion_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `fingerprint` varchar(128) DEFAULT NULL COMMENT '浏览器指纹,串联同一访客的事件',
  `user_id` varchar(64) DEFAULT NULL COMMENT '已登录则有,游客为空',
  `visitor_type` varchar(20) DEFAULT NULL COMMENT 'visitor / admin / root',
  `event` varchar(64) NOT NULL COMMENT 'wall_hit / cta_click / register / page_view',
  `context` varchar(255) DEFAULT NULL COMMENT '撞墙接口路径 / CTA 来源等',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_event_time` (`event`, `create_time`),
  KEY `idx_fingerprint` (`fingerprint`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='游客转化漏斗事件';
