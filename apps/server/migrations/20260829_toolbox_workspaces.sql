-- 知识工具箱持续工作区：研究、学习与写作共用一套可扩展的长期推进底座。
-- 这里只保存账号内资料引用、工作项与推进记录，不复制笔记、书签或文件正文。

CREATE TABLE IF NOT EXISTS toolbox_workspaces (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  goal VARCHAR(1000) DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  target_date DATE DEFAULT NULL,
  next_step VARCHAR(500) DEFAULT NULL,
  last_opened_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_toolbox_workspace_user_kind (user_id, kind, status, updated_at),
  KEY idx_toolbox_workspace_user_opened (user_id, last_opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱持续工作区';

CREATE TABLE IF NOT EXISTS toolbox_workspace_resources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(24) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  resource_version VARCHAR(128) NOT NULL,
  resource_title VARCHAR(255) NOT NULL DEFAULT '',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_workspace_resource (workspace_id, resource_type, resource_id),
  KEY idx_toolbox_workspace_resource_user (user_id, resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续工作区资料引用，不保存资料正文';

CREATE TABLE IF NOT EXISTS toolbox_workspace_items (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  lane VARCHAR(24) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  position INT UNSIGNED NOT NULL DEFAULT 0,
  due_on DATE DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_toolbox_workspace_item_lane (workspace_id, lane, status, position),
  KEY idx_toolbox_workspace_item_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续工作区三段式推进事项';

CREATE TABLE IF NOT EXISTS toolbox_workspace_sessions (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  summary VARCHAR(1000) DEFAULT NULL,
  next_step VARCHAR(500) DEFAULT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_toolbox_workspace_session_time (workspace_id, create_time),
  KEY idx_toolbox_workspace_session_user (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续工作区推进记录与连续活跃依据';
