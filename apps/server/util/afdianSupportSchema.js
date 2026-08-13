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
    verification_state varchar(24) NOT NULL DEFAULT 'pending',
    webhook_signature_valid tinyint unsigned NOT NULL DEFAULT 0,
    webhook_received_at datetime DEFAULT NULL,
    verified_at datetime DEFAULT NULL,
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
]);

let ensurePromise;

/** 在开始接收订单前完成幂等建表，读取接口不在请求内执行 DDL。 */
export function ensureAfdianSupportSchema({ db = pool } = {}) {
  if (!ensurePromise || db !== pool) {
    const promise = (async () => {
      for (const sql of AFDIAN_SUPPORT_TABLE_SQL) await db.query(sql);
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
