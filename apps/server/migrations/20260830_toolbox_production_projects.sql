CREATE TABLE IF NOT EXISTS toolbox_projects (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  project_type VARCHAR(24) NOT NULL,
  title VARCHAR(255) NOT NULL,
  metadata_json JSON DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  current_revision INT UNSIGNED NOT NULL DEFAULT 1,
  current_revision_id CHAR(36) NOT NULL,
  create_request_id VARCHAR(128) NOT NULL,
  create_digest CHAR(64) NOT NULL,
  last_opened_at DATETIME DEFAULT NULL,
  trashed_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_project_create_request (user_id, create_request_id),
  KEY idx_toolbox_project_user_type (user_id, project_type, status, updated_at),
  KEY idx_toolbox_project_user_opened (user_id, last_opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱独立生产项目';

CREATE TABLE IF NOT EXISTS toolbox_project_revisions (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  revision_no INT UNSIGNED NOT NULL,
  parent_revision_id CHAR(36) DEFAULT NULL,
  restored_from_revision_id CHAR(36) DEFAULT NULL,
  schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  content_json JSON NOT NULL,
  content_bytes INT UNSIGNED NOT NULL,
  content_hash CHAR(64) NOT NULL,
  change_kind VARCHAR(24) NOT NULL,
  label VARCHAR(200) DEFAULT NULL,
  client_request_id VARCHAR(128) NOT NULL,
  request_digest CHAR(64) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_project_revision_no (project_id, revision_no),
  UNIQUE KEY uk_toolbox_project_revision_request (user_id, client_request_id),
  KEY idx_toolbox_project_revision_storage (user_id, project_id, content_bytes),
  KEY idx_toolbox_project_revision_time (project_id, create_time),
  KEY idx_toolbox_project_revision_restore (restored_from_revision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱生产项目不可变修订';

CREATE TABLE IF NOT EXISTS toolbox_project_resources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(24) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  resource_version VARCHAR(128) NOT NULL DEFAULT '',
  resource_title VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(24) NOT NULL DEFAULT 'source',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_project_resource (project_id, resource_type, resource_id),
  KEY idx_toolbox_project_resource_user (user_id, resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱生产项目资料引用，不保存资料正文';

CREATE TABLE IF NOT EXISTS toolbox_project_revision_requests (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  project_id CHAR(36) NOT NULL,
  client_request_id VARCHAR(128) NOT NULL,
  request_digest CHAR(64) NOT NULL,
  result_revision_id CHAR(36) NOT NULL,
  result_revision_no INT UNSIGNED NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_project_revision_request_receipt (user_id, client_request_id),
  KEY idx_toolbox_project_revision_request_project (project_id, result_revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱生产项目修订请求幂等收据';

CREATE TABLE IF NOT EXISTS toolbox_schema_migrations (
  migration_key VARCHAR(64) NOT NULL,
  last_id VARCHAR(128) DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱可恢复数据迁移游标';
