-- 笔记/目录公开分享。令牌只保存 SHA-256 摘要；目录范围按实时父链动态解析。
-- 仅声明结构，不在应用启动时自动改库；部署前执行并跑 schema-assertions.sql。

CREATE TABLE IF NOT EXISTS note_shares (
  id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  root_note_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  owner_user_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  scope_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hint VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  access_code_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  max_access_count INT UNSIGNED DEFAULT NULL,
  access_count INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'active',
  last_access_at DATETIME DEFAULT NULL,
  revoked_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_note_shares_token_hash (token_hash),
  KEY idx_note_shares_owner_status (owner_user_id, status, create_time),
  KEY idx_note_shares_root_status (root_note_id, status),
  KEY idx_note_shares_expiry (status, expires_at),
  CONSTRAINT fk_note_shares_root FOREIGN KEY (root_note_id) REFERENCES note (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='可撤销笔记与目录分享';

CREATE TABLE IF NOT EXISTS note_share_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  share_id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  outcome VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_note_share_events_share_time (share_id, create_time),
  KEY idx_note_share_events_retention (create_time),
  CONSTRAINT fk_note_share_events_share FOREIGN KEY (share_id) REFERENCES note_shares (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='笔记分享隐私化访问事件';
