import pool from '../db/index.js';

const USER_ACHIEVEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id VARCHAR(64) NOT NULL,
    achievement_key VARCHAR(64) NOT NULL,
    unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME DEFAULT NULL,
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

let ensurePromise = null;

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
      await migrateLegacyAchievementState();
      await migrateGrowthActivityHistory();
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export {
  GROWTH_RECAP_STATE_TABLE_SQL,
  USER_ACHIEVEMENTS_TABLE_SQL,
  USER_GROWTH_PREFERENCES_TABLE_SQL,
  migrateGrowthActivityHistory,
  migrateLegacyAchievementState,
};
