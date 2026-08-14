import pool from '../db/index.js';

const USER_ACHIEVEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id VARCHAR(64) NOT NULL,
    achievement_key VARCHAR(64) NOT NULL,
    unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME DEFAULT NULL,
    reward_points_snapshot INT DEFAULT NULL,
    reward_frame_id_snapshot VARCHAR(64) DEFAULT NULL,
    policy_version VARCHAR(32) DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_key),
    KEY idx_user_achievements_status (user_id, claimed_at, unlocked_at),
    KEY idx_user_achievements_recent (user_id, unlocked_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户成就永久状态'
`;

const USER_GROWTH_PREFERENCES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_growth_preferences (
    user_id VARCHAR(64) NOT NULL,
    weekly_active_target TINYINT UNSIGNED NOT NULL DEFAULT 5,
    streak_reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
    celebration_enabled TINYINT(1) NOT NULL DEFAULT 1,
    low_pressure_mode TINYINT(1) NOT NULL DEFAULT 0,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    utc_offset_minutes SMALLINT NOT NULL DEFAULT 480,
    points_goal_item_id VARCHAR(64) DEFAULT NULL,
    points_goal_enabled TINYINT(1) NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户成长偏好'
`;

const GROWTH_RECAP_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS growth_recap_state (
    user_id VARCHAR(64) NOT NULL,
    resource_type VARCHAR(16) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    snoozed_until DATETIME DEFAULT NULL,
    dismissed_at DATETIME DEFAULT NULL,
    last_shown_date DATE DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, resource_type, resource_id),
    KEY idx_growth_recap_available (user_id, dismissed_at, snoozed_until)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成长内容回顾状态'
`;

const POINTS_EARNING_PERIOD_POLICY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS points_earning_period_policy (
    period_type VARCHAR(8) NOT NULL,
    period_key CHAR(8) NOT NULL,
    policy_version VARCHAR(32) NOT NULL,
    selected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (period_type, period_key),
    KEY idx_points_period_policy_version (policy_version, selected_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分获取日/周策略版本锁'
`;

const POINTS_GRANT_OPERATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS points_grant_operations (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(64) NOT NULL,
    request_id VARCHAR(96) NOT NULL,
    operation_type VARCHAR(32) NOT NULL,
    operation_hash CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    points BIGINT NOT NULL,
    reason VARCHAR(32) NOT NULL,
    ref VARCHAR(64) DEFAULT NULL,
    policy_version VARCHAR(32) DEFAULT NULL,
    result_json JSON DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_points_grant_user_request (user_id, request_id),
    KEY idx_points_grant_status_time (status, create_time),
    KEY idx_points_grant_type_time (operation_type, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='非消费积分发放幂等收据'
`;

const POINTS_LEDGER_BASELINES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS points_ledger_baselines (
    user_id VARCHAR(64) NOT NULL,
    baseline_delta BIGINT NOT NULL DEFAULT 0,
    captured_balance BIGINT NOT NULL DEFAULT 0,
    captured_ledger_sum BIGINT NOT NULL DEFAULT 0,
    policy_version VARCHAR(32) NOT NULL,
    captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='C5 对账期初差额基线'
`;

const POINTS_CAMPAIGNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS points_campaigns (
    id BIGINT NOT NULL AUTO_INCREMENT,
    public_id VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    points_per_user INT UNSIGNED NOT NULL,
    audience_json JSON NOT NULL,
    recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
    delivered_count INT UNSIGNED NOT NULL DEFAULT 0,
    failed_count INT UNSIGNED NOT NULL DEFAULT 0,
    total_points BIGINT UNSIGNED NOT NULL DEFAULT 0,
    reason_code VARCHAR(32) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    create_request_id VARCHAR(64) NOT NULL,
    create_payload_hash CHAR(64) NOT NULL,
    confirmed_by VARCHAR(64) DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    frozen_at DATETIME DEFAULT NULL,
    confirmed_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_points_campaign_public (public_id),
    UNIQUE KEY uk_points_campaign_create_request (created_by, create_request_id),
    KEY idx_points_campaign_status_time (status, update_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='正向积分活动批次'
`;

const POINTS_CAMPAIGN_RECIPIENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS points_campaign_recipients (
    campaign_id BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    points INT UNSIGNED NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    request_id VARCHAR(96) NOT NULL,
    lease_owner VARCHAR(64) DEFAULT NULL,
    lease_until DATETIME DEFAULT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    delivered_at DATETIME DEFAULT NULL,
    error_code VARCHAR(64) DEFAULT NULL,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (campaign_id, user_id),
    UNIQUE KEY uk_points_campaign_request (request_id),
    KEY idx_points_campaign_recipient_work (campaign_id, status, lease_until, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分活动冻结名单与交付状态'
`;

let ensurePromise = null;

async function columnMissing(table, column) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return !Number(row?.count || 0);
}

async function indexMissing(table, indexName) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName],
  );
  return !Number(row?.count || 0);
}

async function ensureC5ColumnsAndIndexes() {
  const achievementColumns = [
    ['reward_points_snapshot', 'INT DEFAULT NULL AFTER claimed_at'],
    ['reward_frame_id_snapshot', 'VARCHAR(64) DEFAULT NULL AFTER reward_points_snapshot'],
    ['policy_version', 'VARCHAR(32) DEFAULT NULL AFTER reward_frame_id_snapshot'],
  ];
  for (const [column, definition] of achievementColumns) {
    if (await columnMissing('user_achievements', column)) {
      await pool.query(`ALTER TABLE user_achievements ADD COLUMN ${column} ${definition}`);
    }
  }
  const preferenceColumns = [
    ['points_goal_item_id', 'VARCHAR(64) DEFAULT NULL AFTER utc_offset_minutes'],
    ['points_goal_enabled', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER points_goal_item_id'],
  ];
  for (const [column, definition] of preferenceColumns) {
    if (await columnMissing('user_growth_preferences', column)) {
      await pool.query(`ALTER TABLE user_growth_preferences ADD COLUMN ${column} ${definition}`);
    }
  }
  const campaignColumns = [
    ['create_request_id', 'VARCHAR(64) DEFAULT NULL AFTER created_by'],
    ['create_payload_hash', 'CHAR(64) DEFAULT NULL AFTER create_request_id'],
  ];
  for (const [column, definition] of campaignColumns) {
    if (await columnMissing('points_campaigns', column)) {
      await pool.query(`ALTER TABLE points_campaigns ADD COLUMN ${column} ${definition}`);
    }
  }
  if (await indexMissing('points_campaigns', 'uk_points_campaign_create_request')) {
    await pool.query(
      'ALTER TABLE points_campaigns ADD UNIQUE INDEX uk_points_campaign_create_request (created_by, create_request_id)',
    );
  }
  if (await indexMissing('growth_events', 'idx_growth_events_activity')) {
    await pool.query(
      'ALTER TABLE growth_events ADD INDEX idx_growth_events_activity (user_id, source, status, create_time)',
    );
  }
}

async function migrateLegacyAchievementState() {
  await pool.query(
    `INSERT INTO user_achievements (user_id, achievement_key, unlocked_at, claimed_at)
     SELECT
       user_id,
       ref,
       MIN(create_time),
       MIN(CASE WHEN reason = 'achievement' THEN create_time ELSE NULL END)
     FROM points_log
     WHERE reason IN ('ach_unlock', 'achievement')
       AND ref IS NOT NULL
       AND ref <> ''
     GROUP BY user_id, ref
     ON DUPLICATE KEY UPDATE
       unlocked_at = LEAST(user_achievements.unlocked_at, VALUES(unlocked_at)),
       claimed_at = COALESCE(user_achievements.claimed_at, VALUES(claimed_at))`,
  );
}

async function migrateGrowthActivityHistory() {
  await pool.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta, create_time)
     SELECT user_id, 'todo_complete', SHA2(CONCAT('todo:', CAST(id AS CHAR)), 256),
            NULL, 0, 'granted', JSON_OBJECT('kind', 'todo'), completed_at
       FROM todo_items
      WHERE completed_at IS NOT NULL`,
  );
  await pool.query(
    `INSERT IGNORE INTO growth_events
       (user_id, source, ref_id, day, amount, status, meta, create_time)
     SELECT ri.user_id, 'organize_complete',
            SHA2(CONCAT('organize:', ri.resource_type, ':', ri.resource_id), 256),
            NULL, 0, 'granted', JSON_OBJECT('kind', 'organize'), ri.complete_time
       FROM resource_inbox ri
      WHERE ri.complete_time IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
           WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
             AND osr.resource_id = ri.resource_id
        )`,
  );
}

export function ensureGrowthCenterSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(USER_ACHIEVEMENTS_TABLE_SQL);
      await pool.query(USER_GROWTH_PREFERENCES_TABLE_SQL);
      await pool.query(GROWTH_RECAP_STATE_TABLE_SQL);
      await pool.query(POINTS_EARNING_PERIOD_POLICY_TABLE_SQL);
      await pool.query(POINTS_GRANT_OPERATIONS_TABLE_SQL);
      await pool.query(POINTS_LEDGER_BASELINES_TABLE_SQL);
      await pool.query(POINTS_CAMPAIGNS_TABLE_SQL);
      await pool.query(POINTS_CAMPAIGN_RECIPIENTS_TABLE_SQL);
      await ensureC5ColumnsAndIndexes();
      // 历史成就、事实账本、奖励快照与期初基线都会扫描业务表或 points_log，
      // 只能由 20260814_points_earning_c5.sql 在维护窗口显式执行。应用启动
      // 只做幂等 Schema/索引就绪，避免每次重启阻塞首批业务请求。
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export {
  GROWTH_RECAP_STATE_TABLE_SQL,
  POINTS_CAMPAIGNS_TABLE_SQL,
  POINTS_CAMPAIGN_RECIPIENTS_TABLE_SQL,
  POINTS_EARNING_PERIOD_POLICY_TABLE_SQL,
  POINTS_GRANT_OPERATIONS_TABLE_SQL,
  POINTS_LEDGER_BASELINES_TABLE_SQL,
  USER_ACHIEVEMENTS_TABLE_SQL,
  USER_GROWTH_PREFERENCES_TABLE_SQL,
  migrateGrowthActivityHistory,
  migrateLegacyAchievementState,
};
