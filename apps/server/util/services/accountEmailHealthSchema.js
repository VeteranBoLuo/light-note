import pool from '../../db/index.js';
import { readFile } from 'node:fs/promises';

export async function accountEmailHealthSchemaReady(db = pool) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM information_schema.columns
    WHERE table_schema = DATABASE() AND ((table_name = 'account_email_health_runs' AND column_name IN ('period', 'after_user_id', 'completed'))
      OR (table_name = 'account_email_health_notices' AND column_name IN ('user_id', 'email_hash', 'issue_code')))`);
  if (Number(row.total) !== 6) return false;
  const [indexes] =
    await db.query(`SELECT table_name AS tableName, index_name AS indexName, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list,
    MAX(non_unique) AS non_unique, SUM(sub_part IS NOT NULL) AS prefixed FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND ((table_name IN ('account_email_health_notices', 'account_email_health_runs') AND index_name = 'PRIMARY')
      OR (table_name = 'email_delivery_logs' AND index_name = 'idx_email_delivery_recipient_time')) GROUP BY table_name, index_name`);
  return (
    indexes.some(
      (item) =>
        item.tableName === 'account_email_health_notices' &&
        item.columns_list === 'user_id,email_hash,issue_code' &&
        Number(item.non_unique) === 0 &&
        Number(item.prefixed) === 0,
    ) &&
    indexes.some(
      (item) =>
        item.tableName === 'email_delivery_logs' &&
        item.columns_list === 'recipient_email,create_time,id' &&
        Number(item.prefixed) === 0,
    ) &&
    indexes.some(
      (item) =>
        item.tableName === 'account_email_health_runs' &&
        item.columns_list === 'period' &&
        Number(item.non_unique) === 0,
    )
  );
}

// 只供显式迁移脚本与隔离测试调用；启动和请求路径仅检查结构。
export async function migrateAccountEmailHealthSchema(db = pool) {
  const source = await readFile(new URL('../../migrations/20261023_account_email_health.sql', import.meta.url), 'utf8');
  for (const sql of source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.query(sql);
  const [indexes] = await db.query(`SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE()
    AND table_name = 'email_delivery_logs' AND index_name = 'idx_email_delivery_recipient_time' LIMIT 1`);
  if (!indexes.length)
    await db.query(
      'ALTER TABLE email_delivery_logs ADD INDEX idx_email_delivery_recipient_time (recipient_email, create_time, id)',
    );
}
