export const huaweiInstallationTableSql = `CREATE TABLE IF NOT EXISTS huawei_push_installations (
 user_id char(36) NOT NULL, provider_app_id varchar(32) NOT NULL,
 installation_id char(36) NOT NULL, device_key char(64) NOT NULL,
 package_name varchar(128) NOT NULL, identity_kind varchar(16) NOT NULL,
 device_label varchar(96) NOT NULL DEFAULT '', native_revision bigint unsigned NOT NULL,
 active tinyint NOT NULL DEFAULT 1,
 first_seen_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 last_seen_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 current_device_key char(64) GENERATED ALWAYS AS (IF(active = 1, device_key, NULL)) STORED,
 PRIMARY KEY(user_id, provider_app_id, installation_id),
 UNIQUE KEY uk_huawei_current_device(user_id, provider_app_id, current_device_key),
 KEY idx_huawei_installation_device(user_id, provider_app_id, device_key, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`;

export const huaweiSubscriptionColumns = [
  ['installation_id', 'char(36) DEFAULT NULL'],
  ['provider_app_id', 'varchar(32) DEFAULT NULL'],
  ['retired_reason', 'varchar(32) DEFAULT NULL'],
  ['active_installation_id', 'char(36) GENERATED ALWAYS AS (IF(active IN (1,2), installation_id, NULL)) STORED'],
];

// Explicit installer only. Startup and workers must never call this function.
export async function installHuaweiPushInstallationSchema(db) {
  const connection = await db.getConnection();
  try {
    await connection.query(huaweiInstallationTableSql);
    const [columns] = await connection.query('SHOW COLUMNS FROM browser_push_subscriptions');
    const existing = new Set(columns.map((column) => column.Field));
    for (const [name, definition] of huaweiSubscriptionColumns) {
      if (!existing.has(name))
        await connection.query(`ALTER TABLE browser_push_subscriptions ADD COLUMN ${name} ${definition}`);
    }
    const [indexes] = await connection.query('SHOW INDEX FROM browser_push_subscriptions');
    if (!indexes.some((index) => index.Key_name === 'uk_push_current_installation'))
      await connection.query(
        'ALTER TABLE browser_push_subscriptions ADD UNIQUE KEY uk_push_current_installation (user_id, provider_app_id, active_installation_id)',
      );
    if (!indexes.some((index) => index.Key_name === 'idx_push_installation'))
      await connection.query(
        'ALTER TABLE browser_push_subscriptions ADD KEY idx_push_installation (user_id, provider_app_id, installation_id, active)',
      );
  } finally {
    connection.release();
  }
}

export async function assertHuaweiPushInstallationSchema(db) {
  await db.query(
    'SELECT installation_id, provider_app_id, retired_reason, active_installation_id FROM browser_push_subscriptions LIMIT 0',
  );
  await db.query(
    'SELECT user_id, provider_app_id, installation_id, device_key, package_name, identity_kind, device_label, native_revision, active, first_seen_at, last_seen_at, current_device_key FROM huawei_push_installations LIMIT 0',
  );
  const invalid = () => {
    throw Object.assign(new Error('HUAWEI_INSTALLATION_SCHEMA_INVALID'), {
      code: 'HUAWEI_INSTALLATION_SCHEMA_INVALID',
    });
  };
  for (const [table, indexName, expected] of [
    ['browser_push_subscriptions', 'uk_push_current_installation', 'user_id,provider_app_id,active_installation_id'],
    ['huawei_push_installations', 'PRIMARY', 'user_id,provider_app_id,installation_id'],
    ['huawei_push_installations', 'uk_huawei_current_device', 'user_id,provider_app_id,current_device_key'],
  ]) {
    const [indexes] = await db.query(`SHOW INDEX FROM ${table}`);
    const current = indexes
      .filter((index) => index.Key_name === indexName)
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index);
    if (
      current.some((index) => Number(index.Non_unique) !== 0 || index.Sub_part != null) ||
      current.map((index) => index.Column_name).join(',') !== expected
    )
      invalid();
  }
  for (const [table, column, type, expression] of [
    ['browser_push_subscriptions', 'active_installation_id', 'char(36)', 'ifactivein1,2,installation_id,null'],
    ['huawei_push_installations', 'current_device_key', 'char(64)', 'ifactive=1,device_key,null'],
  ]) {
    const [[definition]] = await db.query(
      'SELECT COLUMN_TYPE,EXTRA,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
      [table, column],
    );
    const normalized = String(definition?.GENERATION_EXPRESSION || '')
      .toLowerCase()
      .replace(/[`\s()]/g, '');
    if (
      definition?.COLUMN_TYPE !== type ||
      !String(definition.EXTRA).includes('STORED GENERATED') ||
      normalized !== expression
    )
      invalid();
  }
}
