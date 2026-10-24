-- Additive, explicit installation only. No account backfill, balance changes or reward grants.
CREATE TABLE IF NOT EXISTS knowledge_manors (
  user_id VARCHAR(64) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  state_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_manor_operations (
  user_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  command_hash CHAR(64) NOT NULL,
  model_version VARCHAR(32) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  result_json JSON NOT NULL,
  points_delta INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
