-- 轻笺知识工具箱一期：报价、异步任务、输入引用、产物与保存收据。
-- 浏览器本地 PDF/图片工具不进入这些表；付费工具只在服务端报价后预占积分。

ALTER TABLE points_economy_operations
  MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS toolbox_quotes (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  tool_id VARCHAR(48) NOT NULL,
  pricing_version VARCHAR(32) NOT NULL,
  input_digest CHAR(64) NOT NULL,
  input_snapshot_json JSON NOT NULL,
  quoted_points INT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  consumed_job_id CHAR(36) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_quote_request (user_id, request_id),
  KEY idx_toolbox_quote_expiry (status, expires_at),
  KEY idx_toolbox_quote_user_time (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱服务端报价快照';

CREATE TABLE IF NOT EXISTS toolbox_jobs (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  client_request_id VARCHAR(64) NOT NULL,
  tool_id VARCHAR(48) NOT NULL,
  quote_id CHAR(36) DEFAULT NULL,
  input_digest CHAR(64) NOT NULL,
  options_json JSON DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  billing_status VARCHAR(24) NOT NULL DEFAULT 'reserved',
  save_status VARCHAR(16) NOT NULL DEFAULT 'unsaved',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  stage VARCHAR(32) NOT NULL DEFAULT 'queued',
  quoted_points INT UNSIGNED NOT NULL DEFAULT 0,
  actual_points INT UNSIGNED NOT NULL DEFAULT 0,
  points_operation_id BIGINT DEFAULT NULL,
  artifact_id CHAR(36) DEFAULT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME DEFAULT NULL,
  locked_by VARCHAR(128) DEFAULT NULL,
  external_cost_committed TINYINT(1) NOT NULL DEFAULT 0,
  cancel_requested_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  error_code VARCHAR(64) DEFAULT NULL,
  error_message VARCHAR(255) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_job_request (user_id, client_request_id),
  UNIQUE KEY uk_toolbox_job_quote (quote_id),
  KEY idx_toolbox_job_claim (status, available_at, locked_at),
  KEY idx_toolbox_job_user_time (user_id, create_time),
  KEY idx_toolbox_job_billing (billing_status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱异步任务与三状态机快照';

CREATE TABLE IF NOT EXISTS toolbox_job_inputs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  job_id CHAR(36) NOT NULL,
  input_index SMALLINT UNSIGNED NOT NULL,
  input_type VARCHAR(24) NOT NULL,
  resource_type VARCHAR(24) DEFAULT NULL,
  resource_id VARCHAR(128) DEFAULT NULL,
  document_source_id CHAR(36) DEFAULT NULL,
  resource_version VARCHAR(128) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_job_input_order (job_id, input_index),
  KEY idx_toolbox_job_input_resource (resource_type, resource_id),
  KEY idx_toolbox_job_input_source (document_source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱任务输入引用，不保存材料正文';

CREATE TABLE IF NOT EXISTS toolbox_artifacts (
  id CHAR(36) NOT NULL,
  job_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  tool_id VARCHAR(48) NOT NULL,
  artifact_type VARCHAR(32) NOT NULL,
  artifact_version INT UNSIGNED NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  content_type VARCHAR(32) NOT NULL DEFAULT 'markdown',
  source_json JSON DEFAULT NULL,
  coverage_json JSON DEFAULT NULL,
  meta_json JSON DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  expires_at DATETIME NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_artifact_job (job_id),
  KEY idx_toolbox_artifact_user_time (user_id, create_time),
  KEY idx_toolbox_artifact_expiry (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱结构化可保存产物';

CREATE TABLE IF NOT EXISTS toolbox_save_receipts (
  id CHAR(36) NOT NULL,
  receipt_key CHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  artifact_id CHAR(36) NOT NULL,
  artifact_version INT UNSIGNED NOT NULL,
  target_type VARCHAR(24) NOT NULL,
  target_id VARCHAR(128) DEFAULT NULL,
  save_generation INT UNSIGNED NOT NULL DEFAULT 1,
  idempotency_key VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'saving',
  lease_token CHAR(36) DEFAULT NULL,
  error_code VARCHAR(64) DEFAULT NULL,
  error_message VARCHAR(255) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_toolbox_save_receipt (receipt_key),
  UNIQUE KEY uk_toolbox_save_request (user_id, idempotency_key),
  KEY idx_toolbox_save_artifact (artifact_id, artifact_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱同版本产物保存幂等收据';
