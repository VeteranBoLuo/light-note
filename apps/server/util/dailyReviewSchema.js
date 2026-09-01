import pool from '../db/index.js';
import { GROWTH_RECAP_STATE_TABLE_SQL } from './growthCenterSchema.js';

// 历史奖励型回顾已经占用旧版会话 / 条目表名；
// 新版内容回顾必须保持物理隔离，不能依赖 CREATE TABLE IF NOT EXISTS 复用旧表。
const DAILY_REVIEW_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS daily_content_review_sessions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    review_date DATE NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    item_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    completed_at DATETIME DEFAULT NULL,
    skipped_at DATETIME DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_daily_content_review_session_user_date (user_id, review_date),
    KEY idx_daily_content_review_session_user_status (user_id, status, review_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
    COMMENT='账号时区下的每日回顾固定会话'
`;

const DAILY_REVIEW_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS daily_content_review_items (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    slot TINYINT UNSIGNED NOT NULL,
    resource_type VARCHAR(16) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    resource_date DATE DEFAULT NULL,
    reason_code VARCHAR(24) NOT NULL,
    reason_tag_id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    action VARCHAR(24) NOT NULL DEFAULT 'pending',
    acted_at DATETIME DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_daily_content_review_item_session_slot (session_id, slot),
    UNIQUE KEY uk_daily_content_review_item_session_resource (session_id, resource_type, resource_id),
    KEY idx_daily_content_review_item_user_resource (user_id, resource_type, resource_id(128), create_time),
    KEY idx_daily_content_review_item_session_action (session_id, action, slot),
    CONSTRAINT fk_daily_content_review_item_session
      FOREIGN KEY (session_id) REFERENCES daily_content_review_sessions (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
    COMMENT='每日回顾会话中的稳定资源条目'
`;

let ensurePromise = null;

async function ensureRecapLastShownDate() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'growth_recap_state'
        AND column_name = 'last_shown_date'`,
  );
  if (!Number(row?.count || 0)) {
    try {
      await pool.query(
        'ALTER TABLE growth_recap_state ADD COLUMN last_shown_date DATE DEFAULT NULL AFTER dismissed_at',
      );
    } catch (error) {
      // 多实例可能同时通过 information_schema 检查；只把另一实例已经完成的同列升级视为成功。
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

async function ensureDailyReviewResourceDate() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'daily_content_review_items'
        AND column_name = 'resource_date'`,
  );
  if (!Number(row?.count || 0)) {
    try {
      await pool.query(
        'ALTER TABLE daily_content_review_items ADD COLUMN resource_date DATE DEFAULT NULL AFTER resource_id',
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

export function ensureDailyReviewSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      // 发布前脚本也必须能在尚未启动过成长中心的新库上独立运行；表定义复用成长域唯一事实源。
      await pool.query(GROWTH_RECAP_STATE_TABLE_SQL);
      await ensureRecapLastShownDate();
      await pool.query(DAILY_REVIEW_SESSIONS_TABLE_SQL);
      await pool.query(DAILY_REVIEW_ITEMS_TABLE_SQL);
      await ensureDailyReviewResourceDate();
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

export { DAILY_REVIEW_ITEMS_TABLE_SQL, DAILY_REVIEW_SESSIONS_TABLE_SQL };
