import pool from '../db/index.js';

export const AFDIAN_SUPPORT_PACKAGE_TABLE_SQL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS support_campaigns (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    campaign_key varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    version int unsigned NOT NULL,
    title varchar(120) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    status varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft',
    starts_at datetime NOT NULL,
    ends_at datetime NOT NULL,
    cost_policy_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    published_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    published_at datetime DEFAULT NULL,
    suspended_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    suspended_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_campaign_version (campaign_key, version),
    KEY idx_support_campaign_public (status, starts_at, ends_at, version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_campaign_skus (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    campaign_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sku_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title varchar(80) NOT NULL,
    category varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount decimal(12,2) unsigned NOT NULL,
    ai_tokens bigint unsigned NOT NULL DEFAULT 0,
    storage_mb int unsigned NOT NULL DEFAULT 0,
    per_user_limit smallint unsigned NOT NULL DEFAULT 1,
    margin_bps int NOT NULL,
    sort_order int NOT NULL DEFAULT 0,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_campaign_sku_version (campaign_id, sku_id),
    KEY idx_support_campaign_sku_campaign (campaign_id, sort_order, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_campaign_user_limits (
    campaign_sku_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    completed_count smallint unsigned NOT NULL DEFAULT 0,
    active_intent_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    active_until datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (campaign_sku_id, user_id),
    UNIQUE KEY uk_support_campaign_active_intent (active_intent_id),
    KEY idx_support_campaign_limit_user (user_id, update_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_first_purchase_claims (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
    provider_identity_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sku_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    support_order_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_first_user_sku (user_id, sku_id),
    UNIQUE KEY uk_support_first_identity_sku (provider_identity_hash, sku_id),
    UNIQUE KEY uk_support_first_order (support_order_id),
    KEY idx_support_first_sku_time (sku_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS support_entitlement_grants (
    id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    support_order_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    checkout_intent_id char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    entitlement_type varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sku_id varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    catalog_version varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    campaign_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    campaign_sku_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    campaign_version int unsigned DEFAULT NULL,
    paid_amount decimal(12,2) unsigned NOT NULL,
    calculated_ai_tokens bigint unsigned NOT NULL DEFAULT 0,
    calculated_storage_mb int unsigned NOT NULL DEFAULT 0,
    granted_ai_tokens bigint unsigned NOT NULL DEFAULT 0,
    granted_storage_mb int unsigned NOT NULL DEFAULT 0,
    first_purchase_applied tinyint unsigned NOT NULL DEFAULT 0,
    grant_status varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason_code varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    ai_ledger_entry_id char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    storage_log_ref varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    reviewed_by varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
    reviewed_at datetime DEFAULT NULL,
    credited_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_support_entitlement_order (support_order_id),
    UNIQUE KEY uk_support_entitlement_ai_ledger (ai_ledger_entry_id),
    KEY idx_support_entitlement_intent (checkout_intent_id, create_time),
    KEY idx_support_entitlement_user_time (user_id, create_time, id),
    KEY idx_support_entitlement_status_time (grant_status, update_time, id),
    KEY idx_support_entitlement_sku_time (entitlement_type, sku_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]);

const CHECKOUT_INTENT_COLUMNS = Object.freeze([
  ['intent_type', "varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'legacy' AFTER option_key"],
  ['intent_status', "varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'issued' AFTER intent_type"],
  ['sku_id', 'varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER intent_status'],
  ['catalog_version', 'varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER sku_id'],
  ['quoted_amount', 'decimal(12,2) unsigned DEFAULT NULL AFTER catalog_version'],
  ['base_ai_tokens', 'bigint unsigned NOT NULL DEFAULT 0 AFTER quoted_amount'],
  ['base_storage_mb', 'int unsigned NOT NULL DEFAULT 0 AFTER base_ai_tokens'],
  ['quoted_ai_tokens', 'bigint unsigned NOT NULL DEFAULT 0 AFTER base_storage_mb'],
  ['quoted_storage_mb', 'int unsigned NOT NULL DEFAULT 0 AFTER quoted_ai_tokens'],
  ['first_purchase_candidate', 'tinyint unsigned NOT NULL DEFAULT 0 AFTER quoted_storage_mb'],
  ['campaign_id', 'char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER first_purchase_candidate'],
  ['campaign_sku_id', 'char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER campaign_id'],
  ['campaign_version', 'int unsigned DEFAULT NULL AFTER campaign_sku_id'],
  ['campaign_user_limit', 'smallint unsigned DEFAULT NULL AFTER campaign_version'],
  ['campaign_starts_at', 'datetime DEFAULT NULL AFTER campaign_user_limit'],
  ['campaign_ends_at', 'datetime DEFAULT NULL AFTER campaign_starts_at'],
  ['consumed_order_id', 'char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER first_used_at'],
]);

async function ensureColumn(db, table, column, definition) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  if (rows.length) return;
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureIndex(db, table, index, definition) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index],
  );
  if (rows.length) return;
  try {
    await db.query(`ALTER TABLE ${table} ADD ${definition}`);
  } catch (error) {
    if (error?.code !== 'ER_DUP_KEYNAME') throw error;
  }
}

async function ensureCampaignSkuVersionIndex(db) {
  const [rows] = await db.query(
    `SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS sequence, COLUMN_NAME AS columnName
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'support_campaign_skus'
        AND INDEX_NAME IN ('uk_support_campaign_sku_public', 'uk_support_campaign_sku_version')
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
  );
  const indexes = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.indexName || row?.INDEX_NAME || '');
    if (!name) continue;
    if (!indexes.has(name)) indexes.set(name, { nonUnique: Number(row?.nonUnique ?? row?.NON_UNIQUE ?? 1), columns: [] });
    indexes.get(name).columns.push(String(row?.columnName || row?.COLUMN_NAME || ''));
  }

  if (indexes.has('uk_support_campaign_sku_public')) {
    await db.query('ALTER TABLE support_campaign_skus DROP INDEX uk_support_campaign_sku_public');
  }

  const current = indexes.get('uk_support_campaign_sku_version');
  const isExact = current?.nonUnique === 0 && current.columns.join(',') === 'campaign_id,sku_id';
  if (isExact) return;
  if (current) await db.query('ALTER TABLE support_campaign_skus DROP INDEX uk_support_campaign_sku_version');
  await db.query(
    'ALTER TABLE support_campaign_skus ADD UNIQUE KEY uk_support_campaign_sku_version (campaign_id, sku_id)',
  );
}

let ensurePromise;

/** 套餐结算读取接口不在请求内执行 DDL；启动监听前完成幂等建表与旧表补列。 */
export function ensureAfdianSupportPackageSchema({ db = pool } = {}) {
  if (!ensurePromise || db !== pool) {
    const promise = (async () => {
      for (const [column, definition] of CHECKOUT_INTENT_COLUMNS) {
        await ensureColumn(db, 'support_checkout_intents', column, definition);
      }
      await ensureIndex(
        db,
        'support_checkout_intents',
        'idx_support_checkout_package',
        'KEY idx_support_checkout_package (intent_type, sku_id, user_id, create_time)',
      );
      await ensureIndex(
        db,
        'support_checkout_intents',
        'idx_support_checkout_consumed',
        'KEY idx_support_checkout_consumed (consumed_order_id)',
      );
      for (const sql of AFDIAN_SUPPORT_PACKAGE_TABLE_SQL) await db.query(sql);
      await ensureCampaignSkuVersionIndex(db);
    })();
    if (db === pool) {
      ensurePromise = promise.catch((error) => {
        ensurePromise = undefined;
        throw error;
      });
    } else {
      return promise;
    }
  }
  return ensurePromise;
}
