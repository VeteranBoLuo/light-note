-- 单条资源 AI 参与偏好（MySQL 5.7 兼容、可重复执行）

CREATE TABLE IF NOT EXISTS ai_resource_preferences (
  user_id varchar(36) NOT NULL,
  resource_type varchar(16) NOT NULL,
  resource_id varchar(64) NOT NULL,
  ai_excluded tinyint(1) NOT NULL DEFAULT 0,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_type, resource_id),
  KEY idx_ai_resource_preferences_excluded (user_id, ai_excluded, resource_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
