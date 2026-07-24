-- 书签图标后台补全任务表（MySQL 5.7 兼容、可重复执行）。
-- 每个书签 URL 对应一条任务记录。
--
-- 在导入完成后创建批量任务，由独立 Worker 按 Origin 分组抓取图标。
-- 用户可离开页面，Worker 在服务器后台推进。

SET @tbl := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bookmark_icon_jobs'
);

SET @ddl := IF(
  @tbl = 0,
  "CREATE TABLE bookmark_icon_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    batch_id VARCHAR(36) NOT NULL COMMENT '批次UUID',
    user_id VARCHAR(255) NOT NULL COMMENT '书签所属用户',
    bookmark_id VARCHAR(255) NOT NULL COMMENT '书签ID',
    url_snapshot VARCHAR(2048) NOT NULL COMMENT '创建时的书签URL快照',
    origin_key VARCHAR(512) NOT NULL COMMENT '规范化 Origin(protocol+host+port)',
    url_hash CHAR(64) NOT NULL COMMENT 'url_snapshot 的 SHA-256',
    status ENUM(
      'queued','processing','retry_wait','success','not_found','failed','cancelled'
    ) NOT NULL DEFAULT 'queued',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '可执行时间(retry_wait 时控制重试时机)',
    locked_at DATETIME DEFAULT NULL COMMENT 'processing 开始时间',
    locked_by VARCHAR(96) DEFAULT NULL COMMENT 'Worker ID',
    error_code VARCHAR(64) DEFAULT NULL COMMENT '最终错误码',
    create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_icon_job_queue (status, available_at, id),
    KEY idx_icon_job_batch (user_id, batch_id, status),
    KEY idx_icon_job_bookmark (user_id, bookmark_id),
    UNIQUE KEY uk_icon_job_bookmark_url (bookmark_id, url_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='书签图标后台补全任务'",
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
