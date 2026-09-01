-- 仅回滚书签健康持久任务状态；不会删除已有 bookmark_health 观测。

DROP TABLE IF EXISTS `bookmark_health_scan_items`;
DROP TABLE IF EXISTS `bookmark_health_scan_jobs`;
