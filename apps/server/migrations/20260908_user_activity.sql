-- Real interaction activity, Beijing wall-clock DATETIME, no historical API-log backfill.
CREATE TABLE IF NOT EXISTS user_activity_daily (
  activity_date DATE NOT NULL,
  user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  first_active_at DATETIME(3) NOT NULL,
  last_active_at DATETIME(3) NOT NULL,
  PRIMARY KEY (activity_date, user_id),
  KEY idx_activity_date_first_user (activity_date, first_active_at, user_id),
  KEY idx_activity_user_date (user_id, activity_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS user_activity_metadata (
  id TINYINT UNSIGNED NOT NULL,
  started_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO user_activity_metadata (id, started_at)
VALUES (1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR));
