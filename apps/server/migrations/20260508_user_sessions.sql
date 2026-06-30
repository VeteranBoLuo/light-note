CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar(128) NOT NULL PRIMARY KEY,
  user_id varchar(255) NOT NULL,
  role varchar(32) NOT NULL,
  expires_at datetime NOT NULL,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  last_active_time datetime DEFAULT CURRENT_TIMESTAMP,
  ip varchar(100),
  user_agent varchar(500),
  INDEX idx_user_sessions_user_id (user_id),
  INDEX idx_user_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
