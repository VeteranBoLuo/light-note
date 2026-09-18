-- One reward configuration and one immutable award per topic/member. No historical backfill.
CREATE TABLE IF NOT EXISTS community_task_rewards (
  topic_id BIGINT UNSIGNED NOT NULL,
  starts_at DATETIME(6) NOT NULL,
  ends_at DATETIME(6) NOT NULL,
  reward_exp INT UNSIGNED NOT NULL DEFAULT 0,
  reward_points INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS community_task_awards (
  topic_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  post_id BIGINT UNSIGNED NOT NULL,
  reward_exp INT UNSIGNED NOT NULL,
  reward_points INT UNSIGNED NOT NULL,
  earned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  claimed_at DATETIME(6) NULL,
  PRIMARY KEY (topic_id,user_id),
  KEY idx_user_claim (user_id,claimed_at,topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
