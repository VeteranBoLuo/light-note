-- 轻笺智域：持久会话、证据、Change Set、可控记忆与统一内容索引。
-- MySQL 5.7 / utf8mb4 兼容；仅创建不存在的表，可安全重复执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  subject_user_id VARCHAR(64) NOT NULL,
  admin_context_id VARCHAR(64) NULL,
  admin_context_mode VARCHAR(16) NOT NULL DEFAULT 'normal',
  title VARCHAR(255) NOT NULL DEFAULT '新会话',
  summary TEXT NULL,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'global',
  scope_json JSON NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  retention_mode VARCHAR(24) NOT NULL DEFAULT 'standard',
  expire_at DATETIME NULL,
  root_conversation_id VARCHAR(36) NOT NULL,
  parent_conversation_id VARCHAR(36) NULL,
  branch_from_message_id VARCHAR(36) NULL,
  last_message_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_conversation_owner (actor_user_id, subject_user_id, admin_context_mode, status, last_message_at),
  KEY idx_ai_conversation_lineage_owner (actor_user_id, subject_user_id, admin_context_mode, admin_context_id, root_conversation_id, create_time),
  KEY idx_ai_conversation_parent (parent_conversation_id),
  KEY idx_ai_conversation_expiry (status, expire_at),
  KEY idx_ai_conversation_context (admin_context_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  parent_message_id VARCHAR(36) NULL,
  request_id VARCHAR(64) NULL,
  trace_id VARCHAR(64) NULL,
  role VARCHAR(16) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  context_refs_json JSON NULL,
  attachment_refs_json JSON NULL,
  activity_json JSON NULL,
  coverage_json JSON NULL,
  version_group_id VARCHAR(36) NULL,
  model_meta_json JSON NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_message_request_role (conversation_id, request_id, role),
  KEY idx_ai_message_conversation (conversation_id, create_time, id),
  KEY idx_ai_message_parent (parent_message_id),
  KEY idx_ai_message_version (version_group_id, create_time),
  KEY idx_ai_message_trace (trace_id),
  CONSTRAINT fk_ai_message_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_message_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id VARCHAR(36) NOT NULL,
  source_id VARCHAR(96) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_id VARCHAR(128) NULL,
  display_title VARCHAR(255) NOT NULL DEFAULT '',
  resource_version VARCHAR(96) NULL,
  target_json JSON NULL,
  coverage_json JSON NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_message_source (message_id, source_id),
  KEY idx_ai_message_source_resource (resource_type, resource_id),
  CONSTRAINT fk_ai_message_source_message FOREIGN KEY (message_id) REFERENCES ai_messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_message_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id VARCHAR(36) NOT NULL,
  source_id VARCHAR(96) NOT NULL,
  evidence_ref VARCHAR(96) NOT NULL,
  citation_key VARCHAR(32) NOT NULL,
  locator_json JSON NULL,
  excerpt_hash CHAR(64) NOT NULL,
  excerpt VARCHAR(800) NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_message_evidence_ref (message_id, evidence_ref),
  UNIQUE KEY uk_ai_message_citation_key (message_id, citation_key),
  KEY idx_ai_evidence_source (message_id, source_id),
  CONSTRAINT fk_ai_message_evidence_message FOREIGN KEY (message_id) REFERENCES ai_messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_feedback (
  id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  subject_user_id VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  message_id VARCHAR(36) NOT NULL,
  request_id VARCHAR(64) NULL,
  rating VARCHAR(16) NOT NULL,
  reason VARCHAR(48) NULL,
  resolved TINYINT(1) NULL,
  comment VARCHAR(500) NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_feedback_actor_message (actor_user_id, message_id),
  KEY idx_ai_feedback_conversation (conversation_id, create_time),
  KEY idx_ai_feedback_request (request_id),
  CONSTRAINT fk_ai_feedback_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_feedback_message FOREIGN KEY (message_id) REFERENCES ai_messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_content_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  resource_version VARCHAR(96) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  section_title VARCHAR(255) NULL,
  content MEDIUMTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  token_estimate INT UNSIGNED NOT NULL DEFAULT 0,
  locator_json JSON NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_content_chunk (subject_user_id, resource_type, resource_id, resource_version, chunk_index),
  KEY idx_ai_content_owner_active (subject_user_id, active, resource_type),
  KEY idx_ai_content_resource (resource_type, resource_id),
  KEY idx_ai_content_hash (content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_content_generations (
  subject_user_id VARCHAR(64) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subject_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_change_sets (
  id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  subject_user_id VARCHAR(64) NOT NULL,
  admin_context_id VARCHAR(64) NULL,
  admin_context_mode VARCHAR(16) NOT NULL DEFAULT 'normal',
  conversation_id VARCHAR(36) NULL,
  request_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  risk_level VARCHAR(16) NOT NULL DEFAULT 'low',
  selection_json JSON NULL,
  preview_revision INT UNSIGNED NOT NULL DEFAULT 1,
  retry_json JSON NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  expires_at DATETIME NULL,
  applied_at DATETIME NULL,
  undone_at DATETIME NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_change_set_request (actor_user_id, subject_user_id, admin_context_mode, request_id),
  KEY idx_ai_change_set_owner (actor_user_id, subject_user_id, admin_context_mode, status, create_time),
  KEY idx_ai_change_set_conversation (conversation_id),
  CONSTRAINT fk_ai_change_set_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_change_items (
  id VARCHAR(36) NOT NULL,
  change_set_id VARCHAR(36) NOT NULL,
  item_order INT UNSIGNED NOT NULL DEFAULT 0,
  operation VARCHAR(48) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  before_hash CHAR(64) NULL,
  before_json JSON NULL,
  after_json JSON NOT NULL,
  reason VARCHAR(500) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  receipt_json JSON NULL,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_change_item_set (change_set_id, item_order),
  KEY idx_ai_change_item_resource (resource_type, resource_id),
  CONSTRAINT fk_ai_change_item_set FOREIGN KEY (change_set_id) REFERENCES ai_change_sets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_memories (
  id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  subject_user_id VARCHAR(64) NOT NULL,
  admin_context_id VARCHAR(64) NULL,
  admin_context_mode VARCHAR(16) NOT NULL DEFAULT 'normal',
  scope_type VARCHAR(32) NOT NULL DEFAULT 'global',
  scope_json JSON NULL,
  memory_type VARCHAR(32) NOT NULL,
  content VARCHAR(1000) NOT NULL,
  source_conversation_id VARCHAR(36) NULL,
  source_message_id VARCHAR(36) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'candidate',
  confirmed_at DATETIME NULL,
  expire_at DATETIME NULL,
  last_used_at DATETIME NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_memory_owner (actor_user_id, subject_user_id, admin_context_mode, admin_context_id(16), status, update_time),
  KEY idx_ai_memory_expiry (status, expire_at),
  KEY idx_ai_memory_source (source_conversation_id, source_message_id),
  CONSTRAINT fk_ai_memory_conversation FOREIGN KEY (source_conversation_id) REFERENCES ai_conversations (id) ON DELETE SET NULL,
  CONSTRAINT fk_ai_memory_message FOREIGN KEY (source_message_id) REFERENCES ai_messages (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_response_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id VARCHAR(64) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  subject_user_id VARCHAR(64) NOT NULL,
  admin_context_mode VARCHAR(16) NOT NULL DEFAULT 'normal',
  admin_context_id VARCHAR(64) NULL,
  event_id INT UNSIGNED NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  payload_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_response_event (request_id, event_id),
  KEY idx_ai_response_event_owner (
    actor_user_id,
    subject_user_id,
    admin_context_mode,
    admin_context_id,
    request_id
  ),
  KEY idx_ai_response_event_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
