-- Agent Runtime V3 Phase 2：五个最小权威实体。
-- 仅建表，不回填、不启用运行时；MySQL 5.7 / utf8mb4 兼容，可重复执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_agent_conversation_state (
  conversation_id VARCHAR(36) NOT NULL,
  conversation_owner_id VARCHAR(64) NOT NULL,
  owner_key_hash CHAR(64) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  topic_epoch INT UNSIGNED NOT NULL DEFAULT 0,
  discourse_state JSON NOT NULL,
  active_source_set_ids JSON NOT NULL,
  active_result_set_ids JSON NOT NULL,
  latest_artifact_version_id VARCHAR(36) NULL,
  last_run_id VARCHAR(64) NULL,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  KEY idx_ai_agent_state_owner_updated (conversation_owner_id, update_time),
  KEY idx_ai_agent_state_owner_hash (owner_key_hash, update_time),
  CONSTRAINT fk_ai_agent_state_conversation
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_agent_run (
  id VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_role VARCHAR(24) NOT NULL,
  subject_id VARCHAR(64) NULL,
  owner_key_hash CHAR(64) NOT NULL,
  base_revision BIGINT UNSIGNED NOT NULL,
  runtime_version VARCHAR(16) NOT NULL,
  semantic_digest CHAR(64) NULL,
  execution_digest CHAR(64) NULL,
  turn_spec JSON NULL,
  goal_states JSON NOT NULL,
  execution_receipt JSON NULL,
  status ENUM(
    'accepted','running','clarification','unsupported','forbidden',
    'awaiting_confirmation','awaiting_interaction','partial',
    'completed','cancelled','failed','unknown'
  ) NOT NULL,
  error_code VARCHAR(128) NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_ai_agent_run_conversation_created (conversation_id, create_time),
  KEY idx_ai_agent_run_owner_created (owner_key_hash, create_time),
  CONSTRAINT fk_ai_agent_run_conversation
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_agent_source_set (
  id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  run_id VARCHAR(64) NULL,
  owner_key_hash CHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  kind ENUM('explicit','result_refs','attachment','dialogue','mixed') NOT NULL,
  items_json JSON NOT NULL,
  source_digest CHAR(64) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_ai_agent_source_conversation_created (conversation_id, create_time),
  KEY idx_ai_agent_source_digest (owner_key_hash, source_digest),
  KEY idx_ai_agent_source_expiry (expires_at),
  CONSTRAINT fk_ai_agent_source_conversation
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_agent_result_set (
  id VARCHAR(36) NOT NULL,
  handle_id VARCHAR(64) NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  owner_key_hash CHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  goal_id VARCHAR(64) NOT NULL,
  capability_id VARCHAR(120) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  query_fingerprint CHAR(64) NOT NULL,
  filters_json JSON NOT NULL,
  refs_json JSON NOT NULL,
  ordering_json JSON NOT NULL,
  field_mask_json JSON NOT NULL,
  total_count INT UNSIGNED NULL,
  returned_count INT UNSIGNED NOT NULL,
  completeness ENUM('complete','partial','unknown','empty') NOT NULL,
  partial_reason VARCHAR(64) NULL,
  next_cursor TEXT NULL,
  fresh_until DATETIME NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_agent_result_handle (conversation_id, handle_id),
  KEY idx_ai_agent_result_conversation_created (conversation_id, create_time),
  KEY idx_ai_agent_result_run_goal (run_id, goal_id),
  KEY idx_ai_agent_result_freshness (owner_key_hash, fresh_until),
  CONSTRAINT fk_ai_agent_result_conversation
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_agent_artifact_version (
  id VARCHAR(36) NOT NULL,
  artifact_chain_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  owner_key_hash CHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  capability_id VARCHAR(120) NOT NULL,
  version INT UNSIGNED NOT NULL,
  parent_version_id VARCHAR(36) NULL,
  state ENUM('draft','ready','committed','cancelled','superseded','failed','unknown') NOT NULL,
  content_md MEDIUMTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  source_set_id VARCHAR(36) NULL,
  output_contract JSON NULL,
  validation_report JSON NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_agent_artifact_chain_version (artifact_chain_id, version),
  KEY idx_ai_agent_artifact_conversation_updated (conversation_id, update_time),
  KEY idx_ai_agent_artifact_source_set (source_set_id),
  CONSTRAINT fk_ai_agent_artifact_conversation
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_agent_artifact_source_set
    FOREIGN KEY (source_set_id) REFERENCES ai_agent_source_set (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
