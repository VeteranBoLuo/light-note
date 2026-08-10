-- 后台高风险操作统一审计（MySQL 5.7，可重复执行）。
-- 只保存动作摘要与受控元数据；口令、Token 与用户正文不得写入本表。

CREATE TABLE IF NOT EXISTS admin_operation_audit (
  id char(36) NOT NULL,
  actor_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  action varchar(64) NOT NULL,
  target_type varchar(64) DEFAULT NULL,
  target_id varchar(255) DEFAULT NULL,
  outcome varchar(16) NOT NULL COMMENT 'intent/succeeded/failed/denied',
  reason varchar(500) NOT NULL DEFAULT '',
  request_id varchar(64) DEFAULT NULL,
  ip_masked varchar(64) DEFAULT NULL,
  metadata json DEFAULT NULL,
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_operation_actor_time (actor_user_id, create_time, id),
  KEY idx_admin_operation_action_time (action, create_time, id),
  KEY idx_admin_operation_target_time (target_type, target_id, create_time, id),
  KEY idx_admin_operation_outcome_time (outcome, create_time, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='后台高风险操作追加式审计';
