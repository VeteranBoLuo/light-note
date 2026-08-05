-- 操作日志补记操作系统与运行环境（幂等、兼容 MySQL 5.7）。
--
-- 背景：api_logs 一直有 system 列（JSON：os/browser/runtime），后台能按环境筛查问题；
-- 而 operation_logs 只有 ip，出问题时看不出这条操作来自浏览器、PWA 还是 Android App，
-- 也就没法把「只在 App 里复现」的问题和具体操作对上。
--
-- 字符集：operation_logs 整表是 latin1（正因如此写入侧要剥 emoji，见 commonHandle 的注释），
-- 而 system 里存的是 JSON，含「未知」这类中文值。所以这一列单独指定 utf8mb4，
-- 不动表默认字符集 —— 改表默认会牵动 module/operation 等既有列，风险远大于收益。
--
-- 长度：只存 os/browser/runtime/appVersion 这几项精简 JSON，255 足够；
-- 不像 api_logs.system 那样把 fingerprint 等也塞进去。

SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_logs');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_logs' AND COLUMN_NAME = 'system');
SET @ddl := IF(@tbl = 1 AND @col = 0, "ALTER TABLE `operation_logs` ADD COLUMN `system` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '操作时的系统信息(JSON:os/browser/runtime/appVersion)'", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
