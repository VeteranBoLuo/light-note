import pool from '../db/index.js';

const TOOLBOX_CONTENT_BYTES_MIGRATION_KEY = 'project_revision_content_bytes_v1';
const TOOLBOX_CONTENT_BYTES_BACKFILL_BATCH_SIZE = 1000;
const TOOLBOX_SCHEMA_LOCK_NAME = 'lightnote:toolbox:schema';

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

async function toolboxColumnTooShort(database, tableName, columnName, expectedLength) {
  const [rows] = await database.query(
    `SELECT character_maximum_length AS max_length
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0 && Number(rows[0].max_length || 0) < expectedLength;
}

async function toolboxIndexMissing(database, tableName, indexName) {
  const [rows] = await database.query(
    `SELECT COUNT(*) AS index_count
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?`,
    [tableName, indexName],
  );
  return Number(rows[0]?.index_count || 0) === 0;
}

async function backfillToolboxProjectContentBytes(connection, batchSize = TOOLBOX_CONTENT_BYTES_BACKFILL_BATCH_SIZE) {
  await connection.query(
    `INSERT IGNORE INTO toolbox_schema_migrations (migration_key)
     VALUES (?)`,
    [TOOLBOX_CONTENT_BYTES_MIGRATION_KEY],
  );
  const [states] = await connection.query(
    `SELECT last_id, completed_at
       FROM toolbox_schema_migrations
      WHERE migration_key = ?
      LIMIT 1`,
    [TOOLBOX_CONTENT_BYTES_MIGRATION_KEY],
  );
  if (states[0]?.completed_at) return { completed: true, updatedRows: 0 };

  let cursor = String(states[0]?.last_id || '');
  let updatedRows = 0;
  while (true) {
    const [rows] = cursor
      ? await connection.query(
          `SELECT id
             FROM toolbox_project_revisions
            WHERE id > ?
            ORDER BY id ASC
            LIMIT ?`,
          [cursor, batchSize],
        )
      : await connection.query(
          `SELECT id
             FROM toolbox_project_revisions
            ORDER BY id ASC
            LIMIT ?`,
          [batchSize],
        );
    if (!rows.length) {
      const [unfilledRows] = await connection.query(
        `SELECT id
           FROM toolbox_project_revisions
          WHERE content_bytes = 0
          LIMIT 1`,
      );
      if (unfilledRows.length) {
        cursor = '';
        await connection.query(
          `UPDATE toolbox_schema_migrations
              SET last_id = NULL, completed_at = NULL
            WHERE migration_key = ?`,
          [TOOLBOX_CONTENT_BYTES_MIGRATION_KEY],
        );
        continue;
      }
      await connection.query(
        `UPDATE toolbox_schema_migrations
            SET last_id = NULL, completed_at = CURRENT_TIMESTAMP
          WHERE migration_key = ?`,
        [TOOLBOX_CONTENT_BYTES_MIGRATION_KEY],
      );
      return { completed: true, updatedRows };
    }

    const nextCursor = String(rows.at(-1).id);
    const [result] = cursor
      ? await connection.query(
          `UPDATE toolbox_project_revisions
              SET content_bytes = OCTET_LENGTH(CAST(content_json AS CHAR CHARACTER SET utf8mb4))
            WHERE id > ? AND id <= ? AND content_bytes = 0`,
          [cursor, nextCursor],
        )
      : await connection.query(
          `UPDATE toolbox_project_revisions
              SET content_bytes = OCTET_LENGTH(CAST(content_json AS CHAR CHARACTER SET utf8mb4))
            WHERE id <= ? AND content_bytes = 0`,
          [nextCursor],
        );
    updatedRows += Number(result?.affectedRows || 0);
    cursor = nextCursor;
    await connection.query(
      `UPDATE toolbox_schema_migrations
          SET last_id = ?, completed_at = NULL
        WHERE migration_key = ?`,
      [cursor, TOOLBOX_CONTENT_BYTES_MIGRATION_KEY],
    );
  }
}

async function ensureToolboxProjectContentBytesBackfill(database) {
  if (typeof database.getConnection !== 'function') {
    return backfillToolboxProjectContentBytes(database);
  }
  const connection = await database.getConnection();
  let acquired = false;
  try {
    const [[lock = {}]] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [TOOLBOX_SCHEMA_LOCK_NAME]);
    acquired = Number(lock.acquired || 0) === 1;
    if (!acquired) throw new Error('TOOLBOX_SCHEMA_LOCK_TIMEOUT');
    return await backfillToolboxProjectContentBytes(connection);
  } finally {
    if (acquired) await connection.query('SELECT RELEASE_LOCK(?)', [TOOLBOX_SCHEMA_LOCK_NAME]).catch(() => {});
    connection.release?.();
  }
}

/**
 * 工具箱长任务的 Schema 必须在 HTTP 与 Worker 接单前完整就绪。
 *
 * 历史生产项目修订只回填可由 JSON 快照确定计算的字节数，不改写正文、版本号或修订关系。
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱服务端报价快照'
  `);

  await database.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱异步任务与三状态机快照'
  `);

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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱任务输入引用，不保存材料正文'
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱结构化可保存产物'
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱同版本产物保存幂等收据'
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱持续工作区'
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续工作区资料引用，不保存资料正文'
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续工作区三段式推进事项'
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续工作区推进记录与连续活跃依据'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_projects (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      project_type VARCHAR(24) NOT NULL,
      title VARCHAR(255) NOT NULL,
      metadata_json JSON DEFAULT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      version BIGINT UNSIGNED NOT NULL DEFAULT 1,
      current_revision INT UNSIGNED NOT NULL DEFAULT 1,
      current_revision_id CHAR(36) NOT NULL,
      create_request_id VARCHAR(128) NOT NULL,
      create_digest CHAR(64) NOT NULL,
      last_opened_at DATETIME DEFAULT NULL,
      trashed_at DATETIME DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_toolbox_project_create_request (user_id, create_request_id),
      KEY idx_toolbox_project_user_type (user_id, project_type, status, updated_at),
      KEY idx_toolbox_project_user_opened (user_id, last_opened_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱独立生产项目'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_project_revisions (
      id CHAR(36) NOT NULL,
      project_id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      revision_no INT UNSIGNED NOT NULL,
      parent_revision_id CHAR(36) DEFAULT NULL,
      restored_from_revision_id CHAR(36) DEFAULT NULL,
      schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
      content_json JSON NOT NULL,
      content_bytes INT UNSIGNED NOT NULL,
      content_hash CHAR(64) NOT NULL,
      change_kind VARCHAR(24) NOT NULL,
      label VARCHAR(200) DEFAULT NULL,
      client_request_id VARCHAR(128) NOT NULL,
      request_digest CHAR(64) NOT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_toolbox_project_revision_no (project_id, revision_no),
      UNIQUE KEY uk_toolbox_project_revision_request (user_id, client_request_id),
      KEY idx_toolbox_project_revision_storage (user_id, project_id, content_bytes),
      KEY idx_toolbox_project_revision_time (project_id, create_time),
      KEY idx_toolbox_project_revision_restore (restored_from_revision_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱生产项目不可变修订'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_project_resources (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      resource_type VARCHAR(24) NOT NULL,
      resource_id VARCHAR(128) NOT NULL,
      resource_version VARCHAR(128) NOT NULL DEFAULT '',
      resource_title VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(24) NOT NULL DEFAULT 'source',
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_toolbox_project_resource (project_id, resource_type, resource_id),
      KEY idx_toolbox_project_resource_user (user_id, resource_type, resource_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱生产项目资料引用，不保存资料正文'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_project_revision_requests (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      project_id CHAR(36) NOT NULL,
      client_request_id VARCHAR(128) NOT NULL,
      request_digest CHAR(64) NOT NULL,
      result_revision_id CHAR(36) NOT NULL,
      result_revision_no INT UNSIGNED NOT NULL,
      outcome VARCHAR(16) NOT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_toolbox_project_revision_request_receipt (user_id, client_request_id),
      KEY idx_toolbox_project_revision_request_project (project_id, result_revision_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱生产项目修订请求幂等收据'
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS toolbox_schema_migrations (
      migration_key VARCHAR(64) NOT NULL,
      last_id VARCHAR(128) DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (migration_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具箱可恢复数据迁移游标'
  `);

  if (await toolboxColumnMissing(database, 'toolbox_projects', 'trashed_at')) {
    try {
      await database.query(
        'ALTER TABLE toolbox_projects ADD COLUMN trashed_at DATETIME DEFAULT NULL AFTER last_opened_at',
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  if (await toolboxColumnMissing(database, 'toolbox_project_revisions', 'content_bytes')) {
    try {
      await database.query(
        'ALTER TABLE toolbox_project_revisions ADD COLUMN content_bytes INT UNSIGNED NOT NULL DEFAULT 0 AFTER content_json',
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await ensureToolboxProjectContentBytesBackfill(database);
  if (await toolboxIndexMissing(database, 'toolbox_project_revisions', 'idx_toolbox_project_revision_storage')) {
    try {
      await database.query(
        'ALTER TABLE toolbox_project_revisions ADD KEY idx_toolbox_project_revision_storage (user_id, project_id, content_bytes)',
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_KEYNAME') throw error;
    }
  }
  const projectRevisionLabelMissing = await toolboxColumnMissing(database, 'toolbox_project_revisions', 'label');
  if (projectRevisionLabelMissing) {
    try {
      await database.query(
        'ALTER TABLE toolbox_project_revisions ADD COLUMN label VARCHAR(200) DEFAULT NULL AFTER change_kind',
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    if (!(await toolboxColumnMissing(database, 'toolbox_project_revisions', 'name'))) {
      await database.query(
        'UPDATE toolbox_project_revisions SET label = name WHERE label IS NULL AND name IS NOT NULL',
      );
    }
  }
  if (await toolboxColumnTooShort(database, 'toolbox_projects', 'create_request_id', 128)) {
    await database.query('ALTER TABLE toolbox_projects MODIFY COLUMN create_request_id VARCHAR(128) NOT NULL');
  }
  if (await toolboxColumnTooShort(database, 'toolbox_project_revisions', 'client_request_id', 128)) {
    await database.query('ALTER TABLE toolbox_project_revisions MODIFY COLUMN client_request_id VARCHAR(128) NOT NULL');
  }
}

export const toolboxSchemaInternals = Object.freeze({
  pointsOperationStatusTooShort,
  toolboxColumnMissing,
  toolboxColumnTooShort,
  toolboxIndexMissing,
  backfillToolboxProjectContentBytes,
  ensureToolboxProjectContentBytesBackfill,
});
