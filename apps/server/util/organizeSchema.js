import pool from '../db/index.js';

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows?.[0]?.total || 0) > 0;
}

async function addColumnIfMissing(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) return;
  await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

/**
 * 整理中心读取接口保持纯只读，因此所有附加 Schema 都在服务启动阶段完成。
 * 这里只做幂等结构补齐；历史数据回填必须由显式 migration 完成。
 */
export async function ensureOrganizeSchema() {
  await addColumnIfMissing('bookmark', 'url_exact_hash', 'BINARY(32) DEFAULT NULL AFTER `url`');
  if (!(await indexExists('bookmark', 'idx_bookmark_exact_url'))) {
    await pool.query('ALTER TABLE `bookmark` ADD KEY `idx_bookmark_exact_url` (`user_id`, `del_flag`, `url_exact_hash`)');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organize_issue_suppressions (
      id CHAR(36) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      issue_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      subject_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
      context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_organize_suppression (user_id, issue_type, subject_key),
      KEY idx_organize_suppression_issue (user_id, issue_type, update_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户整理中心明确忽略决定'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organize_action_requests (
      user_id VARCHAR(255) NOT NULL,
      client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      action_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
      response_json JSON DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, client_request_id),
      KEY idx_organize_action_status (status, update_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='整理中心高风险动作幂等结果'
  `);

  // bookmark_health 的旧列保留一个兼容周期；新读写只以观测与用户覆盖列为权威。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmark_health (
      bookmark_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'unknown',
      note VARCHAR(32) DEFAULT NULL,
      checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      observed_status VARCHAR(16) NOT NULL DEFAULT 'unknown',
      observed_code VARCHAR(32) DEFAULT NULL,
      checked_url_hash BINARY(32) DEFAULT NULL,
      user_override VARCHAR(16) DEFAULT NULL,
      override_at DATETIME DEFAULT NULL,
      PRIMARY KEY (bookmark_id),
      KEY idx_user_status (user_id, status),
      KEY idx_bookmark_health_observed (user_id, observed_status, checked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='书签链接健康观测与用户覆盖决定'
  `);
  await addColumnIfMissing('bookmark_health', 'observed_status', "VARCHAR(16) NOT NULL DEFAULT 'unknown' AFTER `checked_at`");
  await addColumnIfMissing('bookmark_health', 'observed_code', 'VARCHAR(32) DEFAULT NULL AFTER `observed_status`');
  await addColumnIfMissing('bookmark_health', 'checked_url_hash', 'BINARY(32) DEFAULT NULL AFTER `observed_code`');
  await addColumnIfMissing('bookmark_health', 'user_override', 'VARCHAR(16) DEFAULT NULL AFTER `checked_url_hash`');
  await addColumnIfMissing('bookmark_health', 'override_at', 'DATETIME DEFAULT NULL AFTER `user_override`');
  if (!(await indexExists('bookmark_health', 'idx_bookmark_health_observed'))) {
    await pool.query(
      'ALTER TABLE `bookmark_health` ADD KEY `idx_bookmark_health_observed` (`user_id`, `observed_status`, `checked_at`)',
    );
  }
}
