-- 仅建空任务表；不自动重抓历史书签。兼容 MySQL 5.7。
CREATE TABLE IF NOT EXISTS bookmark_archive_jobs (
  bookmark_id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  url VARCHAR(2048) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token VARCHAR(36) DEFAULT NULL,
  lease_expires_at DATETIME DEFAULT NULL,
  reason_code VARCHAR(64) DEFAULT NULL,
  source VARCHAR(20) DEFAULT NULL,
  char_count INT NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_archive_due (status, next_attempt_at),
  KEY idx_archive_owner (user_id, status),
  KEY idx_archive_lease (lease_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 新安装同样可执行；已有存档不覆盖。
CREATE TABLE IF NOT EXISTS bookmark_snapshot (
  bookmark_id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  url VARCHAR(2048) DEFAULT NULL,
  title VARCHAR(512) DEFAULT NULL,
  content LONGTEXT,
  char_count INT NOT NULL DEFAULT 0,
  source VARCHAR(20) DEFAULT NULL,
  summary TEXT DEFAULT NULL,
  summary_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 旧存档来源保持未知，不根据现有正文猜测。
SET @archive_source_ddl = IF((SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema=DATABASE() AND table_name='bookmark_snapshot' AND column_name='source') = 0,
 'ALTER TABLE bookmark_snapshot ADD COLUMN source VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE archive_source_stmt FROM @archive_source_ddl;
EXECUTE archive_source_stmt;
DEALLOCATE PREPARE archive_source_stmt;
