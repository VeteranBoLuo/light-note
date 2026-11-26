-- Weekly snapshots and durable payout receipts. Installing the schema grants no points.
CREATE TABLE IF NOT EXISTS leaderboard_periods (
  board VARCHAR(12) CHARACTER SET ascii NOT NULL,
  period_key DATE NOT NULL,
  period_end DATE NOT NULL,
  mode VARCHAR(16) CHARACTER SET ascii NOT NULL,
  state VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT 'open',
  qualified_count INT UNSIGNED NOT NULL DEFAULT 0,
  slots TINYINT UNSIGNED NOT NULL DEFAULT 0,
  frozen_at DATETIME DEFAULT NULL,
  PRIMARY KEY (board, period_key),
  KEY idx_leaderboard_period_state (board, state, period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leaderboard_results (
  board VARCHAR(12) CHARACTER SET ascii NOT NULL,
  period_key DATE NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  position INT UNSIGNED NOT NULL,
  score BIGINT UNSIGNED NOT NULL,
  active_days INT UNSIGNED NOT NULL,
  reward_slot TINYINT UNSIGNED DEFAULT NULL,
  reward_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  reward_state VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT 'none',
  reward_error VARCHAR(32) CHARACTER SET ascii DEFAULT NULL,
  notified_at DATETIME DEFAULT NULL,
  PRIMARY KEY (board, period_key, user_id),
  UNIQUE KEY uk_leaderboard_position (board, period_key, position),
  KEY idx_leaderboard_payout (board, reward_state, notified_at, period_key, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
