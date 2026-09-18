-- Comment likes are unique per member; no notification event is produced.
CREATE TABLE IF NOT EXISTS community_comment_likes (
  user_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  comment_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, comment_id),
  KEY idx_comment (comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
