CREATE TABLE IF NOT EXISTS visitor_example_maintenance (
  user_id VARCHAR(64) NOT NULL,
  version VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  manifest_json JSON NOT NULL,
  last_success_date DATE NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY visitor_examples_enabled (enabled, last_success_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
