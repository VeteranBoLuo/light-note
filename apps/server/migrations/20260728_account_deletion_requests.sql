-- 账号自助注销：立即停用账号，后台可靠清理数据库与对象存储。
-- MySQL 5.7 兼容；只创建不存在的表，可安全重复执行。
--
-- 注意：
-- 1. 本表不保存邮箱、昵称等直接身份信息；
-- 2. object_keys_json / note_image_urls_json / bookmark_icons_json 仅用于物理文件删除重试，
--    清理成功后立即覆写为空数组；
-- 3. user_id 在账号表删除后仅作为不含邮箱、昵称的账号 UUID 保留，用于清理幂等与失败重试。

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id char(36) NOT NULL,
  user_id varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending'
    COMMENT 'pending/processing/retry_wait/completed',
  object_keys_json longtext NOT NULL,
  note_image_urls_json longtext NOT NULL,
  bookmark_icons_json longtext NOT NULL,
  attempts int unsigned NOT NULL DEFAULT 0,
  requested_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_started_at datetime DEFAULT NULL,
  next_retry_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at datetime DEFAULT NULL,
  last_error_code varchar(64) DEFAULT NULL,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_account_deletion_user (user_id),
  KEY idx_account_deletion_queue (status, next_retry_at, requested_at),
  KEY idx_account_deletion_completed (status, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC
  COMMENT='账号注销及物理文件清理重试队列';
