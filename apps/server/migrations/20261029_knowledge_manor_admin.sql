-- Additive administration control. Installation is explicit; no account or asset backfill.
CREATE TABLE IF NOT EXISTS knowledge_manor_runtime (
  id TINYINT UNSIGNED NOT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'open',
  message VARCHAR(120) NOT NULL DEFAULT '',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_by VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  coverage_started_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conditional column/index additions are installed by knowledgeManorAdminSchema.js
-- for MySQL 5.7 compatibility. Historical receipt metadata remains NULL.
