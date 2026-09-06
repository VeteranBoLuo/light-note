import pool from '../db/index.js';

export const DAILY_BRIEF_SCHEMA_SQL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS workbench_daily_briefs (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    brief_date DATE NOT NULL,
    timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'generating',
    facts_json JSON NOT NULL,
    brief_json JSON DEFAULT NULL,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    lease_expires_at DATETIME DEFAULT NULL,
    generated_at DATETIME DEFAULT NULL,
    last_error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_workbench_daily_brief_user_date (user_id, brief_date),
    KEY idx_workbench_daily_brief_lease (status, lease_expires_at)
  ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='桌面工作台每日简报幂等产物'`,
]);

export async function ensureDailyBriefSchema(database = pool) {
  for (const sql of DAILY_BRIEF_SCHEMA_SQL) await database.query(sql);
}
