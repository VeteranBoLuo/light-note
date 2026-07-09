-- 通知中心:统一收件箱。升级(level_up)/反馈回复(opinion_reply)/系统公告(system)等事件各写一行,
-- 支持未读数、分页、标记已读/全部已读。历史事件不回填,上线后新产生的事件才入库。
CREATE TABLE IF NOT EXISTS `notification` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL COMMENT '接收者',
  `type` varchar(32) NOT NULL COMMENT '类型:level_up/opinion_reply/system',
  `title` varchar(255) NOT NULL,
  `content` text,
  `link` varchar(255) DEFAULT NULL COMMENT '点击跳转路径',
  `meta` json DEFAULT NULL COMMENT '额外数据(如等级、反馈id)',
  `is_read` tinyint NOT NULL DEFAULT '0',
  `read_time` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `del_flag` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_user_unread` (`user_id`, `is_read`, `del_flag`),
  KEY `idx_user_time` (`user_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
