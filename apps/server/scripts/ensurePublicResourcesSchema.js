import pool from '../db/index.js';
import { migratePublicResourceSchema, publicResourceSchemaReady } from '../util/publicResources/schema.js';
try {
  await migratePublicResourceSchema(pool);
  if (!(await publicResourceSchemaReady(pool))) throw new Error('SCHEMA_CONTRACT_MISMATCH');
  console.log('[public-resources] schema ready; flags unchanged');
} catch (error) {
  console.error('[public-resources] migration failed code=%s', error.code || 'SCHEMA_CONTRACT_MISMATCH');
  process.exitCode = 1;
} finally {
  await pool.end();
}
