import pool from '../../db/index.js';
import { SECURITY_RULE_CATALOG } from './rules.js';

const ensureColumn = async (tableName, columnName, definition) => {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  if (!rows[0]) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
};

const ensureIndex = async (tableName, indexName, definition) => {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName],
  );
  if (!rows[0]) await pool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} ${definition}`);
};

const ensureSecurityEventSchema = async () => {
  await ensureColumn('security_events', 'ip_risk_delta', 'ip_risk_delta INT DEFAULT 0 AFTER ip_attack_count_24h');
  await ensureColumn(
    'security_events',
    'ip_risk_reverted',
    'ip_risk_reverted BOOLEAN DEFAULT FALSE AFTER ip_risk_delta',
  );
  await ensureColumn('security_events', 'ip_risk_reverted_at', 'ip_risk_reverted_at DATETIME AFTER ip_risk_reverted');
  await ensureColumn('security_events', 'user_risk_delta', 'user_risk_delta INT DEFAULT 0 AFTER ip_risk_reverted_at');
  await ensureColumn(
    'security_events',
    'user_risk_reverted',
    'user_risk_reverted BOOLEAN DEFAULT FALSE AFTER user_risk_delta',
  );
  await ensureColumn(
    'security_events',
    'user_risk_reverted_at',
    'user_risk_reverted_at DATETIME AFTER user_risk_reverted',
  );
  await ensureColumn('security_events', 'primary_rule_code', 'primary_rule_code VARCHAR(100) AFTER matched_rule');
  await ensureColumn(
    'security_events',
    'workflow_status',
    "workflow_status ENUM('new','reviewing','resolved') DEFAULT 'new' AFTER handled_status",
  );
  await ensureColumn(
    'security_events',
    'disposition',
    "disposition ENUM('unknown','confirmed_attack','false_positive','authorized_test','benign_anomaly') DEFAULT 'unknown' AFTER workflow_status",
  );
  await ensureColumn('security_events', 'cluster_key', 'cluster_key VARCHAR(128) AFTER disposition');
  await ensureColumn('security_events', 'policy_version', 'policy_version INT DEFAULT 1 AFTER cluster_key');
  await ensureColumn('security_events', 'detector_version', 'detector_version VARCHAR(50) AFTER policy_version');
  await ensureColumn('security_events', 'reviewed_by', 'reviewed_by VARCHAR(64) AFTER handled_by');
  await ensureColumn('security_events', 'reviewed_at', 'reviewed_at DATETIME AFTER reviewed_by');
  await ensureColumn('security_events', 'review_reason', 'review_reason TEXT AFTER reviewed_at');
  await ensureColumn('security_event_evidence', 'field_context', 'field_context VARCHAR(50) AFTER matched_field');
  await ensureColumn('security_event_evidence', 'policy_mode', "policy_mode ENUM('observe','block') AFTER confidence");
  await ensureColumn('security_event_evidence', 'policy_version', 'policy_version INT DEFAULT 1 AFTER policy_mode');
  await ensureColumn('security_event_evidence', 'exception_ids', 'exception_ids JSON AFTER policy_version');
  await ensureIndex('security_events', 'idx_security_event_cluster', '(cluster_key)');
  await ensureIndex('security_events', 'idx_security_event_review', '(workflow_status, disposition, created_at)');
  await pool.query(`
    ALTER TABLE security_events
    MODIFY handled_status ENUM('unhandled','processed','confirmed','false_positive','authorized_test','ignored','resolved') DEFAULT 'unhandled'
  `);
  await pool.query(`
    UPDATE security_events
    SET handled_status = 'processed'
    WHERE handled_status IN ('confirmed','resolved','ignored')
  `);
  await pool.query(`
    ALTER TABLE security_events
    MODIFY handled_status ENUM('unhandled','processed','false_positive','authorized_test') DEFAULT 'unhandled'
  `);
  await pool.query(`
    UPDATE security_events
    SET workflow_status = CASE WHEN handled_status = 'unhandled' THEN 'new' ELSE 'resolved' END,
        disposition = CASE
          WHEN handled_status = 'false_positive' THEN 'false_positive'
          WHEN handled_status = 'authorized_test' THEN 'authorized_test'
          ELSE COALESCE(disposition, 'unknown')
        END,
        primary_rule_code = COALESCE(NULLIF(primary_rule_code, ''), matched_rule, attack_type),
        detector_version = COALESCE(NULLIF(detector_version, ''), 'security-v1')
    WHERE workflow_status IS NULL
       OR disposition IS NULL
       OR primary_rule_code IS NULL
       OR detector_version IS NULL
  `);
  await pool.query(`
    UPDATE security_events
    SET cluster_key = SHA2(CONCAT(
      COALESCE(NULLIF(primary_rule_code, ''), matched_rule, attack_type), '|',
      COALESCE(request_path, ''), '|',
      COALESCE(NULLIF(user_id, ''), source_ip, 'anonymous'), '|',
      FLOOR(UNIX_TIMESTAMP(created_at) / 300)
    ), 256)
    WHERE cluster_key IS NULL OR cluster_key = ''
  `);
};

const ensureSecurityV2Tables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_rule_overrides (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      rule_code VARCHAR(100) NOT NULL,
      mode ENUM('observe','block','off') NOT NULL,
      score_override INT NULL,
      route_pattern VARCHAR(500) NULL,
      request_method VARCHAR(16) NULL,
      field_pattern VARCHAR(255) NULL,
      field_context VARCHAR(50) NULL,
      reason VARCHAR(500) NOT NULL,
      expires_at DATETIME NULL,
      enabled BOOLEAN DEFAULT TRUE,
      version INT DEFAULT 1,
      created_by VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rule_override_active (rule_code, enabled, expires_at),
      INDEX idx_rule_override_version (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_exceptions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      subject_type ENUM('user','ip') NOT NULL,
      subject_value VARCHAR(128) NOT NULL,
      rule_code VARCHAR(100) NULL,
      route_pattern VARCHAR(500) NULL,
      request_method VARCHAR(16) NULL,
      field_pattern VARCHAR(255) NULL,
      effect ENUM('observe_only','skip_rule','score_adjust') NOT NULL,
      score_delta INT NULL,
      reason VARCHAR(500) NOT NULL,
      expires_at DATETIME NULL,
      enabled BOOLEAN DEFAULT TRUE,
      created_by VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_security_exception_subject (subject_type, subject_value, enabled),
      INDEX idx_security_exception_rule (rule_code, enabled, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_account_restrictions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      restriction_type ENUM('login_lock','write_lock','upload_lock','ai_lock','full_lock') NOT NULL,
      scope_json JSON NULL,
      status ENUM('active','revoked','expired') DEFAULT 'active',
      reason VARCHAR(500) NOT NULL,
      expires_at DATETIME NULL,
      created_by VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_by VARCHAR(64) NULL,
      revoked_at DATETIME NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_security_restriction_active (user_id, status, expires_at),
      INDEX idx_security_restriction_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_rule_tuning_suggestions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL,
      rule_code VARCHAR(100) NOT NULL,
      request_path VARCHAR(500) NULL,
      request_method VARCHAR(16) NULL,
      matched_field VARCHAR(255) NULL,
      suggestion_type ENUM('observe_route','ignore_field','lower_score','exact_exception','no_change') NOT NULL,
      status ENUM('draft','accepted','dismissed') DEFAULT 'draft',
      reason VARCHAR(500) NULL,
      created_by VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tuning_event (event_id),
      INDEX idx_tuning_rule_status (rule_code, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_policy_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      policy_type ENUM('rule_override','exception','account_restriction','source_deny') NOT NULL,
      policy_id BIGINT NULL,
      action ENUM('create','update','disable','revoke','expire') NOT NULL,
      policy_version INT DEFAULT 1,
      operator_id VARCHAR(64) NULL,
      reason VARCHAR(500) NULL,
      snapshot_json JSON NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_security_policy_audit (policy_type, policy_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_migration_state (
      migration_key VARCHAR(100) PRIMARY KEY,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

const migrateLegacySecurityControls = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(`
      INSERT INTO security_account_restrictions
        (user_id, restriction_type, status, reason, created_by, created_at)
      SELECT b.user_id, 'full_lock', 'active', COALESCE(NULLIF(b.ban_reason, ''), '历史安全封禁迁移'), b.banned_by,
             COALESCE(b.banned_at, NOW())
      FROM security_account_bans b
      WHERE b.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM security_account_restrictions r
          WHERE r.user_id = b.user_id AND r.status = 'active' AND r.restriction_type = 'full_lock'
        )
    `);
    await connection.query(`
      INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason, snapshot_json)
      SELECT 'account_restriction', r.id, 'create', 1, r.created_by, '历史安全封禁迁移',
             JSON_OBJECT('userId', r.user_id, 'restrictionType', r.restriction_type, 'migrated', TRUE)
      FROM security_account_restrictions r
      LEFT JOIN security_policy_audit a
        ON a.policy_type = 'account_restriction' AND a.policy_id = r.id AND a.action = 'create'
      WHERE a.id IS NULL
    `);
    await connection.query(`
      INSERT INTO security_exceptions
        (subject_type, subject_value, effect, reason, enabled, created_by, created_at)
      SELECT w.target_type, w.target_value, 'observe_only',
             COALESCE(NULLIF(w.reason, ''), NULLIF(w.label, ''), '历史白名单迁移'), 1, w.created_by, w.created_at
      FROM security_whitelist w
      WHERE w.enabled = 1
        AND NOT EXISTS (
          SELECT 1 FROM security_exceptions x
          WHERE x.subject_type = w.target_type AND x.subject_value = w.target_value
            AND x.rule_code IS NULL AND x.route_pattern IS NULL AND x.request_method IS NULL
            AND x.field_pattern IS NULL AND x.effect = 'observe_only' AND x.enabled = 1
        )
    `);
    await connection.query(`
      INSERT INTO security_policy_audit
        (policy_type, policy_id, action, policy_version, operator_id, reason, snapshot_json)
      SELECT 'exception', x.id, 'create', 1, x.created_by, '历史白名单迁移',
             JSON_OBJECT('subjectType', x.subject_type, 'subjectValue', x.subject_value, 'effect', x.effect, 'migrated', TRUE)
      FROM security_exceptions x
      LEFT JOIN security_policy_audit a
        ON a.policy_type = 'exception' AND a.policy_id = x.id AND a.action = 'create'
      WHERE a.id IS NULL
    `);
    await connection.query(`
      UPDATE security_whitelist
      SET enabled = 0, updated_at = NOW()
      WHERE enabled = 1
    `);
    const migrationKey = 'security-controls-v2-del-flag-separation';
    const [migrationRows] = await connection.query(
      'SELECT migration_key FROM security_migration_state WHERE migration_key = ? LIMIT 1 FOR UPDATE',
      [migrationKey],
    );
    if (!migrationRows[0]) {
      await connection.query(`
        UPDATE user u
        JOIN security_account_bans b ON b.user_id = u.id AND b.is_active = 1
        SET u.del_flag = 0
        WHERE u.role <> 'root'
      `);
      await connection.query('INSERT INTO security_migration_state (migration_key) VALUES (?)', [migrationKey]);
    }
    await connection.query(`
      UPDATE security_ip_reputation
      SET is_banned = 0, banned_until = NULL, ban_reason = ''
      WHERE ban_reason REGEXP '^IP风险分 [0-9]+ 达到自动封禁阈值 [0-9]+$'
    `);
    await connection.commit();
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
};

export const ensureSecurityTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL UNIQUE,
      attack_type VARCHAR(50) NOT NULL,
      severity ENUM('low','medium','high','critical') NOT NULL,
      threat_score INT DEFAULT 0,
      confidence INT DEFAULT 0,
      action_taken ENUM('log','allow','rate_limit','block','ban') DEFAULT 'log',
      blocked BOOLEAN DEFAULT FALSE,
      request_method VARCHAR(10),
      request_path VARCHAR(500),
      request_url TEXT,
      status_code INT,
      response_time_ms INT,
      source_ip VARCHAR(45),
      x_forwarded_for VARCHAR(500),
      user_agent VARCHAR(500),
      user_id VARCHAR(64),
      role VARCHAR(50),
      matched_rule VARCHAR(100),
      matched_payload TEXT,
      payload_summary JSON,
      headers_summary JSON,
      ip_attack_count_5m INT DEFAULT 0,
      ip_attack_count_24h INT DEFAULT 0,
      ip_risk_delta INT DEFAULT 0,
      ip_risk_reverted BOOLEAN DEFAULT FALSE,
      ip_risk_reverted_at DATETIME,
      decision_reason VARCHAR(255),
      handled_status ENUM('unhandled','processed','false_positive','authorized_test') DEFAULT 'unhandled',
      handled_by VARCHAR(64),
      handled_at DATETIME,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_type_time (attack_type, created_at),
      INDEX idx_ip_time (source_ip, created_at),
      INDEX idx_severity_time (severity, created_at),
      INDEX idx_score (threat_score),
      INDEX idx_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_event_evidence (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL,
      rule_code VARCHAR(100),
      rule_name VARCHAR(100),
      detector VARCHAR(50),
      attack_type VARCHAR(50),
      severity VARCHAR(20),
      matched_field VARCHAR(200),
      field_context VARCHAR(50),
      matched_value_preview TEXT,
      evidence_message TEXT,
      score_delta INT DEFAULT 0,
      confidence INT DEFAULT 0,
      policy_mode ENUM('observe','block'),
      policy_version INT DEFAULT 1,
      exception_ids JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_id (event_id),
      INDEX idx_rule_code (rule_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_ip_reputation (
      ip VARCHAR(45) PRIMARY KEY,
      total_requests BIGINT DEFAULT 0,
      total_attacks INT DEFAULT 0,
      high_risk_count INT DEFAULT 0,
      critical_count INT DEFAULT 0,
      risk_score INT DEFAULT 0,
      attack_type_breakdown JSON,
      is_banned BOOLEAN DEFAULT FALSE,
      banned_until DATETIME,
      ban_reason VARCHAR(255),
      first_seen_at DATETIME,
      last_seen_at DATETIME,
      last_attack_time DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_risk_score (risk_score),
      INDEX idx_banned_until (banned_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_rules (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      rule_code VARCHAR(100) NOT NULL UNIQUE,
      rule_name VARCHAR(100) NOT NULL,
      attack_type VARCHAR(50) NOT NULL,
      severity ENUM('low','medium','high','critical') NOT NULL,
      base_score INT DEFAULT 0,
      confidence INT DEFAULT 0,
      action ENUM('log','allow','rate_limit','block','ban') DEFAULT 'log',
      enabled BOOLEAN DEFAULT TRUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_account_bans (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      banned_by VARCHAR(64),
      ban_reason VARCHAR(255),
      is_active BOOLEAN DEFAULT TRUE,
      banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unbanned_by VARCHAR(64),
      unbanned_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_id (user_id),
      INDEX idx_active_time (is_active, banned_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_account_reputation (
      user_id VARCHAR(64) PRIMARY KEY,
      total_events INT DEFAULT 0,
      high_risk_count INT DEFAULT 0,
      critical_count INT DEFAULT 0,
      risk_score INT DEFAULT 0,
      attack_type_breakdown JSON,
      first_event_at DATETIME,
      last_event_at DATETIME,
      last_attack_time DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_risk_score (risk_score),
      INDEX idx_last_event_at (last_event_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_whitelist (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      target_type ENUM('ip','user') NOT NULL,
      target_value VARCHAR(128) NOT NULL,
      label VARCHAR(255),
      reason VARCHAR(255),
      enabled BOOLEAN DEFAULT TRUE,
      created_by VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_security_whitelist_target (target_type, target_value),
      INDEX idx_enabled_type (enabled, target_type),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await ensureSecurityEventSchema();
  await ensureSecurityV2Tables();
  await migrateLegacySecurityControls();

  for (const rule of SECURITY_RULE_CATALOG) {
    await pool.query(
      `INSERT INTO security_rules
        (rule_code,rule_name,attack_type,severity,base_score,confidence,action,enabled,description)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        rule_name = VALUES(rule_name),
        attack_type = VALUES(attack_type),
        severity = VALUES(severity),
        base_score = VALUES(base_score),
        confidence = VALUES(confidence),
        action = VALUES(action),
        description = VALUES(description),
        updated_at = NOW()`,
      [
        rule.code,
        rule.name,
        rule.attackType,
        rule.severity,
        rule.baseScore,
        rule.confidence,
        rule.baseScore >= 50 ? 'block' : 'log',
        1,
        rule.description || '系统内置安全检测规则',
      ],
    );
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSecurityTables()
    .then(() => {
      console.log('安全模块数据表已就绪');
      process.exit(0);
    })
    .catch((e) => {
      console.error('安全模块建表失败:', e.message);
      process.exit(1);
    });
}
