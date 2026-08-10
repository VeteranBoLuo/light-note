import { constants as fsConstants, promises as fsP } from 'node:fs';
import pool from '../db/index.js';
import { ensureResourceGovernanceSchema, RESOURCE_GOVERNANCE_TABLES } from '../util/resourceGovernanceSchema.js';
import { resolveGovernedImageRoots } from '../util/resourceGovernance/safety.js';
import { resourceGovernanceCleanupEnabled } from '../util/resourceGovernance/registry.js';

let failed = false;
try {
  await ensureResourceGovernanceSchema();
  const [tables] = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (${RESOURCE_GOVERNANCE_TABLES.map(() => '?').join(',')})`,
    RESOURCE_GOVERNANCE_TABLES,
  );
  const existing = new Set(tables.map((row) => String(row.table_name || row.TABLE_NAME || '')));
  const missing = RESOURCE_GOVERNANCE_TABLES.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`RESOURCE_GOVERNANCE_SCHEMA_MISSING:${missing.join(',')}`);

  for (const root of resolveGovernedImageRoots()) {
    try {
      await fsP.access(root, fsConstants.R_OK);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      console.warn('[resource-governance-check] image root not created yet: %s', root);
    }
  }
  if (
    resourceGovernanceCleanupEnabled() &&
    String(process.env.RESOURCE_GOVERNANCE_TOKEN_SECRET || process.env.SESSION_SECRET || '').length < 32
  ) {
    throw new Error('RESOURCE_GOVERNANCE_TOKEN_SECRET_UNAVAILABLE');
  }
  console.log(
    '[resource-governance-check] ready tables=%s cleanup=%s',
    existing.size,
    resourceGovernanceCleanupEnabled(),
  );
} catch (error) {
  failed = true;
  console.error('[resource-governance-check] failed code=%s', String(error?.code || error?.message || 'UNKNOWN'));
} finally {
  await pool.end();
}

if (failed) process.exitCode = 1;
