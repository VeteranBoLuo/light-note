CREATE TABLE IF NOT EXISTS infra_alert_silences (
  check_id VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason VARCHAR(500) NOT NULL,
  silenced_until DATETIME NOT NULL,
  pass_streak INT UNSIGNED NOT NULL DEFAULT 0,
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (check_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
