-- P0-B 增长体系数据地基
-- 见《轻笺 next 总方案》八节数据模型:一张事件账本 + 一张成长快照,
-- EXP/等级只是账本的聚合视图;所有发放走唯一入口 grantExp,账本只追加、永不删行。

-- 统一 EXP 账本(唯一发放入口 grantExp 幂等落此)
CREATE TABLE IF NOT EXISTS `growth_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` varchar(64) NOT NULL COMMENT 'user.id 为 UUID,varchar64 足够,utf8mb4 缩短列长防唯一键超长',
  `source` varchar(32) NOT NULL COMMENT 'checkin/bookmark/note/file/first_own_resource/profile_done/tag/share/task/invite/milestone',
  `ref_id` varchar(128) DEFAULT NULL COMMENT '资源 id / url_hash / 里程碑 key;资源与里程碑类判重用,签到类为 NULL',
  `day` char(8) DEFAULT NULL COMMENT 'YYYYMMDD;签到/活跃每日判重用,资源类为 NULL',
  `amount` int NOT NULL DEFAULT 0 COMMENT '本次实际发放 EXP(触顶可为 0)',
  `status` varchar(16) NOT NULL DEFAULT 'granted' COMMENT 'granted / revoked(作弊冲正)',
  `meta` json DEFAULT NULL COMMENT '附加:连续天数 / 衰减档 / 风控标记等',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_resource` (`user_id`,`source`,`ref_id`) COMMENT '资源/里程碑判重(ref_id 非空生效;多行 NULL 不互斥)',
  UNIQUE KEY `uk_daily` (`user_id`,`source`,`day`) COMMENT '签到/每日判重(day 非空生效;多行 NULL 不互斥)',
  KEY `idx_user_time` (`user_id`,`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='EXP 统一账本,只追加不删行';

-- 成长快照(便于排行/查询;level/streak 冗余,权威仍以账本聚合为准)
CREATE TABLE IF NOT EXISTS `user_growth` (
  `user_id` varchar(64) NOT NULL,
  `exp` int NOT NULL DEFAULT 0,
  `level` int NOT NULL DEFAULT 1,
  `streak` int NOT NULL DEFAULT 0 COMMENT '连续签到天数',
  `streak_protect_cards` int NOT NULL DEFAULT 0 COMMENT '补签保护卡(≤2)',
  `last_checkin_date` char(8) DEFAULT NULL COMMENT 'YYYYMMDD 最近签到日',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='成长快照';
