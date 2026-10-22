import pool from '../db/index.js';
import { ensureHuaweiPushDeliverySchema } from '../util/huaweiPushDeliverySchema.js';

try {
  await ensureHuaweiPushDeliverySchema(pool);
  console.log('[huawei-push-delivery-schema] ready; historical notifications not replayed');
} catch (error) {
  console.error('[huawei-push-delivery-schema] failed code=%s', error?.code || 'SCHEMA_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
