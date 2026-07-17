-- 笔记模板：用户自存模板（内置模板由前端常量提供，不进库）（MySQL 5.7）
-- 硬删除设计：模板是轻量可再生数据，不接回收站，避免 del_flag 死数据

CREATE TABLE IF NOT EXISTS `note_template` (
  `id` char(36) NOT NULL,
  `create_by` char(36) NOT NULL,
  `name` varchar(60) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `type` varchar(16) NOT NULL DEFAULT 'html' COMMENT 'html/markdown',
  `content` longtext,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_note_template_user` (`create_by`, `update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
