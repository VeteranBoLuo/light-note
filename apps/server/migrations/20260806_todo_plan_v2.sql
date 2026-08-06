-- 2026-08-06 待办「任务计划 × 每项提醒」v2（MySQL 5.7，可重复执行）
--
-- 新模型与旧 todo_items.recurrence_rule / todo_reminders 双轨运行；本迁移不改写任何旧数据。

CREATE TABLE IF NOT EXISTS todo_series (
  id char(36) NOT NULL,
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  title varchar(200) NOT NULL,
  description text,
  checklist_template json DEFAULT NULL,
  priority tinyint NOT NULL DEFAULT 1,
  repeat_mode varchar(24) NOT NULL COMMENT 'scheduled/after_completion',
  status varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/paused/ended',
  timezone varchar(64) NOT NULL,
  schedule_rule json NOT NULL,
  version int NOT NULL DEFAULT 1,
  next_occurrence_no int NOT NULL DEFAULT 1,
  generated_through_date date DEFAULT NULL,
  parent_series_id char(36) DEFAULT NULL,
  split_from_occurrence_no int DEFAULT NULL,
  creation_key varchar(64) DEFAULT NULL,
  creation_hash char(64) DEFAULT NULL,
  last_generation_error varchar(64) DEFAULT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_todo_series_creation (user_id, creation_key),
  KEY idx_series_user_status (user_id, status, update_time),
  KEY idx_series_generation (status, generated_through_date),
  KEY idx_series_parent (parent_series_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办 v2 系列事实';

CREATE TABLE IF NOT EXISTS todo_series_resource_refs (
  id char(36) NOT NULL,
  series_id char(36) NOT NULL,
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  resource_type varchar(16) NOT NULL,
  resource_id varchar(255) NOT NULL,
  snapshot_title varchar(500) NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_series_resource (series_id, resource_type, resource_id),
  KEY idx_series_ref_owner (user_id, series_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办系列参考资料模板';

CREATE TABLE IF NOT EXISTS todo_reminder_rules (
  id char(36) NOT NULL,
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  todo_id char(36) DEFAULT NULL,
  series_id char(36) DEFAULT NULL,
  version int NOT NULL DEFAULT 1,
  mode varchar(24) NOT NULL COMMENT 'once_per_instance/nudge',
  trigger_type varchar(24) NOT NULL COMMENT 'at_start/fixed_time/before_due',
  fixed_local_time time DEFAULT NULL,
  offset_minutes int DEFAULT NULL,
  repeat_interval_minutes int DEFAULT NULL,
  stop_type varchar(32) DEFAULT NULL COMMENT 'completion_or_due/max_count',
  max_count int DEFAULT NULL,
  channels json NOT NULL,
  target_email varchar(254) DEFAULT NULL,
  quiet_policy varchar(24) NOT NULL DEFAULT 'defer_once',
  timezone varchar(64) NOT NULL,
  enabled tinyint NOT NULL DEFAULT 1,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rule_todo (todo_id, enabled),
  KEY idx_rule_series (series_id, enabled),
  KEY idx_rule_owner (user_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办 v2 单项或系列提醒模板';

CREATE TABLE IF NOT EXISTS todo_reminder_jobs (
  id char(36) NOT NULL,
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  todo_id char(36) NOT NULL,
  series_id char(36) DEFAULT NULL,
  rule_id char(36) DEFAULT NULL,
  rule_version int DEFAULT NULL,
  channel varchar(16) NOT NULL,
  sequence_no int NOT NULL DEFAULT 1,
  original_scheduled_at_utc datetime NOT NULL,
  scheduled_at_utc datetime NOT NULL,
  scheduled_at_local datetime NOT NULL,
  stop_at_utc datetime DEFAULT NULL,
  timezone varchar(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending'
    COMMENT 'pending/processing/paused/sent/skipped/failed/unknown/cancelled',
  lease_token char(36) DEFAULT NULL,
  lease_until datetime DEFAULT NULL,
  retry_count int NOT NULL DEFAULT 0,
  provider_message_id varchar(255) DEFAULT NULL,
  last_error varchar(64) DEFAULT NULL,
  cancel_reason varchar(64) DEFAULT NULL,
  sent_at datetime DEFAULT NULL,
  dedupe_key char(64) NOT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_todo_reminder_job_dedupe (dedupe_key),
  KEY idx_reminder_job_due (status, scheduled_at_utc),
  KEY idx_reminder_job_lease (status, lease_until),
  KEY idx_reminder_job_todo (todo_id, status),
  KEY idx_reminder_job_series (series_id, status),
  KEY idx_reminder_job_rule (rule_id, rule_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办 v2 每次实际提醒投递';

CREATE TABLE IF NOT EXISTS todo_plan_requests (
  id char(36) NOT NULL,
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  idempotency_key varchar(64) NOT NULL,
  request_hash char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'processing' COMMENT 'processing/succeeded/failed',
  series_id char(36) DEFAULT NULL,
  todo_id char(36) DEFAULT NULL,
  response_json json DEFAULT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_todo_plan_request (user_id, idempotency_key),
  KEY idx_todo_plan_request_time (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办 v2 创建幂等回执';

CREATE TABLE IF NOT EXISTS todo_plan_mutations (
  id char(36) NOT NULL,
  user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  idempotency_key varchar(64) NOT NULL,
  action varchar(48) NOT NULL,
  request_hash char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'processing' COMMENT 'processing/succeeded',
  response_json json DEFAULT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_todo_plan_mutation (user_id, idempotency_key),
  KEY idx_todo_plan_mutation_time (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办 v2 修改与系列操作幂等回执';

CREATE TABLE IF NOT EXISTS todo_plan_runtime_metrics (
  metric_name varchar(64) NOT NULL,
  metric_value bigint unsigned NOT NULL DEFAULT 0,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办 v2 调度累计诊断指标';

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'start_at');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN start_at datetime DEFAULT NULL COMMENT 'v2 当前实例开始时间' AFTER due_at", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'plan_version');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN plan_version tinyint NOT NULL DEFAULT 1 COMMENT '1 legacy / 2 series model' AFTER start_at", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'series_version');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN series_version int DEFAULT NULL AFTER plan_version", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'occurrence_no');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN occurrence_no int DEFAULT NULL AFTER series_version", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'occurrence_date');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN occurrence_date date DEFAULT NULL AFTER occurrence_no", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'instance_timezone');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN instance_timezone varchar(64) DEFAULT NULL AFTER occurrence_date", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'is_exception');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN is_exception tinyint NOT NULL DEFAULT 0 AFTER instance_timezone", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'instance_state');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN instance_state varchar(16) NOT NULL DEFAULT 'normal' COMMENT 'normal/skipped' AFTER is_exception", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND COLUMN_NAME = 'generated_by_todo_id');
SET @ddl := IF(@col = 0, "ALTER TABLE todo_items ADD COLUMN generated_by_todo_id char(36) DEFAULT NULL COMMENT '完成后再次安排的来源实例' AFTER instance_state", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todo_items' AND INDEX_NAME = 'uk_todo_series_occurrence');
SET @ddl := IF(@idx = 0, "ALTER TABLE todo_items ADD UNIQUE KEY uk_todo_series_occurrence (series_id, occurrence_no)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 站内提醒按 Job 建稳定来源键，防止 Worker 重试生成重复通知。
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'source_type');
SET @ddl := IF(@col = 0, "ALTER TABLE notification ADD COLUMN source_type varchar(32) DEFAULT NULL AFTER meta", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'source_id');
SET @ddl := IF(@col = 0, "ALTER TABLE notification ADD COLUMN source_id varchar(64) DEFAULT NULL AFTER source_type", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND INDEX_NAME = 'uk_notification_source');
SET @ddl := IF(@idx = 0, "ALTER TABLE notification ADD UNIQUE KEY uk_notification_source (user_id, source_type, source_id)", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
