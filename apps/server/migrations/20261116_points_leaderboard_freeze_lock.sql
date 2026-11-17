-- Coordinate the weekly snapshot with transactions that record leaderboard activity.
CREATE TABLE IF NOT EXISTS leaderboard_settlement_lock (
  id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

INSERT IGNORE INTO leaderboard_settlement_lock (id) VALUES (1);
