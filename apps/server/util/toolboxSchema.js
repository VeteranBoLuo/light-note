import pool from '../db/index.js';

async function pointsOperationStatusTooShort(database = pool) {
  const [rows] = await database.query(
    `SELECT character_maximum_length AS max_length
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'points_economy_operations'
        AND column_name = 'status'
      LIMIT 1`,
  );
  return rows.length > 0 && Number(rows[0].max_length || 0) < 24;
}

async function toolboxColumnMissing(database, tableName, columnName) {
  const [rows] = await database.query(
    `SELECT COUNT(*) AS column_count
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(rows[0]?.column_count || 0) === 0;
}

/**
 * 工具箱长任务的 Schema 必须在 HTTP 与 Worker 接单前完整就绪。
 */
export async function ensureToolboxSchema(database = pool) {
  if (await pointsOperationStatusTooShort(database)) {
    await database.query(
      "ALTER TABLE points_economy_operations MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'pending'",
    );
  }

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_quotes (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      request_id VARCHAR(64) NOT NULL,
      tool_id VARCHAR(48) NOT NULL,
      pricing_version VARCHAR(32) NOT NULL,
      billing_medium VARCHAR(16) NOT NULL DEFAULT 'points',
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工具箱服务端报价快照'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_jobs (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      client_request_id VARCHAR(64) NOT NULL,
      tool_id VARCHAR(48) NOT NULL,
      quote_id CHAR(36) DEFAULT NULL,
      billing_medium VARCHAR(16) NOT NULL DEFAULT 'points',
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工具箱异步任务与三状态机快照'
  `);

  if (await toolboxColumnMissing(database, 'toolbox_quotes', 'billing_medium')) {
    try {
      await database.query(
        "ALTER TABLE toolbox_quotes ADD COLUMN billing_medium VARCHAR(16) NOT NULL DEFAULT 'points' AFTER pricing_version",
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  if (await toolboxColumnMissing(database, 'toolbox_jobs', 'billing_medium')) {
    try {
      await database.query(
        "ALTER TABLE toolbox_jobs ADD COLUMN billing_medium VARCHAR(16) NOT NULL DEFAULT 'points' AFTER quote_id",
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await database.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工具箱任务输入引用，不保存材料正文'
  `);

  await database.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工具箱结构化可保存产物'
  `);

  await database.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工具箱同版本产物保存幂等收据'
  `);

  // 旧环境可能已创建保存收据表；租约代次令牌用于阻止过期请求覆盖新请求的终态。
  if (await toolboxColumnMissing(database, 'toolbox_save_receipts', 'lease_token')) {
    try {
      await database.query(
        'ALTER TABLE toolbox_save_receipts ADD COLUMN lease_token CHAR(36) DEFAULT NULL AFTER status',
      );
    } catch (error) {
      // HTTP 与 Worker 可能同时冷启动；另一个进程已完成同一幂等变更时继续即可。
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  // 用户删除已保存笔记后，只有显式重存才进入下一代；代次保证重试幂等且不会复活旧笔记。
  if (await toolboxColumnMissing(database, 'toolbox_save_receipts', 'save_generation')) {
    try {
      await database.query(
        'ALTER TABLE toolbox_save_receipts ADD COLUMN save_generation INT UNSIGNED NOT NULL DEFAULT 1 AFTER target_id',
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_workspaces (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      kind VARCHAR(24) NOT NULL,
      title VARCHAR(120) NOT NULL,
      description VARCHAR(500) DEFAULT NULL,
      goal VARCHAR(1000) DEFAULT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      target_date DATE DEFAULT NULL,
      next_step VARCHAR(500) DEFAULT NULL,
      last_opened_at DATETIME DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_toolbox_workspace_user_kind (user_id, kind, status, updated_at),
      KEY idx_toolbox_workspace_user_opened (user_id, last_opened_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工具箱持续工作区'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_workspace_resources (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      resource_type VARCHAR(24) NOT NULL,
      resource_id VARCHAR(128) NOT NULL,
      resource_version VARCHAR(128) NOT NULL,
      resource_title VARCHAR(255) NOT NULL DEFAULT '',
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_toolbox_workspace_resource (workspace_id, resource_type, resource_id),
      KEY idx_toolbox_workspace_resource_user (user_id, resource_type, resource_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='持续工作区资料引用，不保存资料正文'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_workspace_items (
      id CHAR(36) NOT NULL,
      workspace_id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      lane VARCHAR(24) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT DEFAULT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      position INT UNSIGNED NOT NULL DEFAULT 0,
      due_on DATE DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_toolbox_workspace_item_lane (workspace_id, lane, status, position),
      KEY idx_toolbox_workspace_item_user (user_id, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='持续工作区三段式推进事项'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_workspace_sessions (
      id CHAR(36) NOT NULL,
      workspace_id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      summary VARCHAR(1000) DEFAULT NULL,
      next_step VARCHAR(500) DEFAULT NULL,
      duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_toolbox_workspace_session_time (workspace_id, create_time),
      KEY idx_toolbox_workspace_session_user (user_id, create_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='持续工作区推进记录与连续活跃依据'
  `);
}

export const toolboxSchemaInternals = Object.freeze({
  pointsOperationStatusTooShort,
  toolboxColumnMissing,
});
