-- 模块化 AI Skills 的统一根执行与 Provider 子调用账本（MySQL 5.7 兼容、幂等）。
-- 不保存用户问题、资源标题、URL 或模型正文，只保存治理标识、稳定错误码和用量。

CREATE TABLE IF NOT EXISTS ai_executions (
  id                    CHAR(36)      NOT NULL,
  request_id            VARCHAR(64)   NOT NULL,
  actor_user_id         VARCHAR(128)  NOT NULL,
  subject_user_id       VARCHAR(128)  NOT NULL,
  billing_policy        VARCHAR(16)   NOT NULL,
  surface               VARCHAR(64)   NOT NULL,
  task_type             VARCHAR(64)   NOT NULL,
  skill_id              VARCHAR(96)   DEFAULT NULL,
  skill_version         INT           DEFAULT NULL,
  status                VARCHAR(24)   NOT NULL,
  model_called          TINYINT(1)    NOT NULL DEFAULT 0,
  provider_call_count   INT           NOT NULL DEFAULT 0,
  prompt_tokens         BIGINT        NOT NULL DEFAULT 0,
  completion_tokens     BIGINT        NOT NULL DEFAULT 0,
  provider_tokens       BIGINT        NOT NULL DEFAULT 0,
  charged_tokens        BIGINT        NOT NULL DEFAULT 0,
  usage_complete        TINYINT(1)    NOT NULL DEFAULT 1,
  quota_settlement_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  quota_reservation_key CHAR(64)      DEFAULT NULL,
  error_code            VARCHAR(64)   DEFAULT NULL,
  duration_ms           INT           NOT NULL DEFAULT 0,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_execution_request (request_id),
  KEY idx_ai_execution_subject_created (subject_user_id, created_at),
  KEY idx_ai_execution_skill_created (skill_id, created_at),
  KEY idx_ai_execution_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 用户动作级统一额度与治理账本';

CREATE TABLE IF NOT EXISTS ai_provider_spans (
  id                CHAR(36)      NOT NULL,
  execution_id      CHAR(36)      NOT NULL,
  trace_id          VARCHAR(64)   NOT NULL,
  stage             VARCHAR(64)   NOT NULL,
  task_type         VARCHAR(64)   NOT NULL,
  kind              VARCHAR(16)   NOT NULL,
  provider          VARCHAR(32)   DEFAULT NULL,
  model             VARCHAR(96)   DEFAULT NULL,
  status            VARCHAR(24)   NOT NULL,
  usage_status      VARCHAR(16)   NOT NULL,
  prompt_tokens     BIGINT        NOT NULL DEFAULT 0,
  completion_tokens BIGINT        NOT NULL DEFAULT 0,
  total_tokens      BIGINT        NOT NULL DEFAULT 0,
  estimated_cost    DECIMAL(12,6) NOT NULL DEFAULT 0,
  duration_ms       INT           NOT NULL DEFAULT 0,
  error_code        VARCHAR(64)   DEFAULT NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_provider_span_execution (execution_id, created_at),
  KEY idx_ai_provider_span_provider_created (provider, created_at),
  KEY idx_ai_provider_span_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI Execution 内部真实模型调用用量账本';

CREATE TABLE IF NOT EXISTS ai_skill_threads (
  id              CHAR(36)      NOT NULL,
  actor_user_id   VARCHAR(128)  NOT NULL,
  subject_user_id VARCHAR(128)  NOT NULL,
  admin_context_mode VARCHAR(16) NOT NULL DEFAULT 'normal',
  admin_context_id VARCHAR(128) DEFAULT NULL,
  skill_id        VARCHAR(96)   NOT NULL,
  skill_version   INT           NOT NULL,
  scope_digest    CHAR(64)      NOT NULL,
  status          VARCHAR(16)   NOT NULL DEFAULT 'active',
  expires_at      DATETIME      NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_skill_thread_subject_updated (subject_user_id, updated_at),
  KEY idx_ai_skill_thread_expiry (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='按 Skill 和权威资源范围隔离的短期对话线程';

CREATE TABLE IF NOT EXISTS ai_skill_turns (
  id             CHAR(36)     NOT NULL,
  thread_id      CHAR(36)     NOT NULL,
  request_id     VARCHAR(64)  NOT NULL,
  user_text      TEXT         NOT NULL,
  assistant_text MEDIUMTEXT   NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_skill_turn_request (thread_id, request_id),
  KEY idx_ai_skill_turn_thread_created (thread_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仅用于省略承接的有界 Skill 历史，不作为事实来源';
