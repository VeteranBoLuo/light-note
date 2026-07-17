-- 笔记模板补充迁移(幂等、兼容 MySQL 5.7):
-- 1) note_template.title_template — 模板名称(name)与新笔记默认标题语义分离;
--    NULL 时前端回退用 name,兼容已存数据与旧客户端。
-- 2) note_images.url 索引 — 彻底删除笔记后按 URL 检查剩余引用(引用计数式物理文件清理)。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note_template' AND COLUMN_NAME = 'title_template');
SET @ddl := IF(@col = 0, "ALTER TABLE `note_template` ADD COLUMN `title_template` varchar(255) DEFAULT NULL COMMENT '新笔记默认标题,可含变量;NULL 回退 name' AFTER `name`", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note_images' AND INDEX_NAME = 'idx_note_images_url');
SET @ddl := IF(@idx = 0, "ALTER TABLE `note_images` ADD KEY `idx_note_images_url` (`url`)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
