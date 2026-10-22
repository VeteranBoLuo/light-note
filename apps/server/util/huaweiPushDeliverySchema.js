import { readFileSync } from 'node:fs';

export const huaweiPushDeliveryTableSql = readFileSync(
  new URL('../migrations/20261022_huawei_push_delivery.sql', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

export async function ensureHuaweiPushDeliverySchema(db) {
  for (const statement of huaweiPushDeliveryTableSql) await db.query(statement);
}
