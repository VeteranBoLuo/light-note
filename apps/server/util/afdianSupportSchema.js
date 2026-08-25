import pool from '../db/index.js';

export const AFDIAN_SUPPORT_TABLE_SQL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS support_checkout_intents (
    id char(36) NOT NULL,
    token_hash char(64) NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    option_key varchar(32) NOT NULL,
    provider_user_id varchar(128) DEFAULT NULL,
    provider_private_id varchar(128) DEFAULT NULL,
    expires_at datetime NOT NULL,
    first_used_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_checkout_token (token_hash),
    KEY idx_support_checkout_user_time (user_id, create_time, id),
    KEY idx_support_checkout_expiry (expires_at, first_used_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_account_links (
    id char(36) NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    provider_user_id varchar(128) NOT NULL,
    provider_private_id varchar(128) DEFAULT NULL,
    provider_name varchar(100) DEFAULT NULL,
    provider_avatar_url varchar(1024) DEFAULT NULL,
    identity_refreshed_at datetime DEFAULT NULL,
    linked_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_link_user (user_id),
    UNIQUE KEY uk_support_link_provider_user (provider_user_id),
    UNIQUE KEY uk_support_link_provider_private (provider_private_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_orders (
    id char(36) NOT NULL,
    provider_order_no varchar(128) NOT NULL,
    provider_user_id varchar(128) DEFAULT NULL,
    provider_private_id varchar(128) DEFAULT NULL,
    checkout_intent_id char(36) DEFAULT NULL,
    light_note_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    ownership_source varchar(24) NOT NULL DEFAULT 'unlinked',
    plan_id varchar(128) DEFAULT NULL,
    product_type tinyint unsigned NOT NULL DEFAULT 0,
    month int unsigned NOT NULL DEFAULT 1,
    total_amount decimal(12,2) NOT NULL DEFAULT 0.00,
    show_amount decimal(12,2) NOT NULL DEFAULT 0.00,
    provider_status smallint NOT NULL DEFAULT 0,
    provider_created_at datetime DEFAULT NULL,
    verification_state varchar(24) NOT NULL DEFAULT 'pending',
    webhook_signature_valid tinyint unsigned NOT NULL DEFAULT 0,
    webhook_received_at datetime DEFAULT NULL,
    verified_at datetime DEFAULT NULL,
    ranking_observed_at datetime DEFAULT NULL,
    retry_count int unsigned NOT NULL DEFAULT 0,
    next_retry_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_order_provider (provider_order_no),
    KEY idx_support_order_user_status (light_note_user_id, verification_state, provider_status, create_time),
    KEY idx_support_order_provider_user (provider_user_id, provider_private_id, create_time),
    KEY idx_support_order_checkout (checkout_intent_id),
    KEY idx_support_order_retry (verification_state, next_retry_at, retry_count)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_public_preferences (
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    public_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    participate_in_ranking tinyint unsigned NOT NULL DEFAULT 1,
    show_identity tinyint unsigned NOT NULL DEFAULT 0,
    identity_consented_at datetime DEFAULT NULL,
    admin_hidden tinyint unsigned NOT NULL DEFAULT 0,
    admin_hidden_reason varchar(255) DEFAULT NULL,
    admin_hidden_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    admin_hidden_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_support_public_id (public_id),
    KEY idx_support_public_visibility (participate_in_ranking, admin_hidden, show_identity, update_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);

const AFDIAN_SUPPORT_COLUMN_PATCHES = Object.freeze([
  ['support_account_links', 'provider_name', 'varchar(100) DEFAULT NULL AFTER provider_private_id'],
  ['support_account_links', 'provider_avatar_url', 'varchar(1024) DEFAULT NULL AFTER provider_name'],
  ['support_account_links', 'identity_refreshed_at', 'datetime DEFAULT NULL AFTER provider_avatar_url'],
  ['support_orders', 'ranking_observed_at', 'datetime DEFAULT NULL AFTER verified_at'],
  ['support_orders', 'provider_created_at', 'datetime DEFAULT NULL AFTER provider_status'],
]);

async function ensureColumn(db, table, column, definition) {
  const [rows] = await db.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  if (!rows.length) {
    try {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

async function ensureRankingIndex(db) {
  const [rows] = await db.query(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'support_orders'
        AND INDEX_NAME = 'idx_support_order_ranking'
      LIMIT 1`,
  );
  if (!rows.length) {
    try {
      await db.query(
        `ALTER TABLE support_orders
           ADD KEY idx_support_order_ranking
             (verification_state, provider_status, ranking_observed_at, light_note_user_id)`,
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_KEYNAME') throw error;
    }
  }
}

let ensurePromise;

/** 在开始接收订单前完成幂等建表，读取接口不在请求内执行 DDL。 */
export function ensureAfdianSupportSchema({ db = pool } = {}) {
  if (!ensurePromise || db !== pool) {
    const promise = (async () => {
      for (const sql of AFDIAN_SUPPORT_TABLE_SQL) await db.query(sql);
      for (const [table, column, definition] of AFDIAN_SUPPORT_COLUMN_PATCHES) {
        await ensureColumn(db, table, column, definition);
      }
      await ensureRankingIndex(db);
    })();
    if (db === pool)
      ensurePromise = promise.catch((error) => {
        ensurePromise = undefined;
        throw error;
      });
    else return promise;
  }
  return ensurePromise;
}
