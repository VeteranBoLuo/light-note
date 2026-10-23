import pool from '../db/index.js';
import {
  migrateAccountEmailHealthSchema,
  accountEmailHealthSchemaReady,
} from '../util/services/accountEmailHealthService.js';
try {
  await migrateAccountEmailHealthSchema(pool);
  if (!(await accountEmailHealthSchemaReady(pool)))
    throw Object.assign(new Error(), { code: 'SCHEMA_CONTRACT_MISMATCH' });
  console.log('[account-email-health] schema ready; no accounts scanned or changed');
} catch (error) {
  console.error('[account-email-health] migration failed code=%s', error?.code || 'SCHEMA_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
